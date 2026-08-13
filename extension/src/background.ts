import {
	FTAEventNoteIssueTypeNumeric,
	FTAEventNoteResolutionTypeNumeric,
	FTAEventNoteTypeNumeric,
	TournamentLevelNumeric,
	type FTAEventNoteIssueType,
	type FTAEventNoteResolutionType,
	type FTANoteRecord,
	type TournamentLevel,
} from "../../shared/fmsApiTypes";
import { addNote, deleteNote, getEventCode, getTeamNumbers, updateNote } from "./fmsapi";
import { CheesyArenaSource } from "./sources/cheesyArenaSource";
import { FmsSource } from "./sources/fmsSource";
import type { FieldDataSource } from "./sources/types";
import { trpc, updateValues } from "./trpc";
import { MatchState, MatchStateMap } from "../../shared/types";
import { clearCheesyOriginRule, setCheesyOriginRule } from "./sources/cheesyOriginRule";

const ALARM_TEAM_POLL = "teamPoll";
const ALARM_MATCH_IMPORT = "matchImport";
const ALARM_SCHEDULE_POLL = "schedulePoll";

let qualsScheduleAvailable = false;
let inboundSyncInProgress = false;

/**
 * Track FMS note IDs recently synced outbound so we can suppress the
 * SignalR echo that FMS fires back for the same operation.
 */
const recentOutboundFmsIds = new Set<string>();
const ECHO_SUPPRESSION_MS = 10_000;

/**
 * Track in-flight outbound creates so we can defer inbound "added" events
 * until the FMS note ID is known and echo suppression is active.
 */
let outboundCreatesInFlight = 0;
const deferredInboundAdded: Array<{ action: "added"; fmsNote: FTANoteRecord }> = [];

const NOTE_TYPE_TO_FMS_NUMERIC: Record<string, number> = {
	TeamIssue: FTAEventNoteTypeNumeric.FTATeamIssue,
	EventNote: FTAEventNoteTypeNumeric.FTAEvent,
	MatchNote: FTAEventNoteTypeNumeric.FTAMatch,
};

type OutboundSubscription = ReturnType<typeof trpc.notes.updateSubscription.subscribe> | undefined;
let outboundNoteSubscription: OutboundSubscription;

const manifestData = chrome.runtime.getManifest();
export const FMS = "10.0.100.5";
/**
 * Cheesy Arena runs on the arena server at the FRC-standard 10.0.100.5 (the IP is
 * fixed by convention and covered by host_permissions regardless of port). Only
 * the port is configurable, defaulting to Cheesy Arena's own default of 8080.
 */
export const CHEESY_IP = "10.0.100.5";
export const DEFAULT_CHEESY_PORT = 8080;

/** Clamp an arbitrary stored value to a valid port, falling back to the default. */
export function sanitizeCheesyPort(value: unknown): number {
	const n = Number(value);
	return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : DEFAULT_CHEESY_PORT;
}

/** The Cheesy Arena host:port for the configured port. */
function cheesyHost(): string {
	return `${CHEESY_IP}:${cheesyPort}`;
}

/**
 * The active field data source. Rebuilt in {@link start} from the current
 * settings (FMS over SignalR, or a Cheesy Arena websocket).
 */
let source: FieldDataSource | null = null;

export let eventCode: string;
export let eventToken: string;
export let url: string;
export let id: string;
export let enabled: boolean;
export let fieldMonitor: boolean = false;
export let useSignalR: boolean = true;
export let sourceMode: "fms" | "cheesy" = "fms";
export let cheesyPort: number = DEFAULT_CHEESY_PORT;
export let cloud: boolean;
export let useDev: boolean;
export let changed: number;

export let fmsApi: boolean = false;
export let fmsApiEnabled: boolean = true;

async function stop() {
	stopTeamPolling();
	stopMatchAutoImport();
	stopSchedulePolling();
	outboundNoteSubscription?.unsubscribe();
	outboundNoteSubscription = undefined;
	await source?.stop();
}

