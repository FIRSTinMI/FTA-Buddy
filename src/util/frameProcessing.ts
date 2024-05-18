import { eq } from "drizzle-orm";
import { DSState, FieldState, MonitorFrame, PartialMonitorFrame, ROBOT, StateChange, StateChangeType, TeamInfo } from "../../shared/types";
import { db } from "../db/db";
import { events } from "../db/schema";
import { getEvent } from "./get-event";

export function detectStatusChange(currentFrame: PartialMonitorFrame, previousFrame: MonitorFrame | null) {
    const changes: StateChange[] = [];

    for (let _robot in ROBOT) {
        const robot = _robot as ROBOT;
        const currentRobot = (currentFrame[robot as keyof MonitorFrame] as TeamInfo);
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
