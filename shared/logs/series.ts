/**
 * Putting our station log and a team's own logs on one time axis.
 *
 * The station log viewer already plots what FMS saw. A team's Driver Station log
 * and data log are recordings of the same 2 minutes 30 from the other two points
 * of view, so the useful thing is not three charts, it is one chart where
 * "battery sagged" and "FMS saw us drop" line up to the same second.
 *
 * The shared axis is **seconds relative to match start**, because that is the
 * only clock all three sources can be put on:
 *
 * - FMS frames carry a wall clock `timeStamp`.
 * - A Driver Station log carries the laptop's wall clock at the first sample,
 *   then one record per 20 ms control packet, so 50 Hz.
 * - A data log counts microseconds from robot boot, so it needs its `systemTime`
 *   entry (epoch microseconds, written every five seconds) to place itself.
 */

import type { DsLogResult } from "./dslog";
import type { FMSLogFrame } from "../types";

export type SeriesAxis = "volts" | "ms" | "percent" | "db" | "mbps" | "amps" | "bool" | "number";

export interface SeriesDef {
	/**
	 * Multiplier from the parser's units to the unit named above. The DS log
	 * stores utilisation and loss as a fraction, so a "%" series has to be scaled
	 * or the chart plots 0.36 next to an axis that says percent.
	 */
	scale?: number;
	key: string;
	label: string;
	unit?: string;
	axis: SeriesAxis;
	/** Which file this comes out of. */
	from: "fms" | "dslog" | "wpilog" | "csv" | "derived";
	/** Shown by default in the viewer. Everything else is behind the picker. */
	defaultOn?: boolean;
}

export interface SeriesPoint {
	/** Seconds from match start. Negative before the match started. */
	t: number;
	v: number | null;
}

export interface Series {
	def: SeriesDef;
	points: SeriesPoint[];
}

/** What FMS recorded. These already drive the existing station log viewer. */
export const FMS_SERIES: SeriesDef[] = [
	{ key: "fms.battery", label: "Battery (FMS)", unit: "V", axis: "volts", from: "fms", defaultOn: true },
	{ key: "fms.averageTripTime", label: "Trip time (FMS)", unit: "ms", axis: "ms", from: "fms", defaultOn: true },
	{ key: "fms.lostPackets", label: "Lost packets (FMS)", axis: "number", from: "fms", defaultOn: true },
	{ key: "fms.signal", label: "Signal", unit: "dBm", axis: "db", from: "fms" },
	{ key: "fms.noise", label: "Noise", unit: "dBm", axis: "db", from: "fms" },
	{ key: "fms.snr", label: "SNR", unit: "dB", axis: "db", from: "fms" },
	{ key: "fms.dataRateTotal", label: "Bandwidth", unit: "Mbps", axis: "mbps", from: "fms" },
	{ key: "fms.txRate", label: "TX rate", unit: "Mbps", axis: "mbps", from: "fms" },
	{ key: "fms.rxRate", label: "RX rate", unit: "Mbps", axis: "mbps", from: "fms" },
	{ key: "fms.enabled", label: "Enabled (FMS)", axis: "bool", from: "fms" },
	{ key: "fms.brownout", label: "Brownout (FMS)", axis: "bool", from: "fms" },
	{ key: "fms.radioLink", label: "Radio link", axis: "bool", from: "fms", defaultOn: true },
	{ key: "fms.rioLink", label: "RIO link", axis: "bool", from: "fms", defaultOn: true },
	{ key: "fms.dsLinkActive", label: "DS link", axis: "bool", from: "fms" },
];

/** What the team's Driver Station recorded. */
export const DSLOG_SERIES: SeriesDef[] = [
	{ key: "ds.batteryVolts", label: "Battery (DS)", unit: "V", axis: "volts", from: "dslog", defaultOn: true },
	{ key: "ds.tripTimeMs", label: "Trip time (DS)", unit: "ms", axis: "ms", from: "dslog" },
	{
		key: "ds.packetLoss",
		label: "Packet loss (DS)",
		unit: "%",
		axis: "percent",
		from: "dslog",
		defaultOn: true,
		scale: 100,
	},
	{
		key: "ds.cpuUtilization",
		label: "roboRIO CPU",
		unit: "%",
		axis: "percent",
		from: "dslog",
		defaultOn: true,
		scale: 100,
	},
	{ key: "ds.canUtilization", label: "CAN bus", unit: "%", axis: "percent", from: "dslog", scale: 100 },
	{ key: "ds.wifiDb", label: "Radio signal (DS)", unit: "dB", axis: "db", from: "dslog" },
	{ key: "ds.wifiMb", label: "Bandwidth (DS)", unit: "Mbps", axis: "mbps", from: "dslog" },
	{ key: "ds.brownout", label: "Brownout (DS)", axis: "bool", from: "dslog", defaultOn: true },
	{ key: "ds.watchdog", label: "Watchdog", axis: "bool", from: "dslog", defaultOn: true },
	{ key: "ds.robotDisabled", label: "Robot reports disabled", axis: "bool", from: "dslog" },
	{ key: "ds.robotAuto", label: "Robot in auto", axis: "bool", from: "dslog" },
	{ key: "ds.robotTeleop", label: "Robot in teleop", axis: "bool", from: "dslog" },
	{ key: "ds.dsDisabled", label: "DS says disabled", axis: "bool", from: "dslog" },
];