async function start() {
	await stop();

	await new Promise((resolve) => {
		chrome.storage.local.get(
			[
				"url",
				"cloud",
				"useDev",
				"event",
				"changed",
				"enabled",
				"fieldMonitor",
				"useSignalR",
				"sourceMode",
				"cheesyPort",
				"id",
				"eventToken",
				"fmsApiEnabled",
			],
			(item) => {
				if (!item.id) chrome.storage.local.set({ id: crypto.randomUUID() });

				if (
					item.url == undefined ||
					item.cloud == undefined ||
					item.event == undefined ||
					item.changed == undefined ||
					item.enabled == undefined ||
					item.eventToken == undefined
				) {
					item = {
						url: item.url || "http://localhost:3001",
						cloud: item.cloud ?? true,
						useDev: item.useDev ?? false,
						event: item.event || "2024event",
						changed: item.changed || new Date().getTime(),
						enabled: item.enabled ?? false,
						fieldMonitor: item.fieldMonitor ?? false,
						useSignalR: item.useSignalR ?? true,
						fmsApiEnabled: item.fmsApiEnabled ?? true,
						eventToken: item.eventToken || "",
						id: item.id || crypto.randomUUID(),
					};
					chrome.storage.local.set(item);
				}

				url = String(item.url);
				cloud = Boolean(item.cloud);
				useDev = Boolean(item.useDev);
				eventCode = String(item.event);
				changed = Number(item.changed);
				enabled = Boolean(item.enabled);
				fieldMonitor = Boolean(item.fieldMonitor);
				useSignalR = item.useSignalR !== false; // default true
				fmsApiEnabled = item.fmsApiEnabled !== false; // default true
				sourceMode = item.sourceMode === "cheesy" ? "cheesy" : "fms"; // default fms
				cheesyPort = sanitizeCheesyPort(item.cheesyPort);
				eventToken = String(item.eventToken);
				id = String(item.id) || crypto.randomUUID();
				if (id !== item.id) chrome.storage.local.set({ id });
				resolve(void 0);
			},
		);
	});

	if (!enabled) {
		console.log("Not enabled");
		return;
	} else if (changed && changed + 1000 * 60 * 60 * 24 * 4 < new Date().getTime()) {
		console.log("Expired");
		return;
	}

	// (Re)build the field data source for the selected mode and wire its events.
	source = buildSource();
	source.on("frame", sendFrame);
	source.on("cycleTime", sendCycletime);
	source.on("sendSchedule", sendScheduleDetails);

	// Cheesy Arena's websocket enforces a same-origin check; strip the extension
	// Origin header on requests to it so the connection is accepted.
	if (sourceMode === "cheesy") await setCheesyOriginRule(cheesyHost());
	else await clearCheesyOriginRule();

	await pingFMS();

	if (!fieldMonitor) {
		console.log("Field monitor disabled, skipping realtime source");
		if (!(eventCode || eventToken)) return;
		await updateValues();
		if (fmsApiEnabled) {
			startSchedulePolling();
			startTeamPolling();
			startMatchAutoImport();
		}
		return;
	}

	// The Cheesy Arena source is the realtime feed for its mode; for FMS the
	// SignalR feed is optional (scraping mode posts frames from a content script).
	if (sourceMode === "cheesy") {
		console.log("Starting Cheesy Arena source");
		await source.start();
	} else if (useSignalR) {
		console.log("Starting SignalR");
		await source.start();
	} else {
		console.log("SignalR disabled, using scraping mode");
	}

	if (!(eventCode || eventToken)) return;

	await updateValues();
	if (fmsApiEnabled) {
		startSchedulePolling();
		startTeamPolling();
		startMatchAutoImport();
	}

	// FMS-only: fetch the FMS event password and wire two-way note sync.
	if (source.supportsNotes) {
		try {
			const { fmsEventPassword } = await trpc.event.getFmsEventPassword.query();
			source.setFmsEventPassword(fmsEventPassword);
			if (useSignalR) {
				source.on("noteChanged", handleFmsNoteChanged);
			}
			startOutboundNoteSync();
		} catch (err) {
			console.warn("Could not fetch FMS event password:", err);
		}
	}
}

