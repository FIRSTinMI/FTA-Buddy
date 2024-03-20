import { GREEN, GREEN_X, RED, type MonitorFrame, type TeamInfo, WRONG_MATCH, MOVE_STATION, ASTOP, ESTOP, CODE, NO_CODE } from "../../../shared/types";

const VIBRATION_PATTERNS = {
    ds: [1000, 200, 1000],
    radio: [500, 200, 1000],
    rio: [500, 200, 500],
    code: [500],
    estop: [200]
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
