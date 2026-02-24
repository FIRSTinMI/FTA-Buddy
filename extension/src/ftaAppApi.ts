/**
 * FTA App API
 *
 * Stub functions for authenticating against and calling the FMS FTA App API endpoints.
 * Base route: http://{fms}/api/v1.0/FTA
 *
 * Authentication uses HTTP Basic auth with the FMS event password.
 * The password is stored in the FTA Buddy server and fetched by the extension at startup.
 *
 * See docs/ftaapp.md and openapi.json for full endpoint documentation.
 */

import type {
	FTABypassStatusInfoTeam,
	FTAConnectionStatusInfo,
	FTAEventNoteCreateModifyModel,
	FTAEventNoteModel,
	FTAMatchNoteCreateModifyModel,
	FTAMatchNoteModel,
	FTANoteCreatedUpdatedModel,
	FTANoteModel,
	FTATeamIssueCreateModifyModel,
	FTATeamIssueModel,
} from "../../shared/fmsApiTypes";
import { FMS } from "./background";

const FTA_BASE = () => `http://${FMS}/api/v1.0/FTA`;

/** The current FMS event password. Set via {@link setFmsEventPassword}. */
let fmsEventPassword: string | null = null;

/** Update the FMS event password used for API authentication. */
export function setFmsEventPassword(password: string | null) {
	fmsEventPassword = password;
}

/**
 * Build HTTP Basic auth headers for FMS API requests.
 * FMS expects HTTP Basic auth with any username and the event password.
 * Returns null if no password is configured.
 */
function buildAuthHeaders(): HeadersInit | null {
	if (!fmsEventPassword) return null;
	// TODO: Confirm whether FMS expects a specific username here
	const credentials = btoa(`FTABuddy:${fmsEventPassword}`);
	return {
		Authorization: `Basic ${credentials}`,
		"Content-Type": "application/json",
	};
}

/**
 * Check whether the extension currently has an FMS event password configured.
 */
export function hasFmsEventPassword(): boolean {
	return !!fmsEventPassword;
}

// ---------------------------------------------------------------------------
// Read endpoints
// ---------------------------------------------------------------------------

/**
 * Get connection status info for all driver stations.
 * GET /api/v1.0/FTA/get/Api_GetConnectionStatusInfo
 * @stub
 */
export async function getConnectionStatusInfo(): Promise<FTAConnectionStatusInfo> {
	const headers = buildAuthHeaders();
	if (!headers) throw new Error("FMS event password not configured");

	const res = await fetch(`${FTA_BASE()}/get/Api_GetConnectionStatusInfo`, { headers });
	if (!res.ok) throw new Error(`FMS API error: ${res.status}`);
	return res.json() as Promise<FTAConnectionStatusInfo>;
}

/**
 * Get bypass status info for all driver stations.
 * GET /api/v1.0/FTA/get/Api_GetBypassStatusInfo
 * @stub
 */
export async function getBypassStatusInfo(): Promise<FTABypassStatusInfoTeam[]> {
	const headers = buildAuthHeaders();
	if (!headers) throw new Error("FMS event password not configured");

	const res = await fetch(`${FTA_BASE()}/get/Api_GetBypassStatusInfo`, { headers });
	if (!res.ok) throw new Error(`FMS API error: ${res.status}`);
	return res.json() as Promise<FTABypassStatusInfoTeam[]>;
}

/**
 * Get event-level notes from FMS.
 * GET /api/v1.0/FTA/get/Api_GetEventNote
 * @param season - FIRST season year (e.g. 2026)
 * @param eventCode - FMS event code
 * @stub
 */
export async function getEventNotes(season: number, eventCode: string): Promise<FTAEventNoteModel[]> {
	const headers = buildAuthHeaders();
	if (!headers) throw new Error("FMS event password not configured");

	const url = new URL(`${FTA_BASE()}/get/Api_GetEventNote`);
	url.searchParams.set("season", String(season));
	url.searchParams.set("eventCode", eventCode);

	const res = await fetch(url.toString(), { headers });
	if (!res.ok) throw new Error(`FMS API error: ${res.status}`);
	return res.json() as Promise<FTAEventNoteModel[]>;
}

/**
 * Get match-level notes from FMS.
 * GET /api/v1.0/FTA/get/Api_GetMatchNote
 * @param season - FIRST season year (e.g. 2026)
 * @param eventCode - FMS event code
 * @stub
 */
export async function getMatchNotes(season: number, eventCode: string): Promise<FTAMatchNoteModel[]> {
	const headers = buildAuthHeaders();
	if (!headers) throw new Error("FMS event password not configured");

	const url = new URL(`${FTA_BASE()}/get/Api_GetMatchNote`);
	url.searchParams.set("season", String(season));
	url.searchParams.set("eventCode", eventCode);

	const res = await fetch(url.toString(), { headers });
	if (!res.ok) throw new Error(`FMS API error: ${res.status}`);
	return res.json() as Promise<FTAMatchNoteModel[]>;
}

