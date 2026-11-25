import type { FTAEventNoteIssueType, FTAEventNoteResolutionType } from "./fmsApiTypes";

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
	matchScheduledStartTime?: Date;
	exactAheadBehind?: string;
}

type PartialBy<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>> & Partial<Pick<T, K>>;

export interface PartialMonitorFrame extends Omit<
	MonitorFrame,
	"blue1" | "blue2" | "blue3" | "red1" | "red2" | "red3"
> {
	blue1: PartialRobotInfo;
	blue2: PartialRobotInfo;
	blue3: PartialRobotInfo;
	red1: PartialRobotInfo;
	red2: PartialRobotInfo;
	red3: PartialRobotInfo;
}

export type PartialRobotInfo = PartialBy<RobotInfo, "lastChange" | "improved" | "warnings">;

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
	radioConnectionQuality: "Warning" | "Caution" | "Good" | "Excellent" | null;
	radioConnected: boolean | null;
	versionData?: {
		VersionTag: "DSVersion" | "WPILibVersion" | "RIOVersion";
		Version: string;
		Status: "preferred" | "unknown";
	};
}

export enum RobotWarnings {
	NOT_INSPECTED,
	RADIO_NOT_FLASHED,
	SLOW,
	OPEN_NOTE,
	RECENT_NOTE,
	PREVIOUS_MATCH_EVENT,
}

export enum ROBOT {
	blue1 = "blue1",
	blue2 = "blue2",
	blue3 = "blue3",
	red1 = "red1",
	red2 = "red2",
	red3 = "red3",
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
	MATCH_NOT_READY,
}

export enum MatchState {
	RUNNING,
	OVER,
	PRESTART,
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
	[FieldState.UNKNOWN]: MatchState.PRESTART,
};

export enum DSState {
	RED,
	GREEN,
	GREEN_X,
	MOVE_STATION,
	WAITING,
	BYPASS,
	ESTOP,
	ASTOP,
}

export enum EnableState {
	RED,
	RED_A,
	RED_T,
	GREEN_A,
	GREEN_T,
	ESTOP,
	ASTOP,
}

export type MonitoredRobotParts = Omit<
	keyof RobotInfo,
	| "number"
	| "bwu"
	| "battery"
	| "ping"
	| "packets"
	| "MAC"
	| "RX"
	| "RXMCS"
	| "TX"
	| "TXMCS"
	| "SNR"
	| "noise"
	| "signal"
	| "versionmm"
>;

export enum StateChangeType {
	FallingEdge,
	RisingEdge,
}

export interface StateChange {
	station: ROBOT;
	robot: RobotInfo;
	key: MonitoredRobotParts;
	oldValue: boolean | DSState | EnableState;
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
	MACAddress: string | null;
	TxRate: number;
	TxMCS: number;
	TxMCSBandWidth: number;
	TxVHT: number | null;
	TxVHTNSS: boolean | null;
	TxPackets: number;
	RxRate: number;
	RxMCS: number;
	RxMCSBandWidth: number;
	RxVHT: number | null;
	RxVHTNSS: boolean | null;
	RxPackets: number;
	DataRateTotal: number;
	DataRateToRobot: number;
	DataRateFromRobot: number;
	BWUtilization: FMSEnums.BWUtilizationType;
	WPAKeyStatus: FMSEnums.WPAKeyStatusType;
	DriverStationIsOfficial: boolean;
	StationStatus: "Good" | "WrongStation" | "WrongMatch" | "Waiting" | "Unknown";
	Brownout: boolean;
	EStopSource: string;
	IsAStopPressed: boolean;
	IsAStopped: boolean;
	MoveToStation: string | null;
	RadioConnectionQuality: "Warning" | "Caution" | "Good" | "Excellent" | null;
	RadioConnectedToAp: boolean | null;
}

