import { randomUUID } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import {
	DSState,
	FieldState,
	MatchState,
	MatchStateMap,
	ROBOT,
	RobotWarnings,
	StateChangeType,
} from "../../shared/types";
import type {
	EventCycleTracking,
	MonitorFrame,
	PartialMonitorFrame,
	RobotInfo,
	ScheduleDetails,
	StateChange,
} from "../../shared/types";
import { db } from "../db/db";
import schema, { matchEvents, notes, robotCycleLogs } from "../db/schema";
import { debugLog } from "./debug-log";
import { getCycleTracking, getChecklist, getSlowTeams, setCycleTracking, setChecklist } from "./event-state";
import { refreshSlowTeams } from "./slow-teams";

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
	const checklist = await getChecklist(eventCode);
	const teamsToUpdate: { number: string; inspected: boolean }[] = [];

	for (const team of [frame.blue1, frame.blue2, frame.blue3, frame.red1, frame.red2, frame.red3]) {
		if (team.radio && checklist[team.number]) {
			checklist[team.number].present = true;
			checklist[team.number].radioProgrammed = true;
			checklist[team.number].connectionTested = true;
			teamsToUpdate.push({ number: String(team.number), inspected: checklist[team.number].inspected });
		}
	}

	if (teamsToUpdate.length === 0) return false;

	setChecklist(eventCode, checklist);

	// Upsert changed rows to Postgres; preserve existing inspected status
	await db
		.insert(schema.checklist)
		.values(
			teamsToUpdate.map((t) => ({
				eventCode,
				teamNumber: t.number,
				present: true,
				radioProgrammed: true,
				connectionTested: true,
				inspected: t.inspected,
			})),
		)
		.onConflictDoUpdate({
			target: [schema.checklist.eventCode, schema.checklist.teamNumber],
			set: { present: true, radioProgrammed: true, connectionTested: true },
		});

	return checklist;
}

