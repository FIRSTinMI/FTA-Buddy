/**
 * injected-overlay.ts — Extension visual overlay for FMS FieldMonitor.
 *
 * Injected into the FMS FieldMonitor page whenever the extension is enabled.
 * Shows a small toggle button (FTA Buddy logo) on the page.
 * When localStorage has 'ftabuddy=1', renders the full FTA Buddy overlay with:
 *   - Live Angular data (battery, ping, signal, DS state, etc.)
 *   - Server-backed emojis (warnings[]) and lastChange from polled history
 *   - Cycle time footer (C:/A: from server, T: locally tracked)
 *   - Exact ahead/behind from server (replaces FMS native value)
 *   - Schedule text (from server getCycleData)
 */

import { CSS } from "../../userscript/src/styles";
import { buildFrame, isAppReady } from "../../userscript/src/angular";
import { makeFrameHistory, updateHistory } from "../../userscript/src/history";
import { buildRoot, updateAll, makeFullscreenBtn, type RootElements } from "../../userscript/src/ui";
import { trpc, updateValues } from "./injected-trpc";
import {
	makeCycleTimeState,
	updateCycleTimeState,
	formatCycleMs,
	currentCycleElapsedMs,
	type CycleTimeState,
} from "./overlay-cycle";
import { updateScheduleText } from "../../app/src/util/schedule-detail-formatter";
import { cycleTimeToMS } from "../../shared/cycleTimeToMS";
import {
	DSState,
	FieldState,
	MatchState,
	MatchStateMap,
	RobotWarnings,
	type MonitorFrame,
	type PartialMonitorFrame,
	type PartialRobotInfo,
	type RobotInfo,
	type ScheduleDetails,
} from "../../shared/types";

// ── Config from injector ───────────────────────────────────────────────────

const scriptEl = document.getElementById("fta-buddy-overlay") as HTMLScriptElement | null;
const logoUrl = scriptEl?.dataset.logoUrl ?? "";
const urlVal = scriptEl?.dataset.host;
const cloudVal = scriptEl?.dataset.cloud;
const useDev = scriptEl?.dataset.useDev;
const eventCode = scriptEl?.dataset.event;
const eventToken = scriptEl?.dataset.eventToken;
const extensionId = scriptEl?.dataset.extensionId;
const version = scriptEl?.dataset.version ?? "0.0.0";

// localStorage is the reliable detection source — Angular strips unknown
// query params during router init before the injected script runs.
const STORAGE_KEY = "ftabuddy";
const FTA_MODE = localStorage.getItem(STORAGE_KEY) === "1";

// ── Toggle button ──────────────────────────────────────────────────────────

function makeToggleBtn(): HTMLButtonElement {
	const btn = document.createElement("button");
	btn.id = "fb-toggle-btn";
	btn.title = FTA_MODE ? "Switch to FMS native view" : "Switch to FTA Buddy view";

	if (FTA_MODE) {
		btn.classList.add("fta-active");
		btn.title = "Switch to FMS native view";
		btn.textContent = "← FMS";
	} else {
		btn.title = "Switch to FTA Buddy view";
		if (logoUrl) {
			const img = document.createElement("img");
			img.src = logoUrl;
			img.alt = "FTA Buddy";
			btn.appendChild(img);
		} else {
			btn.textContent = "FTA Buddy";
		}
	}

	btn.addEventListener("click", () => {
		if (FTA_MODE) {
			localStorage.removeItem(STORAGE_KEY);
		} else {
			localStorage.setItem(STORAGE_KEY, "1");
		}
		location.reload();
	});

	return btn;
}

// ── Footer DOM (inside the grid as a span row) ─────────────────────────────

interface FooterElements {
	cycleSpan: HTMLSpanElement;
	scheduleSpan: HTMLSpanElement;
	currentSpan: HTMLSpanElement;
}

function buildFooter(root: HTMLElement): FooterElements {
	const footer = document.createElement("div");
	footer.id = "fb-footer";

	const cycleSpan = document.createElement("span");
	cycleSpan.id = "fb-footer-cycle";
	const scheduleSpan = document.createElement("span");
	scheduleSpan.id = "fb-footer-schedule";
	const currentSpan = document.createElement("span");
	currentSpan.id = "fb-footer-current";

	footer.appendChild(cycleSpan);
	footer.appendChild(scheduleSpan);
	footer.appendChild(currentSpan);

	// Append inside the grid so footer sits right below the station rows
	const grid = root.querySelector(".fb-grid") as HTMLElement;
	grid.appendChild(footer);

	return { cycleSpan, scheduleSpan, currentSpan };
}

// ── Server cycle data ──────────────────────────────────────────────────────

interface ServerCycleData {
	lastCycleTime: string | null;
	averageCycleTime: number | null;
	bestCycleTime: string | null;
	prestartTime: Date | string | null;
	startTime: Date | string | null;
	exactAheadBehind: string | null;
	scheduleDetails: ScheduleDetails | null;
	match: number;
	level: string;
}

