import { eq, and, desc } from "drizzle-orm";
import { DSState, FieldState, MatchState, MatchStateMap, MonitorFrame, PartialMonitorFrame, ROBOT, StateChange, StateChangeType, RobotInfo, RobotWarnings } from "../../shared/types";
import { db } from "../db/db";
import { events, tickets, robotCycleLogs } from "../db/schema";
import { getEvent } from "./get-event";
import { randomUUID } from "crypto";

export function detectRadioNoDs(currentFrame: PartialMonitorFrame, pastFrames: MonitorFrame[]) {
    // Only in prestart
    if (MatchStateMap[currentFrame.field] !== MatchState.PRESTART) return currentFrame;
    for (let _robot in ROBOT) {
        const robot = _robot as ROBOT;
        const currentRobot = (currentFrame[robot as keyof PartialMonitorFrame] as RobotInfo);
        const currentSignal = currentRobot.signal;

        if (currentSignal === 0 || currentRobot.ds === DSState.GREEN) continue;

        const pastSignals = (pastFrames.slice(-20).map(f => (f[robot as keyof MonitorFrame] as RobotInfo).signal));

        // If the signal hasn't changed in the last 20 frames, the radio probably disconnected
        if (pastSignals.every(signal => signal === currentSignal)) continue;

        // Otherwise the radio is probably connected without DS
        currentRobot.radio = true;
    }

    return currentFrame;
}

