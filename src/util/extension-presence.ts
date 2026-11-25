import { eq } from "drizzle-orm";
import { z } from "zod";
import type {
	AdminExtensionEntry,
	ExtensionConfig,
	ExtensionHeartbeatStats,
	ExtensionPresence,
	ExtensionRunState,
} from "../../shared/types";
import { db } from "../db/db";
import { events as eventsTable } from "../db/schema";
import { eventCodes, events } from "../state";
import { instanceId } from "./leaderLock";
import { redis } from "./redis";

/**
 * Extension presence for the admin dashboard.
 *
 * Production runs two load-balanced instances, so nothing here lives in process
 * memory: every extension heartbeat goes to Redis, and so does the config an
 * admin queues for an extension. Keys:
 *
 * - `ftabuddy:ext:presence:<id>`  JSON {@link ExtensionPresence}, expires 24 h after the last heartbeat
 * - `ftabuddy:ext:presence-index` ZSET id -> lastSeen ms, pruned to the same 24 h
 * - `ftabuddy:ext:pending:<id>`   HASH config key -> JSON value, expires 10 min after the last change
 * - `ftabuddy:ext:legacy:<instanceId>` JSON snapshot of this instance's in-memory
 *   `event.stats.extensions`, rewritten every 20 s, expires after 60 s
 */

// #region Constants

const PRESENCE_PREFIX = "ftabuddy:ext:presence:";
const PRESENCE_INDEX = "ftabuddy:ext:presence-index";
const PENDING_PREFIX = "ftabuddy:ext:pending:";
const LEGACY_PREFIX = "ftabuddy:ext:legacy:";

/** How long an extension stays listable after its last heartbeat. */
export const PRESENCE_TTL_SECONDS = 24 * 60 * 60;
/** How long an admin's queued config waits for a heartbeat to pick it up. */
export const PENDING_TTL_SECONDS = 10 * 60;
/** An extension is online if it sent a heartbeat (or, legacy, a frame/state report) this recently. */
export const ONLINE_WINDOW_MS = 150_000;

const LEGACY_SNAPSHOT_INTERVAL_MS = 20_000;
const LEGACY_SNAPSHOT_TTL_SECONDS = 60;

// #endregion

// #region Schemas

export const extensionConfigSchema = z.object({
	enabled: z.boolean().optional(),
	fieldMonitor: z.boolean().optional(),
	useSignalR: z.boolean().optional(),
	fmsApiEnabled: z.boolean().optional(),
	scoreAutofill: z.boolean().optional(),
	sourceMode: z.enum(["fms", "cheesy"]).optional(),
	cheesyPort: z.number().int().min(1).max(65535).optional(),
});

const epochMs = z.number().int().min(0).max(8_640_000_000_000_000);

export const heartbeatStatsSchema = z.object({
	sourceMode: z.enum(["fms", "cheesy"]).optional(),
	fmsReachable: z.boolean().optional(),
	fmsPingAt: epochMs.optional(),
	fmsApi: z.boolean().optional(),
	realtimeFeed: z.enum(["signalr", "cheesy", "scraping", "off"]).optional(),
	realtimeStatus: z.string().max(40).optional(),
	framesSent: z.number().int().min(0).optional(),
	lastFrameAt: epochMs.optional(),
	lastError: z.string().max(500).optional(),
	lastErrorAt: epochMs.optional(),
	workerStartedAt: epochMs.optional(),
	changed: epochMs.optional(),
});

export const heartbeatInputSchema = z.object({
	extensionId: z.string().min(1).max(64),
	version: z.string().min(1).max(32),
	state: z.enum(["running", "remote-disabled", "disabled", "expired", "no-event"]),
	eventCode: z.string().max(64).optional(),
	config: extensionConfigSchema,
	stats: heartbeatStatsSchema.optional(),
});

export type HeartbeatInput = z.infer<typeof heartbeatInputSchema>;

// #endregion

// #region Pending config

/**
 * Queue a config for an extension. Keys merge with anything already queued, so
 * two quick changes (enable, then switch source) both arrive.
 */
