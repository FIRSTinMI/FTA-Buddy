export interface MonitorFrame {
    field: FieldState;
    match: number;
    time: string;
    blue1: TeamInfo;
    blue2: TeamInfo;
    blue3: TeamInfo;
    red1: TeamInfo;
    red2: TeamInfo;
    red3: TeamInfo;
}

export interface TeamInfo {
    number: number;
    ds: DSState;
    radio: RadioState;
    rio: RioState;
    code: CodeState;
    bwu: number;
    battery: number; 
    ping: number;
    packets: number;
}

type FieldState = typeof UNKNOWN | typeof MATCH_RUNNING_TELEOP | typeof MATCH_TRANSITIONING | typeof MATCH_RUNNING_AUTO | typeof MATCH_READY | typeof PRESTART_COMPLETED | typeof PRESTART_INITIATED | typeof READY_TO_PRESTART | typeof MATCH_ABORTED | typeof MATCH_OVER | typeof READY_FOR_POST_RESULT;
type DSState =  typeof RED | typeof GREEN | typeof GREEN_X | typeof MOVE_STATION | typeof WRONG_MATCH | typeof BYPASS | typeof ESTOP;
type CodeState = typeof NO_CODE | typeof CODE;
type RadioState = typeof RED | typeof GREEN;
type RioState = typeof RED | typeof GREEN;

export const RED = 0;
export const GREEN = 1;
export const GREEN_X = 2;
export const MOVE_STATION = 3;
export const WRONG_MATCH = 4;
export const BYPASS = 5;
export const ESTOP = 6;
export const NO_CODE = 0;
export const CODE = 1;
export const UNKNOWN = 0;
export const MATCH_RUNNING_TELEOP = 1;
export const MATCH_TRANSITIONING = 2;
export const MATCH_RUNNING_AUTO = 3;
export const MATCH_READY = 4;
export const PRESTART_COMPLETED = 5;
export const PRESTART_INITIATED = 6;
export const READY_TO_PRESTART = 7;
export const MATCH_ABORTED = 8;
export const MATCH_OVER = 9;
export const READY_FOR_POST_RESULT = 10;