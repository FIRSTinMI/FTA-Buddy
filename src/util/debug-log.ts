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

/**
 * Categories registered up-front at server boot so admins see switches for
 * them on the debug-logs page even before any code has called `debugLog`.
 * Add new entries here when a new section starts emitting debug logs — the
 * lazy registration below handles ad-hoc cases but boot-time entries are
 * what gives the page a populated set on a fresh deploy.
 */
const KNOWN_CATEGORIES = [
	"cycle",
	"field-monitor",
	"slack",
	"fms",
	"match-events",
	"notifications",
	"general",
];

let enabledCategories = new Set<string>();
let cacheInitialized = false;
const registeredCategories = new Set<string>();

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

async function ensureKnownCategoriesRegistered(): Promise<void> {
	try {
		for (const category of KNOWN_CATEGORIES) {
			await db
				.insert(debugLogCategories)
				.values({ category, enabled: false, updated_at: new Date() })
				.onConflictDoNothing()
				.execute();
			registeredCategories.add(category);
		}
	} catch (err) {
		console.error("[debugLog] failed to register known categories:", err);
	}
}

function registerCategoryLazily(category: string): void {
	if (registeredCategories.has(category)) return;
	registeredCategories.add(category);
	db.insert(debugLogCategories)
		.values({ category, enabled: false, updated_at: new Date() })
		.onConflictDoNothing()
		.execute()
		.catch((err) => console.error(`[debugLog] failed to register ${category}:`, err));
}

let started = false;
export function startDebugLogBackground(): void {
	if (started) return;
	started = true;
	ensureKnownCategoriesRegistered()
		.then(() => refreshCategoryCache())
		.catch(() => {});
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
	// Always make sure the category is registered so it shows up as a switch
	// on the admin page, even if it's currently disabled and we drop the log.
	registerCategoryLazily(opts.category);

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