export interface FMSLogFrame {
	timeStamp: string;
	matchTimeBase: number;
	matchTime: number;
	auto: boolean;
	dsLinkActive: boolean;
	enabled: boolean;
	aStopPressed: boolean;
	eStopPressed: boolean;
	linkActive: boolean;
	radioLink: boolean;
	rioLink: boolean;
	averageTripTime: number;
	lostPackets: number;
	sentPackets: number;
	battery: number;
	brownout: boolean;
	signal: number | null;
	noise: number | null;
	snr: number | null;
	txRate: number | null;
	txMCS: number | null;
	rxRate: number | null;
	rxMCS: number | null;
	dataRateTotal: number;
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
	actualStartTime: string;
	dayNumber: number;
	description: string; // "Test Match"
	fmsEventId: string;
	fmsMatchId: string;
	matchNumber: number;
	playNumber: number;
	startTime: string;
	teamNumberBlue1: number;
	teamNumberBlue2: number;
	teamNumberBlue3: number;
	teamNumberRed1: number;
	teamNumberRed2: number;
	teamNumberRed3: number;
	tournamentLevel: TournamentLevel;
}

export type TournamentLevel = "None" | "Practice" | "Qualification" | "Playoff";

export namespace FMSEnums {
	export enum Level {
		None = 0,
		Practice = 1,
		Qualification = 2,
		Playoff = 3,
	}

	export enum AllianceType {
		None = 0,
		Red = 1,
		Blue = 2,
	}

	export enum StationType {
		None = 0,
		Station1 = 1,
		Station2 = 2,
		Station3 = 3,
	}

	export enum MonitorStatusType {
		Unknown,
		EStopped,
		AStopped,
		DisabledAuto,
		DisabledTeleop,
		EnabledAuto,
		EnabledTeleop,
	}

	export enum BWUtilizationType {
		Low,
		Medium,
		High,
		VeryHigh,
	}

	export enum WPAKeyStatusType {
		NotTested,
		UsedInConnectionTest,
		UsedInMatch,
	}

	export enum StationStatusType {
		Good,
		WrongStation,
		WrongMatch,
		Unknown,
	}
}

export const FMSLevelMap: { [key in FMSEnums.Level]: "None" | "Practice" | "Qualification" | "Playoff" } = {
	[FMSEnums.Level.None]: "None",
	[FMSEnums.Level.Practice]: "Practice",
	[FMSEnums.Level.Qualification]: "Qualification",
	[FMSEnums.Level.Playoff]: "Playoff",
};

export interface TeamChecklist {
	present: boolean;
	inspected: boolean;
	radioProgrammed: boolean;
	connectionTested: boolean;
}
export type EventChecklist = { [key: string]: TeamChecklist };
export type TeamList = { number: string; name: string; inspected: boolean }[];

export interface EventTiming {
	lastPrestartDone: Date | null;
	lastMatchReady: Date | null;
	lastMatchStart: Date | null;
	lastMatchEnd: Date | null;
	lastMatchRefDone: Date | null;
	lastMatchScoresPosted: Date | null;
}

export interface PitMapElement {
	position: { x: number; y: number };
	size: { x: number; y: number };
}

export interface PitMapPit extends PitMapElement {
	team?: string;
}

export interface PitMapArea extends PitMapElement {
	label: string;
}

export interface PitMapLabel extends PitMapElement {
	label: string;
}

export interface PitMapArrow extends PitMapElement {
	angle: number;
	type: string;
}

export interface PitMapWall extends PitMapElement {}

export interface PitMapData {
	size: { x: number; y: number };
	pits: Record<string, PitMapPit>;
	areas: Record<string, PitMapArea> | null;
	labels: Record<string, PitMapLabel> | null;
	arrows: Record<string, PitMapArrow> | null;
	walls: Record<string, PitMapWall> | null;
}

export interface NexusMatchTimes {
	estimatedQueueTime?: number;
	estimatedOnDeckTime?: number;
	estimatedOnFieldTime?: number;
	estimatedStartTime?: number;
	actualQueueTime?: number;
	actualOnDeckTime?: number;
	actualOnFieldTime?: number;
}

