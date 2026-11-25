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
import type {
	ExtensionConfig,
	ExtensionConfigDelivery,
	ExtensionHeartbeatStats,
	ExtensionRealtimeFeed,
	PowerTelemetry,
} from "../../shared/types";
import {
	deriveExtensionState,
	expiryRenewed,
	type ExtensionStorageUpdates,
	isExpired,
	remoteConfigToStorageUpdates,
	remoteSwitchToStorageUpdates,
	shouldDisableForExpiry,
} from "../../shared/extension-state";
import { DEFAULT_SUBNET_PREFIX, isValidSubnetPrefix, monitorOrigins, PowerMonitorManager } from "./power-monitor";

const ALARM_TEAM_POLL = "teamPoll";
const ALARM_MATCH_IMPORT = "matchImport";
const ALARM_SCHEDULE_POLL = "schedulePoll";
const ALARM_HEARTBEAT = "heartbeat";

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
/**
 * Where FMS lives. 10.0.100.5 by FRC convention in every shipped build; webpack
 * substitutes it so a test build can point at fake-fms on localhost instead.
 */
export const FMS = __FMS_HOST__;
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
/**
 * An admin switched extensions off for this extension's event (heartbeat reply
 * or live push). Kept apart from `enabled` so the host's own setting comes back
 * untouched when the admin switches the event on again.
 */
export let remoteDisabled: boolean = false;

/** Enabled locally and not switched off by an admin: the only state that may touch the field network. */
function isActive(): boolean {
	return Boolean(enabled) && !remoteDisabled;
}
export let fieldMonitor: boolean = false;
export let useSignalR: boolean = true;
export let sourceMode: "fms" | "cheesy" = "fms";
export let cheesyPort: number = DEFAULT_CHEESY_PORT;
export let cloud: boolean;
export let useDev: boolean;
export let changed: number;
/**
 * Newest `changed` this worker wrote for a remote enable or switch-on. Set
 * before the storage write lands, so a popup expiry check that read the old
 * value in between does not clear Enable over the top of it.
 */
let renewedChanged = 0;

export let powerMonitorEnabled: boolean = false;
/** First three octets of the /24 the monitors live on. The event network by default. */
export let powerSubnet: string = DEFAULT_SUBNET_PREFIX;

export let fmsApi: boolean = false;
export let fmsApiEnabled: boolean = true;
/** Fill unset tower selections at commit, test and practice only. Off by default. */
export let scoreAutofill: boolean = false;

// #region Runtime stats (reported in the heartbeat)

/** When this service worker instance started. */
const workerStartedAt = Date.now();
/** Which live feed start() actually opened; "off" until it does and after stop(). */
let realtimeFeed: ExtensionRealtimeFeed = "off";
/** Frames this worker posted to the server (SignalR / Cheesy Arena feed only). */
let framesSent = 0;
let lastFrameAt: number | undefined;
/** Result and time of the last field-system ping that actually ran. */
let fmsReachable: boolean | undefined;
let fmsPingAt: number | undefined;
let lastError: string | undefined;
let lastErrorAt: number | undefined;

/** Remember the most recent error the worker caught, for the admin dashboard. */
function noteError(context: string, err: unknown) {
	const text = err instanceof Error ? err.message : String(err);
	lastError = `${context}: ${text}`.slice(0, 300);
	lastErrorAt = Date.now();
}

// #endregion

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
	// Drop the stopped source so nothing (popup ping, page getEventCode) can
	// reach the field system through it while the extension is disabled.
	source = null;
	realtimeFeed = "off";
}

/** Apply settings, then send a heartbeat so the admin dashboard sees the new state at once. */
async function start() {
	try {
		await startInner();
	} finally {
		sendHeartbeat();
	}
}

