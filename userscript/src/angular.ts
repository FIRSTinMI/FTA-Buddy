/**
 * angular.ts — Read live data from the FMS FieldMonitor Angular component.
 * Ported from extension/src/injected-fieldmonitor.ts.
 */

import { DSState, EnableState, FieldState, FMSEnums, type PartialMonitorFrame, type PartialRobotInfo } from "../../shared/types";

export interface StationData {
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

const RADIO_QUALITY_MAP: Record<number, "Warning" | "Caution" | "Good" | "Excellent"> = {
	0: "Warning",
	1: "Caution",
	2: "Good",
	3: "Excellent",
};

const TOURNAMENT_LEVEL_MAP: Record<string, "None" | "Practice" | "Qualification" | "Playoff"> = {
	None: "None",
	Practice: "Practice",
	Qual: "Qualification",
	Qualification: "Qualification",
	Playoff: "Playoff",
	Eliminations: "Playoff",
};

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

const EMPTY_ROBOT: PartialRobotInfo = {
	number: 0, ds: DSState.RED, radio: false, rio: false, code: false,
	enabled: EnableState.RED, bwu: 0, battery: 0, ping: 0, packets: 0,
	MAC: null, RX: null, RXMCS: null, TX: null, TXMCS: null,
	SNR: null, noise: null, signal: null, versionmm: false,
	radioConnectionQuality: null, radioConnected: null,
};

let _angularLoggedOnce = false;
function buildFrameFromAngular(): PartialMonitorFrame | null {
	const comp = getAngularComponent("field-monitor-simple");
	if (!comp) {
		if (!_angularLoggedOnce) console.log("[FTA Buddy] ng.getComponent('field-monitor-simple') returned null — ng available:", !!(window as any).ng, "element exists:", !!document.querySelector("field-monitor-simple"));
		return null;
	}

	if (!_angularLoggedOnce) {
		_angularLoggedOnce = true;
		console.log("[FTA Buddy] Angular component found! Keys:", Object.keys(comp).filter(k => !k.startsWith("_") && !k.startsWith("ng")).slice(0, 20));
		console.log("[FTA Buddy] matchStatus:", JSON.stringify(comp.matchStatus));
		console.log("[FTA Buddy] blue1 keys:", comp.blue1 ? Object.keys(comp.blue1) : "null");
	}

	const ms: MatchStatusInfo | null = comp.matchStatus ?? null;
	if (!ms) {
		console.warn("[FTA Buddy] comp.matchStatus is null/undefined");
		return null;
	}

	const matchStateMsg = ms.MatchStateMessage ?? ms.matchStateMessage ?? "";
	const matchNum = ms.MatchNumber ?? ms.matchNumber ?? 0;
	const playNum = ms.PlayNumber ?? ms.playNumber ?? 1;
	const tournamentLevel = ms.TournamentLevel ?? ms.tournamentLevel ?? "";

	const station = (key: string): PartialRobotInfo => {
		const s: StationData | null = comp[key] ?? null;
		return s ? stationToRobotInfo(s) : EMPTY_ROBOT;
	};

	return {
		field: matchStateTextToField(matchStateMsg),
		match: matchNum,
		play: playNum,
		level: TOURNAMENT_LEVEL_MAP[tournamentLevel] ?? "None",
		time: comp.aheadBehind ?? "",
		version: "userscript",
		frameTime: Date.now(),
		blue1: station("blue1"),
		blue2: station("blue2"),
		blue3: station("blue3"),
		red1: station("red1"),
		red2: station("red2"),
		red3: station("red3"),
		lastCycleTime: "",
	};
}

// ── DOM fallback ────────────────────────────────────────────────────────────

function parseFloatSafe(s: string | null | undefined): number {
	const v = parseFloat((s ?? "").replace(/[^\d.-]/g, ""));
	return isNaN(v) ? 0 : v;
}

function parseIntSafe(s: string | null | undefined): number {
	const v = parseInt((s ?? "").replace(/[^\d-]/g, ""), 10);
	return isNaN(v) ? 0 : v;
}

function parseTitleAttr(title: string) {
	const num = (label: string) => {
		const m = title.match(new RegExp(label + "[:\\s]+([\\d.-]+)"));
		return m ? parseFloat(m[1]) : 0;
	};
	return {
		signal: num("Signal"), noise: num("Noise"), snr: num("SNR"),
		txRate: num("TX Rate"), txMCS: num("TX MCS"), rxRate: num("RX Rate"), rxMCS: num("Rx MCS"),
	};
}

function iconToDsState(el: Element): DSState {
	if (el.querySelector(".bg-yellow")) return DSState.BYPASS;
	if (el.querySelector(".move-indicator")) return DSState.MOVE_STATION;
	const col1 = el.querySelectorAll(".col-3, .col-xl-2")[0];
	if (!col1) return DSState.RED;
	const i = col1.querySelector("i");
	if (!i) return DSState.RED;
	if (i.classList.contains("fa-circle-check")) return DSState.GREEN;
	if (i.classList.contains("fa-square-exclamation")) return DSState.GREEN_X;
	return DSState.RED;
}

function iconToRadio(el: Element): boolean {
	const col = el.querySelectorAll(".col-3, .col-xl-2")[1];
	if (!col) return false;
	const i = col.querySelector("i");
	return !!i && !i.classList.contains("fa-square-x");
}

function iconToRio(el: Element): boolean {
	const col = el.querySelectorAll(".col-3, .col-xl-2")[2];
	if (!col) return false;
	const i = col.querySelector("i");
	return !!i && i.classList.contains("fa-circle-check");
}

function iconToRadioQuality(el: Element): "Warning" | "Caution" | "Good" | "Excellent" | null {
	const col = el.querySelectorAll(".col-3, .col-xl-2")[1];
	if (!col) return null;
	const i = col.querySelector("i");
	if (!i) return null;
	if (i.classList.contains("fa-signal-bars-weak")) return "Warning";
	if (i.classList.contains("fa-signal-bars-fair")) return "Caution";
	if (i.classList.contains("fa-signal-bars-good")) return "Good";
	if (i.classList.contains("fa-signal-bars-strong")) return "Excellent";
	return null;
}

function iconToEnableState(el: Element, isInMatch: boolean): EnableState {
	const col = el.querySelectorAll(".col-3, .col-xl-2")[3];
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

function scrapeStation(el: Element, isInMatch: boolean): PartialRobotInfo {
	const topRow = el.querySelector("field-monitor-station-top-row");
	const bottomRow = el.querySelector("field-monitor-station-bottom-row");

	const teamBadge = topRow?.querySelector(".badge.bg-light.text-dark h2, .badge.bg-light h2");
	const teamNumber = parseIntSafe(teamBadge?.textContent);

	const ds = topRow ? iconToDsState(topRow) : DSState.RED;
	const radio = topRow ? iconToRadio(topRow) : false;
	const rio = topRow ? iconToRio(topRow) : false;
	const radioQuality = topRow ? iconToRadioQuality(topRow) : null;
	const enabled = bottomRow ? iconToEnableState(bottomRow, isInMatch) : EnableState.RED;

	let battery = 0, bwu = 0, ping = 0, packets = 0;
	let signal = 0, noise = 0, snr = 0, txRate = 0, txMCS = 0, rxRate = 0, rxMCS = 0;

	const dataRateCol = bottomRow?.querySelector("[title*='Signal:']");
	if (dataRateCol) {
		const p = parseTitleAttr(dataRateCol.getAttribute("title") ?? "");
		signal = p.signal; noise = p.noise; snr = p.snr;
		txRate = p.txRate; txMCS = p.txMCS; rxRate = p.rxRate; rxMCS = p.rxMCS;
	}

	const allPrimary = Array.from(bottomRow?.querySelectorAll(".indicator-data, .indicator-data-small") ?? []);
	const allSecondary = Array.from(bottomRow?.querySelectorAll(".indicator-data-secondary, .indicator-data-small-secondary") ?? []);

	for (let i = 0; i < allSecondary.length; i++) {
		const sec = allSecondary[i].textContent ?? "";
		if (sec.includes("Min:")) { battery = parseFloatSafe(allPrimary[i]?.textContent); break; }
	}
	for (let i = 0; i < allSecondary.length; i++) {
		const sec = allSecondary[i].textContent ?? "";
		if (sec.includes("/")) { bwu = parseFloatSafe(allPrimary[i]?.textContent); break; }
	}

	const tripEl = topRow?.querySelector(".indicator-data-small");
	if (tripEl) ping = parseIntSafe(tripEl.textContent);
	const packetsEl = topRow?.querySelectorAll(".indicator-data-small")?.[1];
	if (packetsEl) packets = parseIntSafe(packetsEl.textContent);

	return {
		number: teamNumber, ds, radio, rio, code: rio && radio, enabled, bwu, battery, ping, packets,
		MAC: null, RX: rxRate || null, RXMCS: rxMCS || null, TX: txRate || null, TXMCS: txMCS || null,
		SNR: snr || null, noise: noise || null, signal: signal || null, versionmm: false,
		radioConnectionQuality: radioQuality, radioConnected: radio || null,
	};
}

let _domLoggedOnce = false;
function buildFrameFromDOM(): PartialMonitorFrame | null {
	const container = document.querySelector(".content-container-small");
	if (!container) {
		if (!_domLoggedOnce) { _domLoggedOnce = true; console.log("[FTA Buddy] DOM fallback: .content-container-small not found either"); }
		return null;
	}

	const stationEls = Array.from(container.querySelectorAll(":scope > .station"));
	if (stationEls.length < 6) return null;

	const matchStateEl = document.querySelector(".bg-light span.fs-2, .bg-light span.fs-5");
	const matchStateText = matchStateEl?.textContent ?? "";
	const fieldState = matchStateTextToField(matchStateText);
	const isInMatch = fieldState === FieldState.MATCH_RUNNING_AUTO
		|| fieldState === FieldState.MATCH_RUNNING_TELEOP
		|| fieldState === FieldState.MATCH_TRANSITIONING;

	const matchNumEl = document.querySelector(".bg-secondary span.fs-2");
	const matchNum = parseIntSafe((matchNumEl?.textContent ?? "M0").replace(/[Mm]/, ""));

	const aheadBehindEl = document.querySelector(".bg-dark span");
	const aheadBehind = aheadBehindEl?.textContent?.trim() ?? "";

	return {
		field: fieldState, match: matchNum, play: 1, level: "Qualification",
		time: aheadBehind, version: "userscript", frameTime: Date.now(),
		blue1: stationEls[0] ? scrapeStation(stationEls[0], isInMatch) : EMPTY_ROBOT,
		blue2: stationEls[1] ? scrapeStation(stationEls[1], isInMatch) : EMPTY_ROBOT,
		blue3: stationEls[2] ? scrapeStation(stationEls[2], isInMatch) : EMPTY_ROBOT,
		red1: stationEls[3] ? scrapeStation(stationEls[3], isInMatch) : EMPTY_ROBOT,
		red2: stationEls[4] ? scrapeStation(stationEls[4], isInMatch) : EMPTY_ROBOT,
		red3: stationEls[5] ? scrapeStation(stationEls[5], isInMatch) : EMPTY_ROBOT,
		lastCycleTime: "",
	};
}

export function buildFrame(): PartialMonitorFrame | null {
	return buildFrameFromAngular() ?? buildFrameFromDOM();
}

export function isAppReady(): boolean {
	return !!(
		document.querySelector("field-monitor-simple") ||
		document.querySelector(".content-container-small")
	);
}
