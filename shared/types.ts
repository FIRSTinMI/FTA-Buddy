import WebSocket from "ws";

export interface MonitorFrame {
    type: 'monitorUpdate' | 'message';
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
    lastCycleTime?: string;
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

export interface SignalRMonitorFrame {
    Alliance: "Red" | "Blue";
    Station: FMSEnums.StationType;
    TeamNumber: number;
    Connection: boolean;
    LinkActive: boolean;
    DSLinkActive: boolean;
    RadioLink: boolean;
    RIOLink: boolean;
    IsEnabled: boolean;
    IsAuto: boolean;
    IsBypassed: boolean;
    IsEStopPressed: boolean;
    IsEStopped: boolean;
    Battery: number;
    MonitorStatus: FMSEnums.MonitorStatusType;
    AverageTripTime: number;
    LostPackets: number;
    Signal: number;
    Noise: number;
    SNR: number;
    Inactivity: number;
    MACAddress: string | null,
    TxRate: number;
    TxMCS: number;
    TxMCSBandWidth: number;
    TxVHT: number | null,
    TxVHTNSS: boolean | null,
    TxPackets: number;
    RxRate: number;
    RxMCS: number;
    RxMCSBandWidth: number;
    RxVHT: number | null,
    RxVHTNSS: boolean | null,
    RxPackets: number;
    DataRateTotal: number;
    DataRateToRobot: number;
    DataRateFromRobot: number;
    BWUtilization: FMSEnums.BWUtilizationType,
    WPAKeyStatus: FMSEnums.WPAKeyStatusType,
    DriverStationIsOfficial: boolean;
    StationStatus: FMSEnums.StationStatusType,
    Brownout: boolean;
    EStopSource: string,
    IsAStopPressed: boolean;
    IsAStopped: boolean;
    MoveToStation: string | null;
}

export interface FMSLogFrame {
    timeStamp: string,
    matchTimeBase: number,
    matchTime: number,
    auto: boolean,
    dsLinkActive: boolean,
    enabled: boolean,
    aStopPressed: boolean,
    eStopPressed: boolean,
    linkActive: boolean,
    radioLink: boolean,
    rioLink: boolean,
    averageTripTime: number,
    lostPackets: number,
    sentPackets: number,
    battery: number,
    brownout: boolean,
    signal: number | null,
    noise: number | null,
    snr: number | null,
    txRate: number | null,
    txMCS: number | null,
    rxRate: number | null,
    rxMCS: number | null,
    dataRateTotal: number
}

export interface FMSMatch {
    actualStartTime: string,
    dayNumber: number,
    description: string, // "Test Match"
    fmsEventId: string,
    fmsMatchId: string,
    matchNumber: number,
    playNumber: number,
    startTime: string,
    teamNumberBlue1: number,
    teamNumberBlue2: number,
    teamNumberBlue3: number,
    teamNumberRed1: number,
    teamNumberRed2: number,
    teamNumberRed3: number,
    tournamentLevel: "None" | "Practice" | "Qualification" | "Playoff"
}

export namespace FMSEnums {
    export enum Level {
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
        AStopped,
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
        WrongStation,
        WrongMatch,
        Unknown
    }
}

export interface TeamChecklist { present: boolean, weighed: boolean, inspected: boolean, radioProgrammed: boolean, connectionTested: boolean }
export type EventChecklist = { [key: string]: TeamChecklist }
export type TeamList = ({ number: string, name: string, inspected: boolean })[]