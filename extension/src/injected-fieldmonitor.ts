import { trpc, updateValues, uploadAllUnimportedMatchLogs } from "./injected-trpc";
import { DSState, EnableState, FieldState, FMSEnums, type PartialMonitorFrame, type PartialRobotInfo } from "../../shared/types";

const scriptEl = document.getElementById("fta-buddy") as HTMLScriptElement | null;
const urlVal = scriptEl?.dataset.host;
const cloudVal = scriptEl?.dataset.cloud;
const useDev = scriptEl?.dataset.useDev;
const eventCode = scriptEl?.dataset.event;
const eventToken = scriptEl?.dataset.eventToken;
const extensionId = scriptEl?.dataset.extensionId;
const version = scriptEl?.dataset.version ?? "0.0.0";

if (!urlVal || !cloudVal || !eventCode || !eventToken) {
	console.error("[FTA Buddy] Missing dataset config on #fta-buddy script element");
	throw new Error("Missing data");
}

updateValues({
	cloud: cloudVal === "true",
	useDev: useDev === "true",
	id: extensionId ?? "",
	event: eventCode,
	url: urlVal,
	eventToken: eventToken,
	extensionId,
});

console.log("[FTA Buddy] FieldMonitor scraper loaded");

interface StationData {
	TeamNumber: number;
	Connection: boolean;
	LinkActive: boolean;
	RadioLink: boolean;
	RIOLink: boolean;
	IsEnabled: boolean;
	IsAuto: boolean;
	IsBypassed: boolean;
	IsEStopped: boolean;
	IsAStopped: boolean;
	Battery: number;
	MonitorStatus: number; // FMSEnums.MonitorStatusType
	AverageTripTime: number;
	LostPackets: number;
	Signal: number;
	Noise: number;
	SNR: number;
	MACAddress: string | null;
	TxRate: number;
	TxMCS: number;
	RxRate: number;
	RxMCS: number;
	DataRateTotal: number;
	StationStatus: string; // "Good" | "WrongStation" | "WrongMatch" | "Unknown"
	RadioConnectionQuality: "Warning" | "Caution" | "Good" | "Excellent" | null;
	RadioConnectedToAp: boolean | null;
}

interface MatchStatusInfo {
	// Property names vary: SignalR hub sends camelCase JSON, Angular may expose either casing.
	MatchState?: number;
	matchState?: number;
	MatchStateMessage?: string;
	matchStateMessage?: string;
	MatchNumber?: number;
	matchNumber?: number;
	PlayNumber?: number;
	playNumber?: number;
	TournamentLevel?: string;
	tournamentLevel?: string;
}

function dsState(s: StationData): DSState {
	if (s.IsEStopped) return DSState.ESTOP;
	if (s.IsAStopped) return DSState.ASTOP;
	if (s.IsBypassed) return DSState.BYPASS;
	if (s.StationStatus === "WrongStation" || s.StationStatus === "WrongMatch") return DSState.MOVE_STATION;
	if (!s.Connection) return DSState.RED;
	if (!s.StationStatus || s.StationStatus === "Good") return DSState.GREEN;
	return DSState.GREEN_X;
}

function enableState(s: StationData): EnableState {
	switch (s.MonitorStatus) {
		case FMSEnums.MonitorStatusType.EStopped: return EnableState.ESTOP;
		case FMSEnums.MonitorStatusType.AStopped: return EnableState.ASTOP;
		case FMSEnums.MonitorStatusType.DisabledAuto: return EnableState.RED_A;
		case FMSEnums.MonitorStatusType.DisabledTeleop: return EnableState.RED_T;
		case FMSEnums.MonitorStatusType.EnabledAuto: return EnableState.GREEN_A;
		case FMSEnums.MonitorStatusType.EnabledTeleop: return EnableState.GREEN_T;
		default: return EnableState.RED;
	}
}

// Angular stores RadioConnectionQuality as a numeric enum; SignalR sends it as a string.
// Handle both so the Angular component path and any future path work correctly.
const RADIO_QUALITY_MAP: Record<number, "Warning" | "Caution" | "Good" | "Excellent"> = {
	0: "Warning",
	1: "Caution",
	2: "Good",
	3: "Excellent",
};

/** Coerce a value to number | null - handles strings from SignalR deserialization. */
function toNum(v: unknown): number | null {
	if (v === null || v === undefined) return null;
	const n = Number(v);
	return isNaN(n) ? null : n;
}

