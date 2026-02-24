/**
 * FMS FTA App API Types
 *
 * TypeScript interfaces and enums derived from the FMS OpenAPI spec and
 * ftaAppHub SignalR documentation.
 *
 * Date fields from FMS use the format "M/d/yyyy h:mm:ss tt"
 * (e.g. "2/17/2026 10:38:46 PM"). They are typed as `string` here.
 *
 * `recordVersion` is a C# `ulong` used for optimistic concurrency. FMS
 * returns it as an opaque JSON value (number | null) — it must be echoed
 * back unchanged on modify/delete calls.
 */

import type { TournamentLevel } from "./types";

export type { TournamentLevel };

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** FMS note category types (EventNoteTypes enum). */
export type FTAEventNoteType =
	| "FTAEvent"
	| "FTAMatch"
	| "FTATeamIssue"
	| "FTAAppUsageData"
	| "FTATeam"
	| "FMSAllianceTimeout"
	| "FMSMatchMaker"
	| "Staff";

/** Issue category for team issues (EventNoteIssueTypes enum). */
export type FTAEventNoteIssueType =
	| "RoboRioIssue"
	| "DSIssue"
	| "NoRobot"
	| "RadioIssue"
	| "RobotPwrIssue"
	| "OtherRobotIssue"
	| "VenueIssue"
	| "ElectricalIssue"
	| "MechanicalIssue"
	| "VolunteerIssue"
	| "Other";

/** Resolution state for team issues (EventNoteResolutionTypes enum). */
export type FTAEventNoteResolutionType = "Open" | "Resolved" | "NotApplicable";

// ---------------------------------------------------------------------------
// Connection / bypass status
// ---------------------------------------------------------------------------

/** Per-team connection status entry (ConnectionStatusInfoTeamModel). */
export interface FTAConnectionStatusInfoTeam {
	teamNumber: number;
	wpaKeyExists: boolean;
	/** String representation of WPAKeyStatusType enum. */
	wpaKeyStatus: string;
}

/** Response from Api_GetConnectionStatusInfo (ConnectionStatusInfoModel). */
export interface FTAConnectionStatusInfo {
	teamStatuses: FTAConnectionStatusInfoTeam[];
}

/** Per-team bypass info entry (BypassStatusInfoTeamModel). */
export interface FTABypassStatusInfoTeam {
	teamNumber: number;
	matchNumber: number;
	tournamentLevel: string;
}

// ---------------------------------------------------------------------------
// Note models — GET (read) responses
// ---------------------------------------------------------------------------

/** Event-level note returned by Api_GetEventNote (EventNoteModel). */
export interface FTAEventNoteModel {
	note: string;
	/** UUID. Optional per spec — absent on some older records. */
	noteId?: string;
	/** FMS date string: "M/d/yyyy h:mm:ss tt" */
	timeAdded?: string | null;
	/** FMS date string: "M/d/yyyy h:mm:ss tt" */
	timeUpdated?: string | null;
	isDeleted: boolean;
	whoAdded: string;
	whoUpdated: string;
	/** Opaque ulong from C# — echo back unchanged on modify. */
	recordVersion: number | null;
}

/** Match-level note returned by Api_GetMatchNote (MatchNoteModel). */
export interface FTAMatchNoteModel {
	note: string;
	noteId?: string;
	tournamentLevel: string;
	matchNumber: number;
	playNumber: number;
	teamNumber?: number | null;
	/** FMS date string: "M/d/yyyy h:mm:ss tt" */
	timeAdded?: string | null;
	/** FMS date string: "M/d/yyyy h:mm:ss tt" */
	timeUpdated?: string | null;
	isDeleted: boolean;
	whoAdded: string;
	whoUpdated: string;
	recordVersion: number | null;
}

/** Team issue returned by Api_GetTeamIssues (TeamIssueModel). */
export interface FTATeamIssueModel {
	note: string;
	noteId?: string;
	tournamentLevel: TournamentLevel;
	matchNumber: number;
	playNumber: number;
	teamNumber: number;
	issueType: FTAEventNoteIssueType;
	resolutionStatus: FTAEventNoteResolutionType;
	/** FMS date string: "M/d/yyyy h:mm:ss tt" */
	timeAdded?: string | null;
	/** FMS date string: "M/d/yyyy h:mm:ss tt" */
	timeUpdated?: string | null;
	isDeleted: boolean;
	whoAdded: string;
	whoUpdated: string;
	recordVersion: number | null;
}