export interface NexusMatch {
	label: string;
	status: string;
	redTeams?: (string | null)[];
	blueTeams?: (string | null)[];
	times: NexusMatchTimes;
	replayOf?: string;
	breakAfter?: string;
}

export interface NexusEventStatus {
	dataAsOfTime: number;
	nowQueuing: string | null;
	matches: NexusMatch[];
}

export type NexusPollState =
	| "not_configured"
	| "polling"
	| "polling_slow"
	| "unauthorized"
	| "error"
	| "complete"
	| "event_over";

export interface NexusStatus {
	state: NexusPollState;
	lastSuccessAt?: Date;
	lastErrorAt?: Date;
	lastErrorMessage?: string;
	intervalMinutes: 2 | 30;
	isAllInspected: boolean;
}

export interface ServerEvent {
	code: string;
	name: string;
	pin: string;
	token: string;
	/** Archived events are read-only history: the app refuses tokens for them. */
	archived: boolean;
	users: Profile[];
	scheduleDetails: ScheduleDetails;
	notes: Note[];
	meshedEvent: boolean;
	notepadOnly: boolean;
	playoffMode: boolean;
	powerMonitoring: boolean;
	/** Admin switch for every extension on the event; false stops them. */
	extensionsEnabled: boolean;
	powerAlertSettings: PowerAlertSettings;
	subEvents?: {
		code: string;
		label: string;
		color?: string;
		token: string;
		teams: TeamList;
		pin: string;
		users?: Profile[];
	}[];
	slackChannel?: string;
	slackTeam?: string;
	publicNoteSubmit: boolean;
	nexusApiKey?: string;
	fmsEventPassword?: string;
	autoEventSettings: EventAutoEventSettings;
	slowWarningSettings: SlowWarningSettings;
	startDate?: string;
	endDate?: string;
	timezone?: string;
	nexus: NexusStatus;
	nexusEventStatus?: NexusEventStatus;
	pitMap?: { data: PitMapData | null; fetchedAt: Date };
	stats: {
		extensions: {
			id: string;
			lastFrame: Date;
			frames: number;
			checklistUpdates: number;
			ip?: string;
			userAgent?: string;
			connected: Date;
			version?: string;
			config?: ExtensionConfig;
			fmsApi?: boolean;
		}[];
		clients: {
			id: string;
			userAgent?: string;
			ip?: string;
			connected: Date;
		}[];
	};
}

/**
 * The extension settings that can be read and changed remotely (through the
 * server) as well as locally. Mirrors the fields the extension stores in
 * chrome.storage.local, so any device can reconfigure a connected extension.
 */
export interface ExtensionConfig {
	enabled?: boolean;
	fieldMonitor?: boolean;
	useSignalR?: boolean;
	fmsApiEnabled?: boolean;
	scoreAutofill?: boolean;
	sourceMode?: "fms" | "cheesy";
	cheesyPort?: number;
}

/**
 * What the server sends an extension over `extension.configSubscription`.
 * `remoteDisabled: true` marks the stop for an event whose extensions an admin
 * switched off: old extensions apply the `enabled: false` beside it, new ones
 * set their separate remote flag and leave their own Enable setting alone.
 */
export type ExtensionConfigDelivery = ExtensionConfig & { remoteDisabled?: boolean };

// #region Extension presence (admin dashboard)

/**
 * What an extension is doing, from its own settings:
 * - `remote-disabled`: an admin switched extensions off for its event; same as disabled.
 * - `disabled`: the master Enable toggle is off; it talks to nothing but the heartbeat.
 * - `expired`: settings last changed more than four days ago; field data stays off.
 * - `no-event`: enabled but holds no event token, so it is not attached to an event.
 * - `running`: enabled, fresh and attached to an event.
 */
export type ExtensionRunState = "running" | "remote-disabled" | "disabled" | "expired" | "no-event";

/**
 * Live-feed mode: `signalr` (FMS hubs), `cheesy` (Cheesy Arena websocket),
 * `scraping` (FMS field monitor page posts frames itself), `off` (field monitor off).
 */
