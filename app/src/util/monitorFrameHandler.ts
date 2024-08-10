import { cycleTimeToMS } from "../../../shared/cycleTimeToMS";
import { DSState, FieldState, MatchState, MatchStateMap, ROBOT, StateChangeType, type MonitorFrame, type StateChange, type TeamInfo } from "../../../shared/types";

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

    public setHistory(history: MonitorFrame[]) {
        this.frames = history;
    }

    public feed(frame: MonitorFrame) {
        this.frames.push(frame);
        if (this.frames.length > 50) this.frames.shift();
        this.process();

        this.dispatchEvent(new CustomEvent('frame', {
            detail: {
                frame,
                match: MatchStateMap[frame.field]
            }
        }));
    }

    // Fires events when field state changes
    public fieldStatusChange(field: FieldState) {
        if (field === FieldState.PRESTART_COMPLETED) {
            this.dispatchEvent(new CustomEvent('prestart', { detail: { frame: this.getFrame(), match: MatchState.PRESTART } }));
        } else if (field === FieldState.MATCH_OVER) {
            this.dispatchEvent(new CustomEvent('match-over', { detail: { frame: this.getFrame(), match: MatchState.OVER } }));
        } else if (field === FieldState.MATCH_RUNNING_AUTO) {
            this.dispatchEvent(new CustomEvent('match-start', { detail: { frame: this.getFrame(), match: MatchState.RUNNING } }));
        } else if (field === FieldState.MATCH_READY) {
            this.dispatchEvent(new CustomEvent('match-ready', { detail: { frame: this.getFrame(), match: MatchState.RUNNING } }));
        }
    }

    // Fires events when robot status changes
    public robotStatusChange(change: StateChange) {
        const robot = change.station;
        const frame = this.getFrame();
        if (!frame) return;
        const match = MatchStateMap[frame.field];

        if (change.key === 'ds') {
            this.dispatchEvent(new CustomEvent(
                (change.type === StateChangeType.RisingEdge) ? 'ds-connect' : 'ds-drop',
                {
                    detail: { robot, frame, match }
                }));
        } else if (change.key === 'radio') {
            this.dispatchEvent(new CustomEvent(
                (change.type === StateChangeType.RisingEdge) ? 'radio-connect' : 'radio-drop',
                {
                    detail: { robot, frame, match }
                }));
        } else if (change.key === 'rio') {
            this.dispatchEvent(new CustomEvent(
                (change.type === StateChangeType.RisingEdge) ? 'rio-connect' : 'rio-drop',
                {
                    detail: { robot, frame, match }
                }));
        } else if (change.key === 'code') {
            this.dispatchEvent(new CustomEvent(
                (change.type === StateChangeType.RisingEdge) ? 'code-connect' : 'code-drop',
                {
                    detail: { robot, frame, match }
                }));
        }
    }

    // Fires events when a robot is taking longer than usual to connect
    public process() {
        const currentFrame = this.getFrame();
        const previousFrame = this.getPreviousFrame();

        if (!currentFrame || !previousFrame) return;

        const currentMatchState = ([FieldState.MATCH_RUNNING_TELEOP, FieldState.MATCH_RUNNING_AUTO, FieldState.MATCH_TRANSITIONING].includes(currentFrame.field)) ? MatchState.RUNNING : ([FieldState.MATCH_OVER, FieldState.MATCH_ABORTED, FieldState.READY_FOR_POST_RESULT, FieldState.READY_TO_PRESTART].includes(currentFrame.field)) ? MatchState.OVER : MatchState.PRESTART;
        const previousMatchState = ([FieldState.MATCH_RUNNING_TELEOP, FieldState.MATCH_RUNNING_AUTO, FieldState.MATCH_TRANSITIONING].includes(previousFrame.field)) ? MatchState.RUNNING : ([FieldState.MATCH_OVER, FieldState.MATCH_ABORTED, FieldState.READY_FOR_POST_RESULT, FieldState.READY_TO_PRESTART].includes(previousFrame.field)) ? MatchState.OVER : MatchState.PRESTART;

        for (let _robot in ROBOT) {
            const robot = _robot as ROBOT;
            const currentRobot = (currentFrame[robot as keyof MonitorFrame] as TeamInfo);
            const previousRobot = (previousFrame[robot as keyof MonitorFrame] as TeamInfo);

            // Reset alerts played if prestart happened
            if (currentMatchState === MatchState.PRESTART && previousMatchState !== MatchState.PRESTART) {
                this.alertsPlayed[robot] = { ds: false, radio: false, rio: false, code: false };
            }

            if (currentRobot.lastChange) {
                if (currentRobot.ds === DSState.RED) {
                    if (this.alertsPlayed[robot].ds || currentRobot.lastChange.getTime() + 45e3 > new Date().getTime()) continue;
                    this.alertsPlayed[robot].ds = true;
                    this.dispatchEvent(new CustomEvent('ds-alert', { detail: { robot, frame: currentFrame, match: currentMatchState } }));
                } else if (currentRobot.ds === DSState.GREEN_X) {
                    if (this.alertsPlayed[robot].ds || currentRobot.lastChange.getTime() + 30e3 > new Date().getTime()) continue;
                    this.alertsPlayed[robot].ds = true;
                    this.dispatchEvent(new CustomEvent('ds-alert', { detail: { robot, frame: currentFrame, match: currentMatchState } }));
                } else if (!currentRobot.radio) {
                    if (this.alertsPlayed[robot].radio || currentRobot.lastChange.getTime() + 240e3 > new Date().getTime()) continue;
                    this.alertsPlayed[robot].radio = true;
                    this.dispatchEvent(new CustomEvent('radio-alert', { detail: { robot, frame: currentFrame, match: currentMatchState } }));
                } else if (!currentRobot.rio) {
                    if (this.alertsPlayed[robot].rio || currentRobot.lastChange.getTime() + 45e3 > new Date().getTime()) continue;
                    this.alertsPlayed[robot].rio = true;
                    this.dispatchEvent(new CustomEvent('rio-alert', { detail: { robot, frame: currentFrame, match: currentMatchState } }));
                } else if (!currentRobot.code) {
                    if (this.alertsPlayed[robot].code || currentRobot.lastChange.getTime() + 30e3 > new Date().getTime()) continue;
                    this.alertsPlayed[robot].code = true;
                    this.dispatchEvent(new CustomEvent('code-alert', { detail: { robot, frame: currentFrame, match: currentMatchState } }));
                }
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

    public getLastCycleTime() {
        const thisFrame = this.getFrame();
        const lastCycleTime = thisFrame?.lastCycleTime;
        console.log(lastCycleTime);
        if (lastCycleTime) {
            return cycleTimeToMS(lastCycleTime);
        } else {
            return undefined;
        }
    }
}
