/**
 * ui.ts - DOM construction and per-frame update logic.
 *
 * Produces an exact replica of FTA Buddy's Monitor.svelte + MonitorRow.svelte:
 *   - Flat CSS grid (all station cells are direct children of .fb-grid)
 *   - <button> elements matching MonitorRow.svelte
 *   - Class names match styles.ts (fb-team, fb-sq, fb-metric, fb-ping, etc.)
 *   - SVG sparklines with viewBox="0 0 100 100", quadratic-bezier smooth curve
 *   - Battery red overlay: (-1.5*v²-6.6*v+255)/255 when v < 11
 *   - Ping red overlay: Math.log10(ping/25) for 20-100ms, 0.5 for >100ms
 *   - Signal: 3-bar SVG icon (>-60 green, >-70 yellow, >-80 red, else gray)
 */

import { DSState, FieldState, type PartialMonitorFrame, type PartialRobotInfo } from "../../shared/types";
import { type StationHistory, type FrameHistory } from "./history";

const STATION_KEYS = ["blue1", "blue2", "blue3", "red1", "red2", "red3"] as const;
type StationKey = (typeof STATION_KEYS)[number];

// ── Field state labels ────────────────────────────────────────────────────────

const FIELD_STATE_LABELS: Record<number, string> = {
	[FieldState.UNKNOWN]: "Unknown",
	[FieldState.MATCH_RUNNING_TELEOP]: "Match Running Teleop",
	[FieldState.MATCH_TRANSITIONING]: "Match Transitioning",
	[FieldState.MATCH_RUNNING_AUTO]: "Match Running Auto",
	[FieldState.MATCH_READY]: "Match Ready",
	[FieldState.PRESTART_COMPLETED]: "Prestart Completed",
	[FieldState.PRESTART_INITIATED]: "Prestart Initiated",
	[FieldState.READY_TO_PRESTART]: "Ready to Prestart",
	[FieldState.MATCH_ABORTED]: "Match Aborted",
	[FieldState.MATCH_OVER]: "Match Over",
	[FieldState.READY_FOR_POST_RESULT]: "Ready for Post Result",
	[FieldState.MATCH_NOT_READY]: "Match Not Ready",
};

// ── DS helpers ────────────────────────────────────────────────────────────────

function dsLetter(ds: DSState): string {
	switch (ds) {
		case DSState.GREEN_X: return "X";
		case DSState.MOVE_STATION: return "M";
		case DSState.WAITING: return "W";
		case DSState.BYPASS: return "B";
		case DSState.ESTOP: return "E";
		case DSState.ASTOP: return "A";
		default: return "";
	}
}

// ── Sparkline path (smooth quadratic-bezier, matches Graph.svelte curveBasis) ─
//
// Graph.svelte uses d3 curveBasis (cubic B-spline).  We approximate it with
// quadratic-bezier midpoint smoothing - visually equivalent for sparklines.
//
// Coordinate system (matches Graph.svelte scales):
//   x: (index / (n-1)) * 90       → domain [0, 20], range [0, 90]
//   y: (max - value) / (max - min) * 100  → flipped so high = top

function buildSparklinePath(values: number[], min: number, max: number): string {
	if (values.length < 2) return "";
	const range = max - min || 1;
	const n = values.length;

	const pts = values.map((v, i): [number, number] => [
		(i / (n - 1)) * 90,
		((max - v) / range) * 100,
	]);

	let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
	for (let i = 0; i < pts.length - 1; i++) {
		const mx = ((pts[i][0] + pts[i + 1][0]) / 2).toFixed(1);
		const my = ((pts[i][1] + pts[i + 1][1]) / 2).toFixed(1);
		d += ` Q${pts[i][0].toFixed(1)},${pts[i][1].toFixed(1)} ${mx},${my}`;
	}
	d += ` L${pts[pts.length - 1][0].toFixed(1)},${pts[pts.length - 1][1].toFixed(1)}`;
	return d;
}

// ── Signal bars icon ──────────────────────────────────────────────────────────

function makeSignalSvg(): { svg: SVGSVGElement; bars: SVGRectElement[] } {
	const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
	svg.setAttribute("viewBox", "0 0 24 24");

	// Three bars of increasing height (left=short, right=tall)
	const barDefs = [
		[1, 18, 5, 5],     // bar 1 - short
		[9.5, 12, 5, 11],  // bar 2 - medium
		[18, 6, 5, 17],    // bar 3 - tall
	] as const;

	const bars: SVGRectElement[] = barDefs.map(([x, y, w, h]) => {
		const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
		rect.setAttribute("x", String(x));
		rect.setAttribute("y", String(y));
		rect.setAttribute("width", String(w));
		rect.setAttribute("height", String(h));
		rect.setAttribute("fill", "#555");
		svg.appendChild(rect);
		return rect;
	});

	return { svg, bars };
}