export type ExtensionRealtimeFeed = "signalr" | "cheesy" | "scraping" | "off";

/**
 * Runtime stats an extension reports with each heartbeat. Every field is
 * optional: the extension leaves out what it cannot report truthfully.
 * Times are epoch milliseconds.
 */
export interface ExtensionHeartbeatStats {
	sourceMode?: "fms" | "cheesy";
	/** Result of the last reachability ping to the field system. */
	fmsReachable?: boolean;
	/** When that ping ran. */
	fmsPingAt?: number;
	/** FMS REST API usable (same probe the extension gates its FMS API calls on). */
	fmsApi?: boolean;
	realtimeFeed?: ExtensionRealtimeFeed;
	/** SignalR hub state ("Connected", "Reconnecting", ...) or the Cheesy Arena feed state. */
	realtimeStatus?: string;
	/** Frames the service worker posted since it started. Absent in scraping mode (the page posts those). */
	framesSent?: number;
	lastFrameAt?: number;
	lastError?: string;
	lastErrorAt?: number;
	/** When the current service worker instance started. */
	workerStartedAt?: number;
	/** When the extension settings last changed (drives the four-day expiry). */
	changed?: number;
}

/** One extension's presence record as stored by the server (Redis, ~24 h after the last heartbeat). */
export interface ExtensionPresence {
	id: string;
	version: string;
	state: ExtensionRunState;
	/** Event code resolved on the server from the extension's event token; null when it has none or it is unknown. */
	eventCode: string | null;
	/** Event code the extension has stored locally (may be stale or a placeholder). */
	reportedEventCode: string | null;
	config: ExtensionConfig;
	stats: ExtensionHeartbeatStats;
	ip: string | null;
	userAgent: string | null;
	firstSeen: number;
	lastSeen: number;
}

/** Row returned by `admin.listExtensions`. */
export interface AdminExtensionEntry {
	id: string;
	/**
	 * True for extensions known only from an event's in-memory stats (versions
	 * before the heartbeat). Remote enable cannot reach them once disabled.
	 */
	legacy: boolean;
	online: boolean;
	version: string | null;
	/** Null for legacy extensions, which do not report it. */
	state: ExtensionRunState | null;
	eventCode: string | null;
	reportedEventCode: string | null;
	config: ExtensionConfig;
	/** Config set by an admin and not yet picked up by a heartbeat. */
	pendingConfig: ExtensionConfig | null;
	stats: ExtensionHeartbeatStats;
	/** Legacy only: frames the server counted for this extension; null otherwise. */
	legacyFrames: number | null;
	ip: string | null;
	userAgent: string | null;
	/** Epoch ms. For legacy entries: when the server first saw it on this event. */
	firstSeen: number;
	/** Epoch ms. For legacy entries: its last frame or state report. */
	lastSeen: number;
}

/** One point of `admin.getActiveUsers`. */
export interface ActiveUsersPoint {
	/** Bucket start, epoch ms. */
	t: number;
	/** Distinct users and devices seen in the bucket. */
	users: number;
	/** Of those, distinct users and devices whose tab showed the field monitor ("/" or "/monitor"). */
	fieldMonitors: number;
}

// #endregion

export type NotificationEvents = {
	send: (data: { users: number[]; notification: Notification }) => void;
};

export interface EventCycleTracking {
	prestart?: Date;
	blue1?: RobotCycleTracking;
	blue2?: RobotCycleTracking;
	blue3?: RobotCycleTracking;
	red1?: RobotCycleTracking;
	red2?: RobotCycleTracking;
	red3?: RobotCycleTracking;
}