export async function setPendingConfig(extensionId: string, config: ExtensionConfig): Promise<void> {
	const fields: string[] = [];
	for (const [key, value] of Object.entries(config)) {
		if (value !== undefined) fields.push(key, JSON.stringify(value));
	}
	if (fields.length === 0) return;
	const key = PENDING_PREFIX + extensionId;
	await redis
		.multi()
		.hset(key, ...fields)
		.expire(key, PENDING_TTL_SECONDS)
		.exec();
}

/** Parse a stored pending-config hash. Drops fields that no longer validate. */
export function parsePendingHash(hash: Record<string, string> | null | undefined): ExtensionConfig | null {
	if (!hash || Object.keys(hash).length === 0) return null;
	const raw: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(hash)) {
		try {
			raw[key] = JSON.parse(value);
		} catch {
			// a corrupt field is skipped, not fatal
		}
	}
	const parsed = extensionConfigSchema.safeParse(raw);
	if (!parsed.success) {
		console.warn("[ext-presence] dropped invalid pending config:", parsed.error.message);
		return null;
	}
	return Object.keys(parsed.data).length > 0 ? parsed.data : null;
}

/** Read and delete the queued config in one MULTI, so it is delivered at most once. */
export async function takePendingConfig(extensionId: string): Promise<ExtensionConfig | null> {
	const key = PENDING_PREFIX + extensionId;
	const res = await redis.multi().hgetall(key).del(key).exec();
	const [err, hash] = res?.[0] ?? [null, null];
	if (err) throw err;
	return parsePendingHash(hash as Record<string, string> | null);
}

// #endregion

// #region Event code from token

/** Tokens that matched no event, so a bad token does not cost a DB query every minute. */
const unknownTokens = new Map<string, number>();
const UNKNOWN_TOKEN_TTL_MS = 10 * 60_000;

/**
 * Resolve an event token to its code without loading the event into memory
 * (unlike getEvent, which would pull every extension's event onto whichever
 * instance took the heartbeat).
 */
export async function eventCodeForToken(token: string | undefined): Promise<string | null> {
	if (!token) return null;
	const cached = eventCodes[token];
	if (cached) return cached.toLowerCase();
	const miss = unknownTokens.get(token);
	if (miss && miss > Date.now()) return null;
	const row = await db
		.select({ code: eventsTable.code })
		.from(eventsTable)
		.where(eq(eventsTable.token, token))
		.limit(1)
		.execute();
	if (!row[0]) {
		if (unknownTokens.size > 1000) unknownTokens.clear();
		unknownTokens.set(token, Date.now() + UNKNOWN_TOKEN_TTL_MS);
		return null;
	}
	eventCodes[token] = row[0].code;
	return row[0].code.toLowerCase();
}

// #endregion

// #region Heartbeat

/** Build the stored presence record from a heartbeat and the previous record, if any. */
export function buildPresence(
	input: HeartbeatInput,
	server: { eventCode: string | null; ip: string | undefined; userAgent: string | undefined; now: number },
	previous: ExtensionPresence | null,
): ExtensionPresence {
	return {
		id: input.extensionId,
		version: input.version,
		state: input.state,
		eventCode: server.eventCode,
		reportedEventCode: input.eventCode ?? null,
		config: input.config,
		stats: input.stats ?? {},
		ip: server.ip?.split(",")[0].trim().slice(0, 100) ?? null,
		userAgent: server.userAgent?.slice(0, 400) ?? null,
		firstSeen: previous?.firstSeen ?? server.now,
		lastSeen: server.now,
	};
}

function parsePresence(raw: string | null): ExtensionPresence | null {
	if (!raw) return null;
	try {
		return JSON.parse(raw) as ExtensionPresence;
	} catch {
		return null;
	}
}

/**
 * Store one heartbeat and hand back any config an admin queued for this
 * extension. The pending config is read and deleted in the same MULTI as the
 * presence write, so it reaches the extension exactly once.
 */