function updateFooter(
	footer: FooterElements,
	cycleState: CycleTimeState,
	serverCycleData: ServerCycleData | null,
	frame: PartialMonitorFrame,
): void {
	// T: from local cycle state, fall back to server prestartTime for immediate display
	let elapsed = currentCycleElapsedMs(cycleState);
	if (elapsed === null && serverCycleData?.prestartTime) {
		const matchMs = MatchStateMap[frame.field];
		if (matchMs === MatchState.PRESTART || matchMs === MatchState.RUNNING) {
			elapsed = Date.now() - new Date(serverCycleData.prestartTime).getTime();
		}
	}

	// C: last cycle — prefer server string, treat "unk" sentinel as no data
	const rawLast = serverCycleData?.lastCycleTime;
	const lastStr = (rawLast && rawLast !== "unk") ? rawLast : "—";

	// A: average — prefer server ms value
	const avgMs = serverCycleData?.averageCycleTime ?? null;
	const avgStr = avgMs !== null ? formatCycleMs(avgMs) : "—";

	// Green if last cycle is best
	const isBest =
		rawLast != null && rawLast !== "unk" &&
		serverCycleData?.bestCycleTime != null &&
		cycleTimeToMS(rawLast) <= cycleTimeToMS(serverCycleData.bestCycleTime);

	footer.cycleSpan.textContent = `C: ${lastStr} (A: ${avgStr})`;
	footer.cycleSpan.className = isBest ? "fb-cycle-best" : "";

	// Schedule text (qualification only) — use server level/match as they persist across match states
	const scheduleDetails = serverCycleData?.scheduleDetails ?? null;
	const schedLevel = serverCycleData?.level ?? frame.level ?? "";
	const schedMatch = serverCycleData?.match ?? frame.match ?? 0;
	const schedText = scheduleDetails && avgMs !== null
		? updateScheduleText(schedMatch, scheduleDetails, schedLevel, avgMs)
		: "";
	footer.scheduleSpan.textContent = schedText;

	// T: current elapsed cycle time with redness
	if (elapsed !== null) {
		const elapsedStr = formatCycleMs(elapsed);
		footer.currentSpan.textContent = `T: ${elapsedStr}`;

		if (avgMs !== null) {
			const redness = Math.min(1, Math.max(0, (elapsed - avgMs) / 120_000));
			const r = Math.round(75 * redness + 180);
			const g = Math.round(180 * (1 - redness));
			const b = Math.round(180 * (1 - redness));
			footer.currentSpan.style.color = `rgb(${r},${g},${b})`;
		} else {
			footer.currentSpan.style.color = "";
		}
	} else {
		footer.currentSpan.textContent = "";
		footer.currentSpan.style.color = "";
	}
}

// ── Emoji / warning overlay ────────────────────────────────────────────────

const STATION_KEYS = ["blue1", "blue2", "blue3", "red1", "red2", "red3"] as const;
type StationKey = (typeof STATION_KEYS)[number];

function warningsToEmoji(
	robot: PartialRobotInfo,
	serverRobot: RobotInfo | null,
	fieldState: FieldState,
): string {
	const emojis: string[] = [];

	// 👀 waiting — only shown during PRESTART states, uses server lastChange
	// Not shown for bypassed or e-stopped robots
	const ds = robot.ds ?? DSState.RED;
	if (
		MatchStateMap[fieldState] === MatchState.PRESTART &&
		serverRobot?.lastChange &&
		ds !== DSState.BYPASS &&
		ds !== DSState.ESTOP
	) {
		const lc = new Date(serverRobot.lastChange).getTime();
		const now = Date.now();
		if ((ds === DSState.RED || ds === DSState.GREEN_X) && lc + 30_000 < now) {
			emojis.push("👀");
		} else if (!robot.radio && lc + 180_000 < now) {
			emojis.push("👀");
		} else if (!robot.rio && lc + 45_000 < now) {
			emojis.push("👀");
		} else if (!robot.code && lc + 30_000 < now) {
			emojis.push("👀");
		}
	}

	// Server-backed warnings
	if (serverRobot?.warnings) {
		for (const w of serverRobot.warnings) {
			switch (w) {
				case RobotWarnings.NOT_INSPECTED: emojis.push("🔍"); break;
				case RobotWarnings.RADIO_NOT_FLASHED: emojis.push("🛜"); break;
				case RobotWarnings.OPEN_NOTE:
				case RobotWarnings.RECENT_NOTE: emojis.push("📝"); break;
				case RobotWarnings.PREVIOUS_MATCH_EVENT: emojis.push("⚙️"); break;
			}
		}
	}

	// Deduplicate
	return [...new Set(emojis)].join("");
}

function applyServerWarnings(
	els: RootElements,
	frame: PartialMonitorFrame,
	serverFrame: MonitorFrame | null,
): void {
	for (const key of STATION_KEYS) {
		const robot = frame[key] as PartialRobotInfo;
		const serverRobot = serverFrame ? (serverFrame[key] as RobotInfo) : null;
		const warnP = els.stations[key].teamWarnP;
		warnP.textContent = warningsToEmoji(robot, serverRobot, frame.field);
	}
}