export interface RobotCycleTracking {
	team: number;
	firstDS?: Date;
	lastDS?: Date;
	timeDS?: number;
	firstRadio?: Date;
	lastRadio?: Date;
	timeRadio?: number;
	firstRio?: Date;
	lastRio?: Date;
	timeRio?: number;
	firstCode?: Date;
	lastCode?: Date;
	timeCode?: number;
	/** First frame the robot was fully connected (DS green + radio + rIO + code). */
	firstReady?: Date;
	/** Start of the LAST fully-connected streak before match start (settled-ready time). */
	lastReady?: Date;
	/** ms from prestart to lastReady — the value the SLOW warning is scored on. */
	timeReady?: number;
	/** Transient: whether the robot was fully connected on the previous frame (edge detect). */
	prevReady?: boolean;
}

export interface CycleData {
	eventCode: string;
	matchNumber: number;
	prestartTime: Date | null;
	startTime: Date | null;
	endTime: Date | null;
	refEndTime: Date | null;
	scoresPostedTime: Date | null;
	lastCycleTime: string | null;
	averageCycleTime: number | null;
	level: TournamentLevel;
	aheadBehind: string;
	state: FieldState;
	scheduleDetails: ScheduleDetails;
	exactAheadBehind: string;
}

export interface Profile {
	id: number;
	username: string;
	role: "FTAA" | "FTA" | "CSA" | "RI" | "System" | "Scorekeeper";
	admin: boolean;
}

export type Integration = "Slack" | "FMS";

export interface FmsNoteMetadata {
	issueType: FTAEventNoteIssueType;
	resolutionStatus: FTAEventNoteResolutionType;
}

export type NoteUpdateEvents = {
	note_update: (data: NoteUpdateEventData) => void;
};

export type MatchEventUpdateEvents = {
	create: (data: { kind: "match_event_create"; matchEvent: MatchEvent }) => void;
	dismiss: (data: { kind: "match_event_dismiss"; id: string }) => void;
	convert: (data: { kind: "match_event_convert"; id: string; note_id: string }) => void;
};

export type MatchEventUpdateEventData =
	| { kind: "heartbeat" }
	| { kind: "match_event_create"; matchEvent: MatchEvent }
	| { kind: "match_event_dismiss"; id: string }
	| { kind: "match_event_convert"; id: string; note_id: string };

export type NoteUpdateEventData =
	| { kind: "heartbeat" }
	| { kind: "create"; note: Note; source?: "fms" }
	| { kind: "edit"; note: Note; source?: "fms" }
	| { kind: "delete"; note: Note; source?: "fms" }
	| { kind: "status"; note_id: string; resolution_status: FTAEventNoteResolutionType; resolved_by: Profile | null }
	| { kind: "assign"; note_id: string; assigned_to_id: number | null; assigned_to: Profile | null }
	| { kind: "follow"; note_id: string; followers: number[] }
	| { kind: "add_message"; note_id: string; message: Message }
	| { kind: "edit_message"; note_id: string; message: Message }
	| { kind: "delete_message"; note_id: string; message_id: string };

export interface Note {
	id: string;
	text: string;
	author_id: number;
	author: Profile;
	/** Nullable - EventNotes and MatchNotes may not be team-specific. */
	team: number | null;
	note_type: "TeamIssue" | "EventNote" | "MatchNote";
	resolution_status: FTAEventNoteResolutionType | null;
	issue_type: FTAEventNoteIssueType | null;
	match_number: number | null;
	play_number: number | null;
	tournament_level: TournamentLevel | null;
	fms_note_id: string | null;
	fms_record_version: number | null;
	fms_metadata: FmsNoteMetadata | null;
	event_code: string;
	created_at: Date;
	updated_at: Date;
	closed_at: Date | null;
	assigned_to_id: number | null;
	assigned_to: Profile | null;
	followers: number[];
	match_id?: string | null;
	slack_ts?: string | null;
	slack_channel?: string | null;
	resolved_by_id: number | null;
	resolved_by: Profile | null;
	request_type: "CSA" | "RI" | null;
	is_nexus?: boolean;
	merged_into?: string | null;
	messages?: Message[];
	integration: Integration | null;
	author_display_name: string | null;
}

export interface Message {
	id: string;
	note_id: string;
	text: string;
	author_id: number;
	author: Profile;
	event_code: string;
	created_at: Date;
	updated_at: Date;
	integration: Integration | null;
	author_display_name: string | null;
}