async function startInner() {
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
				"remoteDisabled",
				"fieldMonitor",
				"useSignalR",
				"sourceMode",
				"cheesyPort",
				"id",
				"eventToken",
				"fmsApiEnabled",
				"scoreAutofill",
				"powerMonitor",
				"powerSubnet",
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
				remoteDisabled = item.remoteDisabled === true;
				fieldMonitor = Boolean(item.fieldMonitor);
				useSignalR = item.useSignalR !== false; // default true
				fmsApiEnabled = item.fmsApiEnabled !== false; // default true
				scoreAutofill = item.scoreAutofill === true; // default false
				sourceMode = item.sourceMode === "cheesy" ? "cheesy" : "fms"; // default fms
				cheesyPort = sanitizeCheesyPort(item.cheesyPort);
				eventToken = String(item.eventToken);
				powerMonitorEnabled = Boolean(item.powerMonitor);
				powerSubnet = isValidSubnetPrefix(String(item.powerSubnet ?? ""))
					? String(item.powerSubnet).trim()
					: DEFAULT_SUBNET_PREFIX;
				powerSubnet = isValidSubnetPrefix(String(item.powerSubnet ?? ""))
					? String(item.powerSubnet).trim()
					: DEFAULT_SUBNET_PREFIX;
				id = String(item.id) || crypto.randomUUID();
				if (id !== item.id) chrome.storage.local.set({ id });
				resolve(void 0);
			},
		);
	});

	// Point the server client at the configured server before any gate below, so
	// the heartbeat reaches the right server even while disabled. Storage read only.
	await updateValues();

	if (!isActive()) {
		console.log(remoteDisabled ? "Switched off for this event by an admin" : "Not enabled");
		return;
	}

	// Power monitoring sits under the master Enable toggle but ahead of the
	// field-data gates: it needs nothing from FMS or the field monitor. In
	// particular it runs BEFORE the four-day expiry below, which exists to stop
	// a stale extension posting field frames to an old event. That expiry only
	// clears when the popup writes settings, so toggling power monitoring alone
	// left it looking expired and silently started nothing.
	await updateValues();
	await startPowerMonitor();

	if (isExpired(changed, Date.now())) {
		console.log("Expired (power monitoring unaffected)");
		return;
	}

	// (Re)build the field data source for the selected mode and wire its events.
	source = buildSource();
	// Must be set before start(): the source only opens the gameSpecificHub
	// connection the autofill writes to when the feature is on.
	source.setScoreAutofill(scoreAutofill);
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
		realtimeFeed = "cheesy";
		await source.start();
	} else if (useSignalR) {
		console.log("Starting SignalR");
		realtimeFeed = "signalr";
		await source.start();
	} else {
		console.log("SignalR disabled, using scraping mode");
		realtimeFeed = "scraping";
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
			noteError("FMS event password", err);
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
function currentExtensionConfig(): ExtensionConfig {
	return {
		enabled: Boolean(enabled),
		fieldMonitor,
		useSignalR,
		fmsApiEnabled,
		scoreAutofill,
		sourceMode,
		cheesyPort,
	};
}

/**
 * Apply a config that came from the server (live subscription or heartbeat
 * reply). Written to chrome.storage.local, whose change listener restarts the
 * extension so the new settings take effect.
 */
function applyRemoteConfig(config: ExtensionConfigDelivery) {
	// An admin switched the event off: set the separate remote flag and leave the
	// host's own settings (Enable included) as they are.
	if (config.remoteDisabled === true) {
		if (!remoteDisabled) chrome.storage.local.set({ remoteDisabled: true });
		return;
	}
	writeRemoteUpdates(remoteConfigToStorageUpdates(config, sanitizeCheesyPort, Date.now()));
}

/** Write remote updates, remembering any `changed` so a popup expiry check cannot undo them. */
function writeRemoteUpdates(updates: ExtensionStorageUpdates) {
	if (Object.keys(updates).length === 0) return;
	if (typeof updates.changed === "number") renewedChanged = Math.max(renewedChanged, updates.changed);
	chrome.storage.local.set(updates);
}

/** Report the current config + version to the server so any device can see it. */
function reportExtensionState() {
	if (!eventToken) return;
	trpc.extension.reportState
		.mutate({ extensionId: id, version: manifestData.version, fmsApi, config: currentExtensionConfig() })
		.catch((err) => {
			console.warn("Extension reportState failed:", err);
			noteError("reportState", err);
		});
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
			onData: (config) => applyRemoteConfig(config),
			onError: (err) => {
				console.warn("Extension configSubscription error:", err);
				noteError("configSubscription", err);
			},
		},
	);
}