// ── Angular UI hiding ──────────────────────────────────────────────────────

function hideAngularUI(): void {
	for (const child of Array.from(document.body.children)) {
		const el = child as HTMLElement;
		if (el.id !== "fta-buddy-root" && el.id !== "fta-buddy-styles" && el.id !== "fb-controls") {
			el.style.display = "none";
		}
	}
}

// ── Wait for Angular ───────────────────────────────────────────────────────

function waitForApp(callback: () => void, attempts = 0): void {
	if (isAppReady()) {
		callback();
	} else if (attempts < 60) {
		setTimeout(() => waitForApp(callback, attempts + 1), 500);
	} else {
		console.warn("[FTA Buddy Overlay] FieldMonitor did not load after 30s");
	}
}

// ── Server data polling ────────────────────────────────────────────────────

let serverFrame: MonitorFrame | null = null;
let serverCycleData: ServerCycleData | null = null;

async function pollServerFrame(): Promise<void> {
	try {
		const history = await trpc.field.history.query();
		if (history && history.length > 0) {
			serverFrame = history[history.length - 1] as MonitorFrame;
		}
	} catch {
		// Server not reachable — silently ignore, use local data only
	}
}

async function pollCycleData(): Promise<void> {
	if (!eventCode) return;
	try {
		const data = await trpc.cycles.getCycleData.query({ eventCode });
		if (data) {
			serverCycleData = {
				lastCycleTime: data.lastCycleTime ?? null,
				averageCycleTime: data.averageCycleTime ?? null,
				bestCycleTime: data.bestCycleTime ?? null,
				prestartTime: data.prestartTime ?? null,
				startTime: data.startTime ?? null,
				exactAheadBehind: (data as any).exactAheadBehind ?? null,
				scheduleDetails: (data.scheduleDetails as ScheduleDetails) ?? null,
				match: data.match ?? 0,
				level: data.level ?? "",
			};
		}
	} catch {
		// Server not reachable — silently ignore
	}
}

// ── Boot ───────────────────────────────────────────────────────────────────

function injectStyles(): void {
	if (document.getElementById("fta-buddy-styles")) return;
	const style = document.createElement("style");
	style.id = "fta-buddy-styles";
	style.textContent = CSS;
	document.head.appendChild(style);
}

function boot(): void {
	console.log("[FTA Buddy Overlay] boot(), FTA_MODE:", FTA_MODE);

	injectStyles();
	const controls = document.createElement("div");
	controls.id = "fb-controls";
	controls.appendChild(makeToggleBtn());
	controls.appendChild(makeFullscreenBtn());
	document.body.appendChild(controls);

	if (!FTA_MODE) {
		console.log("[FTA Buddy Overlay] Toggle button injected, waiting for user action");
		return;
	}

	// Validate config before connecting to server
	if (!urlVal || !cloudVal || !eventCode || !eventToken) {
		console.warn("[FTA Buddy Overlay] Missing config — overlay will work but no server data");
	} else {
		updateValues({
			cloud: cloudVal === "true",
			useDev: useDev === "true",
			id: extensionId ?? "",
			event: eventCode,
			url: urlVal,
			eventToken: eventToken,
			extensionId,
		});

		// Initial server data fetch
		pollServerFrame();
		pollCycleData();

		// Poll every 2 seconds for warnings
		setInterval(pollServerFrame, 2_000);
		// Poll every 5 seconds for cycle data (C:, A:, exactAheadBehind, schedule)
		setInterval(pollCycleData, 5_000);
	}

	waitForApp(() => {
		console.log("[FTA Buddy Overlay] Building overlay...");

		const els = buildRoot();
		const footer = buildFooter(els.root);
		document.body.appendChild(els.root);
		hideAngularUI();

		const history = makeFrameHistory();
		const cycleState = makeCycleTimeState();

		function render(): void {
			const frame = buildFrame();
			if (!frame) return;

			updateCycleTimeState(frame.field, cycleState);
			updateHistory(history, frame);
			updateAll(els, frame, history);
			applyServerWarnings(els, frame, serverFrame);

			// Override header time with server's exact ahead/behind if available
			if (serverCycleData?.exactAheadBehind) {
				els.headerTimeSpan.textContent = serverCycleData.exactAheadBehind;
			}

			updateFooter(footer, cycleState, serverCycleData, frame);
		}

		// Render immediately
		render();

		// MutationObserver with debounce for Angular change detection
		let debounceTimer: ReturnType<typeof setTimeout> | null = null;
		const observer = new MutationObserver(() => {
			if (debounceTimer !== null) clearTimeout(debounceTimer);
			debounceTimer = setTimeout(() => {
				debounceTimer = null;
				render();
			}, 0);
		});

		const target = document.querySelector("field-monitor-simple") ?? document.body;
		observer.observe(target, { subtree: true, childList: true, characterData: true, attributes: true });

		// 1-second interval to keep T: timer + lastChange emojis current
		setInterval(render, 1_000);
	});
}

console.log("[FTA Buddy Overlay] Script loaded");
if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", boot);
} else {
	boot();
}
