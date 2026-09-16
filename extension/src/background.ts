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
import type { PowerTelemetry } from "../../shared/types";
import { PowerMonitorManager, SUBNET_PREFIX } from "./power-monitor";

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
let extensionConfigSubscription: { unsubscribe: () => void } | undefined;

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

export let powerMonitorEnabled: boolean = false;

export let fmsApi: boolean = false;
export let fmsApiEnabled: boolean = true;

async function stop() {
	stopTeamPolling();
	stopMatchAutoImport();
	stopSchedulePolling();
	outboundNoteSubscription?.unsubscribe();
	outboundNoteSubscription = undefined;
	extensionConfigSubscription?.unsubscribe();
	extensionConfigSubscription = undefined;
	stopPowerMonitor();
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
				"powerMonitor",
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
				powerMonitorEnabled = Boolean(item.powerMonitor);
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

	// Field power monitors are independent of the field data source - they need
	// nothing from FMS and only the event token to post - so they start before
	// the field-monitor gate below.
	await updateValues();
	await startPowerMonitor();

	// (Re)build the field data source for the selected mode and wire its events.
	source = buildSource();
	source.on("frame", sendFrame);
	source.on("cycleTime", sendCycletime);
	source.on("sendSchedule", sendScheduleDetails);

	// Cheesy Arena's websocket enforces a same-origin check that rejects the
	// service worker's chrome-extension:// origin, and Chrome won't let DNR strip
	// the Origin header on a ws handshake. So in Cheesy mode the `cheesy-inject`
	// content script opens the feed from the Cheesy Arena field monitor page and
	// relays it here (see the "cheesyWs" runtime message handler). Nothing to do
	// in the worker beyond building the source.

	await pingFMS();

	if (!fieldMonitor) {
		console.log("Field monitor disabled, skipping realtime source");
		if (!(eventCode || eventToken)) return;
		await updateValues();
		startExtensionConfigSync();
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
	startExtensionConfigSync();
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
		return new CheesyArenaSource(cheesyHost(), manifestData.version, () => eventCode);
	}
	return new FmsSource(FMS, manifestData.version);
}

// #region Remote config sync

/** The extension settings mirrored to the server for remote configuration. */
function currentExtensionConfig() {
	return { enabled, fieldMonitor, useSignalR, fmsApiEnabled, sourceMode, cheesyPort };
}

/** Report the current config + version to the server so any device can see it. */
function reportExtensionState() {
	if (!eventToken) return;
	trpc.extension.reportState
		.mutate({ extensionId: id, version: manifestData.version, fmsApi, config: currentExtensionConfig() })
		.catch((err) => console.warn("Extension reportState failed:", err));
}

/**
 * Report current config to the server and subscribe for remote config pushes so
 * the extension can be reconfigured from any device. A pushed config is written
 * to chrome.storage.local, whose change listener restarts the extension so the
 * new settings take effect (and reportState then confirms the applied state).
 */
function startExtensionConfigSync() {
	extensionConfigSubscription?.unsubscribe();
	reportExtensionState();
	extensionConfigSubscription = trpc.extension.configSubscription.subscribe(
		{ extensionId: id },
		{
			onData: (config) => {
				const updates: Record<string, any> = {};
				if (config.enabled !== undefined) updates.enabled = config.enabled;
				if (config.fieldMonitor !== undefined) updates.fieldMonitor = config.fieldMonitor;
				if (config.useSignalR !== undefined) updates.useSignalR = config.useSignalR;
				if (config.fmsApiEnabled !== undefined) updates.fmsApiEnabled = config.fmsApiEnabled;
				if (config.sourceMode !== undefined)
					updates.sourceMode = config.sourceMode === "cheesy" ? "cheesy" : "fms";
				if (config.cheesyPort !== undefined) updates.cheesyPort = sanitizeCheesyPort(config.cheesyPort);
				if (Object.keys(updates).length > 0) chrome.storage.local.set(updates);
			},
			onError: (err) => console.warn("Extension configSubscription error:", err),
		},
	);
}


// #region Field power monitors

/**
 * ESP32-P4 + PZEM-004T monitors on the event network. The extension is the only
 * piece that can reach them (the app is HTTPS, they are plain HTTP on a private
 * address), so it sweeps for them, holds their SSE streams, pushes live samples
 * into any open FTA Buddy tab, and posts one-second rollups to the server.
 */
let powerManager: PowerMonitorManager | null = null;

/** Origins where the `app` content script runs, i.e. tabs that can receive telemetry. */
const APP_TAB_PATTERNS = ["https://ftabuddy.com/*", "https://dev.ftabuddy.com/*", "http://localhost:5173/*"];

/**
 * One second of samples from one monitor: every PZEM register averaged, with
 * the extreme of each kept alongside. A sag or a spike lives inside a second,
 * so an average alone would hide exactly what this is for.
 */