export async function recordHeartbeat(
	input: HeartbeatInput,
	server: { eventCode: string | null; ip: string | undefined; userAgent: string | undefined; now?: number },
): Promise<ExtensionConfig | null> {
	const now = server.now ?? Date.now();
	const presenceKey = PRESENCE_PREFIX + input.extensionId;
	const pendingKey = PENDING_PREFIX + input.extensionId;
	const previous = parsePresence(await redis.get(presenceKey));
	const presence = buildPresence(input, { ...server, now }, previous);

	const res = await redis
		.multi()
		.set(presenceKey, JSON.stringify(presence), "EX", PRESENCE_TTL_SECONDS)
		.zadd(PRESENCE_INDEX, now, input.extensionId)
		.zremrangebyscore(PRESENCE_INDEX, 0, now - PRESENCE_TTL_SECONDS * 1000)
		.hgetall(pendingKey)
		.del(pendingKey)
		.exec();
	const [err, hash] = res?.[3] ?? [null, null];
	if (err) throw err;
	return parsePendingHash(hash as Record<string, string> | null);
}

/** Read one presence record (used to find an extension's event for a config push). */
export async function getPresence(extensionId: string): Promise<ExtensionPresence | null> {
	return parsePresence(await redis.get(PRESENCE_PREFIX + extensionId));
}

// #endregion

// #region Legacy snapshot

/** One in-memory `event.stats.extensions` entry, flattened for Redis. */
export interface LegacyExtensionSnapshot {
	id: string;
	eventCode: string;
	version: string | null;
	config: ExtensionConfig;
	fmsApi: boolean | null;
	ip: string | null;
	userAgent: string | null;
	connected: number;
	lastFrame: number;
	frames: number;
}

/** This instance's view of every extension attached to an event it has in memory. */
export function snapshotInMemoryExtensions(): LegacyExtensionSnapshot[] {
	const out: LegacyExtensionSnapshot[] = [];
	for (const event of Object.values(events)) {
		for (const ext of event.stats?.extensions ?? []) {
			out.push({
				id: ext.id,
				eventCode: event.code,
				version: ext.version ?? null,
				config: ext.config ?? {},
				fmsApi: ext.fmsApi ?? null,
				ip: ext.ip ?? null,
				userAgent: ext.userAgent ?? null,
				connected: new Date(ext.connected).getTime(),
				lastFrame: new Date(ext.lastFrame).getTime(),
				frames: ext.frames,
			});
		}
	}
	return out;
}

async function publishLegacySnapshot(): Promise<void> {
	const snapshot = snapshotInMemoryExtensions();
	const key = LEGACY_PREFIX + instanceId;
	if (snapshot.length === 0) await redis.del(key);
	else await redis.set(key, JSON.stringify(snapshot), "EX", LEGACY_SNAPSHOT_TTL_SECONDS);
}

let legacyTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Older extensions never heartbeat; the only record of them is the
 * `event.stats.extensions` array in the memory of whichever instance served
 * their frames. Each instance copies its array to Redis every 20 s so the admin
 * list sees both instances. The list can lag reality by up to 20 s.
 */
export function startLegacyExtensionSnapshots(): void {
	if (legacyTimer) return;
	const run = () =>
		publishLegacySnapshot().catch((err) => console.error("[ext-presence] legacy snapshot failed:", err));
	run();
	legacyTimer = setInterval(run, LEGACY_SNAPSHOT_INTERVAL_MS);
}

async function readLegacySnapshots(): Promise<LegacyExtensionSnapshot[]> {
	const keys: string[] = [];
	const stream = redis.scanStream({ match: LEGACY_PREFIX + "*", count: 100 });
	for await (const batch of stream) keys.push(...(batch as string[]));
	// This instance's own memory is fresher than its last snapshot.
	const own = LEGACY_PREFIX + instanceId;
	const others = keys.filter((k) => k !== own);
	const out = snapshotInMemoryExtensions();
	if (others.length === 0) return out;
	const values = await redis.mget(...others);
	for (const raw of values) {
		if (!raw) continue;
		try {
			out.push(...(JSON.parse(raw) as LegacyExtensionSnapshot[]));
		} catch {
			// a torn write is replaced on the next 20 s tick
		}
	}
	return out;
}