function updateSignalBars(bars: SVGRectElement[], dBm: number | null | undefined): void {
	const s = dBm ?? 0;
	const level = s === 0 ? 0 : s > -60 ? 3 : s > -70 ? 2 : s > -80 ? 1 : 0;
	// Matches MonitorRow.svelte: green-600 / yellow-600 / red-600 / gray
	const activeColor =
		level === 3 ? "#16a34a" :
		level === 2 ? "#ca8a04" :
		level >= 1  ? "#dc2626" : "#9e9e9e";
	bars.forEach((bar, i) => bar.setAttribute("fill", i < level ? activeColor : "#555"));
}

// ── Fullscreen ────────────────────────────────────────────────────────────────

// MDI icon paths (24×24 viewBox)
const ICON_FULLSCREEN      = "M5,5H10V7H7V10H5V5M14,5H19V10H17V7H14V5M17,14H19V19H14V17H17V14M10,17V19H5V14H7V17H10Z";
const ICON_FULLSCREEN_EXIT = "M14,14H19V16H16V19H14V14M5,14H10V19H8V16H5V14M8,5H10V10H5V8H8V5M19,8V10H14V5H16V8H19Z";

export function makeFullscreenBtn(): HTMLButtonElement {
	const btn = document.createElement("button") as HTMLButtonElement;
	btn.id = "fb-fullscreen-btn";
	btn.title = "Toggle fullscreen";

	const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
	svg.setAttribute("viewBox", "0 0 24 24");
	svg.setAttribute("fill", "currentColor");
	const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
	path.setAttribute("d", ICON_FULLSCREEN);
	svg.appendChild(path);
	btn.appendChild(svg);

	function updateIcon() {
		path.setAttribute("d", document.fullscreenElement ? ICON_FULLSCREEN_EXIT : ICON_FULLSCREEN);
	}

	btn.addEventListener("click", async () => {
		if (document.fullscreenElement) {
			await (document.exitFullscreen?.() ?? (document as any).webkitExitFullscreen?.());
		} else {
			const el = document.documentElement;
			await (el.requestFullscreen?.() ?? (el as any).webkitRequestFullscreen?.());
		}
	});

	document.addEventListener("fullscreenchange", updateIcon);
	document.addEventListener("webkitfullscreenchange", updateIcon);

	return btn;
}

// ── Relative time ─────────────────────────────────────────────────────────────