/** Response from all Api_CreateNote_* and Api_ModifyNote_* endpoints (NoteCreatedUpdatedModel). */
export interface FTANoteCreatedUpdatedModel {
	/** UUID of the created/updated note. Optional per spec. */
	noteId?: string;
	/** Opaque ulong — store and echo back on subsequent modify calls. */
	recordVersion: number | null;
}

// ---------------------------------------------------------------------------
// Note create/modify request models (Client → FMS REST)
// TODO: Field names/requirements are inferred from the response models.
//       Verify against FMS source when possible.
// ---------------------------------------------------------------------------

/** Body for Api_CreateNote_Event / Api_ModifyNote_Event. */
export interface FTAEventNoteCreateModifyModel {
	note: string;
	/** Required for modify. Omit (or null) for create. */
	noteId?: string | null;
	/** Required for modify — prevents stale overwrites. */
	recordVersion?: number | null;
}

/** Body for Api_CreateNote_Match / Api_ModifyNote_Match. */
export interface FTAMatchNoteCreateModifyModel {
	note: string;
	noteId?: string | null;
	tournamentLevel: string;
	matchNumber: number;
	playNumber: number;
	teamNumber?: number | null;
	recordVersion?: number | null;
}

/** Body for Api_CreateNote_TeamIssue / Api_ModifyNote_TeamIssue. */
export interface FTATeamIssueCreateModifyModel {
	note: string;
	noteId?: string | null;
	tournamentLevel: TournamentLevel;
	matchNumber: number;
	playNumber: number;
	teamNumber: number;
	issueType: FTAEventNoteIssueType;
	resolutionStatus: FTAEventNoteResolutionType;
	recordVersion?: number | null;
}

// ---------------------------------------------------------------------------
// ftaAppHub SignalR payloads
// ---------------------------------------------------------------------------

/**
 * Server → Client `NoteChanged` event payload.
 * Broadcast whenever any note is created, updated, resolved, reopened, or deleted.
 */
export interface FTANoteChangedEvent {
	NoteType: FTAEventNoteType;
	/** UUID of the affected note. */
	FMSNoteId: string;
	RecordVersion: number | null;
	/**
	 * The action that triggered the change.
	 * Known values: "Create" | "Update" | "Resolve" | "Reopen" | "Delete"
	 * (not formally enumerated in the FMS spec).
	 */
	Type: string;
	/** Identifier of the FMS device/user that made the change. */
	FMSDeviceIdentification: string;
	/** ISO 8601 timestamp of the current change. */
	CurrentTimeStamp: string;
	/** ISO 8601 timestamp of the previous change (for ordering). */
	PreviousTimeStamp: string;
}

/** Server → Client `MatchStatusInfoChanged` event payload from ftaAppHub. */
export interface FTAMatchStatusInfoChanged {
	/**
	 * Current field / match state machine state.
	 * Known values mirror the fieldMonitorHub MatchState strings
	 * (e.g. "WaitingForPrestart", "MatchAuto", "WaitingForCommit", etc.)
	 * plus "NoCurrentlyActiveEvent" when no match is loaded.
	 */
	MatchState: string;
	MatchNumber: number;
	PlayNumber: number;
	Level: TournamentLevel;
}

/**
 * Model passed to Client → Server hub methods: NoteAdded, NoteUpdated,
 * NoteResolved, NoteReopened, NoteDeleted.
 *
 * The server rebroadcasts this to other connected clients as a NoteChanged event.
 * Fields are inferred from the NoteChanged server→client payload.
 * TODO: Verify exact field requirements with FMS source.
 */
export interface FTANoteModel {
	NoteType: FTAEventNoteType;
	/** UUID of the note. */
	FMSNoteId: string;
	RecordVersion: number | null;
	/** Identifies the calling device/user. */
	FMSDeviceIdentification: string;
	/** ISO 8601 timestamp — set to the time of the operation. */
	CurrentTimeStamp: string;
	/**
	 * ISO 8601 timestamp returned by `GetPreviousTimeStamp` before the operation.
	 * Used by FMS to order and deduplicate change notifications.
	 */
	PreviousTimeStamp: string;
}
