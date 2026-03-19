import { randomUUID } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import {
	DSState,
	FieldState,
	MatchState,
	MatchStateMap,
	MonitorFrame,
	PartialMonitorFrame,
	ROBOT,
	RobotInfo,
	RobotWarnings,
	ScheduleDetails,
	StateChange,
	StateChangeType,
} from "../../shared/types";
import { db } from "../db/db";
import { events, matchEvents, notes, robotCycleLogs } from "../db/schema";
import { getEvent } from "./get-event";

export function detectRadioNoDs(currentFrame: PartialMonitorFrame, pastFrames: MonitorFrame[]) {
	// Only in prestart
	if (MatchStateMap[currentFrame.field] !== MatchState.PRESTART) return currentFrame;
	for (let _robot in ROBOT) {
		const robot = _robot as ROBOT;
		const currentRobot = currentFrame[robot as keyof PartialMonitorFrame] as RobotInfo;
		const currentSignal = currentRobot.signal;

		if (currentSignal === 0 || currentRobot.ds === DSState.GREEN) continue;

		const pastSignals = pastFrames.slice(-20).map((f) => (f[robot as keyof MonitorFrame] as RobotInfo).signal);

		// If the signal hasn't changed in the last 20 frames, the radio probably disconnected
		if (pastSignals.every((signal) => signal === currentSignal)) continue;

		// Otherwise the radio is probably connected without DS
		currentRobot.radio = true;
	}

	return currentFrame;
}

export function detectStatusChange(currentFrame: PartialMonitorFrame, previousFrame: MonitorFrame | null) {
	const changes: StateChange[] = [];

	for (let _robot in ROBOT) {
		const robot = _robot as ROBOT;
		const currentRobot = currentFrame[robot as keyof MonitorFrame] as RobotInfo;

		currentRobot.warnings = [];

		if (previousFrame) {
			const previousRobot = previousFrame[robot as keyof MonitorFrame] as RobotInfo;

			if (
				currentFrame.field === FieldState.PRESTART_COMPLETED &&
				previousFrame.field === FieldState.PRESTART_INITIATED
			) {
				currentRobot.lastChange = new Date();
				currentRobot.improved = true;
			} else if (previousRobot.ds !== currentRobot.ds) {
				currentRobot.lastChange = new Date();
				// DS states are numbered 0: red, 1: green, 2: green x, 3: move station, 4: wrong match, 5: bypass, 6: estop, 7: astop
				currentRobot.improved =
					currentRobot.ds === DSState.RED
						? false
						: previousRobot.ds === DSState.RED
							? true
							: currentRobot.ds < previousRobot.ds;
				changes.push({
					station: robot,
					robot: currentRobot,
					type: currentRobot.improved ? StateChangeType.RisingEdge : StateChangeType.FallingEdge,
					key: "ds",
					oldValue: previousRobot.ds,
					newValue: currentRobot.ds,
				});
			} else if (previousRobot.radio !== currentRobot.radio) {
				currentRobot.lastChange = new Date();
				currentRobot.improved = currentRobot.radio;
				changes.push({
					station: robot,
					robot: currentRobot,
					type: currentRobot.improved ? StateChangeType.RisingEdge : StateChangeType.FallingEdge,
					key: "radio",
					oldValue: previousRobot.radio,
					newValue: currentRobot.radio,
				});
			} else if (previousRobot.rio !== currentRobot.rio) {
				currentRobot.lastChange = new Date();
				currentRobot.improved = currentRobot.rio;
				changes.push({
					station: robot,
					robot: currentRobot,
					type: currentRobot.improved ? StateChangeType.RisingEdge : StateChangeType.FallingEdge,
					key: "rio",
					oldValue: previousRobot.rio,
					newValue: currentRobot.rio,
				});
			} else if (previousRobot.code !== currentRobot.code) {
				currentRobot.lastChange = new Date();
				currentRobot.improved = currentRobot.code;
				changes.push({
					station: robot,
					robot: currentRobot,
					type: currentRobot.improved ? StateChangeType.RisingEdge : StateChangeType.FallingEdge,
					key: "code",
					oldValue: previousRobot.code,
					newValue: currentRobot.code,
				});
			} else {
				currentRobot.lastChange = previousRobot.lastChange;
				currentRobot.improved = previousRobot.improved;
			}
		} else {
			currentRobot.lastChange = null;
			currentRobot.improved = false;
		}
	}

	return { changes, currentFrame: currentFrame as MonitorFrame };
}

export async function processFrameForTeamData(eventCode: string, frame: MonitorFrame, changes: StateChange[]) {
	const event = await getEvent("", eventCode);
	const checklist = event.checklist;
	let changed = false;

	// Automatically check off connection test and prereqs for teams that have a connected radio
	for (let team of [frame.blue1, frame.blue2, frame.blue3, frame.red1, frame.red2, frame.red3]) {
		if (team.radio) {
			changed = true;
			checklist[team.number].present = true;
			checklist[team.number].radioProgrammed = true;
			checklist[team.number].connectionTested = true;
		}
	}

	if (changed) {
		await db.update(events).set({ checklist }).where(eq(events.code, eventCode));
		return checklist;
	}

	return false;
}

