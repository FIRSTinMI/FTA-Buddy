import WebSocket from "ws";

export interface MonitorFrame {
    field: FieldState;
    match: number;
    time: string;
    version: string;
    frameTime: number;
    blue1: TeamInfo;
    blue2: TeamInfo;
    blue3: TeamInfo;
    red1: TeamInfo;
    red2: TeamInfo;
    red3: TeamInfo;
    statusChanges: StatusChanges;
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
    MAC: string | null;
    RX: number | null;
    RXMCS: number | null;
    TX: number | null;
    TXMCS: number | null;
    SNR: number | null;
    noise: number | null;
    signal: number | null;
    versionmm: 0 | 1;
}

export interface Event {
    teams: number[];
    monitor: MonitorFrame;
    ip?: string;
    socketClients: WebSocket[];
    socketServer?: WebSocket;
}

export interface Message {
    id: number;
    profile: number;
    event: string;
    team: number;
    message: string;
    created: Date;
    username: string;
}

export enum ROBOT {
    blue1 = 'blue1',
    blue2 = 'blue2',
    blue3 = 'blue3',
    red1 = 'red1',
    red2 = 'red2',
    red3 = 'red3'
}

export type StatusChanges = { [key in ROBOT]: { lastChange: Date, improved: boolean } };

export type Station = ROBOT;
export type FieldState = typeof UNKNOWN | typeof MATCH_RUNNING_TELEOP | typeof MATCH_TRANSITIONING | typeof MATCH_RUNNING_AUTO | typeof MATCH_READY | typeof PRESTART_COMPLETED | typeof PRESTART_INITIATED | typeof READY_TO_PRESTART | typeof MATCH_ABORTED | typeof MATCH_OVER | typeof READY_FOR_POST_RESULT | typeof MATCH_NOT_READY;
export type DSState = typeof RED | typeof GREEN | typeof GREEN_X | typeof MOVE_STATION | typeof WRONG_MATCH | typeof BYPASS | typeof ESTOP | typeof ASTOP;
export type CodeState = typeof NO_CODE | typeof CODE;
export type RadioState = typeof RED | typeof GREEN;
export type RioState = typeof RED | typeof GREEN | typeof GREEN_X;

export const RED = 0;
export const GREEN = 1;
export const GREEN_X = 2;
export const MOVE_STATION = 3;
export const WRONG_MATCH = 4;
export const BYPASS = 5;
export const ESTOP = 6;
export const ASTOP = 7;
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
export const MATCH_NOT_READY = 11;

export interface SignalRTeamInfo {
    p1: SignalREnums.AllianceType;
    p2: SignalREnums.StationType; // Station
    p3: number; // Team Number
    p4: boolean; // Connection
    p5: boolean; // Link active
    p6: boolean; // DS Link active
    p7: boolean; // Radio Link
    p8: boolean; // RIO Link
    p9: boolean; // is enabled
    pa: boolean; // is auto
    pb: boolean; // is bypassed
    pc: boolean; // estop pressed
    pd: boolean; // is estopped (reported back as estopped?)
    pe: number; // battery
    pf: SignalREnums.StationStatusType; // monitor status?
    pg: number; // ping
    ph: number; // dropped packets
    pi: string | null; // signal
    pj: string | null; // noise
    pk: number; // SNR
    pl: number; // Inactivity?
    pm: string | null; // MAC
    pn: number | null; // TxRate
    po: number | null; // TxMCS
    pp: number | null; // TxMCSBandwidth
    pq: boolean | null; // TxVHT
    pr: number | null; // TxVHTNSS
    ps: number; // TxPackets
    pt: number | null; // RxRate
    pu: number | null; // RxMCS
    pv: number | null; // RxMCSBandwidth
    pw: boolean | null; // RxVHT
    px: number | null; // RxVHTNSS
    py: number; // RxPackets
    pz: number; // DataRateTotal
    paa: number; // DataRateToRobot
    pbb: number; // DataRateFromRobot
    pcc: number; // BWU
    pdd: SignalREnums.WPAKeyStatusType; // WPAKeyStatus
    pee: boolean; // DS is official
    pff: number; // Station status 
    pgg: boolean; // brownout
    phh: string; // ?
}
export namespace SignalREnums {
    export enum TournamentLevel {
        None = 0,
        Practice = 1,
        Qualification = 2,
        Playoff = 3
    }

    export enum AllianceType {
        None = 0,
        Red = 1,
        Blue = 2
    }

    export enum StationType {
        None = 0,
        Station1 = 1,
        Station2 = 2,
        Station3 = 3
    }

    export enum MonitorStatusType {
        Unknown,
        EStopped,
        DisabledAuto,
        DisabledTeleop,
        EnabledAuto,
        EnabledTeleop
    }

    export enum BWUtilizationType {
        Low,
        Medium,
        High,
        VeryHigh
    }

    export enum WPAKeyStatusType {
        NotTested,
        UsedInConnectionTest,
        UsedInMatch
    }

    export enum StationStatusType {
        Good,
        Bad,
        Waiting,
        Unknown
    }
}