/**
 * Get team issues (team-level notes) from FMS.
 * GET /api/v1.0/FTA/get/Api_GetTeamIssues
 * @param season - FIRST season year (e.g. 2026)
 * @param eventCode - FMS event code
 * @stub
 */
export async function getTeamIssues(season: number, eventCode: string): Promise<FTATeamIssueModel[]> {
	const headers = buildAuthHeaders();
	if (!headers) throw new Error("FMS event password not configured");

	const url = new URL(`${FTA_BASE()}/get/Api_GetTeamIssues`);
	url.searchParams.set("season", String(season));
	url.searchParams.set("eventCode", eventCode);

	const res = await fetch(url.toString(), { headers });
	if (!res.ok) throw new Error(`FMS API error: ${res.status}`);
	return res.json() as Promise<FTATeamIssueModel[]>;
}

// ---------------------------------------------------------------------------
// Write endpoints
// ---------------------------------------------------------------------------

/**
 * Create an event-level note in FMS.
 * GET /api/v1.0/FTA/get/Api_CreateNote_Event
 * @stub
 */
export async function createEventNote(
	season: number,
	eventCode: string,
	note: FTAEventNoteCreateModifyModel,
	userInfo: string,
): Promise<FTANoteCreatedUpdatedModel> {
	const headers = buildAuthHeaders();
	if (!headers) throw new Error("FMS event password not configured");

	// TODO: Confirm how FMS expects the note body for GET-based create endpoints
	const url = new URL(`${FTA_BASE()}/get/Api_CreateNote_Event`);
	url.searchParams.set("season", String(season));
	url.searchParams.set("eventCode", eventCode);
	url.searchParams.set("userInfo", userInfo);

	const res = await fetch(url.toString(), { method: "GET", headers });
	if (!res.ok) throw new Error(`FMS API error: ${res.status}`);
	return res.json() as Promise<FTANoteCreatedUpdatedModel>;
}

/**
 * Create a match-level note in FMS.
 * GET /api/v1.0/FTA/get/Api_CreateNote_Match
 * @stub
 */
export async function createMatchNote(
	season: number,
	eventCode: string,
	note: FTAMatchNoteCreateModifyModel,
	userInfo: string,
): Promise<FTANoteCreatedUpdatedModel> {
	const headers = buildAuthHeaders();
	if (!headers) throw new Error("FMS event password not configured");

	const url = new URL(`${FTA_BASE()}/get/Api_CreateNote_Match`);
	url.searchParams.set("season", String(season));
	url.searchParams.set("eventCode", eventCode);
	url.searchParams.set("userInfo", userInfo);

	const res = await fetch(url.toString(), { method: "GET", headers });
	if (!res.ok) throw new Error(`FMS API error: ${res.status}`);
	return res.json() as Promise<FTANoteCreatedUpdatedModel>;
}

/**
 * Create a team issue (team-level note) in FMS.
 * GET /api/v1.0/FTA/get/Api_CreateNote_TeamIssue
 * @stub
 */
export async function createTeamIssue(
	season: number,
	eventCode: string,
	teamIssue: FTATeamIssueCreateModifyModel,
	userInfo: string,
): Promise<FTANoteCreatedUpdatedModel> {
	const headers = buildAuthHeaders();
	if (!headers) throw new Error("FMS event password not configured");

	const url = new URL(`${FTA_BASE()}/get/Api_CreateNote_TeamIssue`);
	url.searchParams.set("season", String(season));
	url.searchParams.set("eventCode", eventCode);
	url.searchParams.set("userInfo", userInfo);

	const res = await fetch(url.toString(), { method: "GET", headers });
	if (!res.ok) throw new Error(`FMS API error: ${res.status}`);
	return res.json() as Promise<FTANoteCreatedUpdatedModel>;
}

/**
 * Modify an existing event-level note in FMS.
 * GET /api/v1.0/FTA/get/Api_ModifyNote_Event
 * @stub
 */
export async function modifyEventNote(
	season: number,
	eventCode: string,
	note: FTAEventNoteCreateModifyModel,
	userInfo: string,
): Promise<FTANoteCreatedUpdatedModel> {
	const headers = buildAuthHeaders();
	if (!headers) throw new Error("FMS event password not configured");

	const url = new URL(`${FTA_BASE()}/get/Api_ModifyNote_Event`);
	url.searchParams.set("season", String(season));
	url.searchParams.set("eventCode", eventCode);
	url.searchParams.set("userInfo", userInfo);

	const res = await fetch(url.toString(), { method: "GET", headers });
	if (!res.ok) throw new Error(`FMS API error: ${res.status}`);
	return res.json() as Promise<FTANoteCreatedUpdatedModel>;
}

/**
 * Modify an existing match-level note in FMS.
 * GET /api/v1.0/FTA/get/Api_ModifyNote_Match
 * @stub
 */