// #endregion

// #region Heartbeat

/**
 * Once a minute, whatever the state (disabled, expired, no event), tell the
 * server this extension exists and how it is set up, and apply any config an
 * admin queued for it. This is the only request a disabled extension makes:
 * it goes to the FTA Buddy server, never to FMS, Cheesy Arena or the field
 * network, and reads only in-memory state.
 */
function sendHeartbeat() {
	// start() has not loaded settings yet; it sends one itself when it finishes.
	if (!id) return;

	const now = Date.now();
	const stats: ExtensionHeartbeatStats = {
		sourceMode,
		fmsApi,
		realtimeFeed,
		workerStartedAt,
	};
	if (fmsReachable !== undefined && fmsPingAt !== undefined) {
		stats.fmsReachable = fmsReachable;
		stats.fmsPingAt = fmsPingAt;
	}
	if ((realtimeFeed === "signalr" || realtimeFeed === "cheesy") && source) {
		stats.realtimeStatus = source.getConnectionStatus().slice(0, 40);
	}
	// In scraping mode the FMS page posts frames itself, so this worker's count would be a false zero.
	if (realtimeFeed !== "scraping") {
		stats.framesSent = framesSent;
		if (lastFrameAt !== undefined) stats.lastFrameAt = lastFrameAt;
	}
	if (lastError !== undefined && lastErrorAt !== undefined) {
		stats.lastError = lastError;
		stats.lastErrorAt = lastErrorAt;
	}
	if (Number.isFinite(changed) && changed > 0) stats.changed = changed;

	const state = deriveExtensionState({ enabled: Boolean(enabled), remoteDisabled, changed, eventToken, now });
	trpc.extension.heartbeat
		.mutate({
			extensionId: id.slice(0, 64),
			version: manifestData.version,
			state,
			eventCode: eventCode ? eventCode.slice(0, 64) : undefined,
			config: currentExtensionConfig(),
			stats,
		})
		.then((reply) => {
			// Older servers send no `remoteDisabled`; only a real boolean changes the flag.
			if (typeof reply.remoteDisabled === "boolean" && reply.remoteDisabled !== remoteDisabled) {
				console.log(reply.remoteDisabled ? "Admin switched this event off" : "Admin switched this event on");
				writeRemoteUpdates(remoteSwitchToStorageUpdates(reply.remoteDisabled, Boolean(enabled), Date.now()));
			}
			if (reply.config) {
				console.log("Applying config queued by an admin:", reply.config);
				applyRemoteConfig(reply.config);
			}
		})
		.catch((err) => {
			// Older servers have no heartbeat route; nothing to do but try next minute.
			console.debug("Extension heartbeat failed:", err);
		});
}

/** Create the heartbeat alarm if it is missing; recreating it would reset its period on every worker wake. */
function ensureHeartbeatAlarm() {
	chrome.alarms.get(ALARM_HEARTBEAT, (alarm) => {
		if (!alarm) chrome.alarms.create(ALARM_HEARTBEAT, { delayInMinutes: 1, periodInMinutes: 1 });
	});
}

chrome.runtime.onInstalled.addListener(() => ensureHeartbeatAlarm());
ensureHeartbeatAlarm();

// #region Field power monitors