function toRadioQuality(v: unknown): "Warning" | "Caution" | "Good" | "Excellent" | null {
	if (v === null || v === undefined) return null;
	if (typeof v === "string" && (v === "Warning" || v === "Caution" || v === "Good" || v === "Excellent")) return v;
	if (typeof v === "number") return RADIO_QUALITY_MAP[v] ?? null;
	return null;
}

function stationToRobotInfo(s: StationData): PartialRobotInfo {
	return {
		number: Number(s.TeamNumber) || 0,
		ds: dsState(s),
		radio: Boolean(s.RadioLink),
		rio: Boolean(s.RIOLink),
		code: Boolean(s.LinkActive),
		enabled: enableState(s),
		bwu: Number(s.DataRateTotal) || 0,
		battery: Number(s.Battery) || 0,
		ping: Number(s.AverageTripTime) || 0,
		packets: Number(s.LostPackets) || 0,
		MAC: s.MACAddress || null,
		RX: toNum(s.RxRate),
		RXMCS: toNum(s.RxMCS),
		TX: toNum(s.TxRate),
		TXMCS: toNum(s.TxMCS),
		SNR: toNum(s.SNR),
		noise: toNum(s.Noise),
		signal: toNum(s.Signal),
		versionmm: false,
		radioConnectionQuality: toRadioQuality(s.RadioConnectionQuality),
		radioConnected: s.RadioConnectedToAp ?? null,
	};
}


const TOURNAMENT_LEVEL_MAP: Record<string | number, "None" | "Practice" | "Qualification" | "Playoff"> = {
	// String keys (SignalR / REST API)
	None: "None",
	Practice: "Practice",
	Qual: "Qualification",
	Qualification: "Qualification",
	Playoff: "Playoff",
	Eliminations: "Playoff",
	// Numeric keys (Angular component)
	0: "None",
	1: "Practice",
	2: "Qualification",
	3: "Playoff",
};

function getAngularComponent(selector: string): any | null {
	const el = document.querySelector(selector);
	if (!el) return null;
	const ng = (window as any).ng;
	if (!ng) return null;
	try {
		return ng.getComponent?.(el) ?? null;
	} catch {
		return null;
	}
}

function buildFrameFromAngular(): PartialMonitorFrame | null {
	const comp = getAngularComponent("field-monitor-simple");
	if (!comp) return null;

	const ms: MatchStatusInfo | null = comp.matchStatus ?? null;
	if (!ms) return null;

	// One-time debug log to confirm actual property values from Angular component
	if (!(window as any).__ftaBuddyMsLogged) {
		(window as any).__ftaBuddyMsLogged = true;
		console.log("[FTA Buddy] matchStatus:", JSON.stringify(ms));
	}

	const stations: Record<string, StationData | null> = {
		blue1: comp.blue1 ?? null,
		blue2: comp.blue2 ?? null,
		blue3: comp.blue3 ?? null,
		red1: comp.red1 ?? null,
		red2: comp.red2 ?? null,
		red3: comp.red3 ?? null,
	};

	const EMPTY: PartialRobotInfo = {
		number: 0, ds: DSState.RED, radio: false, rio: false, code: false,
		enabled: EnableState.RED, bwu: 0, battery: 0, ping: 0, packets: 0,
		MAC: null, RX: null, RXMCS: null, TX: null, TXMCS: null,
		SNR: null, noise: null, signal: null, versionmm: false,
		radioConnectionQuality: null, radioConnected: null,
	};

	const matchStateMsg = ms.MatchStateMessage ?? ms.matchStateMessage ?? "";
	const matchNum = ms.MatchNumber ?? ms.matchNumber ?? 0;
	const playNum = ms.PlayNumber ?? ms.playNumber ?? 1;
	const tournamentLevel = ms.TournamentLevel ?? ms.tournamentLevel ?? "";

	return {
		field: matchStateTextToField(matchStateMsg),
		match: matchNum,
		play: playNum,
		level: TOURNAMENT_LEVEL_MAP[tournamentLevel] ?? "None",
		time: comp.aheadBedind ?? comp.aheadBehind ?? "",
		version,
		frameTime: Date.now(),
		blue1: stations.blue1 ? stationToRobotInfo(stations.blue1) : EMPTY,
		blue2: stations.blue2 ? stationToRobotInfo(stations.blue2) : EMPTY,
		blue3: stations.blue3 ? stationToRobotInfo(stations.blue3) : EMPTY,
		red1: stations.red1 ? stationToRobotInfo(stations.red1) : EMPTY,
		red2: stations.red2 ? stationToRobotInfo(stations.red2) : EMPTY,
		red3: stations.red3 ? stationToRobotInfo(stations.red3) : EMPTY,
		lastCycleTime: "",
	};
}