function buildSource(): FieldDataSource {
	if (sourceMode === "cheesy") {
		return new CheesyArenaSource(cheesyHost(), manifestData.version, () => eventCode, id);
	}
	return new FmsSource(FMS, manifestData.version);
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
	if (msg?.type === "ping") {
		pingFMS().then((fms) => {
			sendResponse({
				source: "ext",
				version: manifestData.version,
				type: "pong",
				fms,
				id,
			});
		});
		return true;
	} else if (msg?.type === "getEventCode") {
		const codeP = source ? source.getEventCode() : getEventCode();
		const teamsP = source ? source.getTeamNumbers() : getTeamNumbers();
		Promise.all([codeP, teamsP]).then(([code, teams]) => {
			sendResponse({
				source: "ext",
				version: manifestData.version,
				type: "eventCode",
				code,
				teams,
				id,
			});
		});
		return true;
	} else if (msg?.type === "restart") {
		chrome.runtime.reload();
		return false;
	} else if (msg?.type === "enable") {
		enabled = true;
		chrome.storage.local.set({ enabled });
		return false;
	}

	if (msg?.type === "getState") {
		sendResponse({
			cloud,
			useDev,
			url,
			eventCode,
			eventToken,
			enabled,
			fieldMonitor,
			useSignalR,
			sourceMode,
			cheesyPort,
			fmsApiEnabled,
			id,
			fmsApi,
			version: manifestData.version,
			FMS,
		});
		return false;
	}

	if (msg?.type === "pingFMS") {
		(async () => {
			const ok = await pingFMS();
			sendResponse({ ok, fmsApi, FMS });
		})();
		return true;
	}

	if (msg?.type === "getStatuses") {
		const signalrStatus: string = source?.getConnectionStatus() ?? "Unknown";

		sendResponse({
			signalrStatus,
		});
		return false;
	}

	return false;
});

export async function pingFMS() {
	try {
		// Use the active source when available; fall back to a direct FMS probe
		// (e.g. for popup pings before the source has been built).
		if (source) {
			fmsApi = await source.ping();
			return fmsApi;
		}
		const controller = new AbortController();
		setTimeout(() => controller.abort(), 500);
		const res = await fetch(`http://${FMS}/`, { signal: controller.signal });
		fmsApi = !!res.ok;
		return res.ok;
	} catch {
		fmsApi = false;
		return false;
	}
}

const NOTE_TYPE_MAP: Record<string, "TeamIssue" | "EventNote" | "MatchNote"> = {
	FTATeam: "TeamIssue",
	FTATeamIssue: "TeamIssue",
	FTAEvent: "EventNote",
	FTAMatch: "MatchNote",
};

