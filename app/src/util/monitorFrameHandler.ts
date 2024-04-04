import { ROBOT, type MonitorFrame, type TeamInfo, CODE, GREEN, GREEN_X, PRESTART_COMPLETED, PRESTART_INITIATED, RED, MATCH_TRANSITIONING, MATCH_RUNNING_AUTO, MATCH_RUNNING_TELEOP, MATCH_ABORTED, MATCH_OVER, READY_FOR_POST_RESULT, READY_TO_PRESTART, BYPASS, WRONG_MATCH, MOVE_STATION, NO_CODE, MATCH_READY } from "../../../shared/types";

export enum MatchState {
    RUNNING,
    OVER,
    PRESTART
}

export interface MonitorEvent extends CustomEvent {
    detail: {
        robot: ROBOT;
        frame: MonitorFrame;
        match: MatchState;
    }
}

export class MonitorFrameHandler extends EventTarget {
    private frames: MonitorFrame[] = [];
    private alertsPlayed: {[key in ROBOT]: {ds: boolean, radio: boolean, rio: boolean, code: boolean}} = {
        red1: { ds: false, radio: false, rio: false, code: false },
        red2: { ds: false, radio: false, rio: false, code: false },
        red3: { ds: false, radio: false, rio: false, code: false },
        blue1: { ds: false, radio: false, rio: false, code: false },
        blue2: { ds: false, radio: false, rio: false, code: false },
        blue3: { ds: false, radio: false, rio: false, code: false }
    };

    constructor() {
        super();
        this.frames = [];
    }

    public feed(frame: MonitorFrame) {
        for (let key in ROBOT) {
            const robot = key as ROBOT;
            let change = frame.statusChanges[robot];
            frame.statusChanges[robot] = {
                lastChange: new Date(change.lastChange),
                improved: change.improved,
            };
        }

        this.frames.push(frame);
        if (this.frames.length > 50) this.frames.shift();
        this.process();
    }