/**
 * ESP32-P4 + PZEM-004T monitors on the event network. The extension is the only
 * piece that can reach them (the app is HTTPS, they are plain HTTP on a private
 * address), so it sweeps for them, holds their SSE streams, pushes live samples
 * into any open FTA Buddy tab, and posts one-second rollups to the server.
 */
let powerManager: PowerMonitorManager | null = null;

/**
 * Content scripts that want telemetry, one per open FTA Buddy tab.
 *
 * They connect to us rather than being found with chrome.tabs.query: filtering
 * tabs by URL needs host permission for those URLs, which this extension does
 * not have for ftabuddy.com, so that query quietly returned nothing and the
 * page only ever saw the server's five-second batches.
 */
const powerPorts = new Set<chrome.runtime.Port>();

chrome.runtime.onConnect.addListener((port) => {
	if (port.name !== "powerTelemetry") return;
	powerPorts.add(port);
	port.onDisconnect.addListener(() => powerPorts.delete(port));
});

/** One reading, shaped for the server. */
interface PowerSample {
	monitorId: string;
	time: Date;
	volts: number;
	voltsMin: number;
	voltsMax: number;
	amps: number;
	ampsMax: number;
	watts: number;
	wattsMax: number;
	hz: number | null;
	hzMin: number | null;
	pf: number | null;
	pfMin: number | null;
	kwh: number | null;
	alarm: boolean;
}

/**
 * Readings waiting to go up. Every sample the board sends is kept: the meter
 * runs at 2 Hz and averaging threw away exactly the transients this exists to
 * catch. Posted in batches for the network's sake, not thinned.
 */
const powerPending: PowerSample[] = [];
/** Ceiling so a long outage cannot grow this without bound. */
const POWER_MAX_PENDING = 600;
/**
 * Whether each monitor's meter last answered. Tracked separately from the
 * buckets because a failed read is dropped before it ever reaches one, and a
 * meter that has stopped answering is exactly what the alerts care about.
 */
const powerMeterOk = new Map<string, boolean>();
let powerFlushTimer: ReturnType<typeof setInterval> | null = null;
const POWER_FLUSH_INTERVAL_MS = 5_000;

/** Queue one reading. A failed read is recorded as meter state, not stored. */
function recordTelemetry(telemetry: PowerTelemetry) {
	powerMeterOk.set(telemetry.id, telemetry.ok);
	if (!telemetry.ok || telemetry.v === null || telemetry.a === null || telemetry.w === null) return;

	// min/max columns predate storing raw samples; for a single reading they are
	// the reading, and the history query aggregates them the same either way.
	powerPending.push({
		monitorId: telemetry.id,
		time: new Date(telemetry.ts),
		volts: telemetry.v,
		voltsMin: telemetry.v,
		voltsMax: telemetry.v,
		amps: telemetry.a,
		ampsMax: telemetry.a,
		watts: telemetry.w,
		wattsMax: telemetry.w,
		hz: telemetry.hz ?? null,
		hzMin: telemetry.hz ?? null,
		pf: telemetry.pf ?? null,
		pfMin: telemetry.pf ?? null,
		kwh: telemetry.kwh ?? null,
		alarm: Boolean(telemetry.alarm),
	});
	if (powerPending.length > POWER_MAX_PENDING) powerPending.splice(0, powerPending.length - POWER_MAX_PENDING);
}

/** Push a reading into every open FTA Buddy tab for the live charts. */
function broadcastTelemetry(telemetry: PowerTelemetry) {
	for (const port of powerPorts) {
		try {
			port.postMessage({ type: "powerTelemetry", data: telemetry });
		} catch {
			// The tab went away between the disconnect event and now.
			powerPorts.delete(port);
		}
	}
}