async function handleFmsNoteChanged(
	action: "added" | "updated" | "reopened" | "resolved" | "deleted",
	fmsNote: FTANoteRecord,
): Promise<void> {
	console.log(
		`[NoteSync] handleFmsNoteChanged action=${action} fmsId=${fmsNote.fmsEventNoteId} inFlight=${outboundCreatesInFlight} deferred=${deferredInboundAdded.length} echoSet=[${[...recentOutboundFmsIds].join(",")}]`,
	);
	// Suppress echoes from our own outbound sync
	if (recentOutboundFmsIds.has(fmsNote.fmsEventNoteId)) {
		console.log(`[NoteSync] ECHO SUPPRESSED for ${fmsNote.fmsEventNoteId}`);
		recentOutboundFmsIds.delete(fmsNote.fmsEventNoteId);
		return;
	}
	// If an outbound create is in flight, defer "added" events until we know
	// the FMS ID (so echo suppression can catch them).
	if (outboundCreatesInFlight > 0 && action === "added") {
		console.log(`[NoteSync] DEFERRED inbound 'added' (outbound create in flight)`);
		deferredInboundAdded.push({ action, fmsNote });
		return;
	}
	if (inboundSyncInProgress) {
		console.log(`[NoteSync] SKIPPED - inboundSyncInProgress`);
		return;
	}
	inboundSyncInProgress = true;
	try {
		const note_type = NOTE_TYPE_MAP[fmsNote.noteType] ?? "EventNote";

		if (action === "added") {
			console.log(`[NoteSync] Calling createFromFMS for fmsId=${fmsNote.fmsEventNoteId}`);
			await trpc.notes.createFromFMS.mutate({
				fms_note_id: fmsNote.fmsEventNoteId,
				text: fmsNote.note,
				display_name: "FTA",
				team: fmsNote.teamNumber ?? undefined,
				note_type,
				match_number: fmsNote.matchNumber ?? undefined,
				play_number: fmsNote.playNumber ?? undefined,
				tournament_level: (fmsNote.tournamentLevel as TournamentLevel) ?? undefined,
				fms_metadata: { issueType: fmsNote.issueType, resolutionStatus: fmsNote.resolutionStatus },
			});
		} else if (action === "deleted") {
			console.log(`[NoteSync] Calling deleteByFmsNoteId for fmsId=${fmsNote.fmsEventNoteId}`);
			await trpc.notes.deleteByFmsNoteId.mutate({ fms_note_id: fmsNote.fmsEventNoteId });
		} else {
			console.log(`[NoteSync] Calling editFromFMS for fmsId=${fmsNote.fmsEventNoteId} (${action})`);
			// updated / reopened / resolved - pass fms_note_id directly, no lookup needed
			await trpc.notes.editFromFMS.mutate({
				fms_note_id: fmsNote.fmsEventNoteId,
				text: fmsNote.note,
				fms_metadata: { issueType: fmsNote.issueType, resolutionStatus: fmsNote.resolutionStatus },
			});
		}
	} catch (err) {
		console.warn(`FMS note sync failed (${action}):`, err);
	} finally {
		inboundSyncInProgress = false;
	}
}

