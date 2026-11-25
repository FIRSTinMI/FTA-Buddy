import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";
import { db } from "../db/db";
import { debugLogs } from "../db/schema";

/**
 * General-purpose persistent debug log. Every call is recorded, whatever its
 * category; categories are free-form strings used for filtering on the admin
 * page. Writes are fire-and-forget so calls on hot paths (frame processing,
 * cycle tracking) never block. Rows are buffered in memory and
 * written in multi-row inserts (see the Buffer region); retention is a size cap (see Retention).
 *
 * Categories (keep new calls consistent with these):
 * - slack: Slack message/thread sync, send failures, OAuth, link/unlink, bot not in channel
 * - notifications: web push send failures, expired subscription removal, who was targeted
 * - nexus: Nexus poll state changes, fetch failures, webhook received, key rejected
 * - fms: extension to server ingest (note sync, match log import, schedule/team sync,
 *   FMS password fetch) and posts refused while an event's extensions are switched off
 * - match-events: automatic match-event detection (created, converted, dismissed, rule that fired)
 * - field-monitor: extension connect/first frame, extension stale, frame gaps, client subscribers
 * - auth: token verification failures, profile create/backfill, admin-only access refused
 * - event: event create, join failures, archive refusal, settings changes
 * - general: server start, migration result, leader-lock changes, background job failures
 * - <area>-payload (nexus-payload, slack-payload, fms-payload, tba-payload, ...): sampled raw inbound
 *   JSON from integrations, see payload-log.ts; retention is the size cap only
 * - client-error / extension-error: JavaScript errors reported by the web app and the extension
 * - cycle: cycle tracking from frame processing
 * - extension-admin: admin remote control of extensions
 *
 * Levels: error = something failed and data may be missing; warn = degraded or
 * retried; info = state change; debug = detail for investigations only.
 * Log state changes and failures, never per-frame or per-request steady state.
 * Never put secrets (keys, tokens, passwords, push endpoints) or large payloads in data.
 */

// #region Buffer

/**
 * `debugLog` never touches the database on the caller's path: it appends to an
 * in-memory buffer. The buffer is written as one multi-row INSERT every
 * FLUSH_INTERVAL_MS, or as soon as it holds FLUSH_AT_ROWS rows. It is bounded:
 * past MAX_BUFFER_ROWS the oldest debug-level row (else the oldest row) is
 * dropped and counted; the count is written as a warn row on the next flush.
 * A failed write is printed to the console and the rows are discarded, so a
 * database fault can never grow memory or stall a request.
 */

const FLUSH_INTERVAL_MS = 1_000;
const FLUSH_AT_ROWS = 200;
const MAX_BUFFER_ROWS = 5_000;
const INSERT_BATCH_ROWS = 100;

type DebugLogRow = typeof debugLogs.$inferInsert;

let buffer: DebugLogRow[] = [];
let dropped = 0;
let flushing: Promise<void> | null = null;
let flushTimer: ReturnType<typeof setInterval> | null = null;

function ensureFlushTimer(): void {
	if (flushTimer) return;
	flushTimer = setInterval(() => void flushDebugLogs(), FLUSH_INTERVAL_MS);
	(flushTimer as { unref?: () => void }).unref?.();
}

function dropOne(): void {
	const i = buffer.findIndex((r) => r.level === "debug");
	buffer.splice(i === -1 ? 0 : i, 1);
	dropped++;
}

/** Write everything buffered now. Resolves when the rows are written (or have failed and been logged). */
export function flushDebugLogs(): Promise<void> {
	if (flushing) return flushing.then(() => (buffer.length ? flushDebugLogs() : undefined));
	// Before the database is connected (early boot) rows wait in the buffer.
	if (buffer.length === 0 || !db) return Promise.resolve();
	flushing = (async () => {
		try {
			if (dropped > 0) {
				buffer.push({
					id: randomUUID(),
					event_code: null,
					category: "general",
					level: "warn",
					message: `Debug log buffer full: dropped ${dropped} rows`,
					data: { dropped },
				});
				dropped = 0;
			}
			const rows = buffer;
			buffer = [];
			for (let i = 0; i < rows.length; i += INSERT_BATCH_ROWS) {
				try {
					await db
						.insert(debugLogs)
						.values(rows.slice(i, i + INSERT_BATCH_ROWS))
						.execute();
				} catch (err) {
					console.error(
						`[debugLog] insert of ${Math.min(INSERT_BATCH_ROWS, rows.length - i)} rows failed:`,
						err,
					);
				}
			}
		} finally {
			flushing = null;
		}
	})();
	return flushing;
}