function parseFloatSafe(s: string | undefined | null): number {
	const v = parseFloat((s ?? "").replace(/[^\d.-]/g, ""));
	return isNaN(v) ? 0 : v;
}

function parseIntSafe(s: string | undefined | null): number {
	const v = parseInt((s ?? "").replace(/[^\d-]/g, ""), 10);
	return isNaN(v) ? 0 : v;
}

/**
 * Parse "Signal: X (dBm) Noise: Y (dBm) SNR: Z TX Rate: A TX MCS: B RX Rate: C Rx MCS: D"
 * from the title attribute of the data rate column.
 */
function parseTitleAttr(title: string): { signal: number; noise: number; snr: number; txRate: number; txMCS: number; rxRate: number; rxMCS: number } {
	const num = (label: string) => {
		const m = title.match(new RegExp(label + "[:\\s]+([\\d.-]+)"));
		return m ? parseFloat(m[1]) : 0;
	};
	return {
		signal: num("Signal"),
		noise: num("Noise"),
		snr: num("SNR"),
		txRate: num("TX Rate"),
		txMCS: num("TX MCS"),
		rxRate: num("RX Rate"),
		rxMCS: num("Rx MCS"),
	};
}

function iconToDsState(topRowEl: Element): DSState {
	// Check for bypass badge first
	if (topRowEl.querySelector(".bg-yellow")) return DSState.BYPASS;
	// Check move-to indicator (wrong station / wrong match)
	if (topRowEl.querySelector(".move-indicator")) return DSState.MOVE_STATION;

	// DS connection icon is in the first col-3 of the bottom area
	const col1 = topRowEl.querySelectorAll(".col-3, .col-xl-2")[0];
	if (!col1) return DSState.RED;
	const i = col1.querySelector("i");
	if (!i) return DSState.RED;
	if (i.classList.contains("fa-circle-check")) return DSState.GREEN;
	if (i.classList.contains("fa-square-exclamation")) return DSState.GREEN_X;
	return DSState.RED;
}

function iconToRadio(topRowEl: Element): boolean {
	const cols = topRowEl.querySelectorAll(".col-3, .col-xl-2");
	const col = cols[1];
	if (!col) return false;
	const i = col.querySelector("i");
	if (!i) return false;
	return !i.classList.contains("fa-square-x");
}

function iconToRio(topRowEl: Element): boolean {
	const cols = topRowEl.querySelectorAll(".col-3, .col-xl-2");
	const col = cols[2];
	if (!col) return false;
	const i = col.querySelector("i");
	if (!i) return false;
	return i.classList.contains("fa-circle-check");
}

function iconToRadioQuality(topRowEl: Element): "Warning" | "Caution" | "Good" | "Excellent" | null {
	const cols = topRowEl.querySelectorAll(".col-3, .col-xl-2");
	const col = cols[1];
	if (!col) return null;
	const i = col.querySelector("i");
	if (!i) return null;
	if (i.classList.contains("fa-signal-bars-weak")) return "Warning";
	if (i.classList.contains("fa-signal-bars-fair")) return "Caution";
	if (i.classList.contains("fa-signal-bars-good")) return "Good";
	if (i.classList.contains("fa-signal-bars-strong")) return "Excellent";
	return null;
}

function iconToEnableState(bottomRowEl: Element, isInMatch: boolean): EnableState {
	const cols = bottomRowEl.querySelectorAll(".col-3, .col-xl-2");
	const col = cols[3];
	if (!col) return EnableState.RED;
	const i = col.querySelector("i");
	if (!i) return EnableState.RED;
	if (i.classList.contains("fa-square-e")) return EnableState.ESTOP;
	if (i.classList.contains("fa-square-a") && !isInMatch) return EnableState.ASTOP;
	if (i.classList.contains("fa-circle-a")) return EnableState.GREEN_A;
	if (i.classList.contains("fa-circle-t")) return EnableState.GREEN_T;
	if (i.classList.contains("fa-square-a")) return EnableState.RED_A;
	if (i.classList.contains("fa-square-t")) return EnableState.RED_T;
	return EnableState.RED;
}