function startOutboundNoteSync() {
	outboundNoteSubscription?.unsubscribe();
	outboundNoteSubscription = trpc.notes.updateSubscription.subscribe(
		{
			eventToken,
			source: `${id}.outboundNoteSync`,
		},
		{
			onData: async (data) => {
				// Only sync create/edit/delete kinds to FMS
				if (data.kind !== "create" && data.kind !== "edit" && data.kind !== "delete") return;
				console.log(
					`[NoteSync] outbound onData: kind=${data.kind} source=${data.source} fms_note_id=${data.note.fms_note_id} noteId=${data.note.id}`,
				);
				// Events originating from FMS don't need to be synced back
				if (data.source === "fms") {
					console.log(`[NoteSync] outbound SKIPPED - source is fms`);
					return;
				}
				if (!fmsApi || !fmsApiEnabled) return;
				try {
					if (data.kind === "create" && !data.note.fms_note_id) {
						console.log(`[NoteSync] outbound CREATE → calling addNote to FMS`);
						outboundCreatesInFlight++;
						try {
							const noteTypeNum =
								NOTE_TYPE_TO_FMS_NUMERIC[data.note.note_type] ?? NOTE_TYPE_TO_FMS_NUMERIC.TeamIssue;
							const issueTypeNum =
								FTAEventNoteIssueTypeNumeric[
									(data.note.issue_type ?? "Other") as FTAEventNoteIssueType
								] ?? 30;
							const resolutionNum =
								FTAEventNoteResolutionTypeNumeric[
									(data.note.resolution_status ?? "Open") as FTAEventNoteResolutionType
								] ?? 1;
							const tournLevel =
								TournamentLevelNumeric[(data.note.tournament_level ?? "None") as TournamentLevel] ?? 0;
							const created = await addNote({
								noteType: noteTypeNum,
								issueType: issueTypeNum,
								issueString: data.note.issue_type ?? "Other",
								resolutionStatus: resolutionNum,
								note: data.note.text,
								teamNumber: data.note.team ?? 0,
								tournamentLevel: tournLevel,
								matchNumber: data.note.match_number ?? 0,
								playNumber: data.note.play_number ?? 0,
							});
							if (created.fmsEventNoteId) {
								console.log(
									`[NoteSync] addNote returned fmsId=${created.fmsEventNoteId}, registering echo suppression`,
								);
								recentOutboundFmsIds.add(created.fmsEventNoteId);
								setTimeout(
									() => recentOutboundFmsIds.delete(created.fmsEventNoteId),
									ECHO_SUPPRESSION_MS,
								);
								try {
									console.log(
										`[NoteSync] calling setFmsId noteId=${data.note.id} fmsId=${created.fmsEventNoteId}`,
									);
									await trpc.notes.setFmsId.mutate({
										id: data.note.id,
										fms_note_id: created.fmsEventNoteId,
									});
									console.log(`[NoteSync] setFmsId succeeded`);
								} catch (err) {
									console.warn("Failed to set FMS note ID:", err);
								}
							} else {
								console.warn(`[NoteSync] addNote returned NO fmsEventNoteId`, created);
							}
						} finally {
							outboundCreatesInFlight--;
							console.log(
								`[NoteSync] outbound create done, inFlight=${outboundCreatesInFlight} deferred=${deferredInboundAdded.length}`,
							);
							// Drain deferred inbound "added" events now that echo suppression is active
							while (deferredInboundAdded.length > 0) {
								const deferred = deferredInboundAdded.shift()!;
								console.log(`[NoteSync] draining deferred fmsId=${deferred.fmsNote.fmsEventNoteId}`);
								await handleFmsNoteChanged(deferred.action, deferred.fmsNote);
							}
						}
					} else if (data.kind === "edit" && data.note.fms_note_id) {
						const fmsId = data.note.fms_note_id;
						recentOutboundFmsIds.add(fmsId);
						setTimeout(() => recentOutboundFmsIds.delete(fmsId), ECHO_SUPPRESSION_MS);
						const resolutionNum =
							FTAEventNoteResolutionTypeNumeric[
								(data.note.resolution_status ?? "Open") as FTAEventNoteResolutionType
							] ?? 1;
						await updateNote(data.note.fms_note_id, resolutionNum, data.note.text);
					} else if (data.kind === "delete" && data.note.fms_note_id) {
						const fmsId = data.note.fms_note_id;
						recentOutboundFmsIds.add(fmsId);
						setTimeout(() => recentOutboundFmsIds.delete(fmsId), ECHO_SUPPRESSION_MS);
						await deleteNote(fmsId);
					}
				} catch (err) {
					console.warn("Outbound FMS note sync failed:", err);
				}
			},
		},
	);
}

async function sendFrame(data: any) {
	// In FMS mode the SignalR feed is gated by useSignalR (scraping mode posts
	// frames separately); the Cheesy Arena source always feeds frames.
	if (!fieldMonitor) return;
	if (sourceMode === "fms" && !useSignalR) return;
	await trpc.field.post.mutate(
		eventToken ? { eventToken, ...data, extensionId: id } : { eventCode, ...data, extensionId: id },
	);
}

async function sendCycletime(
	type: "lastCycleTime" | "prestart" | "matchReady" | "start" | "end" | "refsDone" | "scoresPosted",
	data: string,
) {
	if (!fieldMonitor || !source) return;
	let matchNumber: number, playNumber: number, level: "None" | "Practice" | "Qualification" | "Playoff";
	if (fmsApiEnabled) {
		({ matchNumber, playNumber, level } = await source.getCurrentMatch());
	} else {
		matchNumber = source.frame.match;
		playNumber = source.frame.play;
		level = source.frame.level;
	}
	await trpc.cycles.postCycleTime.mutate({
		eventToken,
		type,
		lastCycleTime: data,
		matchNumber,
		playNumber,
		level,
		extensionId: id,
	});
}

