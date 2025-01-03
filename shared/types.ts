import { EventEmitter } from "events";

export interface MonitorFrame {
    field: FieldState;
    match: number;
    play: number;
    level: TournamentLevel;
    time: string;
    version: string;
    frameTime: number;
    blue1: RobotInfo;
    blue2: RobotInfo;
    blue3: RobotInfo;
    red1: RobotInfo;
    red2: RobotInfo;
    red3: RobotInfo;
    lastCycleTime: string;
}

type PartialBy<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>> & Partial<Pick<T, K>>;

export interface PartialMonitorFrame extends Omit<MonitorFrame, 'blue1' | 'blue2' | 'blue3' | 'red1' | 'red2' | 'red3'> {
    blue1: PartialRobotInfo;
    blue2: PartialRobotInfo;
    blue3: PartialRobotInfo;
    red1: PartialRobotInfo;
    red2: PartialRobotInfo;
    red3: PartialRobotInfo;
}

export type PartialRobotInfo = PartialBy<RobotInfo, 'lastChange' | 'improved' | 'warnings'>

export interface RobotInfo {
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
    warnings: RobotWarnings[];
}

export enum RobotWarnings {
    NOT_INSPECTED,
    RADIO_NOT_FLASHED,
    SLOW,
    OPEN_TICKET,
    RECENT_TICKET
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
    [FieldState.MATCH_READY]: MatchState.PRESTART,
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

export type MonitoredRobotParts = Omit<keyof RobotInfo, 'number' | 'bwu' | 'battery' | 'ping' | 'packets' | 'MAC' | 'RX' | 'RXMCS' | 'TX' | 'TXMCS' | 'SNR' | 'noise' | 'signal' | 'versionmm'>;

export enum StateChangeType {
    FallingEdge,
    RisingEdge,
}

export interface StateChange {
    station: ROBOT,
    robot: RobotInfo,
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
    StationStatus: 'Good' | 'WrongStation' | 'Waiting' | 'Unknown',
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

export interface MatchLog {
    blue1: number;
    blue2: number;
    blue3: number;
    red1: number;
    red2: number;
    red3: number;
    level: string;
    match_number: number;
    play_number: number;
    start_time: Date;
    log: {
        matchTime: number;
        matchTimeBase: number;
        timeStamp: Date;
        auto: boolean;
        blue1: FMSLogFrame | null;
        blue2: FMSLogFrame | null;
        blue3: FMSLogFrame | null;
        red1: FMSLogFrame | null;
        red2: FMSLogFrame | null;
        red3: FMSLogFrame | null;
    }[];
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
    tournamentLevel: TournamentLevel;
}

export type TournamentLevel = "None" | "Practice" | "Qualification" | "Playoff";

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

export const FMSLevelMap: { [key in FMSEnums.Level]: "None" | "Practice" | "Qualification" | "Playoff" } = {
    [FMSEnums.Level.None]: "None",
    [FMSEnums.Level.Practice]: "Practice",
    [FMSEnums.Level.Qualification]: "Qualification",
    [FMSEnums.Level.Playoff]: "Playoff"
}

export interface TeamChecklist { present: boolean, weighed: boolean, inspected: boolean, radioProgrammed: boolean, connectionTested: boolean }
export type EventChecklist = { [key: string]: TeamChecklist }
export type TeamList = ({ number: string, name: string, inspected: boolean })[]

export interface ServerEvent {
    code: string,
    token: string,
    year: number,
    fieldMonitorEmitter: EventEmitter,
    robotStateChangeEmitter: EventEmitter,
    fieldStatusEmitter: EventEmitter,
    checklistEmitter: EventEmitter,
    ticketEmitter: EventEmitter,
    cycleEmitter: EventEmitter,
    teams: TeamList,
    checklist: EventChecklist,
    users: Profile[],
    monitorFrame: MonitorFrame,
    history: MonitorFrame[],
    scheduleDetails: ScheduleDetails,
    lastPrestartDone: Date | null,
    lastMatchStart: Date | null,
    lastMatchEnd: Date | null,
    lastMatchRefDone: Date | null,
    lastMatchScoresPosted: Date | null;
    robotCycleTracking: {
        prestart?: Date,
        blue1?: RobotCycleTracking,
        blue2?: RobotCycleTracking,
        blue3?: RobotCycleTracking,
        red1?: RobotCycleTracking,
        red2?: RobotCycleTracking,
        red3?: RobotCycleTracking;
    };
    tickets: Ticket[],
}

export interface RobotCycleTracking {
    team: number,
    firstDS?: Date,
    lastDS?: Date,
    timeDS?: number,
    firstRadio?: Date,
    lastRadio?: Date,
    timeRadio?: number,
    firstRio?: Date,
    lastRio?: Date,
    timeRio?: number,
    firstCode?: Date,
    lastCode?: Date,
    timeCode?: number;
}

export interface CycleData {
    eventCode: string,
    matchNumber: number,
    prestartTime: Date | null,
    startTime: Date | null,
    endTime: Date | null,
    refEndTime: Date | null,
    scoresPostedTime: Date | null,
    lastCycleTime: string | null;
    averageCycleTime: number | null;
}

export interface Profile {
    id: number,
    username: string,
    role: "FTAA" | "FTA" | "CSA" | "RI";
}

export interface Ticket {
    id: number,
    team: number,
    subject: string,
    author_id: number,
    author: Profile,
    assigned_to_id: number,
    assigned_to?: Profile | null,
    event_code: string,
    is_open: boolean,
    text: string,
    created_at: Date,
    updated_at: Date,
    closed_at?: Date | null,
    messages: Message[] | null,
    matchId?: string,
    followers: number[] | null,
}

export interface Note {
    id: string,
    text: string,
    author_id: number,
    author: Profile,
    team: number,
    event_code: string,
    created_at: Date,
    updated_at: Date,
}

export interface Message {
    id: string,
    ticket_id: number,
    text: string,
    author_id: number,
    author: Profile,
    created_at: Date,
    updated_at: Date,
}

export interface Notification {
    id: string,
    timestamp: Date,
    title: string;
    body: string;
    icon?: string;
    tag?: string;
    data?: {
        page?: string;
    };
}

export type ScheduleBreakdown = {
    date: Date,
    start: number,
    end: number,
    endTime: Date | null,
    lunch: number | null,
    lunchTime: Date | null,
    cycleTimes: {
        match: number,
        minutes: number;
    }[];
}[];

export interface ScheduleDetails {
    days: ScheduleBreakdown,
    lastPlayed: number;
}

export interface DisconnectionEvent {
    issue: string;
    startTime: number;
    endTime: number;
    duration: number;
}
