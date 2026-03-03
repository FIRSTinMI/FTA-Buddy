/**
 * Nexus Inspection Poller
 *
 * Polls frc.nexus/api/v1/event/{eventKey}/inspection on a per-event timer.
 * Results are written into the same checklist structure used by the extension,
 * via the same DB update + checklistEmitter path used in router/checklist.ts.
 *
 * In-memory state is stored on ServerEvent.nexus (never persisted to DB).
 * The API key is never written to logs.
 */

import { eq } from "drizzle-orm";
import { ServerEvent } from "../../shared/types";
import { db } from "../db/db";
import { events } from "../db/schema";

const NEXUS_BASE = "https://frc.nexus/api/v1";

/** Interval in ms for normal polling (2 minutes). */
const INTERVAL_NORMAL_MS = 2 * 60 * 1000;

/** Interval in ms when all teams are inspected or when unauthorized (30 minutes). */
const INTERVAL_SLOW_MS = 30 * 60 * 1000;

/** Buffer (in days) added to endDate before stopping the poller. */
const END_DATE_BUFFER_DAYS = 1;

/** In-memory registry: eventCode → scheduled timeout handle. */
const activePollers = new Map<string, ReturnType<typeof setTimeout>>();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Start polling for an event. Safe to call even if already running (will restart). */
export function startForEvent(event: ServerEvent): void {
	if (!event.nexusApiKey) {
		event.nexus.state = "not_configured";
		return;
	}
	stopForEvent(event.code);
	event.nexus.state = "polling";
	event.nexus.intervalMinutes = 2;
	scheduleNext(event, 0); // first poll immediately
}

/** Stop and remove the poller for an event. */
export function stopForEvent(eventCode: string): void {
	const handle = activePollers.get(eventCode);
	if (handle !== undefined) {
		clearTimeout(handle);
		activePollers.delete(eventCode);
	}
}

/** Restart the poller (e.g. after API key change). Resets error state. */
export function restartForEvent(event: ServerEvent): void {
	stopForEvent(event.code);
	if (!event.nexusApiKey) {
		event.nexus.state = "not_configured";
		event.nexus.lastErrorMessage = undefined;
		return;
	}
	// Reset transient error state so the UI reflects the fresh attempt
	event.nexus.lastErrorMessage = undefined;
	event.nexus.lastErrorAt = undefined;
	startForEvent(event);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function scheduleNext(event: ServerEvent, delayMs: number): void {
	const handle = setTimeout(() => pollNexus(event), delayMs);
	activePollers.set(event.code, handle);
}

async function pollNexus(event: ServerEvent): Promise<void> {
	// -- Guard: event window check ------------------------------------------
	if (event.endDate) {
		const endMs = dateStringToMs(event.endDate) + END_DATE_BUFFER_DAYS * 86_400_000;
		if (Date.now() > endMs) {
			event.nexus.state = "event_over";
			stopForEvent(event.code);
			return;
		}
	}

	if (!event.nexusApiKey) {
		event.nexus.state = "not_configured";
		stopForEvent(event.code);
		return;
	}

	// -- Fetch ---------------------------------------------------------------
	let response: Response;
	try {
		response = await fetch(`${NEXUS_BASE}/event/${event.code}/inspection`, {
			headers: { "Nexus-Api-Key": event.nexusApiKey },
		});
	} catch (err: any) {
		event.nexus.state = "error";
		event.nexus.lastErrorAt = new Date();
		event.nexus.lastErrorMessage = err?.message ?? "Network error";
		// Keep polling at current interval
		scheduleNext(event, intervalMs(event));
		return;
	}

	// -- Handle non-2xx responses --------------------------------------------
	if (response.status === 401 || response.status === 403) {
		event.nexus.state = "unauthorized";
		event.nexus.lastErrorAt = new Date();
		event.nexus.lastErrorMessage = `HTTP ${response.status} – check Nexus API key`;
		event.nexus.intervalMinutes = 30;
		scheduleNext(event, INTERVAL_SLOW_MS);
		return;
	}

	if (response.status === 404) {
		// Event not yet live on Nexus; keep normal polling, surface as soft error
		event.nexus.lastErrorAt = new Date();
		event.nexus.lastErrorMessage = `HTTP 404 – event not found on Nexus (may not be live yet)`;
		scheduleNext(event, intervalMs(event));
		return;
	}

	if (response.status >= 500) {
		event.nexus.state = "error";
		event.nexus.lastErrorAt = new Date();
		event.nexus.lastErrorMessage = `HTTP ${response.status} – Nexus server error`;
		scheduleNext(event, intervalMs(event));
		return;
	}

	if (!response.ok) {
		event.nexus.state = "error";
		event.nexus.lastErrorAt = new Date();
		event.nexus.lastErrorMessage = `HTTP ${response.status}`;
		scheduleNext(event, intervalMs(event));
		return;
	}

	// -- Parse and merge -----------------------------------------------------
	let data: Record<string, { inspected: boolean; [k: string]: any }>;
	try {
		data = await response.json();
	} catch (err: any) {
		event.nexus.state = "error";
		event.nexus.lastErrorAt = new Date();
		event.nexus.lastErrorMessage = `Failed to parse Nexus response: ${err?.message}`;
		scheduleNext(event, intervalMs(event));
		return;
	}

	const checklist = event.checklist;
	const updates: { team: string; inspected: boolean }[] = [];

	for (const [teamNum, nexusTeam] of Object.entries(data)) {
		const teamKey = String(teamNum);
		if (!checklist[teamKey]) continue;
		if (Boolean(nexusTeam.inspected) !== checklist[teamKey].inspected) {
			updates.push({ team: teamKey, inspected: Boolean(nexusTeam.inspected) });
		}
	}

	if (updates.length > 0) {
		for (const u of updates) {
			checklist[u.team].inspected = u.inspected;
			// If marking inspected, also mark present (mirrors extension behavior)
			if (u.inspected) {
				checklist[u.team].present = true;
			}
		}

		try {
			await db.update(events).set({ checklist }).where(eq(events.code, event.code));
		} catch (err: any) {
			// Log the error but don't surface key; continue
			console.error(`[Nexus] Failed to persist checklist for ${event.code}:`, err?.message);
		}

		event.checklist = checklist;
		event.checklistEmitter.emit("update", checklist);
	}

	// -- Update poll metadata ------------------------------------------------
	const allInspected = event.teams.every((t) => checklist[String(t.number)]?.inspected === true);

	event.nexus.isAllInspected = allInspected;
	event.nexus.lastSuccessAt = new Date();
	event.nexus.lastErrorMessage = undefined;

	if (allInspected) {
		event.nexus.state = "complete";
		event.nexus.intervalMinutes = 30;
	} else {
		event.nexus.state = "polling";
		event.nexus.intervalMinutes = 2;
	}

	scheduleNext(event, intervalMs(event));
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function intervalMs(event: ServerEvent): number {
	return event.nexus.intervalMinutes === 30 ? INTERVAL_SLOW_MS : INTERVAL_NORMAL_MS;
}

/** Convert a YYYY-MM-DD string to a Unix timestamp (ms) at midnight UTC. */
function dateStringToMs(dateStr: string): number {
	return new Date(dateStr + "T00:00:00Z").getTime();
}
