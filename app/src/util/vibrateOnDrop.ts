import { GREEN, GREEN_X, RED, type MonitorFrame, type TeamInfo, WRONG_MATCH, MOVE_STATION, ASTOP, ESTOP, CODE, NO_CODE } from "../../../shared/types";

const VIBRATION_PATTERNS = {
    ds: [500, 200, 500],
    radio: [200, 200, 500],
    rio: [200, 100, 200],
    code: [200],
    estop: [100]
}

export interface StatusChange { [key: string]: { lastChange: Date, improved: boolean } };

export function detectStatusChange(statusChanges: StatusChange, currentFrame: MonitorFrame, previousFrame: MonitorFrame | null) {
    if (!previousFrame) return statusChanges;

    for (let robot of ['blue1', 'blue2', 'blue3', 'red1', 'red2', 'red3']) {
        const currentRobot = (currentFrame[robot as keyof MonitorFrame] as TeamInfo);
        const previousRobot = (previousFrame[robot as keyof MonitorFrame] as TeamInfo);

        if (previousRobot.ds !== currentRobot.ds) {
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

export function vibrateHandleMonitorFrame(frame: MonitorFrame, previousFrame: MonitorFrame | null) {
    if (!window.navigator.vibrate || !previousFrame) return;

    for (let robot of ['blue1', 'blue2', 'blue3', 'red1', 'red2', 'red3']) {
        const currentRobot = (frame[robot as keyof MonitorFrame] as TeamInfo);
        const previousRobot = (previousFrame[robot as keyof MonitorFrame] as TeamInfo);

        if (previousRobot.ds === GREEN && [GREEN_X, RED, WRONG_MATCH, MOVE_STATION].includes(currentRobot.ds)) {
            window.navigator.vibrate(VIBRATION_PATTERNS.ds);
        } else if (previousRobot.radio === GREEN && currentRobot.radio !== GREEN) {
            window.navigator.vibrate(VIBRATION_PATTERNS.radio);
        } else if (previousRobot.rio === GREEN && currentRobot.rio !== GREEN) {
            window.navigator.vibrate(VIBRATION_PATTERNS.rio);
        } else if (previousRobot.code === CODE && currentRobot.code !== CODE) {
            window.navigator.vibrate(VIBRATION_PATTERNS.code);
        } else if (![ASTOP, ESTOP].includes(previousRobot.ds) && [ASTOP, ESTOP].includes(currentRobot.ds)) {
            window.navigator.vibrate(VIBRATION_PATTERNS.estop);
        }
    }
}