/** Event code for an extension known only from an in-memory event (legacy). */
export async function legacyEventCodeFor(extensionId: string): Promise<string | null> {
	const all = await readLegacySnapshots();
	let best: LegacyExtensionSnapshot | null = null;
	for (const s of all) if (s.id === extensionId && (!best || s.lastFrame > best.lastFrame)) best = s;
	return best?.eventCode ?? null;
}

// #endregion

// #region Admin list

/**
 * Merge heartbeat presence with legacy in-memory entries into one row per
 * extension id. Presence wins when both exist. A legacy id seen on several
 * events or instances keeps its most recent sighting.
 */
export function mergeExtensionList(
	presences: ExtensionPresence[],
	legacy: LegacyExtensionSnapshot[],
	pending: Map<string, ExtensionConfig | null>,
	now: number,
): AdminExtensionEntry[] {
	const rows = new Map<string, AdminExtensionEntry>();
	for (const p of presences) {
		rows.set(p.id, {
			id: p.id,
			legacy: false,
			online: now - p.lastSeen <= ONLINE_WINDOW_MS,
			version: p.version,
			state: p.state as ExtensionRunState,
			eventCode: p.eventCode,
			reportedEventCode: p.reportedEventCode,
			config: p.config,
			pendingConfig: pending.get(p.id) ?? null,
			stats: p.stats as ExtensionHeartbeatStats,
			legacyFrames: null,
			ip: p.ip,
			userAgent: p.userAgent,
			firstSeen: p.firstSeen,
			lastSeen: p.lastSeen,
		});
	}
	for (const l of legacy) {
		const existing = rows.get(l.id);
		if (existing && !existing.legacy) continue;
		if (existing && existing.lastSeen >= l.lastFrame) continue;
		rows.set(l.id, {
			id: l.id,
			legacy: true,
			online: now - l.lastFrame <= ONLINE_WINDOW_MS,
			version: l.version,
			state: null,
			eventCode: l.eventCode,
			reportedEventCode: null,
			config: l.config,
			pendingConfig: pending.get(l.id) ?? null,
			stats: l.fmsApi === null ? {} : { fmsApi: l.fmsApi },
			legacyFrames: l.frames,
			ip: l.ip,
			userAgent: l.userAgent,
			firstSeen: l.connected,
			lastSeen: l.lastFrame,
		});
	}
	return [...rows.values()].sort((a, b) => Number(b.online) - Number(a.online) || b.lastSeen - a.lastSeen);
}

/** Every extension seen in the last 24 h plus legacy in-memory ones, newest first, online first. */
export async function listExtensions(now = Date.now()): Promise<AdminExtensionEntry[]> {
	await redis.zremrangebyscore(PRESENCE_INDEX, 0, now - PRESENCE_TTL_SECONDS * 1000);
	const ids = await redis.zrange(PRESENCE_INDEX, 0, -1);
	const legacy = await readLegacySnapshots();
	const allIds = [...new Set([...ids, ...legacy.map((l) => l.id)])];

	const pipeline = redis.pipeline();
	for (const id of ids) pipeline.get(PRESENCE_PREFIX + id);
	for (const id of allIds) pipeline.hgetall(PENDING_PREFIX + id);
	const results = (await pipeline.exec()) ?? [];

	const presences: ExtensionPresence[] = [];
	for (let i = 0; i < ids.length; i++) {
		const p = parsePresence((results[i]?.[1] as string | null) ?? null);
		if (p) presences.push(p);
	}
	const pending = new Map<string, ExtensionConfig | null>();
	for (let i = 0; i < allIds.length; i++) {
		pending.set(allIds[i], parsePendingHash(results[ids.length + i]?.[1] as Record<string, string> | null));
	}
	return mergeExtensionList(presences, legacy, pending, now);
}

// #endregion
