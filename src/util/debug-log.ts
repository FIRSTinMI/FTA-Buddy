import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";
import { db } from "../db/db";
import { debugLogs } from "../db/schema";

/**
 * General-purpose persistent debug log. Every call is recorded, whatever its
 * category; categories are free-form strings used for filtering on the admin
 * page. Writes are fire-and-forget so calls on hot paths (frame processing,
 * cycle tracking) never block. A retention pruner keeps the newest 100k rows.
 */

const RETENTION_LIMIT = 100_000;
const RETENTION_INTERVAL_MS = 60_000;

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
	setInterval(() => pruneOldLogs().catch(() => {}), RETENTION_INTERVAL_MS);
}

export interface DebugLogOptions {
	eventCode?: string | null;
	category: string;
	level?: "debug" | "info" | "warn" | "error";
	message: string;
	data?: unknown;
}

/**
 * Write a debug log row. Errors during the write are logged to the console but
 * never thrown, so callers can fire-and-forget safely. Returns the insert so a
 * caller (or a test) can await it when it needs the row to exist.
 */
export function debugLog(opts: DebugLogOptions): Promise<void> {
	return db
		.insert(debugLogs)
		.values({
			id: randomUUID(),
			event_code: opts.eventCode ?? null,
			category: opts.category,
			level: opts.level ?? "info",
			message: opts.message,
			data: opts.data == null ? null : (opts.data as object),
		})
		.execute()
		.then(() => undefined)
		.catch((err) => console.error("[debugLog] insert failed:", err));
}