/** Post everything queued since the last flush, plus per-monitor liveness. */
async function flushPowerSamples() {
	if (!eventToken) return;

	const samples = powerPending.splice(0, powerPending.length);

	// Liveness goes up on every flush, with or without samples: a monitor that
	// has gone dark cannot report its own silence, and the server has no way to
	// tell "nothing to send" from "the field lost power" without being told.
	const status = (powerManager?.list() ?? []).map((m) => ({
		monitorId: m.id,
		connected: m.connected,
		meterOk: powerMeterOk.get(m.id) ?? false,
	}));

	if (samples.length === 0 && status.length === 0) return;

	try {
		await trpc.power.postSamples.mutate({ extensionId: id, samples, status });
	} catch (err) {
		noteError("power samples", err);
		// Dropped on failure rather than retried: this is a continuous stream, and
		// a backlog replayed later would land out of order behind fresher rows.
		console.warn("Power sample post failed:", err);
	}
}

async function startPowerMonitor() {
	// The monitors are on the field network: nothing goes there while disabled.
	if (!isActive() || !powerMonitorEnabled || powerManager) return;

	// The sweep needs permission for arbitrary http origins, granted from the
	// popup. Without it every probe throws and the sweep silently finds nothing.
	const granted = await chrome.permissions.contains({ origins: monitorOrigins() }).catch(() => false);
	if (!granted) {
		console.warn(
			`Power monitoring is on but the ${powerSubnet}.0/24 host permission is not granted - open the popup and re-toggle it`,
		);
		return;
	}

	powerManager = new PowerMonitorManager(
		(telemetry) => {
			broadcastTelemetry(telemetry);
			recordTelemetry(telemetry);
		},
		() => powerSubnet,
	);
	await powerManager.start();
	powerFlushTimer = setInterval(() => flushPowerSamples().catch(console.warn), POWER_FLUSH_INTERVAL_MS);
	console.log(`Power monitoring started on ${powerSubnet}.0/24 - ${powerManager.list().length} monitor(s) found`);
}

