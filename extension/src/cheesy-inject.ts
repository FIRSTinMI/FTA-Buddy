// Content script for Cheesy Arena's field monitor display page.
//
// Cheesy Arena's `/displays/field_monitor/websocket` feed enforces
// gorilla/websocket's default same-origin check, which rejects a socket opened
// from the extension service worker (its Origin is `chrome-extension://<id>`).
// Chrome's declarativeNetRequest cannot strip the Origin header on a websocket
// handshake (verified empirically), so the ONLY way to reach a stock Cheesy
// Arena is to open the socket from a page whose origin already IS the Cheesy
// Arena host. This content script runs on the field monitor page and does exactly
// that: it opens the feed from the page context (Origin: http://<ca-host>), which
// passes the same-origin check, and relays every message to the background
// CheesyArenaSource over chrome.runtime. It mirrors the FMS field-monitor
// injector, including injecting the FTA Buddy overlay reskin onto the page.

const CHEESY_RECONNECT_MS = 3000;

interface CheesyInjectConfig {
	enabled: boolean;
	sourceMode: string;
	changed: number;
	id: string;
	url: string;
	cloud: boolean;
	event: string;
	useDev: boolean;
	eventToken: string;
}

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let overlayInjected = false;
let active = false;

/** Relay a message to the background service worker, ignoring a sleeping/absent SW. */
function relay(message: unknown): void {
	try {
		const p = chrome.runtime.sendMessage(message);
		// MV3 returns a promise; swallow "no receiver" rejections.
		if (p && typeof (p as Promise<unknown>).catch === "function") (p as Promise<unknown>).catch(() => {});
	} catch {
		/* extension context invalidated (e.g. reloaded) */
	}
}

/** Inject the FTA Buddy overlay reskin, same as the FMS field-monitor injector. */
function injectOverlay(cfg: CheesyInjectConfig): void {
	if (overlayInjected || document.getElementById("fta-buddy-overlay")) return;
	overlayInjected = true;
	const manifestData = chrome.runtime.getManifest();
	const s = document.createElement("script");
	s.id = "fta-buddy-overlay";
	s.dataset.host = String(cfg.url);
	s.dataset.cloud = String(cfg.cloud);
	s.dataset.event = String(cfg.event);
	s.dataset.version = String(manifestData.version);
	s.dataset.extensionId = String(cfg.id);
	s.dataset.useDev = String(cfg.useDev);
	s.dataset.eventToken = String(cfg.eventToken);
	s.dataset.logoUrl = chrome.runtime.getURL("img/logo.png");
	s.src = chrome.runtime.getURL("injected-overlay.js");
	(document.body || document.documentElement).appendChild(s);
}

function connect(cfg: CheesyInjectConfig): void {
	if (!active) return;
	// Same-origin as this page (the Cheesy Arena host), which is the whole point.
	const proto = location.protocol === "https:" ? "wss:" : "ws:";
	const displayId = encodeURIComponent(`${cfg.id || "fta-buddy"}-fb`);
	const url = `${proto}//${location.host}/displays/field_monitor/websocket?displayId=${displayId}`;
	console.log(`[FTA Buddy] Opening Cheesy Arena field monitor feed from page context (${url})`);
	let sock: WebSocket;
	try {
		sock = new WebSocket(url);
	} catch (err) {
		console.warn("[FTA Buddy] Cheesy Arena websocket construction failed:", err);
		scheduleReconnect(cfg);
		return;
	}
	ws = sock;
	sock.onopen = () => {
		console.log("[FTA Buddy] Cheesy Arena field monitor connected");
		relay({ type: "cheesyWs", event: "open" });
	};
	sock.onmessage = (ev) => {
		try {
			relay({ type: "cheesyWs", event: "message", data: JSON.parse(ev.data as string) });
		} catch {
			/* ignore malformed frame */
		}
	};
	sock.onerror = () => {
		/* onclose handles reconnect */
	};
	sock.onclose = () => {
		ws = null;
		relay({ type: "cheesyWs", event: "close" });
		scheduleReconnect(cfg);
	};
}

function scheduleReconnect(cfg: CheesyInjectConfig): void {
	if (!active || reconnectTimer) return;
	reconnectTimer = setTimeout(() => {
		reconnectTimer = null;
		connect(cfg);
	}, CHEESY_RECONNECT_MS);
}

function teardown(): void {
	active = false;
	if (reconnectTimer) {
		clearTimeout(reconnectTimer);
		reconnectTimer = null;
	}
	if (ws) {
		ws.onclose = null;
		try {
			ws.close();
		} catch {
			/* already closing */
		}
		ws = null;
		relay({ type: "cheesyWs", event: "close" });
	}
}

/**
 * Decide whether we should be feeding this Cheesy Arena page based on the current
 * settings, and start/stop accordingly. Runs on load and on any settings change,
 * so flipping the extension into Cheesy mode activates an already-open CA page.
 */
function evaluate(): void {
	chrome.storage.local.get(
		["enabled", "sourceMode", "changed", "id", "url", "cloud", "event", "useDev", "eventToken"],
		(item) => {
			const cfg: CheesyInjectConfig = {
				enabled: Boolean(item.enabled),
				sourceMode: String(item.sourceMode ?? "fms"),
				changed: Number(item.changed),
				id: String(item.id ?? ""),
				url: String(item.url ?? ""),
				cloud: Boolean(item.cloud),
				event: String(item.event ?? ""),
				useDev: Boolean(item.useDev),
				eventToken: String(item.eventToken ?? ""),
			};
			const expired = cfg.changed ? cfg.changed + 1000 * 60 * 60 * 24 * 4 < Date.now() : false;
			const shouldRun = cfg.enabled && cfg.sourceMode === "cheesy" && !expired;
			if (shouldRun && !active) {
				active = true;
				injectOverlay(cfg);
				connect(cfg);
			} else if (!shouldRun && active) {
				teardown();
			}
		},
	);
}

evaluate();
chrome.storage.local.onChanged.addListener(() => evaluate());