// #endregion

// #region Retention

/**
 * Retention is a size cap only, no time limit. Every 10 minutes (on one
 * instance: a Redis lock with a TTL just under the interval) the pruner
 * estimates the LIVE size of the table; above DEBUG_LOG_MAX_BYTES (default
 * 6 GiB) it deletes the oldest rows, in batches of 2,000 so no statement holds
 * a long lock, down to DEBUG_LOG_TARGET_BYTES (default 5.5 GiB) so it does not
 * run again on the next tick.
 *
 * Why the estimate: DELETE does not shrink the table file. Deleted rows become
 * dead tuples; autovacuum makes their space reusable but the file (and
 * `pg_total_relation_size`) stays the same size. Comparing the file size with the
 * cap would therefore keep deleting forever. Live size is estimated instead as
 * live rows (`pg_stat_user_tables.n_live_tup`, which drops as soon as rows are
 * deleted) times the average row size (a 1 % block sample of `data`, `message`
 * and the fixed columns, plus an allowance for the indexes). The file size is
 * only reported in the warn row. The row count is an estimate and can be wrong,
 * so when it says the table is over the cap the pruner counts exactly and plans
 * again before it deletes anything.
 *
 * Order: `*-payload` rows first (they are large and low value once old), each
 * payload category oldest-first through its (category, timestamp) index, then,
 * if that is not enough, plain oldest-first through the timestamp index.
 */

const GIB = 1024 ** 3;
export const DEFAULT_MAX_BYTES = 6 * GIB;
export const DEFAULT_TARGET_BYTES = 5.5 * GIB;
/** Index entries and tuple headers per row, on top of the sampled column sizes. */
const ROW_OVERHEAD_BYTES = 200;
const RETENTION_INTERVAL_MS = 10 * 60_000;
const PRUNE_BATCH = 2_000;
const PRUNE_MAX_BATCHES = 50;

export function retentionLimits(env: Record<string, string | undefined> = process.env): {
	maxBytes: number;
	targetBytes: number;
} {
	const maxBytes = Number(env.DEBUG_LOG_MAX_BYTES) > 0 ? Number(env.DEBUG_LOG_MAX_BYTES) : DEFAULT_MAX_BYTES;
	const envTarget = Number(env.DEBUG_LOG_TARGET_BYTES);
	const targetBytes =
		envTarget > 0 && envTarget < maxBytes
			? envTarget
			: maxBytes === DEFAULT_MAX_BYTES
				? DEFAULT_TARGET_BYTES
				: Math.floor(maxBytes * (DEFAULT_TARGET_BYTES / DEFAULT_MAX_BYTES));
	return { maxBytes, targetBytes };
}

/** How many of the oldest rows to delete. Zero at or under the cap. Pure, so it is tested directly. */
export function planPrune(input: { liveRows: number; avgRowBytes: number; maxBytes: number; targetBytes: number }): {
	liveBytes: number;
	rowsToDelete: number;
} {
	const { liveRows, avgRowBytes, maxBytes, targetBytes } = input;
	if (!(liveRows > 0) || !(avgRowBytes > 0)) return { liveBytes: 0, rowsToDelete: 0 };
	const liveBytes = liveRows * (avgRowBytes + ROW_OVERHEAD_BYTES);
	if (liveBytes <= maxBytes) return { liveBytes, rowsToDelete: 0 };
	const rowsToDelete = Math.min(liveRows, Math.ceil((liveBytes - targetBytes) / (avgRowBytes + ROW_OVERHEAD_BYTES)));
	return { liveBytes, rowsToDelete };
}