export type NotificationTopic =
	| "Note-Created"
	| "Note-Status"
	| "Note-Assigned"
	| "New-Note-Message"
	| "Note-Mention"
	| "Note-Follow"
	| "Robot-Status";

export interface Notification {
	id: string;
	timestamp: Date;
	title: string;
	topic: NotificationTopic;
	body?: string;
	icon?: string;
	badge?: string;
	tag?: string;
	/** Notification kind from the taxonomy in shared/notifications.ts. */
	kind?: string;
	/** Ultra-short version for compact toasts (falls back to title if absent). */
	short?: string;
	/** Delivery urgency hint ("low" | "normal" | "high"). */
	urgency?: "low" | "normal" | "high";
	/** Event code this notification belongs to, for routing and client-side filtering. */
	eventCode?: string;
	data?: {
		page?: string;
		note_id?: string;
	};
}

export type ScheduleBreakdown = {
	date: Date;
	start: number;
	end: number;
	endTime: Date | null;
	lunch: number | null;
	lunchTime: Date | null;
	cycleTimes: {
		match: number;
		minutes: number;
	}[];
}[];

export interface ScheduleDetails {
	days: ScheduleBreakdown;
	lastPlayed: number;
	matches?: {
		match: number;
		level: TournamentLevel;
		scheduledStartTime: Date;
		/**
		 * Playoff only: which alliance (1-8) is on each side for this match, from
		 * FMS. Lets the scorekeeper view resolve red/blue without a played match log.
		 */
		redAllianceNumber?: number | null;
		blueAllianceNumber?: number | null;
		/** Teams on each side, from FMS (station 1-3). Present once the field is set. */
		red?: (number | null)[];
		blue?: (number | null)[];
		/** Final scores + FMS match status, captured once the match is posted. */
		finalScoreRed?: number | null;
		finalScoreBlue?: number | null;
		status?: string | null;
	}[];
}

export interface DisconnectionEvent {
	issue: string;
	startTime: number;
	endTime: number;
	duration: number;
	startIndex: number;
	endIndex: number;
}

// #region Scorekeeper view (playoff lineups)

export type AllianceColor = "red" | "blue";

/** Team assigned to each of the three DRIVER STATIONS. null = station empty. */
export interface LineupStations {
	station1: number | null;
	station2: number | null;
	station3: number | null;
}

/** How a resolved lineup was arrived at (see resolveLineup, REBUILT T613). */
export type LineupResolution = "submitted" | "carried-forward" | "default";

export interface ResolvedLineup {
	stations: LineupStations;
	resolution: LineupResolution;
	usesBackup: boolean;
	/** The card this came from, when resolution is "submitted" or "carried-forward". */
	cardId: string | null;
}

// #endregion

/**
 * Issue types that can be auto-detected from match logs.
 * Used as keys in EventAutoEventSettings.
 */
export const AUTO_EVENT_ISSUE_TYPES = [
	"Bypassed",
	"Code disconnect",
	"RIO disconnect",
	"Radio disconnect",
	"DS disconnect",
	"Brownout",
	"Large spike in ping",
	"Sustained high ping",
	"Low signal",
	"High BWU",
] as const;

export type AutoEventIssueType = (typeof AUTO_EVENT_ISSUE_TYPES)[number];

/**
 * Per-event settings controlling which log issues auto-generate match events.
 * Stored as JSON in the events table. Missing keys default to true (enabled).
 */
export type EventAutoEventSettings = Partial<Record<AutoEventIssueType, boolean>>;

export const DEFAULT_AUTO_EVENT_SETTINGS: EventAutoEventSettings = {
	Bypassed: true,
	"Code disconnect": true,
	"RIO disconnect": true,
	"Radio disconnect": true,
	"DS disconnect": true,
	Brownout: false,
	"Large spike in ping": false,
	"Sustained high ping": false,
	"Low signal": false,
	"High BWU": false,
};

