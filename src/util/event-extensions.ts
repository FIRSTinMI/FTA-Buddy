import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import type { ExtensionConfigDelivery } from "../../shared/types";
import { db } from "../db/db";
import { events as eventsTable } from "../db/schema";
import { events } from "../state";
import { bus } from "./eventBus";

/**
 * Per-event admin switch for every extension on an event.
 *
 * Source of truth is `events.extensionsEnabled` in Postgres, so it survives a
 * restart and a Redis flush. Each instance keeps it on its in-memory event and
 * in a short cache for events it has not loaded; a change is published on
 * `global:extensions_enabled` so both instances update at once.
 *
 * Enforcement:
 * - New extensions learn it from the heartbeat reply (`remoteDisabled`) and stop
 *   everything but the heartbeat, without touching their own Enable setting.
 * - Old extensions get `{ enabled: false }` on the event's config channel, now
 *   and whenever they (re)subscribe or report state while it is off.
 * - The server refuses field data from extensions for the event while it is off.
 */

// #region Flag

const GLOBAL_CHANNEL = "global:extensions_enabled";
const CACHE_MS = 30_000;
const cache = new Map<string, { enabled: boolean; expires: number }>();

/** True unless an admin switched extensions off for this event. Unknown events count as on. */
export async function getEventExtensionsEnabled(eventCode: string): Promise<boolean> {
	const code = eventCode.toLowerCase();
	const loaded = events[code];
	if (loaded) return loaded.extensionsEnabled !== false;
	const hit = cache.get(code);
	if (hit && hit.expires > Date.now()) return hit.enabled;
	const [row] = await db
		.select({ enabled: eventsTable.extensionsEnabled })
		.from(eventsTable)
		.where(eq(eventsTable.code, code))
		.limit(1)
		.execute();
	const enabled = row?.enabled !== false;
	if (cache.size > 2000) cache.clear();
	cache.set(code, { enabled, expires: Date.now() + CACHE_MS });
	return enabled;
}

/** Codes of every event whose extensions are switched off. */
export async function listEventsWithExtensionsOff(): Promise<{ code: string; name: string }[]> {
	return db
		.select({ code: eventsTable.code, name: eventsTable.name })
		.from(eventsTable)
		.where(eq(eventsTable.extensionsEnabled, false))
		.orderBy(eventsTable.code)
		.execute();
}

/** The config pushed to an extension to stop it for a switched-off event. */
export const REMOTE_DISABLE_PUSH: ExtensionConfigDelivery = { enabled: false, remoteDisabled: true };

/**
 * Switch extensions on or off for an event. Returns false when the event does
 * not exist. Publishes the change for both instances, for open app clients
 * (`event:<code>:extensions_enabled`, read by `event.settings`), and, when
 * switching off, the stop push for extensions on the live config channel.
 */
export async function setEventExtensionsEnabled(eventCode: string, enabled: boolean): Promise<boolean> {
	const code = eventCode.toLowerCase();
	const updated = await db
		.update(eventsTable)
		.set({ extensionsEnabled: enabled })
		.where(eq(eventsTable.code, code))
		.returning({ code: eventsTable.code })
		.execute();
	if (updated.length === 0) return false;
	bus.publish(GLOBAL_CHANNEL, { code, enabled });
	bus.publish(`event:${code}:extensions_enabled`, enabled);
	if (!enabled) bus.publish(`event:${code}:extension-config`, { config: REMOTE_DISABLE_PUSH });
	return true;
}

let synced = false;

/** Keep this instance's loaded events and cache in step with changes made on any instance. */
export function startEventExtensionsSync(): void {
	if (synced) return;
	synced = true;
	bus.subscribe(GLOBAL_CHANNEL, (data) => {
		const { code, enabled } = data as { code: string; enabled: boolean };
		const loaded = events[code];
		if (loaded) loaded.extensionsEnabled = enabled;
		cache.set(code, { enabled, expires: Date.now() + CACHE_MS });
	});
}

// #endregion

// #region Ingest guard

export const EXTENSIONS_OFF_MESSAGE = "Extensions off for this event";

/** Refuse extension data for an event whose extensions are switched off. */
export async function assertExtensionDataAllowed(eventCode: string): Promise<void> {
	if (!(await getEventExtensionsEnabled(eventCode))) {
		throw new TRPCError({ code: "FORBIDDEN", message: EXTENSIONS_OFF_MESSAGE });
	}
}

// #endregion