async function sendScheduleDetails() {
	if (!source) return;
	const schedule = await source.getScheduleBreakdown();
	if (schedule.days.length === 0) return;
	await trpc.cycles.postScheduleDetails.mutate({ eventToken, ...schedule, extensionId: id });
}

function isMatchRunning(): boolean {
	return fieldMonitor && !!source && MatchStateMap[source.frame.field] === MatchState.RUNNING;
}

async function pollTeams() {
	if (!fmsApi || !eventToken || qualsScheduleAvailable || !source) return;
	if (isMatchRunning()) return; // Skip iteration if a match is running

	try {
		const schedule = await source.getScheduleBreakdown();
		if (schedule.days.length > 0) {
			console.log("Quals schedule available, stopping team polling");
			qualsScheduleAvailable = true;
			stopTeamPolling();
			return;
		}

		const teams: number[] = await source.getTeamNumbers();
		if (teams && teams.length > 0) {
			const result = await trpc.event.syncTeams.mutate({ teamNumbers: teams });
			if (result.added > 0 || result.removed > 0) {
				console.log(`Team sync: +${result.added} added, -${result.removed} removed`);
			}
		}
	} catch (err) {
		console.warn("Team polling error:", err);
	}
}

function startTeamPolling() {
	qualsScheduleAvailable = false;
	pollTeams();
	chrome.alarms.create(ALARM_TEAM_POLL, { delayInMinutes: 2, periodInMinutes: 2 });
	console.log("Started team polling (every 2 min until quals schedule available)");
}

function stopTeamPolling() {
	chrome.alarms.clear(ALARM_TEAM_POLL);
	console.log("Stopped team polling");
}

async function runMatchAutoImport() {
	if (!enabled || !eventToken || !source) return;
	if (isMatchRunning()) return; // Skip iteration if a match is running
	try {
		await source.uploadAllUnimportedMatchLogs();
	} catch (err) {
		console.warn("Match auto-import error:", err);
	}
}

function startMatchAutoImport() {
	runMatchAutoImport();
	chrome.alarms.create(ALARM_MATCH_IMPORT, { delayInMinutes: 2, periodInMinutes: 2 });
	console.log("Started match auto-import (every 2 min)");
}

function stopMatchAutoImport() {
	chrome.alarms.clear(ALARM_MATCH_IMPORT);
}

function startSchedulePolling() {
	sendScheduleDetails();
	chrome.alarms.create(ALARM_SCHEDULE_POLL, { delayInMinutes: 10, periodInMinutes: 10 });
	console.log("Started schedule polling (every 10 min)");
}

function stopSchedulePolling() {
	chrome.alarms.clear(ALARM_SCHEDULE_POLL);
}

chrome.alarms.onAlarm.addListener((alarm) => {
	if (alarm.name === ALARM_TEAM_POLL) pollTeams().catch(console.warn);
	else if (alarm.name === ALARM_MATCH_IMPORT) runMatchAutoImport().catch(console.warn);
	else if (alarm.name === ALARM_SCHEDULE_POLL) sendScheduleDetails().catch(console.warn);
});

let storageDebounce: ReturnType<typeof setTimeout> | null = null;
chrome.storage.local.onChanged.addListener((changes) => {
	for (const key of Object.keys(changes)) {
		if (key === "changed") continue;
		if (storageDebounce) clearTimeout(storageDebounce);
		storageDebounce = setTimeout(() => {
			storageDebounce = null;
			start().catch(console.error);
		}, 300);
		return;
	}
});

if (typeof self !== "undefined" && "ServiceWorkerGlobalScope" in self && self instanceof ServiceWorkerGlobalScope) {
	start().catch(console.error);
}