function stopPowerMonitor() {
	if (powerFlushTimer) clearInterval(powerFlushTimer);
	powerFlushTimer = null;
	powerPending.length = 0;
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
		// Disabled: answer without asking the field system.
		if (!isActive()) {
			sendResponse({ source: "ext", version: manifestData.version, type: "eventCode", code: "", teams: [], id });
			return false;
		}
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
		// Same as a popup save: enabling restarts the four-day expiry.
		chrome.storage.local.set({ enabled, changed: Date.now() });
		return false;
	} else if (msg?.type === "expireIfStale") {
		// The popup found the settings expired. Decide here, where remote enables
		// are written, so a remote enable that landed after the popup read storage wins.
		chrome.storage.local.get(["changed", "enabled", "remoteDisabled"], (item) => {
			const expired = shouldDisableForExpiry({
				enabled: item.enabled === true,
				remoteDisabled: item.remoteDisabled === true,
				changed: Math.max(Number(item.changed) || 0, renewedChanged) || undefined,
				now: Date.now(),
			});
			if (expired) chrome.storage.local.set({ enabled: false });
			sendResponse({ expired });
		});
		return true;
	}

	if (msg?.type === "getState") {
		sendResponse({
			cloud,
			useDev,
			url,
			eventCode,
			eventToken,
			enabled,
			remoteDisabled,
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
		(async () => {
			const permission = await chrome.permissions.contains({ origins: monitorOrigins() }).catch(() => false);
			sendResponse({
				enabled: powerMonitorEnabled,
				subnet: powerSubnet,
				permission,
				running: powerManager?.running ?? false,
				monitors: powerManager?.list() ?? [],
				connected: powerManager?.connectedCount ?? 0,
			});
		})();
		return true;
	}

	if (msg?.type === "rescanPowerMonitors") {
		(async () => {
			if (!powerManager && powerMonitorEnabled) await startPowerMonitor();
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
	// Disabled means no request to the field system at all, including this probe.
	if (!isActive()) {
		fmsApi = false;
		return false;
	}
	fmsPingAt = Date.now();
	try {
		// Use the active source when available; fall back to a direct FMS probe
		// (e.g. for popup pings before the source has been built).
		if (source) {
			fmsApi = await source.ping();
		} else {
			const controller = new AbortController();
			setTimeout(() => controller.abort(), 500);
			const res = await fetch(`http://${FMS}/`, { signal: controller.signal });
			fmsApi = !!res.ok;
		}
	} catch {
		fmsApi = false;
	}
	fmsReachable = fmsApi;
	return fmsApi;
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
	try {
		await trpc.field.post.mutate(
			eventToken ? { eventToken, ...data, extensionId: id } : { eventCode, ...data, extensionId: id },
		);
		framesSent++;
		lastFrameAt = Date.now();
	} catch (err) {
		console.warn("Frame post failed:", err);
		noteError("frame post", err);
	}
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
		noteError("alliance sync", err);
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
		noteError("team polling", err);
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
	if (!isActive() || !eventToken || !source) return;
	if (isMatchRunning()) return; // Skip iteration if a match is running
	try {
		await source.uploadAllUnimportedMatchLogs();
	} catch (err) {
		console.warn("Match auto-import error:", err);
		noteError("match import", err);
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

/**
 * Start as soon as the host permission is granted, without waiting for another
 * settings write. The popup is destroyed when Chrome opens a permission prompt,
 * so it cannot reliably tell us itself, and the grant can also come from the
 * extensions page rather than from our own toggle.
 */
chrome.permissions.onAdded.addListener(() => {
	if (!powerMonitorEnabled || powerManager) return;
	console.log("Host permission granted, starting power monitoring");
	startPowerMonitor().catch(console.warn);
});

/** Permission taken away in chrome://extensions: stop rather than spin on failed probes. */
chrome.permissions.onRemoved.addListener(() => {
	if (!powerManager) return;
	console.log("Host permission removed, stopping power monitoring");
	stopPowerMonitor();
});

chrome.alarms.onAlarm.addListener((alarm) => {
	if (alarm.name === ALARM_TEAM_POLL) pollTeams().catch(console.warn);
	else if (alarm.name === ALARM_MATCH_IMPORT) runMatchAutoImport().catch(console.warn);
	else if (alarm.name === ALARM_SCHEDULE_POLL)
		sendScheduleDetails().catch((err) => {
			console.warn(err);
			noteError("schedule", err);
		});
	else if (alarm.name === ALARM_HEARTBEAT) sendHeartbeat();
});

let storageDebounce: ReturnType<typeof setTimeout> | null = null;
chrome.storage.local.onChanged.addListener((changes) => {
	// Power monitoring is self-contained, so its settings are applied in place.
	// Everything else falls through to a full restart, which tears down SignalR,
	// note sync and polling - far too much for one toggle or one text box.
	const touched = Object.keys(changes).filter((key) => key !== "changed");
	const powerOnly = touched.length > 0 && touched.every((key) => key === "powerMonitor" || key === "powerSubnet");
	// A `changed` that lifts the expiry restarts too, even with no other key changed.
	const renewed =
		changes.changed !== undefined && expiryRenewed(changes.changed.oldValue, changes.changed.newValue, Date.now());
	if (powerOnly) {
		if (changes.powerSubnet) {
			const next = String(changes.powerSubnet.newValue ?? "");
			powerSubnet = isValidSubnetPrefix(next) ? next.trim() : DEFAULT_SUBNET_PREFIX;
			console.log(`Power monitor subnet is now ${powerSubnet}.0/24`);
		}

		if (changes.powerMonitor) {
			powerMonitorEnabled = Boolean(changes.powerMonitor.newValue);
			if (powerMonitorEnabled) startPowerMonitor().catch(console.warn);
			else stopPowerMonitor();
		} else {
			// Subnet alone: keep streaming, just look again on the new network.
			powerManager?.discover().catch(console.warn);
		}
		return;
	}

	for (const key of Object.keys(changes)) {
		if (key === "changed" && !renewed) continue;
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
