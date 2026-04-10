/**
 * history.ts - Rolling buffer for sparklines + per-station lastChange tracking.
 */

import { DSState, type PartialMonitorFrame, type PartialRobotInfo } from "../../shared/types";

export class RollingBuffer<T> {
	private buf: T[] = [];
	constructor(private readonly size: number) {}

	push(v: T): void {
		this.buf.push(v);
		if (this.buf.length > this.size) this.buf.shift();
	}

	get values(): T[] {
		return this.buf;
	}

	get latest(): T | undefined {
		return this.buf[this.buf.length - 1];
	}
}

export interface StationHistory {
	battery: RollingBuffer<number>;
	ping: RollingBuffer<number>;
	lastChangedAt: number;
	// Track previous values to detect changes
	prevDs: DSState;
	prevRadio: boolean;
	prevRio: boolean;
	prevCode: boolean;
}

function makeStationHistory(): StationHistory {
	return {
		battery: new RollingBuffer(20),
		ping: new RollingBuffer(20),
		lastChangedAt: Date.now(),
		prevDs: DSState.RED,
		prevRadio: false,
		prevRio: false,
		prevCode: false,
	};
}

export type FrameHistory = {
	blue1: StationHistory;
	blue2: StationHistory;
	blue3: StationHistory;
	red1: StationHistory;
	red2: StationHistory;
	red3: StationHistory;
};

export function makeFrameHistory(): FrameHistory {
	return {
		blue1: makeStationHistory(),
		blue2: makeStationHistory(),
		blue3: makeStationHistory(),
		red1: makeStationHistory(),
		red2: makeStationHistory(),
		red3: makeStationHistory(),
	};
}

const STATION_KEYS = ["blue1", "blue2", "blue3", "red1", "red2", "red3"] as const;
type StationKey = typeof STATION_KEYS[number];

export function updateHistory(history: FrameHistory, frame: PartialMonitorFrame): void {
	for (const key of STATION_KEYS) {
		const robot = frame[key] as PartialRobotInfo;
		const hist = history[key];

		hist.battery.push(robot.battery ?? 0);
		hist.ping.push(robot.ping ?? 0);

		const ds = robot.ds ?? DSState.RED;
		const radio = robot.radio ?? false;
		const rio = robot.rio ?? false;
		const code = robot.code ?? false;

		if (ds !== hist.prevDs || radio !== hist.prevRadio || rio !== hist.prevRio || code !== hist.prevCode) {
			hist.lastChangedAt = Date.now();
			hist.prevDs = ds;
			hist.prevRadio = radio;
			hist.prevRio = rio;
			hist.prevCode = code;
		}
	}
}