/**
 * Total current out of the battery.
 *
 * Nothing records this directly, so it is summed. The power distribution board's
 * own channels are the right source when the Driver Station log has them, since
 * that is one measurement of everything downstream of the main breaker. Where it
 * does not, the motor controllers' supply currents are summed instead, which
 * misses anything not on a logged controller and is labelled to say so.
 */
export const TOTAL_CURRENT: SeriesDef = {
	key: "total.current",
	label: "Total current",
	unit: "A",
	axis: "amps",
	from: "derived",
};

/**
 * Entries that are a motor's draw from the battery.
 *
 * Supply current is what the breaker sees. Stator and torque current are the
 * motor's phase current, which at low duty cycle runs several times higher, so
 * summing those would report a robot pulling hundreds of amps it never drew.
 */
export function isMotorSupplyCurrent(name: string): boolean {
	if (/Stator|Torque|Stall|PID|Limit|Setpoint|Target/i.test(name)) return false;
	// Phoenix 6 names every device's draw this way, e.g.
	// "Phoenix6/TalonFX-3/SupplyCurrent".
	if (/(^|\/)SupplyCurrent$/.test(name)) return true;
	// REVLib's getOutputCurrent and AdvantageKit's logged equivalent.
	return /(^|\/)(OutputCurrent|CurrentAmps|SupplyCurrentAmps)$/.test(name);
}

/** Power distribution channels are numbered, so their series are generated. */
export function pdChannelSeries(channelCount: number): SeriesDef[] {
	return Array.from({ length: channelCount }, (_, channel) => ({
		key: `ds.pd.${channel}`,
		label: `PD channel ${channel}`,
		unit: "A",
		axis: "amps" as SeriesAxis,
		from: "dslog" as const,
	}));
}

/** A signal from a timestamped CSV, e.g. a REV Hardware Client export. */
export function csvSeriesDef(label: string): SeriesDef {
	return { key: `csv.${label}`, label, axis: "number", from: "csv" };
}

/** A data log entry the team logged themselves, offered by name. */
export function wpilogSeriesDef(entryName: string): SeriesDef {
	return { key: `log.${entryName}`, label: entryName.replace(/^NT:/, ""), axis: "number", from: "wpilog" };
}

function numberFrom(value: unknown): number | null {
	if (typeof value === "number") return Number.isFinite(value) ? value : null;
	if (typeof value === "boolean") return value ? 1 : 0;
	return null;
}

/**
 * One FMS series against match start. `matchStartMs` is the match log's own
 * start time, which is what the rest of the viewer already uses as zero.
 */
export function fmsSeries(frames: FMSLogFrame[], def: SeriesDef, matchStartMs: number): Series {
	const field = def.key.slice("fms.".length) as keyof FMSLogFrame;
	const points = frames.map((frame) => ({
		t: (Date.parse(frame.timeStamp) - matchStartMs) / 1000,
		v: numberFrom(frame[field]),
	}));
	return { def, points };
}

/**
 * One Driver Station series against match start. The DS clock and the FMS clock
 * are different machines, so this can be off by however far the team's laptop
 * clock is out; the viewer says so rather than silently pretending.
 */
export function dsLogSeries(result: DsLogResult, def: SeriesDef, matchStartMs: number): Series {
	if (!result.parsed || result.startTime === null) return { def, points: [] };
	const offsetSecs = result.startTime - matchStartMs / 1000;
	const pd = /^ds\.pd\.(\d+)$/.exec(def.key);
	const field = def.key.slice("ds.".length);
	const scale = def.scale ?? 1;
	const total = def.key === "ds.pd.total";
	const points = result.entries.map((entry) => {
		const raw = total
			? entry.powerDistributionCurrents.length > 0
				? entry.powerDistributionCurrents.reduce((sum, amps) => sum + amps, 0)
				: null
			: pd
				? (entry.powerDistributionCurrents[Number(pd[1])] ?? null)
				: numberFrom((entry as unknown as Record<string, unknown>)[field]);
		return { t: entry.timestamp + offsetSecs, v: raw === null ? null : raw * scale };
	});
	return { def, points };
}

/**
 * One data log entry against match start. `logEpochOffsetSecs` comes from
 * `wpilogClockOffset`; without it the entry cannot be placed on the axis and
 * comes back empty rather than at a made-up time.
 */
