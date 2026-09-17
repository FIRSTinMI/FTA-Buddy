/**
 * What a log's file name tells us before anything is decoded.
 *
 * Teams hand over files named by the tool that wrote them, and those names carry
 * real information: a data log renamed by `DataLogManager` after FMS attached
 * holds the event and the match, and a Driver Station log holds the wall clock
 * time the session started.
 */

import type { MatchLevel } from "./match-link";

export interface WpilogFileName {
	/** `FRC` through 2026, `WPILIB` from the 2027 rewrite. */
	prefix: "FRC" | "WPILIB";
	/** UTC, from the name. The writer formats it in UTC. */
	startedAt: Date | null;
	/** Present only once FMS attached and the file was renamed. */
	eventName?: string;
	matchLevel?: MatchLevel;
	matchNumber?: number;
	/** True for the `*_TBD_*` name, which means the DS never attached. */
	tbd: boolean;
}

/**
 * `WPILIB_yyyyMMdd_HHmmss_<event>_<Q|P|E><number>.wpilog`, or the same with the
 * pre-2027 `FRC_` prefix, or `FRC_TBD_<random>.wpilog` when no DS ever attached.
 * The event segment can itself contain underscores, so the match suffix is
 * anchored to the end of the name.
 */
export function parseWpilogFileName(name: string): WpilogFileName | null {
	const base = name.replace(/^.*[/\\]/, "").replace(/\.wpilog$/i, "");
	const tbd = /^(FRC|WPILIB)_TBD_/i.exec(base);
	if (tbd) {
		return { prefix: tbd[1].toUpperCase() as "FRC" | "WPILIB", startedAt: null, tbd: true };
	}
	const m = /^(FRC|WPILIB)_(\d{8})_(\d{6})(?:_(.+)_([PQE])(\d+))?$/.exec(base);
	if (!m) return null;
	const [, prefix, date, time, eventName, typeChar, matchNumber] = m;
	const startedAt = new Date(
		Date.UTC(
			Number(date.slice(0, 4)),
			Number(date.slice(4, 6)) - 1,
			Number(date.slice(6, 8)),
			Number(time.slice(0, 2)),
			Number(time.slice(2, 4)),
			Number(time.slice(4, 6)),
		),
	);
	const level: MatchLevel | undefined =
		typeChar === "P" ? "Practice" : typeChar === "Q" ? "Qualification" : typeChar === "E" ? "Playoff" : undefined;
	return {
		prefix: prefix.toUpperCase() as "FRC" | "WPILIB",
		startedAt: Number.isNaN(startedAt.getTime()) ? null : startedAt,
		eventName: eventName || undefined,
		matchLevel: level,
		matchNumber: matchNumber ? Number(matchNumber) : undefined,
		tbd: false,
	};
}

/**
 * `2026_03_14 09_33_10 Sat.dslog`. The Driver Station writes these in the
 * laptop's local time, which is why linking a DS log to a match uses the
 * timestamp inside the file (also local, but from the same clock) rather than
 * this name. Parsed anyway so the app can label a file the team just picked.
 */
export function parseDsLogFileName(name: string): { startedAtLocal: string; kind: "dslog" | "dsevents" } | null {
	const base = name.replace(/^.*[/\\]/, "");
	const m = /^(\d{4})_(\d{2})_(\d{2}) (\d{2})_(\d{2})_(\d{2})(?: \w{3})?\.(dslog|dsevents)$/i.exec(base);
	if (!m) return null;
	const [, y, mo, d, h, mi, s, ext] = m;
	return { startedAtLocal: `${y}-${mo}-${d}T${h}:${mi}:${s}`, kind: ext.toLowerCase() as "dslog" | "dsevents" };
}

/**
 * A `.dsevents` file names the data log the robot was writing at the time
 * (`DataLog: Logging to '/home/lvuser/logs/FRC_TBD_....wpilog'`), which pairs a
 * DS log with a data log even when the data log kept its `TBD` name.
 */
export function wpilogNameFromDsEvents(texts: string[]): string | null {
	for (const text of texts) {
		const m = /DataLog: Logging to '([^']*?([^/'\\]+\.wpilog))'/.exec(text);
		if (m) return m[2];
	}
	return null;
}

export interface HootFileName {
	/** Event code as Phoenix Tuner saw it, e.g. `INKOK`. */
	eventName: string;
	matchLevel: MatchLevel;
	matchNumber: number;
	/** `rio`, or the CANivore serial the log came off. */
	bus: string;
	/** Local time the log started, as written. Not a UTC instant. */
	startedAtLocal: string;
}

/**
 * `INKOK_Q13_rio_2025-03-15_12-50-36.hoot`, and the same with a CANivore serial
 * in place of `rio`.
 *
 * Phoenix names a Hoot log after the match it was taken in, which is the only
 * place a Hoot says which match it belongs to: the log itself holds CAN device
 * signals and nothing about FMS. So for these the file name is the evidence.
 */
export function parseHootFileName(name: string): HootFileName | null {
	const base = name.replace(/^.*[/\\]/, "").replace(/\.hoot$/i, "");
	const m = /^(.+)_([QEP])(\d+)_(.+)_(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})$/.exec(base);
	if (!m) return null;
	const [, eventName, typeChar, matchNumber, bus, date, h, mi, sec] = m;
	const level: MatchLevel = typeChar === "P" ? "Practice" : typeChar === "Q" ? "Qualification" : "Playoff";
	return {
		eventName,
		matchLevel: level,
		matchNumber: Number(matchNumber),
		bus,
		startedAtLocal: `${date}T${h}:${mi}:${sec}`,
	};
}
