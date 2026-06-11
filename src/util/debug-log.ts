import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";
import { db } from "../db/db";
import { debugLogCategories, debugLogs } from "../db/schema";

/**
 * General-purpose persistent debug log. Writes are fire-and-forget so calls
 * on hot paths (frame processing, cycle tracking) never block. Enable/disable
 * per category via the admin page — `debug_log_categories` rows persist
 * across deploys, so toggles set during a real event survive a restart.
 *
 * Cache refresh runs every 5s. Retention pruner keeps the newest 100k rows.
 */

const CACHE_REFRESH_MS = 5_000;
const RETENTION_LIMIT = 100_000;
const RETENTION_INTERVAL_MS = 60_000;

let enabledCategories = new Set<string>();
let cacheInitialized = false;

async function refreshCategoryCache(): Promise<void> {
	try {
		const rows = await db.select().from(debugLogCategories);
		const next = new Set<string>();
		for (const row of rows) {
			if (row.enabled) next.add(row.category);
		}
		enabledCategories = next;
		cacheInitialized = true;
	} catch (err) {
		console.error("[debugLog] category cache refresh failed:", err);
	}
}

async function pruneOldLogs(): Promise<void> {
	try {
		await db.execute(sql`
			DELETE FROM debug_logs
			WHERE id IN (
				SELECT id FROM debug_logs
				ORDER BY timestamp DESC
				OFFSET ${RETENTION_LIMIT}
			)
		`);
	} catch (err) {
		console.error("[debugLog] retention prune failed:", err);
	}
}

let started = false;
export function startDebugLogBackground(): void {
	if (started) return;
	started = true;
	refreshCategoryCache().catch(() => {});
	setInterval(() => refreshCategoryCache().catch(() => {}), CACHE_REFRESH_MS);
	setInterval(() => pruneOldLogs().catch(() => {}), RETENTION_INTERVAL_MS);
}

/** True when a category is currently enabled — useful for skipping expensive payload prep. */
export function isCategoryEnabled(category: string): boolean {
	return enabledCategories.has(category);
}

export interface DebugLogOptions {
	eventCode?: string | null;
	category: string;
	level?: "debug" | "info" | "warn" | "error";
	message: string;
	data?: unknown;
}

/**
 * Write a debug log row. Skips silently when the category is disabled or
 * the cache hasn't loaded yet. Errors during the write are logged to the
 * console but never thrown, so callers can fire-and-forget safely.
 */
export function debugLog(opts: DebugLogOptions): void {
	if (!cacheInitialized) return;
	if (!enabledCategories.has(opts.category)) return;

	db.insert(debugLogs)
		.values({
			id: randomUUID(),
			event_code: opts.eventCode ?? null,
			category: opts.category,
			level: opts.level ?? "info",
			message: opts.message,
			data: opts.data == null ? null : (opts.data as object),
		})
		.execute()
		.catch((err) => console.error("[debugLog] insert failed:", err));
}
