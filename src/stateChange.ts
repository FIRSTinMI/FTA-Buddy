import { CODE, GREEN, GREEN_X, MonitorFrame, PRESTART_COMPLETED, PRESTART_INITIATED, RED, TeamInfo } from "../shared/types";

export interface StatusChange { [key: string]: { lastChange: Date, improved: boolean } };

export function detectStatusChange(statusChanges: StatusChange, currentFrame: MonitorFrame, previousFrame: MonitorFrame | null) {
    if (!previousFrame) return statusChanges;

    for (let robot of ['blue1', 'blue2', 'blue3', 'red1', 'red2', 'red3']) {
        const currentRobot = (currentFrame[robot as keyof MonitorFrame] as TeamInfo);
        const previousRobot = (previousFrame[robot as keyof MonitorFrame] as TeamInfo);
        
        if (currentFrame.field === PRESTART_COMPLETED && previousFrame.field === PRESTART_INITIATED) {
            statusChanges[robot].lastChange = new Date();
            statusChanges[robot].improved = true;
        } else if (previousRobot.ds !== currentRobot.ds) {
            statusChanges[robot].lastChange = new Date();
            // DS states are numbered 0: red, 1: green, 2: green x, 3: move station, 4: wrong match, 5: bypass, 6: estop, 7: astop
            statusChanges[robot].improved = (currentRobot.ds === RED) ? false : (previousRobot.ds === RED) ? true : currentRobot.ds < previousRobot.ds;
        } else if (previousRobot.radio !== currentRobot.radio) {
            statusChanges[robot].lastChange = new Date();
            statusChanges[robot].improved = (currentRobot.radio === GREEN);
        } else if (previousRobot.rio !== currentRobot.rio) {
            statusChanges[robot].lastChange = new Date();
            statusChanges[robot].improved = (currentRobot.rio === GREEN || currentRobot.rio === GREEN_X);
            console.log('rio', robot, currentRobot.rio, previousRobot.rio);
        } else if (previousRobot.code !== currentRobot.code) {
            statusChanges[robot].lastChange = new Date();
            statusChanges[robot].improved = (currentRobot.code === CODE);
            console.log('code', robot, currentRobot.code, previousRobot.code);
        }
    }

    return statusChanges;
}