    public process() {
        const currentFrame = this.getFrame();
        const previousFrame = this.getPreviousFrame();

        if (!currentFrame || !previousFrame) return;

        const currentMatchState = ([MATCH_RUNNING_TELEOP, MATCH_RUNNING_AUTO, MATCH_TRANSITIONING].includes(currentFrame.field)) ? MatchState.RUNNING : ([MATCH_OVER, MATCH_ABORTED, READY_FOR_POST_RESULT, READY_TO_PRESTART].includes(currentFrame.field)) ? MatchState.OVER : MatchState.PRESTART;
        const previousMatchState = ([MATCH_RUNNING_TELEOP, MATCH_RUNNING_AUTO, MATCH_TRANSITIONING].includes(previousFrame.field)) ? MatchState.RUNNING : ([MATCH_OVER, MATCH_ABORTED, READY_FOR_POST_RESULT, READY_TO_PRESTART].includes(previousFrame.field)) ? MatchState.OVER : MatchState.PRESTART;

        if (currentFrame.field === PRESTART_COMPLETED && previousFrame.field === PRESTART_INITIATED) {
            this.dispatchEvent(new CustomEvent('prestart', { detail: { frame: currentFrame, match: currentMatchState } }));
        } else if (currentMatchState === MatchState.OVER && previousMatchState !== MatchState.OVER) {
            this.dispatchEvent(new CustomEvent('match-over', { detail: { frame: currentFrame, match: currentMatchState } }));
        } else if (currentMatchState === MatchState.RUNNING && previousMatchState !== MatchState.RUNNING) {
            this.dispatchEvent(new CustomEvent('match-start', { detail: { frame: currentFrame, match: currentMatchState } }));
        }

        if (currentFrame.field === MATCH_READY && previousFrame.field !== MATCH_READY) {
            this.dispatchEvent(new CustomEvent('match-ready', { detail: { frame: currentFrame, match: currentMatchState } }));
        }

        for (let _robot in ROBOT) {
            const robot = _robot as ROBOT;
            const currentRobot = (currentFrame[robot as keyof MonitorFrame] as TeamInfo);
            const previousRobot = (previousFrame[robot as keyof MonitorFrame] as TeamInfo);

            // Run events when something changes
            if (previousRobot.ds !== currentRobot.ds) {
                // DS states are numbered 0: red, 1: green, 2: green x, 3: move station, 4: wrong match, 5: bypass, 6: estop, 7: astop
                const improved = (currentRobot.ds === RED) ? false : (previousRobot.ds === RED) ? true : currentRobot.ds < previousRobot.ds;
                this.dispatchEvent(new CustomEvent((improved) ? 'ds-connect' : 'ds-drop', { detail: { robot, frame: currentFrame, match: currentMatchState } }));
            } else if (previousRobot.radio !== currentRobot.radio) {
                const improved = (currentRobot.radio === GREEN);
                this.dispatchEvent(new CustomEvent((improved) ? 'radio-connect' : 'radio-drop', { detail: { robot, frame: currentFrame, match: currentMatchState } }));
            } else if (previousRobot.rio !== currentRobot.rio) {
                const improved = (currentRobot.rio === GREEN || currentRobot.rio === GREEN_X);
                this.dispatchEvent(new CustomEvent((improved) ? 'rio-connect' : 'rio-drop', { detail: { robot, frame: currentFrame, match: currentMatchState } }));
            } else if (previousRobot.code !== currentRobot.code) {
                const improved = (currentRobot.code === CODE);
                this.dispatchEvent(new CustomEvent((improved) ? 'code-connect' : 'code-drop', { detail: { robot, frame: currentFrame, match: currentMatchState } }));
            }

            // Reset alerts played if prestart happened
            if (currentMatchState === MatchState.PRESTART && previousMatchState !== MatchState.PRESTART) {
                this.alertsPlayed[robot] = { ds: false, radio: false, rio: false, code: false };
            }

            if (currentRobot.ds === RED) {
                if (this.alertsPlayed[robot].ds || currentFrame.statusChanges[robot].lastChange.getTime() + 45e3 > new Date().getTime()) continue;
                this.alertsPlayed[robot].ds = true;
                this.dispatchEvent(new CustomEvent('ds-alert', { detail: { robot, frame: currentFrame, match: currentMatchState } }));
            } else if (currentRobot.ds === GREEN_X) {
                if (this.alertsPlayed[robot].ds || currentFrame.statusChanges[robot].lastChange.getTime() + 30e3 > new Date().getTime()) continue;
                this.alertsPlayed[robot].ds = true;
                this.dispatchEvent(new CustomEvent('ds-alert', { detail: { robot, frame: currentFrame, match: currentMatchState } }));
            } else if (currentRobot.radio === RED) {
                if (this.alertsPlayed[robot].radio || currentFrame.statusChanges[robot].lastChange.getTime() + 240e3 > new Date().getTime()) continue;
                this.alertsPlayed[robot].radio = true;
                this.dispatchEvent(new CustomEvent('radio-alert', { detail: { robot, frame: currentFrame, match: currentMatchState } }));
            } else if (currentRobot.rio === RED) {
                if (this.alertsPlayed[robot].rio || currentFrame.statusChanges[robot].lastChange.getTime() + 45e3 > new Date().getTime()) continue;
                this.alertsPlayed[robot].rio = true;
                this.dispatchEvent(new CustomEvent('rio-alert', { detail: { robot, frame: currentFrame, match: currentMatchState } }));
            } else if (currentRobot.code === NO_CODE) {
                if (this.alertsPlayed[robot].code || currentFrame.statusChanges[robot].lastChange.getTime() + 30e3 > new Date().getTime()) continue;
                this.alertsPlayed[robot].code = true;
                this.dispatchEvent(new CustomEvent('code-alert', { detail: { robot, frame: currentFrame, match: currentMatchState } }));
            }
        }
    }

    public getFrame() {
        if (this.frames.length === 0) return undefined;
        return this.frames[this.frames.length - 1];
    }

    public getPreviousFrame() {
        if (this.frames.length < 2) return undefined;
        return this.frames[this.frames.length - 2];
    }

    public getRobotFrame(robot: ROBOT) {
        return this.getFrame()?.[robot];
    }

    public getRobotPreviousFrame(robot: ROBOT) {
        return this.getPreviousFrame()?.[robot];
    }

    public getHistory(robot: ROBOT, type: keyof TeamInfo, length: number = 50) {
        return this.frames.map((frame) => frame[robot]?.[type]).slice(-length);
    }

    public getStatusChanges() {
        return this.getFrame()?.statusChanges;
    }
}