export async function processTeamWarnings(eventCode: string, frame: MonitorFrame, previousFrame: MonitorFrame) {
	const event = await getEvent("", eventCode);

	for (let station in ROBOT) {
		let robot = frame[station as keyof MonitorFrame] as RobotInfo;
		if (!event.checklist[robot.number]) continue;
		if (!event.checklist[robot.number].inspected) {
			robot.warnings.push(RobotWarnings.NOT_INSPECTED);
		}
		if (!event.checklist[robot.number].radioProgrammed) {
			robot.warnings.push(RobotWarnings.RADIO_NOT_FLASHED);
		}

		// The note warning is expensive on database transactions so only run it one time when prestart completes
		if (frame.field === FieldState.PRESTART_COMPLETED && previousFrame.field === FieldState.PRESTART_INITIATED) {
			const teamNotes = await db
				.select()
				.from(notes)
				.where(and(eq(notes.team, robot.number), eq(notes.event_code, event.code)))
				.orderBy(notes.updated_at);

			const openNote = teamNotes.find((note) => note.resolution_status === "Open");
			if (openNote) {
				robot.warnings.push(RobotWarnings.OPEN_NOTE);
			} else {
				// Find what their last match was
				const previousMatch = await db
					.select()
					.from(robotCycleLogs)
					.where(and(eq(robotCycleLogs.team, robot.number), eq(robotCycleLogs.event, event.code)))
					.orderBy(desc(robotCycleLogs.prestart))
					.limit(1);

				const recentlyResolvedNotes = teamNotes.filter((note) => note.resolution_status === "Resolved");
				let previousMatchStart = new Date();
				if (previousMatch[0] && previousMatch[0].prestart) previousMatchStart = previousMatch[0].prestart;

				for (let note of recentlyResolvedNotes) {
					// If note is resolved and there either is no previous match or the previous match start time was before the note was resolved
					if (note.updated_at && (!previousMatchStart || note.updated_at > previousMatchStart)) {
						robot.warnings.push(RobotWarnings.RECENT_NOTE);
						continue;
					}
				}
			}

			// Check for active match events from the team's most recent match
			const lastMatchEvent = await db
				.select()
				.from(matchEvents)
				.where(
					and(
						eq(matchEvents.event_code, event.code),
						eq(matchEvents.team, robot.number),
						eq(matchEvents.status, "active"),
					),
				)
				.orderBy(desc(matchEvents.created_at))
				.limit(1)
				.execute();

			if (
				lastMatchEvent.length > 0 &&
				lastMatchEvent[0].match_number !== frame.match &&
				lastMatchEvent[0].play_number !== frame.play
			) {
				robot.warnings.push(RobotWarnings.PREVIOUS_MATCH_EVENT);
			}

			// Then copy the warnings from the previous frame until the match ends
		} else if (!(frame.field === FieldState.MATCH_OVER || frame.field === FieldState.MATCH_ABORTED)) {
			const previousFrameWarnings = previousFrame[station as keyof MonitorFrame] as RobotInfo;

			if (previousFrameWarnings.warnings.includes(RobotWarnings.OPEN_NOTE))
				robot.warnings.push(RobotWarnings.OPEN_NOTE);
			if (previousFrameWarnings.warnings.includes(RobotWarnings.RECENT_NOTE))
				robot.warnings.push(RobotWarnings.RECENT_NOTE);
			if (previousFrameWarnings.warnings.includes(RobotWarnings.PREVIOUS_MATCH_EVENT))
				robot.warnings.push(RobotWarnings.PREVIOUS_MATCH_EVENT);
		}
	}

	return frame;
}