export function formatRelativeTime(ms: number): string {
	const s = Math.floor(ms / 1000);
	if (s < 60) return `${s}s`;
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}m`;
	return `${Math.floor(m / 60)}h`;
}

// ── DOM element refs ──────────────────────────────────────────────────────────

interface StationElements {
	teamBtn: HTMLButtonElement;
	teamNumP: HTMLParagraphElement;
	teamWarnP: HTMLParagraphElement;
	dsBtn: HTMLButtonElement;
	radioBtn: HTMLButtonElement;
	rioBtn: HTMLButtonElement;
	batBtn: HTMLButtonElement;
	batPath: SVGPathElement;
	batVal: HTMLDivElement;
	batSub: HTMLParagraphElement;
	pingBtn: HTMLButtonElement;
	pingPath: SVGPathElement;
	pingVal: HTMLDivElement;
	bwuBtn: HTMLButtonElement;
	sigBtn: HTMLButtonElement;
	sigSpan: HTMLSpanElement;
	sigBars: SVGRectElement[];
	lcBtn: HTMLButtonElement;
	netBtn: HTMLButtonElement;
	netPingDiv: HTMLDivElement;
	netBwuDiv: HTMLDivElement;
	netSigDiv: HTMLDivElement;
}

export interface RootElements {
	root: HTMLElement;
	headerMatchDiv: HTMLDivElement;
	headerStateDiv: HTMLDivElement;
	headerTimeSpan: HTMLSpanElement;
	stations: Record<StationKey, StationElements>;
}

// ── DOM builders ──────────────────────────────────────────────────────────────

function makeMetricBtn(extraClass?: string): {
	btn: HTMLButtonElement;
	path: SVGPathElement;
	val: HTMLDivElement;
} {
	const btn = document.createElement("button") as HTMLButtonElement;
	btn.className = `fb-metric fm-sq-h${extraClass ? " " + extraClass : ""}`;

	const graphDiv = document.createElement("div");
	graphDiv.className = "fb-metric-graph";

	const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
	svg.setAttribute("viewBox", "0 0 100 100");
	const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
	svg.appendChild(path);
	graphDiv.appendChild(svg);
	btn.appendChild(graphDiv);

	const val = document.createElement("div") as HTMLDivElement;
	val.className = "fb-metric-val";
	btn.appendChild(val);

	return { btn, path, val };
}

function makeStationCells(alliance: "blue" | "red"): StationElements {
	// ── Team ─────────────────────────────────────────────────────────────────
	const teamBtn = document.createElement("button") as HTMLButtonElement;
	teamBtn.className = `fb-team ${alliance} fm-sq-h`;
	const teamNumP = document.createElement("p") as HTMLParagraphElement;
	const teamWarnP = document.createElement("p") as HTMLParagraphElement;
	teamWarnP.className = "fb-team-warn";
	teamBtn.appendChild(teamNumP);
	teamBtn.appendChild(teamWarnP);

	// ── DS ───────────────────────────────────────────────────────────────────
	const dsBtn = document.createElement("button") as HTMLButtonElement;
	dsBtn.className = "fb-sq ds-0 fm-sq-h";

	// ── Radio ────────────────────────────────────────────────────────────────
	const radioBtn = document.createElement("button") as HTMLButtonElement;
	radioBtn.className = "fb-sq st-0 fm-sq-h";

	// ── RIO ──────────────────────────────────────────────────────────────────
	const rioBtn = document.createElement("button") as HTMLButtonElement;
	rioBtn.className = "fb-sq st-0 fm-sq-h";

	// ── Battery (always visible) ──────────────────────────────────────────────
	const bat = makeMetricBtn();
	const batSub = document.createElement("p") as HTMLParagraphElement;
	batSub.className = "fb-metric-sub";
	bat.btn.appendChild(batSub);

	// ── Ping (desktop only - fb-ping hides it on mobile) ─────────────────────
	const ping = makeMetricBtn("fb-ping");

	// ── BWU (desktop only) ───────────────────────────────────────────────────
	const bwuBtn = document.createElement("button") as HTMLButtonElement;
	bwuBtn.className = "fb-bwu fm-sq-h";

	// ── Signal (desktop only) ────────────────────────────────────────────────
	const sigBtn = document.createElement("button") as HTMLButtonElement;
	sigBtn.className = "fb-signal fm-sq-h";
	const sigSpan = document.createElement("span") as HTMLSpanElement;
	const { svg: sigSvg, bars: sigBars } = makeSignalSvg();
	sigBtn.appendChild(sigSpan);
	sigBtn.appendChild(sigSvg);

	// ── Last Change (desktop only) ───────────────────────────────────────────
	const lcBtn = document.createElement("button") as HTMLButtonElement;
	lcBtn.className = "fb-lastchange fm-sq-h";

	// ── Net (mobile only: ping + bwu + signal combined) ──────────────────────
	const netBtn = document.createElement("button") as HTMLButtonElement;
	netBtn.className = "fb-net fm-sq-h";
	const netPingDiv = document.createElement("div") as HTMLDivElement;
	const netBwuDiv = document.createElement("div") as HTMLDivElement;
	const netSigDiv = document.createElement("div") as HTMLDivElement;
	netBtn.appendChild(netPingDiv);
	netBtn.appendChild(netBwuDiv);
	netBtn.appendChild(netSigDiv);

	return {
		teamBtn, teamNumP, teamWarnP,
		dsBtn, radioBtn, rioBtn,
		batBtn: bat.btn, batPath: bat.path, batVal: bat.val, batSub,
		pingBtn: ping.btn, pingPath: ping.path, pingVal: ping.val,
		bwuBtn,
		sigBtn, sigSpan, sigBars,
		lcBtn,
		netBtn, netPingDiv, netBwuDiv, netSigDiv,
	};
}

export function buildRoot(): RootElements {
	const root = document.createElement("div");
	root.id = "fta-buddy-root";

	// ── Scroll area ───────────────────────────────────────────────────────────
	const scroll = document.createElement("div");
	scroll.id = "fb-scroll";

	const grid = document.createElement("div");
	grid.className = "fb-grid";

	// ── Header span row (match# | field state | time) ─────────────────────────
	const headerRow = document.createElement("div");
	headerRow.className = "fb-span-row";
	const headerMatchDiv = document.createElement("div") as HTMLDivElement;
	headerMatchDiv.className = "fb-left";
	const headerStateDiv = document.createElement("div") as HTMLDivElement;
	headerStateDiv.className = "fb-mid";
	const headerTimeDiv = document.createElement("div") as HTMLDivElement;
	headerTimeDiv.className = "fb-right";
	const headerTimeSpan = document.createElement("span") as HTMLSpanElement;
	headerTimeDiv.appendChild(headerTimeSpan);
	headerRow.appendChild(headerMatchDiv);
	headerRow.appendChild(headerStateDiv);
	headerRow.appendChild(headerTimeDiv);
	grid.appendChild(headerRow);

	// ── Column header <p> elements ────────────────────────────────────────────
	// Always-visible (columns 1-5 on both mobile and desktop)
	for (const label of ["Team", "DS", "Radio", "Rio", "Battery"]) {
		const p = document.createElement("p");
		p.textContent = label;
		grid.appendChild(p);
	}
	// Desktop-only (columns 6-9): use .fb-col-dt for display:none→block at 1024px
	for (const label of ["Ping (ms)", "BWU (mbps)", "Signal (dBm)", "Last Change"]) {
		const p = document.createElement("p");
		p.textContent = label;
		p.className = "fb-col-dt";
		grid.appendChild(p);
	}
	// Mobile-only (column 6 on mobile): use .fb-col-mb for display:block→none at 1024px
	const netP = document.createElement("p");
	netP.textContent = "Net";
	netP.className = "fb-col-mb";
	grid.appendChild(netP);

	// ── Station cells (flat grid - all cells are direct .fb-grid children) ────
	const stationOrder: { key: StationKey; alliance: "blue" | "red" }[] = [
		{ key: "blue1", alliance: "blue" },
		{ key: "blue2", alliance: "blue" },
		{ key: "blue3", alliance: "blue" },
		{ key: "red1", alliance: "red" },
		{ key: "red2", alliance: "red" },
		{ key: "red3", alliance: "red" },
	];

	const stationEls: Partial<Record<StationKey, StationElements>> = {};
	for (const { key, alliance } of stationOrder) {
		const els = makeStationCells(alliance);
		stationEls[key] = els;
		// Append in the same column order as Monitor.svelte / MonitorRow.svelte
		grid.appendChild(els.teamBtn);
		grid.appendChild(els.dsBtn);
		grid.appendChild(els.radioBtn);
		grid.appendChild(els.rioBtn);
		grid.appendChild(els.batBtn);
		grid.appendChild(els.pingBtn);   // fb-ping: hidden mobile, flex desktop
		grid.appendChild(els.bwuBtn);    // fb-bwu: hidden mobile, flex desktop
		grid.appendChild(els.sigBtn);    // fb-signal: hidden mobile, flex desktop
		grid.appendChild(els.lcBtn);     // fb-lastchange: hidden mobile, flex desktop
		grid.appendChild(els.netBtn);    // fb-net: flex mobile, hidden desktop
	}

	scroll.appendChild(grid);
	root.appendChild(scroll);

	return {
		root,
		headerMatchDiv,
		headerStateDiv,
		headerTimeSpan,
		stations: stationEls as Record<StationKey, StationElements>,
	};
}

// ── Per-frame updates ─────────────────────────────────────────────────────────

function updateHeader(els: RootElements, frame: PartialMonitorFrame): void {
	const level =
		frame.level === "Qualification" ? "Qual" :
		frame.level === "Playoff" ? "Playoff" :
		frame.level ?? "";
	els.headerMatchDiv.textContent = frame.match > 0 ? `M: ${frame.match}` : "-";
	els.headerStateDiv.textContent = FIELD_STATE_LABELS[frame.field] ?? "Unknown";
	els.headerTimeSpan.textContent = frame.time ?? "";
}

function updateStation(
	els: StationElements,
	robot: PartialRobotInfo,
	hist: StationHistory,
): void {
	const ds = robot.ds ?? DSState.RED;
	const radio = robot.radio ?? false;
	const rio = robot.rio ?? false;
	const code = robot.code ?? false;
	const radioConnected = robot.radioConnected ?? false;

	// ── Team ──────────────────────────────────────────────────────────────────
	els.teamNumP.textContent = robot.number > 0 ? String(robot.number) : "-";
	els.teamWarnP.textContent = "";  // no server = no badges

	// ── DS ────────────────────────────────────────────────────────────────────
	// ds-N class maps to exact colors in styles.ts (0=red, 1/2=green, 3/4=yellow, 5/6=dark-red, 7=green-600)
	els.dsBtn.className = `fb-sq ds-${ds} fm-sq-h`;
	els.dsBtn.textContent = dsLetter(ds);

	// ── Radio ─────────────────────────────────────────────────────────────────
	// st-1=green-500 (connected), st-0=red-600 (disconnected)
	const radioOk = radio || radioConnected;
	els.radioBtn.className = `fb-sq st-${radioOk ? 1 : 0} fm-sq-h`;
	els.radioBtn.textContent = radioConnected && !radio ? "X" : "";

	// ── RIO ───────────────────────────────────────────────────────────────────
	els.rioBtn.className = `fb-sq st-${rio ? 1 : 0} fm-sq-h`;
	els.rioBtn.textContent = rio && !code ? "X" : "";

	// ── Battery ───────────────────────────────────────────────────────────────
	const bat = robot.battery ?? 0;
	// Exact formula from MonitorRow.svelte line 185-186
	const batAlpha = bat < 11 && bat > 0 ? (-1.5 * bat ** 2 - 6.6 * bat + 255) / 255 : 0;
	els.batBtn.style.backgroundColor = `rgba(255,0,0,${batAlpha})`;
	els.batVal.textContent = bat > 0 ? `${bat.toFixed(1)}v` : "-";
	const batVals = hist.battery.values;
	if (batVals.length >= 2) {
		els.batPath.setAttribute("d", buildSparklinePath(batVals, 6, 14));
	}
	const validBatVals = batVals.filter(v => v > 0);
	if (validBatVals.length > 0) {
		const sorted = [...validBatVals].sort((a, b) => a - b);
		const minBat = sorted[Math.floor(sorted.length * 0.02)] ?? sorted[0];
		els.batSub.textContent = `${minBat.toFixed(1)}v`;
		els.batSub.style.color = minBat < 7.8 ? "#dc2626" : "#9e9e9e";
	} else {
		els.batSub.textContent = "";
	}

	// ── Ping ──────────────────────────────────────────────────────────────────
	const ping = robot.ping ?? 0;
	// Exact formula from MonitorRow.svelte lines 211-215
	const pingAlpha =
		ping >= 20 && ping < 100 ? Math.log10(ping / 25) :
		ping > 100 ? 0.5 : 0;
	els.pingBtn.style.backgroundColor = `rgba(255,0,0,${pingAlpha})`;
	els.pingVal.textContent = ping > 0 ? `${ping}ms` : "-";
	const pingVals = hist.ping.values;
	if (pingVals.length >= 2) {
		const pingMax = Math.max(23, ...pingVals) + 2;
		els.pingPath.setAttribute("d", buildSparklinePath(pingVals, 0, pingMax));
	}

	// ── BWU ───────────────────────────────────────────────────────────────────
	const bwu = robot.bwu ?? 0;
	els.bwuBtn.textContent = bwu > 0 ? bwu.toFixed(2) : "-";

	// ── Signal ────────────────────────────────────────────────────────────────
	const sig = robot.signal ?? 0;
	els.sigSpan.textContent = sig !== 0 ? String(sig) : "";
	updateSignalBars(els.sigBars, sig !== 0 ? sig : null);

	// ── Last Change - only shown when something is disconnected and not bypassed/estoped
	const bypassed = ds === DSState.BYPASS || ds === DSState.ESTOP;
	const somethingDisconnected = ds === DSState.RED || !radio || !rio || !code;
	els.lcBtn.textContent = (!bypassed && somethingDisconnected)
		? formatRelativeTime(Date.now() - hist.lastChangedAt)
		: "";

	// ── Net (mobile combined cell) ────────────────────────────────────────────
	els.netPingDiv.textContent = `${ping} ms`;
	els.netBwuDiv.textContent = bwu > 0 ? bwu.toFixed(2) : "-";
	els.netSigDiv.textContent = sig !== 0 ? `${sig} dBm` : "0 dBm";
}

export function updateAll(
	els: RootElements,
	frame: PartialMonitorFrame,
	history: FrameHistory,
): void {
	updateHeader(els, frame);
	for (const key of STATION_KEYS) {
		const robot = frame[key] as PartialRobotInfo;
		if (robot) updateStation(els.stations[key], robot, history[key]);
	}
}