export async function processTeamWarnings(eventCode: string, frame: MonitorFrame, previousFrame: MonitorFrame) {
	const checklist = await getChecklist(eventCode);

	// The SLOW set is a per-event cache (see slow-teams.ts). Only read it on the one frame
	// where prestart completes; other frames copy the warning forward from the previous frame.
	const isPrestartComplete =
		frame.field === FieldState.PRESTART_COMPLETED && previousFrame.field === FieldState.PRESTART_INITIATED;
	const slowTeams = isPrestartComplete ? await getSlowTeams(eventCode) : null;

	for (let station in ROBOT) {
		let robot = frame[station as keyof MonitorFrame] as RobotInfo;
		const teamChecklist = checklist[robot.number];
		if (!teamChecklist) continue;
		if (!teamChecklist.inspected) {
			robot.warnings.push(RobotWarnings.NOT_INSPECTED);
		}
		if (!teamChecklist.radioProgrammed) {
			robot.warnings.push(RobotWarnings.RADIO_NOT_FLASHED);
		}

		// The note warning is expensive on database transactions so only run it one time when prestart completes
		if (isPrestartComplete) {
			// 🐌 Consistently slow to connect at this event (see slow-teams.ts).
			if (slowTeams?.has(robot.number)) {
				robot.warnings.push(RobotWarnings.SLOW);
			}

			const teamNotes = await db
				.select()
				.from(notes)
				.where(and(eq(notes.team, robot.number), eq(notes.event_code, eventCode)))
				.orderBy(notes.updated_at);

			const openNote = teamNotes.find((note) => note.resolution_status === "Open");
			if (openNote) {
				robot.warnings.push(RobotWarnings.OPEN_NOTE);
			} else {
				// Find what their last match was
				const previousMatch = await db
					.select()
					.from(robotCycleLogs)
					.where(and(eq(robotCycleLogs.team, robot.number), eq(robotCycleLogs.event, eventCode)))
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
						eq(matchEvents.event_code, eventCode),
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

			if (previousFrameWarnings.warnings.includes(RobotWarnings.SLOW)) robot.warnings.push(RobotWarnings.SLOW);
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

export async function processTeamCycles(
	eventCode: string,
	frame: MonitorFrame,
	changes: StateChange[],
	lastPrestartDone: Date | null,
) {
	// Skip test matches (match 999) and frames whose level couldn't be resolved
	// from the schedule — FMS reports placeholder teams 1-6 in these slots and
	// they otherwise look identical to real qualification rows.
	if (frame.level === "None" || frame.match === 999) return;

	let tracking = await getCycleTracking(eventCode);

	// If the match is running and there is data, commit it and reset the tracking object
	if (MatchStateMap[frame.field] === MatchState.RUNNING && tracking.prestart) {
		// Catch anything that connected in the final prestart->running frame before committing.
		stampFrame(tracking, frame);

		const insert = [];

		for (let robot in ROBOT) {
			const robotCycle = tracking[robot as ROBOT];
			if (!robotCycle) continue;
			insert.push({
				id: randomUUID(),
				event: eventCode,
				match_number: frame.match,
				play_number: frame.play,
				level: frame.level,
				team: robotCycle.team,
				prestart: tracking.prestart,
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
				first_ready: robotCycle.firstReady,
				last_ready: robotCycle.lastReady,
				time_ready: robotCycle.timeReady,
			});
		}

		debugLog({
			eventCode,
			category: "cycle",
			level: "info",
			message: `commit ${insert.length} robot cycles for match ${frame.match}-${frame.play}`,
			data: { match: frame.match, play: frame.play, level: frame.level, rows: insert },
		});

		if (insert.length > 0) await db.insert(robotCycleLogs).values(insert);
		setCycleTracking(eventCode, {});
		// A new match's timings just landed — recompute the cached SLOW-team set for this
		// event so the next prestart's warnings reflect it. Best-effort; never block commit.
		refreshSlowTeams(eventCode).catch((err) =>
			console.error(`[Cycle] refreshSlowTeams failed for ${eventCode}:`, err),
		);
		return;
	}

	// Make sure to clear the cycle tracking if we re-prestart
	if (frame.field === FieldState.PRESTART_INITIATED) {
		if (tracking.prestart || Object.keys(tracking).filter((k) => k !== "prestart").length > 0) {
			debugLog({
				eventCode,
				category: "cycle",
				level: "debug",
				message: "PRESTART_INITIATED — wiping cycle tracking",
				data: {
					hadPrestart: !!tracking.prestart,
					stations: Object.keys(tracking).filter((k) => k !== "prestart"),
				},
			});
		}
		setCycleTracking(eventCode, {});
		return;
	}

	// Only process in prestart
	if (MatchStateMap[frame.field] !== MatchState.PRESTART) return;

	// If new match, set the prestart time
	if (!tracking.prestart) {
		tracking.prestart = lastPrestartDone || new Date();
		debugLog({
			eventCode,
			category: "cycle",
			level: "info",
			message: `prestart anchor set for match ${frame.match}-${frame.play}`,
			data: {
				prestart: tracking.prestart,
				lastPrestartDone,
				match: frame.match,
				play: frame.play,
				level: frame.level,
			},
		});
	}

	// Level-triggered capture. Every prestart frame we look at each robot's CURRENT
	// connection state and stamp anything that's connected-but-not-yet-recorded, instead
	// of consuming a single rising-edge event per frame. This fixes the old under-fill:
	// when radio/rIO/code came up in the same ~600ms sample (or were already up when
	// prestart completed) the edge-based tracker dropped all but the highest-priority one.
	stampFrame(tracking, frame);

	setCycleTracking(eventCode, tracking);
}

/**
 * Fold one prestart frame into the cycle-tracking object using level (current-state)
 * detection. Records, per robot: the first frame each stage (DS-green / radio / rIO / code)
 * is seen connected (`first*`, and `time*` = first-connect ms from prestart), the last frame
 * it's seen connected (`last*`), and the composite "fully ready" milestone — the START of the
 * LAST ready streak before match start (`lastReady`/`timeReady`), which is what the SLOW
 * warning is scored on. Bypassed/e-stopped robots never reach `ready` (DS isn't GREEN), so
 * they naturally get a null `time_ready` and drop out of the SLOW comparison.
 */
function stampFrame(tracking: EventCycleTracking, frame: MonitorFrame) {
	const now = new Date();
	const prestartMs = tracking.prestart!.getTime();

	for (let _station in ROBOT) {
		const station = _station as ROBOT;
		const robot = frame[station as keyof MonitorFrame] as RobotInfo;
		// Empty alliance slots report no real team number — nothing to track.
		if (!robot || !robot.number) continue;

		if (!tracking[station]) tracking[station] = { team: robot.number };
		const cycle = tracking[station]!;
		cycle.team = robot.number;

		const dsGreen = robot.ds === DSState.GREEN;

		if (dsGreen) {
			if (!cycle.firstDS) {
				cycle.firstDS = now;
				cycle.timeDS = now.getTime() - prestartMs;
			}
			cycle.lastDS = now;
		}
		if (robot.radio) {
			if (!cycle.firstRadio) {
				cycle.firstRadio = now;
				cycle.timeRadio = now.getTime() - prestartMs;
			}
			cycle.lastRadio = now;
		}
		if (robot.rio) {
			if (!cycle.firstRio) {
				cycle.firstRio = now;
				cycle.timeRio = now.getTime() - prestartMs;
			}
			cycle.lastRio = now;
		}
		if (robot.code) {
			if (!cycle.firstCode) {
				cycle.firstCode = now;
				cycle.timeCode = now.getTime() - prestartMs;
			}
			cycle.lastCode = now;
		}

		// Composite readiness: all four connected. Record the LAST rising transition into
		// ready (start of the final ready streak) so a robot that connects, drops, and
		// reconnects is scored on when it FINALLY settled — that's what gates the match.
		const ready = dsGreen && robot.radio && robot.rio && robot.code;
		if (ready && !cycle.prevReady) {
			if (!cycle.firstReady) cycle.firstReady = now;
			cycle.lastReady = now;
			cycle.timeReady = now.getTime() - prestartMs;
		}
		cycle.prevReady = ready;
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