interface PowerBucket {
	monitorId: string;
	second: number;
	count: number;
	voltsSum: number;
	voltsMin: number;
	voltsMax: number;
	ampsSum: number;
	ampsMax: number;
	wattsSum: number;
	wattsMax: number;
	hzSum: number;
	hzMin: number | null;
	hzCount: number;
	pfSum: number;
	pfMin: number | null;
	pfCount: number;
	kwh: number | null;
	alarm: boolean;
}

const powerBuckets = new Map<string, PowerBucket>();
/**
 * Whether each monitor's meter last answered. Tracked separately from the
 * buckets because a failed read is dropped before it ever reaches one, and a
 * meter that has stopped answering is exactly what the alerts care about.
 */
const powerMeterOk = new Map<string, boolean>();
let powerFlushTimer: ReturnType<typeof setInterval> | null = null;
const POWER_FLUSH_INTERVAL_MS = 5_000;

/** Fold one reading into its one-second bucket. Failed reads are not stored. */
function bucketTelemetry(telemetry: PowerTelemetry) {
	powerMeterOk.set(telemetry.id, telemetry.ok);
	if (!telemetry.ok || telemetry.v === null || telemetry.a === null || telemetry.w === null) return;
	const second = Math.floor(telemetry.ts / 1000);
	const key = `${telemetry.id}:${second}`;
	const bucket = powerBuckets.get(key);
	if (bucket) {
		bucket.count++;
		bucket.voltsSum += telemetry.v;
		bucket.voltsMin = Math.min(bucket.voltsMin, telemetry.v);
		bucket.voltsMax = Math.max(bucket.voltsMax, telemetry.v);
		bucket.ampsSum += telemetry.a;
		bucket.ampsMax = Math.max(bucket.ampsMax, telemetry.a);
		bucket.wattsSum += telemetry.w;
		bucket.wattsMax = Math.max(bucket.wattsMax, telemetry.w);
		if (telemetry.hz != null) {
			bucket.hzSum += telemetry.hz;
			bucket.hzCount++;
			bucket.hzMin = bucket.hzMin === null ? telemetry.hz : Math.min(bucket.hzMin, telemetry.hz);
		}
		if (telemetry.pf != null) {
			bucket.pfSum += telemetry.pf;
			bucket.pfCount++;
			bucket.pfMin = bucket.pfMin === null ? telemetry.pf : Math.min(bucket.pfMin, telemetry.pf);
		}
		bucket.kwh = telemetry.kwh ?? bucket.kwh;
		bucket.alarm = bucket.alarm || Boolean(telemetry.alarm);
	} else {
		powerBuckets.set(key, {
			monitorId: telemetry.id,
			second,
			count: 1,
			voltsSum: telemetry.v,
			voltsMin: telemetry.v,
			voltsMax: telemetry.v,
			ampsSum: telemetry.a,
			ampsMax: telemetry.a,
			wattsSum: telemetry.w,
			wattsMax: telemetry.w,
			hzSum: telemetry.hz ?? 0,
			hzMin: telemetry.hz ?? null,
			hzCount: telemetry.hz == null ? 0 : 1,
			pfSum: telemetry.pf ?? 0,
			pfMin: telemetry.pf ?? null,
			pfCount: telemetry.pf == null ? 0 : 1,
			kwh: telemetry.kwh ?? null,
			alarm: Boolean(telemetry.alarm),
		});
	}
}

/** Push a reading into every open FTA Buddy tab for the live charts. */
function broadcastTelemetry(telemetry: PowerTelemetry) {
	chrome.tabs.query({ url: APP_TAB_PATTERNS }, (tabs) => {
		for (const tab of tabs) {
			if (tab.id === undefined) continue;
			chrome.tabs.sendMessage(tab.id, { type: "powerTelemetry", data: telemetry }).catch(() => {});
		}
	});
}

/**
 * Post completed buckets to the server. Only buckets older than the current
 * second are sent, so a second is never split across two posts.
 */