function scrapeStation(stationEl: Element, isInMatch: boolean): PartialRobotInfo {
	const topRow = stationEl.querySelector("field-monitor-station-top-row");
	const bottomRow = stationEl.querySelector("field-monitor-station-bottom-row");

	// Team number
	const teamBadge = topRow?.querySelector(".badge.bg-light.text-dark h2, .badge.bg-light h2");
	const teamNumber = parseIntSafe(teamBadge?.textContent);

	// DS / radio / rio / enable state
	const ds = topRow ? iconToDsState(topRow) : DSState.RED;
	const radio = topRow ? iconToRadio(topRow) : false;
	const rio = topRow ? iconToRio(topRow) : false;
	const radioQuality = topRow ? iconToRadioQuality(topRow) : null;
	const radioConnected = radio;
	const code = rio && radio;
	const enabled = bottomRow ? iconToEnableState(bottomRow, isInMatch) : EnableState.RED;

	// Bottom row data: find battery, data rate, trip time and packets from text spans
	let battery = 0;
	let bwu = 0;
	let ping = 0;
	let packets = 0;
	let signal = 0;
	let noise = 0;
	let snr = 0;
	let txRate = 0;
	let txMCS = 0;
	let rxRate = 0;
	let rxMCS = 0;

	// Data rate col title attribute for signal/noise/SNR/TX/RX
	const dataRateCol = bottomRow?.querySelector("[title*='Signal:']");
	if (dataRateCol) {
		const parsed = parseTitleAttr(dataRateCol.getAttribute("title") ?? "");
		signal = parsed.signal;
		noise = parsed.noise;
		snr = parsed.snr;
		txRate = parsed.txRate;
		txMCS = parsed.txMCS;
		rxRate = parsed.rxRate;
		rxMCS = parsed.rxMCS;
	}

	// Battery from the bottom row - look for the battery col (last data col with "Min:" in secondary)
	const allDataPrimary = Array.from(bottomRow?.querySelectorAll(".indicator-data, .indicator-data-small") ?? []);
	const allDataSecondary = Array.from(bottomRow?.querySelectorAll(".indicator-data-secondary, .indicator-data-small-secondary") ?? []);

	// Look for battery by finding "Min:" secondary label
	for (let i = 0; i < allDataSecondary.length; i++) {
		const sec = allDataSecondary[i].textContent ?? "";
		if (sec.includes("Min:")) {
			// Primary value at same index should be battery
			battery = parseFloatSafe(allDataPrimary[i]?.textContent);
			break;
		}
	}

	// DataRateTotal: the first primary data value (paired with TxRate/RxRate secondary)
	for (let i = 0; i < allDataSecondary.length; i++) {
		const sec = allDataSecondary[i].textContent ?? "";
		if (sec.includes("/")) {
			bwu = parseFloatSafe(allDataPrimary[i]?.textContent);
			break;
		}
	}

	// Trip time and packets from top row secondary area
	const tripEl = topRow?.querySelector(".indicator-data-small");
	if (tripEl) ping = parseIntSafe(tripEl.textContent);
	const packetsEl = topRow?.querySelectorAll(".indicator-data-small")?.[1];
	if (packetsEl) packets = parseIntSafe(packetsEl.textContent);

	return {
		number: teamNumber,
		ds,
		radio,
		rio,
		code,
		enabled,
		bwu,
		battery,
		ping,
		packets,
		MAC: null,
		RX: rxRate || null,
		RXMCS: rxMCS || null,
		TX: txRate || null,
		TXMCS: txMCS || null,
		SNR: snr || null,
		noise: noise || null,
		signal: signal || null,
		versionmm: false,
		radioConnectionQuality: radioQuality,
		radioConnected: radioConnected || null,
	};
}