/** Delete up to `limit` rows matching `where`, oldest first, in batches. Returns rows deleted. */
async function deleteOldest(where: ReturnType<typeof sql>, limit: number): Promise<number> {
	let total = 0;
	for (let i = 0; i < PRUNE_MAX_BATCHES && total < limit; i++) {
		const take = Math.min(PRUNE_BATCH, limit - total);
		const res = await db.execute(sql`
			DELETE FROM debug_logs
			WHERE id IN (SELECT id FROM debug_logs WHERE ${where} ORDER BY timestamp ASC LIMIT ${take})
		`);
		const n = res.rowCount ?? 0;
		total += n;
		if (n < take) break;
		await new Promise((r) => setTimeout(r, 50));
	}
	return total;
}

export async function pruneOldLogs(): Promise<{ deleted: number; rowsToDelete: number }> {
	try {
		const { maxBytes, targetBytes } = retentionLimits();
		const stats = await db.execute(sql`
			SELECT
				(SELECT n_live_tup FROM pg_stat_user_tables WHERE relname = 'debug_logs')::float8 AS live_rows,
				pg_total_relation_size('debug_logs')::float8 AS file_bytes,
				(SELECT avg(coalesce(pg_column_size(data), 0) + pg_column_size(message) + 80)
				   FROM debug_logs TABLESAMPLE SYSTEM (1))::float8 AS avg_row
		`);
		const row = stats.rows[0] as
			| { live_rows: number | null; file_bytes: number; avg_row: number | null }
			| undefined;
		const avgRowBytes = Number(row?.avg_row ?? 0);
		let plan = planPrune({ liveRows: Number(row?.live_rows ?? 0), avgRowBytes, maxBytes, targetBytes });
		if (plan.rowsToDelete === 0) return { deleted: 0, rowsToDelete: 0 };
		// `n_live_tup` is only an estimate and can be far off after bulk deletes or an ANALYZE of a table
		// full of dead tuples. Before deleting anything, count exactly (an index-only scan, and only
		// when the estimate says the table is over its cap) and plan again from that.
		const exact = await db.execute(sql`SELECT count(*)::float8 AS n FROM debug_logs`);
		plan = planPrune({ liveRows: Number((exact.rows[0] as { n: number }).n), avgRowBytes, maxBytes, targetBytes });
		if (plan.rowsToDelete === 0) return { deleted: 0, rowsToDelete: 0 };

		let deleted = 0;
		const cats = (await listLogCategories(true)).filter((c) => c.endsWith("-payload"));
		const perCategory = Math.ceil(plan.rowsToDelete / Math.max(1, cats.length));
		for (const category of cats) {
			deleted += await deleteOldest(sql`category = ${category}`, perCategory);
		}
		if (deleted < plan.rowsToDelete) deleted += await deleteOldest(sql`true`, plan.rowsToDelete - deleted);

		debugLog({
			category: "general",
			level: "warn",
			message: `debug_logs over its size cap: removed ${deleted} oldest rows`,
			data: {
				estimatedLiveBytes: Math.round(plan.liveBytes),
				fileBytes: row?.file_bytes,
				maxBytes,
				targetBytes,
				deleted,
				note: "file size stays high until autovacuum reuses the space",
			},
		});
		return { deleted, rowsToDelete: plan.rowsToDelete };
	} catch (err) {
		console.error("[debugLog] retention prune failed:", err);
		return { deleted: 0, rowsToDelete: 0 };
	}
}

let started = false;
export function startDebugLogBackground(): void {
	if (started) return;
	started = true;
	ensureFlushTimer();
	const tick = async () => {
		try {
			// Only one instance prunes per interval. Loaded lazily: redis needs REDIS_URL at import.
			const { tryAcquireLock } = await import("./leaderLock");
			if (!(await tryAcquireLock("debug_log_prune", Math.floor(RETENTION_INTERVAL_MS / 1000) - 30))) return;
			await pruneOldLogs();
		} catch (err) {
			console.error("[debugLog] prune tick failed:", err);
		}
	};
	const t = setInterval(() => void tick(), RETENTION_INTERVAL_MS);
	(t as { unref?: () => void }).unref?.();
	setTimeout(() => void tick(), 60_000).unref?.();
}

// #endregion

// #region Categories

let categoryCache: { at: number; list: string[] } | null = null;
const CATEGORY_CACHE_MS = 30_000;

