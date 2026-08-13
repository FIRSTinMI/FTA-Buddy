import { and, eq, isNotNull } from "drizzle-orm";
import { DEFAULT_SLOW_WARNING_SETTINGS } from "../../shared/types";
import type { SlowWarningSettings } from "../../shared/types";
import { db } from "../db/db";
import { events, robotCycleLogs } from "../db/schema";
import { setSlowTeams } from "./event-state";

// #region math helpers

/** Median of a non-empty numeric array (average of the two middle values for even length). */
function median(values: number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Linear-interpolated quantile (same method as numpy's default), q in [0, 1].
 * `sorted` must already be ascending and non-empty.
 */
function quantile(sorted: number[], q: number): number {
	if (sorted.length === 1) return sorted[0];
	const pos = (sorted.length - 1) * q;
	const base = Math.floor(pos);
	const rest = pos - base;
	const next = sorted[base + 1];
	return next !== undefined ? sorted[base] + rest * (next - sorted[base]) : sorted[base];
}

// #endregion

/**
 * Compute the set of teams that are "consistently slow to connect" at this event.
 *
 * Each team is ranked on the MEDIAN of their `time_ready` (ms from prestart-complete to
 * fully connected: DS green + radio + rIO + code) across this event only, since teams change
 * robots and routines between events. Only rows where `time_ready` is populated count — a
 * bypassed / never-ready robot contributes nothing rather than a huge outlier. The threshold
 * mode is read from the event's `slowWarningSettings` so it can be tuned/compared live.
 *
 * Returns an empty set when the warning is disabled or there isn't enough data.
 */
export async function computeSlowTeams(eventCode: string): Promise<Set<number>> {
	const event = await db.query.events.findFirst({
		where: eq(events.code, eventCode),
		columns: { slowWarningSettings: true },
	});

	const cfg: SlowWarningSettings = { ...DEFAULT_SLOW_WARNING_SETTINGS, ...(event?.slowWarningSettings ?? {}) };
	if (!cfg.enabled) return new Set();

	const rows = await db
		.select({ team: robotCycleLogs.team, timeReady: robotCycleLogs.time_ready })
		.from(robotCycleLogs)
		.where(and(eq(robotCycleLogs.event, eventCode), isNotNull(robotCycleLogs.time_ready)));

	// team -> list of time_ready samples
	const byTeam = new Map<number, number[]>();
	for (const r of rows) {
		if (r.timeReady == null) continue;
		const arr = byTeam.get(r.team);
		if (arr) arr.push(r.timeReady);
		else byTeam.set(r.team, [r.timeReady]);
	}

	// team -> median, gated by a minimum sample size
	const teamMedian = new Map<number, number>();
	for (const [team, samples] of byTeam) {
		if (samples.length < cfg.minMatches) continue;
		teamMedian.set(team, median(samples));
	}
	if (teamMedian.size === 0) return new Set();

	const medians = [...teamMedian.values()].sort((a, b) => a - b);
	const slow = new Set<number>();

	if (cfg.mode === "iqr") {
		const q1 = quantile(medians, 0.25);
		const q3 = quantile(medians, 0.75);
		const cutoff = q3 + 1.5 * (q3 - q1);
		for (const [team, m] of teamMedian) if (m >= cutoff) slow.add(team);
	} else {
		// percentile & percentile_floor: slowest (100 - percentile)% of the field
		const cutoff = quantile(medians, Math.min(1, Math.max(0, cfg.percentile / 100)));
		const floor = cfg.mode === "percentile_floor" ? cfg.floorMs : 0;
		for (const [team, m] of teamMedian) if (m >= cutoff && m >= floor) slow.add(team);
	}

	return slow;
}

/** Recompute the SLOW set for an event and write it to the Redis cache. Best-effort. */
export async function refreshSlowTeams(eventCode: string): Promise<void> {
	const slow = await computeSlowTeams(eventCode);
	setSlowTeams(eventCode, slow);
}