export function wpilogSeries(
	samples: { timestamp: number; value: string }[],
	def: SeriesDef,
	logEpochOffsetSecs: number | null,
	matchStartMs: number,
): Series {
	if (logEpochOffsetSecs === null) return { def, points: [] };
	const points = samples.map((sample) => {
		const parsed = sample.value === "true" ? 1 : sample.value === "false" ? 0 : Number(sample.value);
		return {
			t: sample.timestamp / 1e6 + logEpochOffsetSecs - matchStartMs / 1000,
			v: Number.isFinite(parsed) ? parsed : null,
		};
	});
	return { def, points };
}

/**
 * One CSV signal against match start. The CSV's timestamps have to be a wall
 * clock for this to mean anything; a relative time column cannot be placed.
 */
export function csvSeries(
	points: { t: number; v: number }[],
	def: SeriesDef,
	absoluteTime: boolean,
	matchStartMs: number,
): Series {
	if (!absoluteTime) return { def, points: [] };
	return { def, points: points.map((p) => ({ t: p.t - matchStartMs / 1000, v: p.v })) };
}

/**
 * Thin a series for the wire. 50 Hz over a session is hundreds of thousands of
 * points; a phone chart needs hundreds. Keeps the extreme of each bucket rather
 * than the average, because the spike is the whole reason anyone is looking.
 */
export function downsample(points: SeriesPoint[], maxPoints = 1200): SeriesPoint[] {
	if (points.length <= maxPoints) return points;
	const bucketSize = Math.ceil(points.length / maxPoints);
	const out: SeriesPoint[] = [];
	for (let i = 0; i < points.length; i += bucketSize) {
		const bucket = points.slice(i, i + bucketSize).filter((p) => p.v !== null);
		if (bucket.length === 0) {
			out.push(points[i]);
			continue;
		}
		let extreme = bucket[0];
		let span = 0;
		const mean = bucket.reduce((sum, p) => sum + (p.v ?? 0), 0) / bucket.length;
		for (const point of bucket) {
			const distance = Math.abs((point.v ?? 0) - mean);
			if (distance >= span) {
				span = distance;
				extreme = point;
			}
		}
		out.push(extreme);
	}
	return out;
}

/** Window a series to the match, with a little either side for context. */
export function clipToMatch(points: SeriesPoint[], padSecs = 20, matchLengthSecs = 165): SeriesPoint[] {
	return points.filter((p) => p.t >= -padSecs && p.t <= matchLengthSecs + padSecs);
}

/**
 * The two sources do not sample at the same rate, and it matters.
 *
 * A Driver Station log has one record per control packet, and those go out
 * every 20 ms, so it is 50 Hz: a real one here holds 31,107 records over
 * 622.14 s. Field monitor frames arrive a good deal slower than that, so
 * where both record the same quantity the team's own log has the finer time
 * axis, and a sag that arrives as one averaged dip from FMS shows its actual
 * shape in the Driver Station log.
 *
 * Rather than assume either rate, `sampleRateHz` measures what a series actually
 * arrived at, so the chart can label it and the assistant can be told.
 */
export function sampleRateHz(points: SeriesPoint[]): number | null {
	if (points.length < 3) return null;
	const gaps: number[] = [];
	for (let i = 1; i < points.length; i++) {
		const gap = points[i].t - points[i - 1].t;
		if (gap > 0) gaps.push(gap);
	}
	if (gaps.length === 0) return null;
	gaps.sort((a, b) => a - b);
	const median = gaps[Math.floor(gaps.length / 2)];
	return median > 0 ? 1 / median : null;
}

/**
 * Where the team's own log records the same thing as ours, at a higher rate.
 * The value is the series that supersedes the key, and why in one clause.
 */
export const SUPERSEDED_BY: Record<string, { key: string; because: string }> = {
	"fms.battery": { key: "ds.batteryVolts", because: "the Driver Station samples battery at 50 Hz" },
	"fms.averageTripTime": {
		key: "ds.tripTimeMs",
		because: "the Driver Station logs every round trip, FMS logs an average",
	},
	"fms.brownout": { key: "ds.brownout", because: "the Driver Station catches a brownout at 50 Hz" },
	"fms.lostPackets": { key: "ds.packetLoss", because: "the Driver Station records loss as a rate, at 50 Hz" },
};

/**
 * What to show first.
 *
 * When the team gave us a Driver Station log, its version of a quantity replaces
 * ours, because it has the finer time axis. What stays on either way is the
 * field's own view of the link, since that is the thing a battery sag gets
 * compared against: a sag before the field lost the robot is a power problem, a
 * field drop with a flat battery trace is not.
 */
export function defaultSeriesKeys(available: { hasDsLog: boolean }): string[] {
	const keys: string[] = [];
	for (const def of FMS_SERIES) {
		if (!def.defaultOn) continue;
		if (available.hasDsLog && SUPERSEDED_BY[def.key]) continue;
		keys.push(def.key);
	}
	if (available.hasDsLog) {
		for (const def of DSLOG_SERIES) if (def.defaultOn) keys.push(def.key);
	}
	return keys.slice(0, 8);
}