/** How the SLOW warning decides which teams are outliers. Selectable per event. */
export const SLOW_WARNING_MODES = ["percentile_floor", "percentile", "iqr"] as const;
export type SlowWarningMode = (typeof SLOW_WARNING_MODES)[number];

/**
 * Per-event config for the 🐌 SLOW warning. Teams are ranked on the MEDIAN of their
 * `time_ready` (ms from prestart-complete to fully connected) across this event only.
 * - percentile_floor: slowest `percentile`% AND median >= `floorMs` AND >= `minMatches` matches
 * - percentile:       slowest `percentile`% AND >= `minMatches` matches (no absolute floor)
 * - iqr:              median above Q3 + 1.5*IQR of the event's team medians (count varies)
 */
export interface SlowWarningSettings {
	enabled: boolean;
	mode: SlowWarningMode;
	/** Percentile cutoff for the percentile modes (e.g. 90 = slowest 10%). */
	percentile: number;
	/** Absolute floor in ms for percentile_floor mode. */
	floorMs: number;
	/** Minimum measured matches before a team can be flagged. */
	minMatches: number;
}

export const DEFAULT_SLOW_WARNING_SETTINGS: SlowWarningSettings = {
	enabled: false,
	mode: "percentile_floor",
	percentile: 90,
	floorMs: 30000,
	minMatches: 3,
};

export type MatchEventStatus = "active" | "dismissed" | "converted";

/** Detail for a single issue within a combined match event. */
export interface MatchEventIssueDetail {
	issue: string;
	start_time: number | null;
	end_time: number | null;
	duration: number | null;
}

/**
 * A match event auto-generated from log analysis.
 * Can be dismissed or converted into a full note.
 */
export interface MatchEvent {
	id: string;
	match_id: string;
	event_code: string;
	team: number;
	alliance: string;
	issue: string;
	issues: MatchEventIssueDetail[] | null;
	match_number: number;
	play_number: number;
	level: string;
	start_time: number | null;
	end_time: number | null;
	duration: number | null;
	status: MatchEventStatus;
	converted_note_id: string | null;
	created_at: Date;
}

// #region Field power monitoring

/** Voltage below this on any monitor is flagged in the UI. Nominal is 120V. */
export const POWER_LOW_VOLTAGE = 110;
/** Current above this on any monitor is flagged in the UI. */
export const POWER_HIGH_CURRENT = 15;

/**
 * One reading from a field power monitor (ESP32-P4 + PZEM-004T), as it comes
 * off the board's SSE stream and as the extension forwards it into the page.
 * `kwh` is the meter's own cumulative register, so event totals are a delta of
 * two counter readings rather than an integration of `w`.
 */
export interface PowerTelemetry {
	id: string;
	ok: boolean;
	/** RMS volts. */
	v: number | null;
	/** RMS amps. */
	a: number | null;
	/** Active watts. */
	w: number | null;
	hz?: number | null;
	pf?: number | null;
	kwh?: number | null;
	/** The meter's own over-power alarm flag. */
	alarm?: boolean;
	/** Board uptime in seconds. */
	up?: number;
	/** Millisecond timestamp, stamped by the extension on receipt. */
	ts: number;
	/** Monitor address on the event network, for the status list. */
	ip?: string;
}

/** One bucket of stored history, as returned to the dashboard. */
export interface PowerHistoryPoint {
	time: number;
	volts: number;
	voltsMin: number;
	voltsMax: number;
	amps: number;
	ampsMax: number;
	watts: number;
	wattsMax: number;
	hz: number | null;
	pf: number | null;
	pfMin: number | null;
	alarm: boolean;
}

/** Per-monitor totals for the whole event. */
export interface PowerMonitorSummary {
	monitorId: string;
	firstSeen: number;
	lastSeen: number;
	samples: number;
	/** kWh drawn over the event, from the meter's counter (reset-safe). */
	energyKwh: number;
	peakAmps: number;
	minVolts: number;
	maxVolts: number;
	avgWatts: number;
	peakWatts: number;
	/** Worst power factor seen. Low means current the wattage does not account for. */
	minPf: number | null;
	avgPf: number | null;
	minHz: number | null;
	maxHz: number | null;
	/** Seconds in which the meter's own alarm was set. */
	alarmSeconds: number;
}