/**
 * Distinct categories without scanning the table: a recursive "skip scan" that
 * jumps from one category to the next through the (category, timestamp) index,
 * so cost is one index probe per category, not per row.
 */
export async function listLogCategories(fresh = false): Promise<string[]> {
	if (!fresh && categoryCache && Date.now() - categoryCache.at < CATEGORY_CACHE_MS) return categoryCache.list;
	const res = await db.execute(sql`
		WITH RECURSIVE t AS (
			(SELECT category FROM debug_logs ORDER BY category LIMIT 1)
			UNION ALL
			SELECT (SELECT category FROM debug_logs WHERE category > t.category ORDER BY category LIMIT 1)
			FROM t WHERE t.category IS NOT NULL
		)
		SELECT category FROM t WHERE category IS NOT NULL
	`);
	const list = (res.rows as { category: string }[]).map((r) => r.category).sort((a, b) => a.localeCompare(b));
	categoryCache = { at: Date.now(), list };
	return list;
}

// #endregion

export interface DebugLogOptions {
	eventCode?: string | null;
	category: string;
	level?: "debug" | "info" | "warn" | "error";
	message: string;
	data?: unknown;
}

/**
 * Record a log row. Appends to the in-memory buffer and returns at once; the
 * database write happens on the next flush (within about a second). Never
 * throws. The returned promise is already resolved: await `flushDebugLogs()`
 * when a caller (or a test) needs the row written.
 */
export function debugLog(opts: DebugLogOptions): Promise<void> {
	try {
		if (buffer.length >= MAX_BUFFER_ROWS) dropOne();
		buffer.push({
			id: randomUUID(),
			event_code: opts.eventCode ?? null,
			category: opts.category,
			level: opts.level ?? "info",
			message: opts.message,
			data: opts.data == null ? null : (opts.data as object),
		});
		ensureFlushTimer();
		if (buffer.length >= FLUSH_AT_ROWS && !flushing) setImmediate(() => void flushDebugLogs());
	} catch (err) {
		console.error("[debugLog] buffer failed:", err);
	}
	return Promise.resolve();
}

/** Test helper: rows currently waiting to be written. */
export function pendingDebugLogRows(): number {
	return buffer.length;
}

const lastState = new Map<string, string>();

/**
 * Log only when `state` differs from the last state logged under `key`, so a
 * condition that persists (for example a failing poll) is recorded once, not on
 * every retry. Returns true when a row was written.
 */
export function debugLogOnChange(key: string, state: string, opts: DebugLogOptions): boolean {
	if (lastState.get(key) === state) return false;
	lastState.set(key, state);
	debugLog(opts);
	return true;
}

/** Forget a key so the next state is always logged (for example when an event is torn down). */
export function resetDebugLogState(key: string): void {
	lastState.delete(key);
}

const throttleState = new Map<string, { lastAt: number; suppressed: number }>();
const THROTTLE_MAX_KEYS = 1000;

/**
 * Log at most once per `intervalMs` for `key`. Calls inside the window are
 * counted and the count is added to the next row as `suppressed` (when `data`
 * is an object or absent). For failures that can repeat on every request, such
 * as an expired token. Returns true when a row was written.
 */
export function debugLogThrottled(key: string, intervalMs: number, opts: DebugLogOptions, now = Date.now()): boolean {
	const entry = throttleState.get(key);
	if (entry && now - entry.lastAt < intervalMs) {
		entry.suppressed++;
		return false;
	}
	const suppressed = entry?.suppressed ?? 0;
	if (!entry && throttleState.size >= THROTTLE_MAX_KEYS) {
		const oldest = throttleState.keys().next().value;
		if (oldest !== undefined) throttleState.delete(oldest);
	}
	throttleState.set(key, { lastAt: now, suppressed: 0 });
	const base = opts.data == null ? {} : typeof opts.data === "object" ? (opts.data as object) : { value: opts.data };
	debugLog(suppressed > 0 ? { ...opts, data: { ...base, suppressed } } : opts);
	return true;
}

/** Test helper: clear throttle and change state. */
export function resetDebugLogHelpers(): void {
	throttleState.clear();
	lastState.clear();
}
