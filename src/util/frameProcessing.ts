import { eq } from "drizzle-orm";
import { DSState, FieldState, MatchState, MatchStateMap, MonitorFrame, PartialMonitorFrame, ROBOT, StateChange, StateChangeType, TeamInfo, TeamWarnings } from "../../shared/types";
import { db } from "../db/db";
import { events, teamCycleLogs } from "../db/schema";
import { getEvent } from "./get-event";
import { getTeamCycle } from "./team-cycles";

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
            } else if (!(currentRobot.lastChange || previousRobot.lastChange)) {
                currentRobot.lastChange = null;
                currentRobot.improved = false;
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

    // Only process in prestart
    if (MatchStateMap[frame.field] !== MatchState.PRESTART) return frame;

    for (let change of changes) {
        const cycle = await getTeamCycle(eventCode, change.robot.number, frame.match, frame.play, frame.level);

        if (!cycle.prestart) cycle.prestart = event.lastPrestartDone || new Date();

        if (change.type === StateChangeType.RisingEdge && change.key === 'ds' && change.robot.ds === DSState.GREEN) {
            if (!cycle.first_ds) cycle.first_ds = change.robot.lastChange || new Date();
            cycle.last_ds = change.robot.lastChange || new Date();
            cycle.time_ds = cycle.last_ds.getTime() - cycle.prestart.getTime();
        } else if (change.type === StateChangeType.RisingEdge && change.key === 'radio') {
            if (!cycle.first_radio) cycle.first_radio = change.robot.lastChange || new Date();
            cycle.last_radio = change.robot.lastChange || new Date();
            cycle.time_radio = cycle.last_radio.getTime() - cycle.prestart.getTime();
        } else if (change.type === StateChangeType.RisingEdge && change.key === 'rio') {
            if (!cycle.first_rio) cycle.first_rio = change.robot.lastChange || new Date();
            cycle.last_rio = change.robot.lastChange || new Date();
            cycle.time_rio = cycle.last_rio.getTime() - cycle.prestart.getTime();
        } else if (change.type === StateChangeType.RisingEdge && change.key === 'code') {
            if (!cycle.first_code) cycle.first_code = change.robot.lastChange || new Date();
            cycle.last_code = change.robot.lastChange || new Date();
            cycle.time_code = cycle.last_code.getTime() - cycle.prestart.getTime();
        }

        await db.update(teamCycleLogs).set(cycle).where(eq(teamCycleLogs.id, cycle.id));
    }
}