function matchStateTextToField(text: string): FieldState {
	const t = text.trim().toUpperCase();
	if (t.includes("AUTO")) return FieldState.MATCH_RUNNING_AUTO;
	if (t.includes("TELEOP")) return FieldState.MATCH_RUNNING_TELEOP;
	if (t.includes("TRANSITIONING")) return FieldState.MATCH_TRANSITIONING;
	if (t.includes("MATCH READY") && !t.includes("NOT")) return FieldState.MATCH_READY;
	if (t.includes("MATCH NOT READY")) return FieldState.MATCH_NOT_READY;
	if (t.includes("PRE-START COMPLETED")) return FieldState.PRESTART_COMPLETED;
	if (t.includes("PRE-START INITIATED")) return FieldState.PRESTART_INITIATED;
	if (t.includes("READY TO PRE-START")) return FieldState.READY_TO_PRESTART;
	if (t.includes("ABORTED") || t.includes("CANCELLED")) return FieldState.MATCH_ABORTED;
	if (t.includes("MATCH OVER") || t.includes("WAITING FOR COMMIT")) return FieldState.MATCH_OVER;
	if (t.includes("POST RESULT")) return FieldState.READY_FOR_POST_RESULT;
	return FieldState.UNKNOWN;
}

function buildFrameFromDOM(): PartialMonitorFrame | null {
	// Use the small-screen container which always has consistent order:
	// blue1, blue2, blue3, red1, red2, red3
	const container = document.querySelector(".content-container-small");
	if (!container) return null;

	const stationEls = Array.from(container.querySelectorAll(":scope > .station"));
	if (stationEls.length < 6) return null;

	// Match status from header
	const matchStateEl = document.querySelector(".bg-light span.fs-2, .bg-light span.fs-5");
	const matchStateText = matchStateEl?.textContent ?? "";
	const fieldState = matchStateTextToField(matchStateText);
	const isInMatch = fieldState === FieldState.MATCH_RUNNING_AUTO || fieldState === FieldState.MATCH_RUNNING_TELEOP || fieldState === FieldState.MATCH_TRANSITIONING;

	const matchNumEl = document.querySelector(".bg-secondary span.fs-2");
	const matchNumText = (matchNumEl?.textContent ?? "M0").replace(/[Mm]/, "");
	const matchNum = parseIntSafe(matchNumText);

	const aheadBehindEl = document.querySelector(".bg-dark span");
	const aheadBehind = aheadBehindEl?.textContent?.trim() ?? "";

	const EMPTY: PartialRobotInfo = {
		number: 0, ds: DSState.RED, radio: false, rio: false, code: false,
		enabled: EnableState.RED, bwu: 0, battery: 0, ping: 0, packets: 0,
		MAC: null, RX: null, RXMCS: null, TX: null, TXMCS: null,
		SNR: null, noise: null, signal: null, versionmm: false,
		radioConnectionQuality: null, radioConnected: null,
	};

	return {
		field: fieldState,
		match: matchNum,
		play: 1,
		level: "Qualification",
		time: aheadBehind,
		version,
		frameTime: Date.now(),
		blue1: stationEls[0] ? scrapeStation(stationEls[0], isInMatch) : EMPTY,
		blue2: stationEls[1] ? scrapeStation(stationEls[1], isInMatch) : EMPTY,
		blue3: stationEls[2] ? scrapeStation(stationEls[2], isInMatch) : EMPTY,
		red1: stationEls[3] ? scrapeStation(stationEls[3], isInMatch) : EMPTY,
		red2: stationEls[4] ? scrapeStation(stationEls[4], isInMatch) : EMPTY,
		red3: stationEls[5] ? scrapeStation(stationEls[5], isInMatch) : EMPTY,
		lastCycleTime: "",
	};
}

let postPending = false;
let prevFieldState: FieldState | null = null;
let lastMatchAutoStartMs: number | null = null;
let lastMatchCycleArgs: { eventToken: string; matchNumber: number; playNumber: number; level: "None" | "Practice" | "Qualification" | "Playoff"; extensionId: string } | null = null;
let matchUploadTimer: ReturnType<typeof setTimeout> | null = null;