/** What the power monitors alert on, per event. */
export interface PowerAlertSettings {
	enabled: boolean;
	/** Notify when a monitor reads below this many volts. A sag is instant, so this fires on sight. */
	lowVoltage: number;
	/** Notify when a monitor holds above this many amps for `sustainSeconds`. */
	highCurrent: number;
	/** How long current must stay high before it counts. Filters the inrush every motor makes. */
	sustainSeconds: number;
	/** Notify when a monitor stops reporting, or its meter stops answering, for this long. */
	offlineSeconds: number;
	/** Minimum gap between repeats of the same alert on the same monitor. */
	cooldownMinutes: number;
}

export const DEFAULT_POWER_ALERT_SETTINGS: PowerAlertSettings = {
	enabled: false,
	lowVoltage: POWER_LOW_VOLTAGE,
	highCurrent: POWER_HIGH_CURRENT,
	sustainSeconds: 10,
	offlineSeconds: 30,
	cooldownMinutes: 5,
};

/** Live per-monitor state the extension reports alongside its samples. */
export interface PowerMonitorStatus {
	monitorId: string;
	/** The SSE stream is up. */
	connected: boolean;
	/** The board answered but its meter did not: mains gone on that circuit. */
	meterOk: boolean;
}

// #endregion

// #region Admin event integrations

/**
 * One event's integration state, returned by `admin.getEventIntegrations`.
 * No secret is ever included: only whether a key or password is set.
 * Fields marked "live" come from the in-memory event of the instance that
 * answered, and are omitted when that instance has not loaded the event.
 */
export interface EventIntegrationStatus {
	code: string;
	name: string;
	nexus: {
		/** An API key is stored. Configuration only: says nothing about whether it works. */
		configured: boolean;
		/** Live, per instance; omitted when this instance has not loaded the event or no key is set. */
		poll?: {
			state: NexusPollState;
			/** ISO time of the last successful inspection poll. */
			lastSuccessAt?: string;
			lastErrorAt?: string;
			lastErrorMessage?: string;
			isAllInspected: boolean;
			/** Epoch ms of the newest Nexus schedule data this instance holds (webhook or fallback fetch). */
			scheduleDataAsOf?: number;
		};
	};
	slack: {
		/** Both a channel and a team are stored on the event. Configuration only. */
		connected: boolean;
		channelId: string | null;
		teamId: string | null;
		/** From the installed workspace row; null when the team has no row (bot not installed). */
		teamName: string | null;
		/** A bot token row exists for the team. Not a check that the token still works. */
		workspaceInstalled: boolean;
	};
	fms: {
		/** An FMS event password is set, so the extension can sync notes. Configuration only. */
		passwordSet: boolean;
		/** Live, cross-instance (Redis): extensions attached to the event that sent a heartbeat or frame in the last 150 s. */
		extensionsOnline?: number;
	};
	notepadOnly: boolean;
	publicTicketSubmit: boolean;
	playoffMode: boolean;
	extensionsEnabled: boolean;
	powerMonitoring: boolean;
	/** Power alerts switch, after defaults. */
	powerAlertsEnabled: boolean;
	meshed: {
		/** This event is a meshed parent; lists its sub-events. */
		subEvents: { code: string; label: string }[];
		/** This event is a sub-event of this parent code, if any. */
		parentCode: string | null;
	};
	/** Issue types that generate match events (a type is on unless explicitly false). */
	autoMatchEvents: { enabledCount: number; total: number; enabled: AutoEventIssueType[] };
	slowWarning: { enabled: boolean; mode: SlowWarningMode };
	timezone: string | null;
	startDate: string | null;
	endDate: string | null;
}

// #endregion
