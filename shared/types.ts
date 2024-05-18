import { EventEmitter } from "events";

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
    lastCycleTime: string;
}

type PartialBy<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>> & Partial<Pick<T, K>>;

export interface PartialMonitorFrame extends Omit<MonitorFrame, 'blue1' | 'blue2' | 'blue3' | 'red1' | 'red2' | 'red3'> {
    blue1: PartialBy<TeamInfo, 'lastChange' | 'improved'>;
    blue2: PartialBy<TeamInfo, 'lastChange' | 'improved'>;
    blue3: PartialBy<TeamInfo, 'lastChange' | 'improved'>;
    red1: PartialBy<TeamInfo, 'lastChange' | 'improved'>;
    red2: PartialBy<TeamInfo, 'lastChange' | 'improved'>;
    red3: PartialBy<TeamInfo, 'lastChange' | 'improved'>;
}

export interface TeamInfo {
    number: number;
    ds: DSState;
    radio: boolean;
    rio: boolean;
    code: boolean;
    enabled: EnableState;
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
    versionmm: boolean;
    lastChange: Date | null;
    improved: boolean;
}

export enum ROBOT {
    blue1 = 'blue1',
    blue2 = 'blue2',
    blue3 = 'blue3',
    red1 = 'red1',
    red2 = 'red2',
    red3 = 'red3'
}

export enum FieldState {
    UNKNOWN,
    MATCH_RUNNING_TELEOP,
    MATCH_TRANSITIONING,
    MATCH_RUNNING_AUTO,
    MATCH_READY,
    PRESTART_COMPLETED,
    PRESTART_INITIATED,
    READY_TO_PRESTART,
    MATCH_ABORTED,
    MATCH_OVER,
    READY_FOR_POST_RESULT,
    MATCH_NOT_READY
}

export enum MatchState {
    RUNNING,
    OVER,
    PRESTART
}

export const MatchStateMap: { [key in FieldState]: MatchState } = {
    [FieldState.MATCH_RUNNING_TELEOP]: MatchState.RUNNING,
    [FieldState.MATCH_TRANSITIONING]: MatchState.RUNNING,
    [FieldState.MATCH_RUNNING_AUTO]: MatchState.RUNNING,
    [FieldState.MATCH_READY]: MatchState.RUNNING,
    [FieldState.PRESTART_COMPLETED]: MatchState.PRESTART,
    [FieldState.PRESTART_INITIATED]: MatchState.PRESTART,
    [FieldState.READY_TO_PRESTART]: MatchState.PRESTART,
    [FieldState.MATCH_ABORTED]: MatchState.OVER,
    [FieldState.MATCH_OVER]: MatchState.OVER,
    [FieldState.READY_FOR_POST_RESULT]: MatchState.OVER,
    [FieldState.MATCH_NOT_READY]: MatchState.PRESTART,
    [FieldState.UNKNOWN]: MatchState.PRESTART
};


export enum DSState {
    RED,
    GREEN,
    GREEN_X,
    MOVE_STATION,
    WAITING,
    BYPASS,
    ESTOP,
    ASTOP
}

export enum EnableState {
    RED,
    RED_A,
    RED_T,
    GREEN_A,
    GREEN_T,
    ESTOP,
    ASTOP
}

export type MonitoredRobotParts = Omit<keyof TeamInfo, 'number' | 'bwu' | 'battery' | 'ping' | 'packets' | 'MAC' | 'RX' | 'RXMCS' | 'TX' | 'TXMCS' | 'SNR' | 'noise' | 'signal' | 'versionmm'>;

export enum StateChangeType {
    FallingEdge,
    RisingEdge,
}

export interface StateChange {
    station: ROBOT,
    robot: TeamInfo,
    key: MonitoredRobotParts,
    oldValue: boolean | DSState | EnableState,
    newValue: boolean | DSState | EnableState;
    type: StateChangeType;
}

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

export interface ServerEvent {
    code: string,
    token: string,
    fieldMonitorEmitter: EventEmitter,
    robotStateChangeEmitter: EventEmitter,
    fieldStatusEmitter: EventEmitter,
    checklistEmitter: EventEmitter,
    ticketEmitter: EventEmitter,
    teams: TeamList,
    checklist: EventChecklist,
    users: string[],
    monitorFrame: MonitorFrame,
    history: MonitorFrame[],
    lastPrestartDone: Date | null,
    lastMatchStart: Date | null,
    lastMatchEnd: Date | null,
    lastMatchRefDone: Date | null,
    lastMatchScoresPosted: Date | null;
}