function msToCycleTimeStr(ms: number): string {
	const totalSec = Math.floor(ms / 1000);
	const h = Math.floor(totalSec / 3600);
	const m = Math.floor((totalSec % 3600) / 60);
	const s = totalSec % 60;
	const msRemainder = ms % 1000;
	return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${msRemainder.toString().padStart(3, "0")}`;
}

function triggerMatchUpload(delayMs: number) {
	if (matchUploadTimer !== null) return; // already scheduled
	matchUploadTimer = setTimeout(async () => {
		matchUploadTimer = null;
		try {
			await uploadAllUnimportedMatchLogs();
		} catch (err) {
			console.warn("[FTA Buddy] Match upload failed:", err);
		}
	}, delayMs);
}

async function postFrame() {
	if (postPending) return;
	postPending = true;
	try {
		const frame = buildFrameFromAngular() ?? buildFrameFromDOM();
		if (!frame) return;

		const cur = frame.field;
		const prev = prevFieldState;
		prevFieldState = cur;

		// Trigger cycle time tracking and match log upload on state transitions (mirrors signalR.ts)
		if (prev !== cur) {
			const cycleArgs = {
				eventToken: eventToken!,
				matchNumber: frame.match ?? 0,
				playNumber: frame.play ?? 1,
				level: frame.level ?? "Qualification",
				extensionId: extensionId ?? "",
			} as const;

			if (cur === FieldState.PRESTART_COMPLETED) {
				trpc.cycles.postCycleTime.mutate({ ...cycleArgs, type: "prestart" })
					.catch((err) => console.warn("[FTA Buddy] postCycleTime prestart failed:", err));
			} else if (cur === FieldState.MATCH_RUNNING_AUTO) {
				// Post the completed cycle time to the PREVIOUS match's DB row (match-start to match-start),
				// mirroring what SignalR's lastcycletimecalculated event does.
				if (lastMatchAutoStartMs !== null && lastMatchCycleArgs !== null) {
					const cycleMs = Date.now() - lastMatchAutoStartMs;
					if (cycleMs > 60_000 && cycleMs < 3_600_000) {
						trpc.cycles.postCycleTime
							.mutate({ ...lastMatchCycleArgs, type: "lastCycleTime", lastCycleTime: msToCycleTimeStr(cycleMs) })
							.catch((err) => console.warn("[FTA Buddy] postCycleTime lastCycleTime failed:", err));
					}
				}
				lastMatchAutoStartMs = Date.now();
				lastMatchCycleArgs = { ...cycleArgs };
				trpc.cycles.postCycleTime.mutate({ ...cycleArgs, type: "start" })
					.catch((err) => console.warn("[FTA Buddy] postCycleTime start failed:", err));
				if (matchUploadTimer !== null) {
					clearTimeout(matchUploadTimer);
					matchUploadTimer = null;
				}
			} else if (cur === FieldState.MATCH_OVER) {
				trpc.cycles.postCycleTime.mutate({ ...cycleArgs, type: "end" })
					.catch((err) => console.warn("[FTA Buddy] postCycleTime end failed:", err));
				triggerMatchUpload(3000);
			} else if (cur === FieldState.MATCH_ABORTED) {
				triggerMatchUpload(3000);
			} else if (cur === FieldState.READY_FOR_POST_RESULT) {
				trpc.cycles.postCycleTime.mutate({ ...cycleArgs, type: "scoresPosted" })
					.catch((err) => console.warn("[FTA Buddy] postCycleTime scoresPosted failed:", err));
				triggerMatchUpload(0);
			}
		}

		await trpc.field.post.mutate(
			eventToken
				? { eventToken, ...frame, extensionId: extensionId ?? "" }
				: { eventCode: eventCode ?? "", ...frame, extensionId: extensionId ?? "" },
		);
	} catch (err) {
		console.warn("[FTA Buddy] Frame post failed:", err);
	} finally {
		postPending = false;
	}
}

// Debounce mutations: Angular makes many DOM changes per change-detection cycle.
// Wait a tick after the last mutation before reading and posting.
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function onMutation() {
	if (debounceTimer !== null) clearTimeout(debounceTimer);
	debounceTimer = setTimeout(() => {
		debounceTimer = null;
		postFrame();
	}, 0); // next event-loop tick - coalesces all mutations in one CD cycle
}

// Wait for Angular to bootstrap before starting
function waitForApp(callback: () => void, attempts = 0) {
	const ready = document.querySelector("field-monitor-simple") || document.querySelector(".content-container-small");
	if (ready) {
		callback();
	} else if (attempts < 60) {
		setTimeout(() => waitForApp(callback, attempts + 1), 500);
	} else {
		console.warn("[FTA Buddy] FieldMonitor app did not load after 30s");
	}
}

waitForApp(() => {
	console.log("[FTA Buddy] FieldMonitor app detected, starting scraper");

	// Observe the whole monitor container for any subtree / attribute changes.
	// Angular updates text content and class names on each CD cycle.
	const target = document.querySelector("field-monitor-simple") ?? document.body;
	const observer = new MutationObserver(onMutation);
	observer.observe(target, { subtree: true, childList: true, characterData: true, attributes: true });

	// Post once immediately so we don't wait for the first mutation.
	postFrame();
});
