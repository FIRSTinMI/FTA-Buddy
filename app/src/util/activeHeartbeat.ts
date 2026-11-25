import { trpc } from "../main";

/**
 * Active-user heartbeat for the admin dashboard chart. While the tab is
 * visible it tells the server every 4 minutes (and on load / when the tab comes
 * back) that this app is open, and whether it is showing the field monitor.
 * The server takes the user from the auth token; the random device id below
 * only stands in when nobody is signed in.
 */

const INTERVAL_MS = 4 * 60_000;
const DEVICE_ID_KEY = "ftabuddy-device-id";
/** Routes that render the field monitor (Monitor.svelte), see router.ts. */
const FIELD_MONITOR_PATHS = new Set(["/", "/monitor"]);

let timer: ReturnType<typeof setInterval> | null = null;
let started = false;

function deviceId(): string {
	let id = localStorage.getItem(DEVICE_ID_KEY);
	if (!id || id.length < 8 || id.length > 64) {
		id = crypto.randomUUID();
		localStorage.setItem(DEVICE_ID_KEY, id);
	}
	return id;
}

function send() {
	const fieldMonitor = FIELD_MONITOR_PATHS.has(window.location.pathname.replace(/\/+$/, "") || "/");
	trpc.telemetry.activeHeartbeat
		.mutate({ deviceId: deviceId(), fieldMonitor })
		.catch((err) => console.warn("[activeHeartbeat] failed:", err));
}

function startTimer() {
	if (timer) return;
	send();
	timer = setInterval(send, INTERVAL_MS);
}

function stopTimer() {
	if (timer) clearInterval(timer);
	timer = null;
}

export function startActiveHeartbeat() {
	if (started || typeof window === "undefined") return;
	started = true;
	if (document.visibilityState === "visible") startTimer();
	document.addEventListener("visibilitychange", () => {
		if (document.visibilityState === "visible") startTimer();
		else stopTimer();
	});
}