export async function modifyMatchNote(
	season: number,
	eventCode: string,
	note: FTAMatchNoteCreateModifyModel,
	userInfo: string,
): Promise<FTANoteCreatedUpdatedModel> {
	const headers = buildAuthHeaders();
	if (!headers) throw new Error("FMS event password not configured");

	const url = new URL(`${FTA_BASE()}/get/Api_ModifyNote_Match`);
	url.searchParams.set("season", String(season));
	url.searchParams.set("eventCode", eventCode);
	url.searchParams.set("userInfo", userInfo);

	const res = await fetch(url.toString(), { method: "GET", headers });
	if (!res.ok) throw new Error(`FMS API error: ${res.status}`);
	return res.json() as Promise<FTANoteCreatedUpdatedModel>;
}

/**
 * Modify an existing team issue in FMS.
 * GET /api/v1.0/FTA/get/Api_ModifyNote_TeamIssue
 * @stub
 */
export async function modifyTeamIssue(
	season: number,
	eventCode: string,
	teamIssue: FTATeamIssueCreateModifyModel,
	userInfo: string,
): Promise<FTANoteCreatedUpdatedModel> {
	const headers = buildAuthHeaders();
	if (!headers) throw new Error("FMS event password not configured");

	const url = new URL(`${FTA_BASE()}/get/Api_ModifyNote_TeamIssue`);
	url.searchParams.set("season", String(season));
	url.searchParams.set("eventCode", eventCode);
	url.searchParams.set("userInfo", userInfo);

	const res = await fetch(url.toString(), { method: "GET", headers });
	if (!res.ok) throw new Error(`FMS API error: ${res.status}`);
	return res.json() as Promise<FTANoteCreatedUpdatedModel>;
}

/**
 * Delete a note from FMS.
 * GET /api/v1.0/FTA/get/Api_DeleteNote
 * @stub
 */
export async function deleteNote(season: number, eventCode: string, noteId: string, userInfo: string): Promise<void> {
	const headers = buildAuthHeaders();
	if (!headers) throw new Error("FMS event password not configured");

	const url = new URL(`${FTA_BASE()}/get/Api_DeleteNote`);
	url.searchParams.set("season", String(season));
	url.searchParams.set("eventCode", eventCode);
	url.searchParams.set("noteId", noteId);
	url.searchParams.set("userInfo", userInfo);

	const res = await fetch(url.toString(), { method: "GET", headers });
	if (!res.ok) throw new Error(`FMS API error: ${res.status}`);
}

// ---------------------------------------------------------------------------
// ftaAppHub invocation stubs
// ---------------------------------------------------------------------------
// These call the SignalR ftaAppHub Client→Server methods.
// Import signalRConnection from background.ts to use them.

/**
 * Fetch the timestamp of the latest FMS note from the server.
 * Invokes `GetPreviousTimeStamp` on ftaAppHub.
 * @stub
 */
export async function getPreviousTimestamp(ftaAppHub: import("@microsoft/signalr").HubConnection): Promise<string> {
	// TODO: Handle the case where ftaAppHub is null / not connected
	return ftaAppHub.invoke<string>("GetPreviousTimeStamp");
}

/**
 * Notify FMS that a note was added.
 * Invokes `NoteAdded` on ftaAppHub.
 * @stub
 */
export async function notifyNoteAdded(
	ftaAppHub: import("@microsoft/signalr").HubConnection,
	note: FTANoteModel,
): Promise<void> {
	return ftaAppHub.invoke("NoteAdded", note);
}

/**
 * Notify FMS that a note was updated.
 * Invokes `NoteUpdated` on ftaAppHub.
 * @stub
 */
export async function notifyNoteUpdated(
	ftaAppHub: import("@microsoft/signalr").HubConnection,
	note: FTANoteModel,
): Promise<void> {
	return ftaAppHub.invoke("NoteUpdated", note);
}

/**
 * Notify FMS that a note was resolved.
 * Invokes `NoteResolved` on ftaAppHub.
 * @stub
 */
export async function notifyNoteResolved(
	ftaAppHub: import("@microsoft/signalr").HubConnection,
	note: FTANoteModel,
): Promise<void> {
	return ftaAppHub.invoke("NoteResolved", note);
}

/**
 * Notify FMS that a note was reopened.
 * Invokes `NoteReopened` on ftaAppHub.
 * @stub
 */
export async function notifyNoteReopened(
	ftaAppHub: import("@microsoft/signalr").HubConnection,
	note: FTANoteModel,
): Promise<void> {
	return ftaAppHub.invoke("NoteReopened", note);
}

/**
 * Notify FMS that a note was deleted.
 * Invokes `NoteDeleted` on ftaAppHub.
 * @stub
 */
export async function notifyNoteDeleted(
	ftaAppHub: import("@microsoft/signalr").HubConnection,
	note: FTANoteModel,
): Promise<void> {
	return ftaAppHub.invoke("NoteDeleted", note);
}