async function flushPowerSamples() {
	if (!eventToken) return;

	const currentSecond = Math.floor(Date.now() / 1000);
	const ready = [...powerBuckets.entries()].filter(([, b]) => b.second < currentSecond);
	for (const [key] of ready) powerBuckets.delete(key);

	// Liveness goes up on every flush, with or without samples: a monitor that
	// has gone dark cannot report its own silence, and the server has no way to
	// tell "nothing to send" from "the field lost power" without being told.
	const status = (powerManager?.list() ?? []).map((m) => ({
		monitorId: m.id,
		connected: m.connected,
		meterOk: powerMeterOk.get(m.id) ?? false,
	}));

	if (ready.length === 0 && status.length === 0) return;

	const samples = ready
		.map(([, b]) => ({
			monitorId: b.monitorId,
			time: new Date(b.second * 1000),
			volts: b.voltsSum / b.count,
			voltsMin: b.voltsMin,
			voltsMax: b.voltsMax,
			amps: b.ampsSum / b.count,
			ampsMax: b.ampsMax,
			watts: b.wattsSum / b.count,
			wattsMax: b.wattsMax,
			hz: b.hzCount > 0 ? b.hzSum / b.hzCount : null,
			hzMin: b.hzMin,
			pf: b.pfCount > 0 ? b.pfSum / b.pfCount : null,
			pfMin: b.pfMin,
			kwh: b.kwh,
			alarm: b.alarm,
		}))
		.sort((a, b) => a.time.getTime() - b.time.getTime());

	try {
		await trpc.power.postSamples.mutate({ extensionId: id, samples, status });
	} catch (err) {
		// Dropped on failure rather than retried: this is a continuous stream, and
		// a backlog replayed later would land out of order behind fresher rows.
		console.warn("Power sample post failed:", err);
	}
}

async function startPowerMonitor() {
	if (!powerMonitorEnabled) return;

	// The sweep needs permission for arbitrary http origins, granted from the
	// popup. Without it every probe throws and the sweep silently finds nothing.
	const granted = await chrome.permissions.contains({ origins: ["http://*/*"] }).catch(() => false);
	if (!granted) {
		console.warn("Power monitoring is on but http://*/* is not granted - open the popup and re-toggle it");
		return;
	}

	powerManager = new PowerMonitorManager((telemetry) => {
		broadcastTelemetry(telemetry);
		bucketTelemetry(telemetry);
	});
	await powerManager.start();
	powerFlushTimer = setInterval(() => flushPowerSamples().catch(console.warn), POWER_FLUSH_INTERVAL_MS);
	console.log(`Power monitoring started on ${SUBNET_PREFIX}.0/24 - ${powerManager.list().length} monitor(s) found`);
}

function stopPowerMonitor() {
	if (powerFlushTimer) clearInterval(powerFlushTimer);
	powerFlushTimer = null;
	powerBuckets.clear();
	powerMeterOk.clear();
	powerManager?.stop();
	powerManager = null;
}

// #endregion

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
	// Cheesy Arena field monitor messages relayed from the `cheesy-inject` content
	// script (it owns the page-origin websocket; see cheesy-inject.ts).
	if (msg?.type === "cheesyWs") {
		if (sourceMode === "cheesy" && source instanceof CheesyArenaSource) {
			if (msg.event === "open") source.setConnected(true);
			else if (msg.event === "close") source.setConnected(false);
			else if (msg.event === "message" && msg.data) {
				source.ingest(msg.data);
				// Pipe the freshly mapped frame back to the Cheesy Arena page so the
				// injected overlay can reskin from live data (there is no FMS Angular
				// DOM to scrape there). Only frame-bearing messages change the frame.
				const kind = msg.data.type;
				const tabId = _sender.tab?.id;
				if (tabId !== undefined && (kind === "arenaStatus" || kind === "matchLoad")) {
					chrome.tabs.sendMessage(tabId, { type: "cheesyFrame", frame: source.frame }).catch(() => {});
				}
			}
		}
		return false;
	}

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

	if (msg?.type === "getPowerStatus") {
		sendResponse({
			enabled: powerMonitorEnabled,
			subnet: SUBNET_PREFIX,
			running: powerManager?.running ?? false,
			monitors: powerManager?.list() ?? [],
			connected: powerManager?.connectedCount ?? 0,
		});
		return false;
	}

	if (msg?.type === "rescanPowerMonitors") {
		(async () => {
			const found = (await powerManager?.discover()) ?? [];
			sendResponse({ found: found.length, monitors: powerManager?.list() ?? [] });
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
	// During playoffs the qual-only `days` breakdown is empty, but `matches` still
	// carries the playoff schedule (needed for the scorekeeper T613 deadline), so post
	// whenever there is anything to send.
	if (schedule.days.length === 0 && schedule.matches.length === 0) return;
	await trpc.cycles.postScheduleDetails.mutate({ eventToken, ...schedule, extensionId: id });
	// Alliances change on the same cadence as the playoff schedule (selection done,
	// backup coupons), so sync them here too - the scorekeeper alliance table comes
	// straight from FMS, no manual entry.
	await sendAlliances();
}

/** Push the current FMS playoff alliance rosters to the scorekeeper view. No-op outside playoffs. */
async function sendAlliances() {
	if (!source || !eventToken) return;
	try {
		const alliances = await source.getAlliances();
		if (alliances.length === 0) return;
		await trpc.scorekeeper.alliances.syncFromFMS.mutate({ alliances });
	} catch (err) {
		console.warn("[scorekeeper] alliance sync failed:", err);
	}
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
