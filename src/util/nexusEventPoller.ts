/**
 * Nexus Event Status Poller
 *
 * Fetches frc.nexus/api/v1/event/{eventKey} to get the live match schedule and
 * nowQueuing status. This is used as a fallback data source when FMS field monitor
 * data is unavailable (notepadOnly events or when the extension is not connected).
 *
 * The webhook endpoint (POST /api/nexus/event-status) is the primary update path.
 * This poller serves as:
 *   1. Initial fetch on server startup / API key configuration
 *   2. Slow fallback every 10 minutes to recover from missed webhooks
 *
 * In-memory state is stored on ServerEvent.nexusEventStatus (never persisted to DB).
 * The API key is never written to logs.
 */

import type { NexusEventStatus, ServerEvent } from "../../shared/types";
import { bus } from "./eventBus";

const NEXUS_BASE = "https://frc.nexus/api/v1";

/** Fallback poll interval in ms (10 minutes - webhooks are the primary mechanism). */
const FALLBACK_INTERVAL_MS = 10 * 60 * 1000;

/** In-memory registry: eventCode → scheduled timeout handle. */
const activePollers = new Map<string, ReturnType<typeof setTimeout>>();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Track events already subscribed: eventCode → bus unsubscribe fn. */
const subscribedEvents = new Map<string, () => void>();

function subscribeToStatusUpdates(event: ServerEvent): void {
	if (subscribedEvents.has(event.code)) return;
	const unsub = bus.subscribe(`event:${event.code}:nexus_event_status`, (data) => {
		const status = data as NexusEventStatus;
		if (status.dataAsOfTime > (event.nexusEventStatus?.dataAsOfTime ?? 0)) {
			event.nexusEventStatus = status;
		}
	});
	subscribedEvents.set(event.code, unsub);
}

/** Fetch event status once and store in event.nexusEventStatus. */
export async function fetchOnce(event: ServerEvent): Promise<void> {
	subscribeToStatusUpdates(event);
	if (!event.nexusApiKey) return;

	let response: Response;
	try {
		response = await fetch(`${NEXUS_BASE}/event/${event.code}`, {
			headers: { "Nexus-Api-Key": event.nexusApiKey },
			signal: AbortSignal.timeout(10_000),
		});
	} catch (err: any) {
		console.warn(`[NexusEvent] Network error fetching status for ${event.code}:`, err?.message);
		return;
	}

	if (response.status === 401 || response.status === 403) {
		console.warn(`[NexusEvent] HTTP ${response.status} for ${event.code} – check Nexus API key`);
		return;
	}

	if (response.status === 404) {
		// Event not yet live on Nexus; not an error
		return;
	}

	if (!response.ok) {
		console.warn(`[NexusEvent] HTTP ${response.status} for ${event.code}`);
		return;
	}

	let data: { dataAsOfTime: number; nowQueuing?: string | null; matches?: NexusEventStatus["matches"] };
	try {
		data = await response.json();
	} catch (err: any) {
		console.warn(`[NexusEvent] Failed to parse response for ${event.code}:`, err?.message);
		return;
	}

	// Only update if this data is newer than what we already have
	if (data.dataAsOfTime <= (event.nexusEventStatus?.dataAsOfTime ?? 0)) return;

	event.nexusEventStatus = {
		dataAsOfTime: data.dataAsOfTime,
		nowQueuing: data.nowQueuing ?? null,
		matches: data.matches ?? [],
	};
	bus.publish(`event:${event.code}:nexus_event_status`, event.nexusEventStatus);
}

/** Start the 10-minute fallback poller for an event. Safe to call if already running (restarts). */
export function startFallbackPoller(event: ServerEvent): void {
	stopForEvent(event.code);
	if (!event.nexusApiKey) return;
	scheduleNext(event);
}

/** Stop the fallback poller for an event and clean up bus subscription. */
export function stopForEvent(eventCode: string): void {
	const handle = activePollers.get(eventCode);
	if (handle !== undefined) {
		clearTimeout(handle);
		activePollers.delete(eventCode);
	}
	const unsub = subscribedEvents.get(eventCode);
	if (unsub) {
		unsub();
		subscribedEvents.delete(eventCode);
	}
}

/** Restart: stop poller, fetch immediately, then restart poller. */
export async function restartForEvent(event: ServerEvent): Promise<void> {
	stopForEvent(event.code);
	if (!event.nexusApiKey) {
		event.nexusEventStatus = undefined;
		return;
	}
	await fetchOnce(event);
	startFallbackPoller(event);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function scheduleNext(event: ServerEvent): void {
	const handle = setTimeout(async () => {
		await fetchOnce(event);
		// Re-schedule only if still active
		if (activePollers.has(event.code)) {
			scheduleNext(event);
		}
	}, FALLBACK_INTERVAL_MS);
	activePollers.set(event.code, handle);
}