export function detectStatusChange(currentFrame: PartialMonitorFrame, previousFrame: MonitorFrame | null) {
    const changes: StateChange[] = [];

    for (let _robot in ROBOT) {
        const robot = _robot as ROBOT;
        const currentRobot = (currentFrame[robot as keyof MonitorFrame] as RobotInfo);

        currentRobot.warnings = [];

        if (previousFrame) {
            const previousRobot = (previousFrame[robot as keyof MonitorFrame] as RobotInfo);

            if (currentFrame.field === FieldState.PRESTART_COMPLETED && previousFrame.field === FieldState.PRESTART_INITIATED) {
                currentRobot.lastChange = new Date();
                currentRobot.improved = true;
            } else if (previousRobot.ds !== currentRobot.ds) {
                currentRobot.lastChange = new Date();
                // DS states are numbered 0: red, 1: green, 2: green x, 3: move station, 4: wrong match, 5: bypass, 6: estop, 7: astop
                currentRobot.improved = (currentRobot.ds === DSState.RED) ? false : (previousRobot.ds === DSState.RED) ? true : currentRobot.ds < previousRobot.ds;
                changes.push({ station: robot, robot: currentRobot, type: currentRobot.improved ? StateChangeType.RisingEdge : StateChangeType.FallingEdge, key: 'ds', oldValue: previousRobot.ds, newValue: currentRobot.ds });
            } else if (previousRobot.radio !== currentRobot.radio) {
                currentRobot.lastChange = new Date();
                currentRobot.improved = currentRobot.radio;
                changes.push({ station: robot, robot: currentRobot, type: currentRobot.improved ? StateChangeType.RisingEdge : StateChangeType.FallingEdge, key: 'radio', oldValue: previousRobot.radio, newValue: currentRobot.radio });
            } else if (previousRobot.rio !== currentRobot.rio) {
                currentRobot.lastChange = new Date();
                currentRobot.improved = currentRobot.rio;
                changes.push({ station: robot, robot: currentRobot, type: currentRobot.improved ? StateChangeType.RisingEdge : StateChangeType.FallingEdge, key: 'rio', oldValue: previousRobot.rio, newValue: currentRobot.rio });
            } else if (previousRobot.code !== currentRobot.code) {
                currentRobot.lastChange = new Date();
                currentRobot.improved = currentRobot.code;
                changes.push({ station: robot, robot: currentRobot, type: currentRobot.improved ? StateChangeType.RisingEdge : StateChangeType.FallingEdge, key: 'code', oldValue: previousRobot.code, newValue: currentRobot.code });
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
    const event = await getEvent('', eventCode);
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
    const event = await getEvent('', eventCode);

    for (let station in ROBOT) {
        let robot = frame[station as keyof MonitorFrame] as RobotInfo;
        if (!event.checklist[robot.number]) continue;
        if (!event.checklist[robot.number].inspected) {
            robot.warnings.push(RobotWarnings.NOT_INSPECTED);
        }
        if (!event.checklist[robot.number].radioProgrammed) {
            robot.warnings.push(RobotWarnings.RADIO_NOT_FLASHED);
        }

        // The ticket warning is expensive on database transactions so only run it one time when prestart completes
        if (frame.field === FieldState.PRESTART_COMPLETED && previousFrame.field === FieldState.PRESTART_INITIATED) {
            const teamTickets = await db.select()
                .from(tickets)
                .where(and(
                    eq(tickets.team, robot.number),
                    eq(tickets.event_code, event.code),
                )).orderBy(tickets.updated_at);

            const openTicket = teamTickets.find(ticket => ticket.is_open);
            if (openTicket) {
                robot.warnings.push(RobotWarnings.OPEN_TICKET);
            } else {
                // Find what their last match was
                const previousMatch = await db.select()
                    .from(robotCycleLogs)
                    .where(and(
                        eq(robotCycleLogs.team, robot.number),
                        eq(robotCycleLogs.event, event.code)
                    ))
                    .orderBy(desc(robotCycleLogs.prestart))
                    .limit(1);

                const recentlyClosedTickets = teamTickets.filter(ticket => !ticket.is_open);
                let previousMatchStart = new Date();
                if (previousMatch[0] && previousMatch[0].prestart) previousMatchStart = previousMatch[0].prestart;

                for (let ticket of recentlyClosedTickets) {
                    // If ticket is closed and there either is no previous match or the previous match start time was before the ticket closed time
                    if (ticket.closed_at && (!previousMatchStart || ticket.closed_at > previousMatchStart)) {
                        robot.warnings.push(RobotWarnings.RECENT_TICKET);
                        continue;
                    }
                }
            }

            // Then copy the warnings from the previous frame until the match ends
        } else if (!(frame.field === FieldState.MATCH_OVER || frame.field === FieldState.MATCH_ABORTED)) {
            const previousFrameWarnings = previousFrame[station as keyof MonitorFrame] as RobotInfo;

            if (previousFrameWarnings.warnings.includes(RobotWarnings.OPEN_TICKET)) robot.warnings.push(RobotWarnings.OPEN_TICKET);
            if (previousFrameWarnings.warnings.includes(RobotWarnings.RECENT_TICKET)) robot.warnings.push(RobotWarnings.RECENT_TICKET);
        }
    }

    return frame;
}

export async function processTeamCycles(eventCode: string, frame: MonitorFrame, changes: StateChange[]) {
    const event = await getEvent('', eventCode);

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
                time_code: robotCycle.timeCode
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
                team: change.robot.number
            };
            cycle = event.robotCycleTracking[change.station];
        }

        if (!cycle) throw new Error('You should never see this error, but if you do look at the processTeamCycles function in util/frameProcessing');

        if (change.type !== StateChangeType.RisingEdge || change.robot.ds !== DSState.GREEN) return;

        switch (change.key) {
            case 'code':
                if (!cycle.firstCode) cycle.firstCode = change.robot.lastChange || new Date();
                cycle.lastCode = change.robot.lastChange || new Date();
                cycle.timeCode = cycle.lastCode.getTime() - event.robotCycleTracking.prestart.getTime();
            case 'rio':
                if (!cycle.firstRio) cycle.firstRio = change.robot.lastChange || new Date();
                cycle.lastRio = change.robot.lastChange || new Date();
                cycle.timeRio = cycle.lastRio.getTime() - event.robotCycleTracking.prestart.getTime();
            case 'radio':
                if (!cycle.firstRadio) cycle.firstRadio = change.robot.lastChange || new Date();
                cycle.lastRadio = change.robot.lastChange || new Date();
                cycle.timeRadio = cycle.lastRadio.getTime() - event.robotCycleTracking.prestart.getTime();
                break;
            case 'ds':
                if (!cycle.firstDS) cycle.firstDS = change.robot.lastChange || new Date();
                cycle.lastDS = change.robot.lastChange || new Date();
                cycle.timeDS = cycle.lastDS.getTime() - event.robotCycleTracking.prestart.getTime();
        }
    }
}