export async function processTeamCycles(eventCode: string, frame: MonitorFrame, changes: StateChange[]) {
	const event = await getEvent("", eventCode);

	// If the match is running and there is data, commit it and reset the tracking object
	if (MatchStateMap[frame.field] === MatchState.RUNNING && event.robotCycleTracking.prestart) {
		const insert = [];

		for (let robot in ROBOT) {
			const robotCycle = event.robotCycleTracking[robot as ROBOT];
			if (!robotCycle) continue;
			insert.push({
				id: randomUUID(),
				event: eventCode,
				match_number: frame.match,
				play_number: frame.play,
				level: frame.level,
				team: robotCycle.team,
				prestart: event.robotCycleTracking.prestart,
				first_ds: robotCycle.firstDS,
				last_ds: robotCycle.lastDS,
				time_ds: robotCycle.timeDS,
				first_radio: robotCycle.firstRadio,
				last_radio: robotCycle.lastRadio,
				time_radio: robotCycle.timeRadio,
				first_rio: robotCycle.firstRio,
				last_rio: robotCycle.lastRio,
				time_rio: robotCycle.timeRio,
				first_code: robotCycle.firstCode,
				last_code: robotCycle.lastCode,
				time_code: robotCycle.timeCode,
			});
		}

		// console.log(insert);

		if (insert.length < 1) return;

		await db.insert(robotCycleLogs).values(insert);
		event.robotCycleTracking = {};
	}

	// Make sure to clear the cycle tracking if we re-prestart
	if (frame.field === FieldState.PRESTART_INITIATED) event.robotCycleTracking = {};

	// Only process in prestart
	if (MatchStateMap[frame.field] !== MatchState.PRESTART) return;

	// If new match, set the prestart time
	if (!event.robotCycleTracking.prestart) event.robotCycleTracking.prestart = event.lastPrestartDone || new Date();

	for (let change of changes) {
		let cycle = event.robotCycleTracking[change.station];

		if (!cycle) {
			event.robotCycleTracking[change.station] = {
				team: change.robot.number,
			};
			cycle = event.robotCycleTracking[change.station];
		}

		if (!cycle)
			throw new Error(
				"You should never see this error, but if you do look at the processTeamCycles function in util/frameProcessing",
			);

		if (change.type !== StateChangeType.RisingEdge || change.robot.ds !== DSState.GREEN) return;

		switch (change.key) {
			case "code":
				if (!cycle.firstCode) cycle.firstCode = change.robot.lastChange || new Date();
				cycle.lastCode = change.robot.lastChange || new Date();
				cycle.timeCode = cycle.lastCode.getTime() - event.robotCycleTracking.prestart.getTime();
			case "rio":
				if (!cycle.firstRio) cycle.firstRio = change.robot.lastChange || new Date();
				cycle.lastRio = change.robot.lastChange || new Date();
				cycle.timeRio = cycle.lastRio.getTime() - event.robotCycleTracking.prestart.getTime();
			case "radio":
				if (!cycle.firstRadio) cycle.firstRadio = change.robot.lastChange || new Date();
				cycle.lastRadio = change.robot.lastChange || new Date();
				cycle.timeRadio = cycle.lastRadio.getTime() - event.robotCycleTracking.prestart.getTime();
				break;
			case "ds":
				if (!cycle.firstDS) cycle.firstDS = change.robot.lastChange || new Date();
				cycle.lastDS = change.robot.lastChange || new Date();
				cycle.timeDS = cycle.lastDS.getTime() - event.robotCycleTracking.prestart.getTime();
		}
	}
}

/**
 * Compute the total duration of overnight gaps that fall entirely between
 * scheduledStart and actualStart.  When a multi-day event carries unplayed
 * matches to the next day, the raw delta (scheduledStart − actualStart)
 * includes the overnight break as lateness.  Adding the gap back yields the
 * true within-session offset.
 *
 * A gap runs from the end of one schedule day to the start of the next.
 * "End of day" is days[i].endTime if available, otherwise the scheduled
 * start of the last match on that day (days[i].end).
 * "Start of next day" is the scheduled start of the first match on days[i+1]
 * (days[i+1].start).
 *
 * @returns milliseconds to ADD back to the raw (scheduledStart − actualStart)
 *          delta, always >= 0.
 */
export function computeOvernightOffset(
	scheduledStart: Date,
	actualStart: Date,
	scheduleDetails: ScheduleDetails,
): number {
	if (!scheduleDetails.days || scheduleDetails.days.length < 2) return 0;
	if (!scheduleDetails.matches || scheduleDetails.matches.length === 0) return 0;

	let offset = 0;

	for (let i = 0; i < scheduleDetails.days.length - 1; i++) {
		const today = scheduleDetails.days[i];
		const tomorrow = scheduleDetails.days[i + 1];

		// Determine gap start: endTime of current day, or scheduled start of last match
		let gapStart: Date | null = today.endTime ? new Date(today.endTime) : null;
		if (!gapStart) {
			const lastMatchOfDay = scheduleDetails.matches.find((m) => m.match === today.end);
			if (!lastMatchOfDay) continue;
			gapStart = new Date(lastMatchOfDay.scheduledStartTime);
		}

		// Determine gap end: scheduled start of first match of next day
		const firstMatchOfNextDay = scheduleDetails.matches.find((m) => m.match === tomorrow.start);
		if (!firstMatchOfNextDay) continue;
		const gapEnd = new Date(firstMatchOfNextDay.scheduledStartTime);

		if (gapEnd <= gapStart) continue;

		// Only apply the overnight correction when the match truly carried over to
		// the next day's session (actualStart >= gapEnd).  If the match merely ran
		// slightly past midnight but before the next session began, it is simply
		// late - no gap correction is needed and adding one would under-report the
		// delay (e.g. 51m behind incorrectly shown as 24m behind).
		if (actualStart.getTime() < gapEnd.getTime()) continue;

		// Gap fully or partially crossed: subtract the portion of the gap that
		// falls within [scheduledStart, actualStart].
		const overlapStart = Math.max(scheduledStart.getTime(), gapStart.getTime());
		const overlapEnd = Math.min(actualStart.getTime(), gapEnd.getTime());
		if (overlapEnd > overlapStart) {
			offset += overlapEnd - overlapStart;
		}
	}

	return offset;
}
