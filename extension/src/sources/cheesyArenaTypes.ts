/**
 * Wire types for Cheesy Arena's `/displays/field_monitor/websocket` notifier stream.
 *
 * Cheesy Arena (github.com/Team254/cheesy-arena) marshals its Go structs with
 * no json tags, so every key is the exact PascalCase Go field name. These types
 * are transcribed from:
 *   field/arena.go                  (AllianceStation, MatchState)
 *   field/driver_station_connection.go (DriverStationConnection)
 *   network/access_point.go         (TeamWifiStatus)
 *   field/arena_notifiers.go        (the notifier message generators)
 *   model/match.go                  (Match, MatchType)
 */

/** Envelope every Cheesy Arena websocket message uses (websocket/websocket.go). */
export interface CheesyMessage<T = unknown> {
	type: string;
	data: T;
}

/** field/arena.go MatchState enum. */
export enum CheesyMatchState {
	PreMatch = 0,
	StartMatch = 1,
	AutoPeriod = 2,
	PausePeriod = 3,
	TeleopPeriod = 4,
	PostMatch = 5,
	TimeoutActive = 6,
	PostTimeout = 7,
}

/** model/match.go MatchType enum. */
export enum CheesyMatchType {
	Test = 0,
	Practice = 1,
	Qualification = 2,
	Playoff = 3,
}

/** field/driver_station_connection.go (exported fields only). */
export interface CheesyDriverStationConnection {
	TeamId: number;
	AllianceStation: string;
	Auto: boolean;
	Enabled: boolean;
	EStop: boolean;
	AStop: boolean;
	DsLinked: boolean;
	RadioLinked: boolean;
	RioLinked: boolean;
	RobotLinked: boolean;
	BatteryVoltage: number;
	DsRobotTripTimeMs: number;
	MissedPacketCount: number;
	DsReportedStatusValid: boolean;
	DsReportedAuto: boolean;
	DsReportedTeleop: boolean;
	DsReportedDisabled: boolean;
	DsReportedEnabled: boolean;
	SecondsSinceLastRobotLink: number;
	SentGameData: string;
	/** Non-empty when the connected team is in the wrong station. */
	WrongStation: string;
}

/** network/access_point.go TeamWifiStatus. */
export interface CheesyWifiStatus {
	TeamId: number;
	RadioLinked: boolean;
	MBits: number;
	RxRate: number;
	TxRate: number;
	SignalNoiseRatio: number;
	/** 1 = caution, 2 = warning, 3 = good, 4 = excellent. */
	ConnectionQuality: number;
}

/** model/team.go (only the fields we read). */
export interface CheesyTeam {
	Id: number;
	Nickname?: string;
}

/** field/arena.go AllianceStation (exported fields only). */
export interface CheesyAllianceStation {
	DsConn: CheesyDriverStationConnection | null;
	Ethernet: boolean;
	AStop: boolean;
	EStop: boolean;
	Bypass: boolean;
	Team: CheesyTeam | null;
	WifiStatus: CheesyWifiStatus;
	GameData: string;
}

/** `arenaStatus` notifier (field/arena_notifiers.go generateArenaStatusMessage). */
export interface CheesyArenaStatus {
	MatchId: number;
	AllianceStations: Record<string, CheesyAllianceStation>;
	/** Embedded MatchState int; marshals under the key "MatchState". */
	MatchState: CheesyMatchState;
	CanStartMatch: boolean;
	AccessPointStatus: string;
	SwitchStatus: string;
	RedSCCStatus: string;
	BlueSCCStatus: string;
	PlcIsHealthy: boolean;
	FieldEStop: boolean;
	PlcArmorBlockStatuses: Record<string, boolean>;
}

/** `matchTime` notifier (MatchTimeMessage). */
export interface CheesyMatchTime {
	MatchState: CheesyMatchState;
	MatchTimeSec: number;
}

/** model/match.go Match (only the fields we read). */
export interface CheesyMatch {
	Id: number;
	Type: CheesyMatchType;
	TypeOrder: number;
	Time: string;
	ShortName: string;
	LongName: string;
	Status: string;
	Red1: number;
	Red2: number;
	Red3: number;
	Blue1: number;
	Blue2: number;
	Blue3: number;
}

/** `matchLoad` notifier (field/arena_notifiers.go GenerateMatchLoadMessage). */
export interface CheesyMatchLoad {
	Match: CheesyMatch;
	AllowSubstitution: boolean;
	IsReplay: boolean;
	Teams: Record<string, CheesyTeam | null>;
	Rankings: Record<string, number>;
}

/** `eventStatus` notifier (field/event_status.go EventStatus, exported fields). */
export interface CheesyEventStatus {
	CycleTime: string;
	EarlyLateMessage: string;
}

/** The six Cheesy Arena station keys, in the canonical FTA-Buddy ROBOT order. */
export const CHEESY_STATION_TO_ROBOT = {
	R1: "red1",
	R2: "red2",
	R3: "red3",
	B1: "blue1",
	B2: "blue2",
	B3: "blue3",
} as const;

export type CheesyStation = keyof typeof CHEESY_STATION_TO_ROBOT;
