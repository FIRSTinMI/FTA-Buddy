import { HubConnectionState } from "@microsoft/signalr";
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
import {
	addNote,
	deleteNote,
	getCurrentMatch,
	getEventCode,
	getScheduleBreakdown,
	getTeamNumbers,
	setFmsEventPassword,
	updateNote,
} from "./fmsapi";
import { SignalR } from "./signalR";
import { trpc, updateValues, uploadAllUnimportedMatchLogs } from "./trpc";
import { MatchState, MatchStateMap } from "../../shared/types";

let teamPollInterval: ReturnType<typeof setInterval> | null = null;
let matchImportInterval: ReturnType<typeof setInterval> | null = null;
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

export const signalRConnection = new SignalR(FMS, manifestData.version);
signalRConnection.on("frame", sendFrame);
signalRConnection.on("cycleTime", sendCycletime);
signalRConnection.on("sendSchedule", sendScheduleDetails);

export let eventCode: string;
export let eventToken: string;
export let url: string;
export let id: string;
export let enabled: boolean;
export let fieldMonitor: boolean = false;
export let cloud: boolean;
export let useDev: boolean;
export let changed: number;

export let fmsApi: boolean = false;

async function stop() {
	stopTeamPolling();
	stopMatchAutoImport();
	outboundNoteSubscription?.unsubscribe();
	outboundNoteSubscription = undefined;
	await signalRConnection.stop();
}

async function start() {
	await stop();

	await new Promise((resolve) => {
		chrome.storage.local.get(
			["url", "cloud", "useDev", "event", "changed", "enabled", "fieldMonitor", "id", "eventToken"],
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

	await pingFMS();

	if (!fieldMonitor) {
		console.log("Field monitor disabled, skipping SignalR");
		if (!(eventCode || eventToken)) return;
		await updateValues();
		sendScheduleDetails();
		startTeamPolling();
		startMatchAutoImport();
		return;
	}

	console.log("Starting SignalR");
	await signalRConnection.start();

	if (!(eventCode || eventToken)) return;

	await updateValues();
	sendScheduleDetails();
	startTeamPolling();
	startMatchAutoImport();

	// Fetch FMS event password from the server and propagate to FTA App API
	try {
		const { fmsEventPassword } = await trpc.event.getFmsEventPassword.query();
		setFmsEventPassword(fmsEventPassword);
		if (fieldMonitor) {
			signalRConnection.on("noteChanged", handleFmsNoteChanged);
			startOutboundNoteSync();
		}
	} catch (err) {
		console.warn("Could not fetch FMS event password:", err);
	}
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
		getEventCode().then((code) => {
			getTeamNumbers().then((teams) => {
				sendResponse({
					source: "ext",
					version: manifestData.version,
					type: "eventCode",
					code,
					teams,
					id,
				});
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
		const signalrStatus: HubConnectionState | string = (signalRConnection as any)?.connection?.state ?? "Unknown";

		sendResponse({
			signalrStatus,
		});
		return false;
	}

	return false;
});

export async function pingFMS() {
	try {
		const controller = new AbortController();
		setTimeout(() => controller.abort(), 500);
		const res = await fetch(`http://${FMS}/FieldMonitor`, { signal: controller.signal });
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
				if (!fmsApi) return;
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
	if (!fieldMonitor) return;
	await trpc.field.post.mutate(
		eventToken ? { eventToken, ...data, extensionId: id } : { eventCode, ...data, extensionId: id },
	);
}

async function sendCycletime(
	type: "lastCycleTime" | "prestart" | "start" | "end" | "refsDone" | "scoresPosted",
	data: string,
) {
	if (!fieldMonitor) return;
	const { matchNumber, playNumber, level } = await getCurrentMatch();
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
	const schedule = await getScheduleBreakdown();
	if (schedule.days.length === 0) return;
	await trpc.cycles.postScheduleDetails.mutate({ eventToken, ...schedule, extensionId: id });
}

function isMatchRunning(): boolean {
	return fieldMonitor && MatchStateMap[signalRConnection.frame.field] === MatchState.RUNNING;
}

async function pollTeams() {
	if (!fmsApi || !eventToken || qualsScheduleAvailable) return;
	if (isMatchRunning()) return; // Skip iteration if a match is running

	try {
		const schedule = await getScheduleBreakdown();
		if (schedule.days.length > 0) {
			console.log("Quals schedule available, stopping team polling");
			qualsScheduleAvailable = true;
			stopTeamPolling();
			return;
		}

		const teams: number[] = await getTeamNumbers();
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
	if (teamPollInterval) return;
	qualsScheduleAvailable = false;
	pollTeams();
	teamPollInterval = setInterval(pollTeams, 2 * 60 * 1000);
	console.log("Started team polling (every 2 min until quals schedule available)");
}

function stopTeamPolling() {
	if (teamPollInterval) {
		clearInterval(teamPollInterval);
		teamPollInterval = null;
		console.log("Stopped team polling");
	}
}

async function runMatchAutoImport() {
	if (!enabled || !eventToken) return;
	if (isMatchRunning()) return; // Skip iteration if a match is running
	try {
		await uploadAllUnimportedMatchLogs();
	} catch (err) {
		console.warn("Match auto-import error:", err);
	}
}

function startMatchAutoImport() {
	if (matchImportInterval) return;
	runMatchAutoImport();
	matchImportInterval = setInterval(runMatchAutoImport, 2 * 60 * 1000);
	console.log("Started match auto-import (every 2 min)");
}

function stopMatchAutoImport() {
	if (matchImportInterval) {
		clearInterval(matchImportInterval);
		matchImportInterval = null;
		console.log("Stopped match auto-import");
	}
}

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
