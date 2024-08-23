import { eq } from "drizzle-orm";
import { DSState, FieldState, MatchState, MatchStateMap, MonitorFrame, PartialMonitorFrame, ROBOT, StateChange, StateChangeType, TeamInfo, TeamWarnings } from "../../shared/types";
import { db } from "../db/db";
import { events, teamCycleLogs } from "../db/schema";
import { getEvent } from "./get-event";
import { randomUUID } from "crypto";
import { TeamCycleLog } from "../db/schema";

export function detectStatusChange(currentFrame: PartialMonitorFrame, previousFrame: MonitorFrame | null) {
    const changes: StateChange[] = [];

    for (let _robot in ROBOT) {
        const robot = _robot as ROBOT;
        const currentRobot = (currentFrame[robot as keyof MonitorFrame] as TeamInfo);

        currentRobot.warnings = [];

        if (previousFrame) {
            const previousRobot = (previousFrame[robot as keyof MonitorFrame] as TeamInfo);

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

export async function processTeamWarnings(eventCode: string, frame: MonitorFrame) {
    const event = await getEvent('', eventCode);

    for (let station in ROBOT) {
        let team = frame[station as keyof MonitorFrame] as TeamInfo;
        if (!event.checklist[team.number]) continue;
        if (!event.checklist[team.number].inspected) {
            team.warnings.push(TeamWarnings.NOT_INSPECTED);
        }
        if (!event.checklist[team.number].radioProgrammed) {
            team.warnings.push(TeamWarnings.RADIO_NOT_FLASHED);
        }
    }

    return frame;
}

export async function processTeamCycles(eventCode: string, frame: MonitorFrame, changes: StateChange[]) {
    const event = await getEvent('', eventCode);

    // If the match is running and there is data, commit it and reset the tracking object
    if (MatchStateMap[frame.field] === MatchState.RUNNING && event.teamCycleTracking.prestart) {
        const insert = [];

        for (let team in ROBOT) {
            const teamCycle = event.teamCycleTracking[team as ROBOT];
            if (!teamCycle) continue;
            insert.push({
                id: randomUUID(),
                event: eventCode,
                match_number: frame.match,
                play_number: frame.play,
                level: frame.level,
                team: teamCycle.team,
                prestart: event.teamCycleTracking.prestart,
                first_ds: teamCycle.firstDS,
                last_ds: teamCycle.lastDS,
                time_ds: teamCycle.timeDS,
                first_radio: teamCycle.firstRadio,
                last_radio: teamCycle.lastRadio,
                time_radio: teamCycle.timeRadio,
                first_rio: teamCycle.firstRio,
                last_rio: teamCycle.lastRio,
                time_rio: teamCycle.timeRio,
                first_code: teamCycle.firstCode,
                last_code: teamCycle.lastCode,
                time_code: teamCycle.timeCode
            });
        }

        console.log(insert);

        await db.insert(teamCycleLogs).values(insert);
        event.teamCycleTracking = {};
    }

    // Only process in prestart
    if (MatchStateMap[frame.field] !== MatchState.PRESTART) return;

    // If new match, set the prestart time
    if (!event.teamCycleTracking.prestart) event.teamCycleTracking.prestart = event.lastPrestartDone || new Date();

    for (let change of changes) {
        let cycle = event.teamCycleTracking[change.station];

        if (!cycle) {
            event.teamCycleTracking[change.station] = {
                team: change.robot.number
            };
            cycle = event.teamCycleTracking[change.station];
        }

        if (!cycle) throw new Error('You should never see this error, but if you do look at the processTeamCycles function in util/frameProcessing');

        if (change.type === StateChangeType.RisingEdge && change.key === 'ds' && change.robot.ds === DSState.GREEN) {
            if (!cycle.firstDS) cycle.firstDS = change.robot.lastChange || new Date();
            cycle.lastDS = change.robot.lastChange || new Date();
            cycle.timeDS = cycle.lastDS.getTime() - event.teamCycleTracking.prestart.getTime();
        } else if (change.type === StateChangeType.RisingEdge && change.key === 'radio') {
            if (!cycle.firstRadio) cycle.firstRadio = change.robot.lastChange || new Date();
            cycle.lastRadio = change.robot.lastChange || new Date();
            cycle.timeRadio = cycle.lastRadio.getTime() - event.teamCycleTracking.prestart.getTime();
        } else if (change.type === StateChangeType.RisingEdge && change.key === 'rio') {
            if (!cycle.firstRio) cycle.firstRio = change.robot.lastChange || new Date();
            cycle.lastRio = change.robot.lastChange || new Date();
            cycle.timeRio = cycle.lastRio.getTime() - event.teamCycleTracking.prestart.getTime();
        } else if (change.type === StateChangeType.RisingEdge && change.key === 'code') {
            if (!cycle.firstCode) cycle.firstCode = change.robot.lastChange || new Date();
            cycle.lastCode = change.robot.lastChange || new Date();
            cycle.timeCode = cycle.lastCode.getTime() - event.teamCycleTracking.prestart.getTime();
        }
    }
}
