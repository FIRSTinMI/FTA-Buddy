import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { randomUUID } from "crypto";
import {
	deriveExtensionState,
	EXTENSION_EXPIRY_MS,
	expiryRenewed,
	remoteConfigToStorageUpdates,
	remoteSwitchToStorageUpdates,
	shouldDisableForExpiry,
} from "../../shared/extension-state";
import type { ExtensionPresence } from "../../shared/types";

/**
 * Admin dashboard: extension presence, remote config pickup, active users and
 * the season dropdown. Pure functions run as-is; the Redis parts run against a
 * real Redis (REDIS_URL; docker-compose provides one). Postgres is replaced by
 * a recorder so debugLog can be checked without a database.
 */

// #region Fake db for debugLog

const inserted: Record<string, unknown>[] = [];
mock.module("../db/db", () => ({
	db: {
		insert: () => ({
			values: (rows: Record<string, unknown> | Record<string, unknown>[]) => ({
				execute: async () => {
					inserted.push(...(Array.isArray(rows) ? rows : [rows]));
				},
			}),
		}),
	},
}));

// #endregion

let presence: typeof import("../util/extension-presence");
let active: typeof import("../util/active-users");
let season: typeof import("../util/season-events");
let debugLogMod: typeof import("../util/debug-log");
let redis: typeof import("../util/redis").redis;

const createdKeys: string[] = [];

beforeAll(async () => {
	presence = await import("../util/extension-presence");
	active = await import("../util/active-users");
	season = await import("../util/season-events");
	debugLogMod = await import("../util/debug-log");
	redis = (await import("../util/redis")).redis;
});

afterAll(async () => {
	if (createdKeys.length) await redis.del(...createdKeys);
});

// #region Extension state

describe("deriveExtensionState", () => {
	const now = 1_800_000_000_000;
	const base = { enabled: true, remoteDisabled: false, changed: now - 1000, eventToken: "tok", now };

	test("running when enabled, fresh and attached", () => {
		expect(deriveExtensionState(base)).toBe("running");
	});
	test("remote-disabled wins over everything", () => {
		expect(deriveExtensionState({ ...base, remoteDisabled: true, enabled: false })).toBe("remote-disabled");
	});
	test("disabled before expiry and event checks", () => {
		expect(deriveExtensionState({ ...base, enabled: false, changed: 0, eventToken: "" })).toBe("disabled");
	});
	test("expired after four days", () => {
		expect(deriveExtensionState({ ...base, changed: now - EXTENSION_EXPIRY_MS - 1 })).toBe("expired");
	});
	test("no-event without a token", () => {
		expect(deriveExtensionState({ ...base, eventToken: "" })).toBe("no-event");
	});
});

describe("remoteConfigToStorageUpdates", () => {
	const now = 1_800_000_000_000;
	test("keeps only set keys and normalises", () => {
		expect(
			remoteConfigToStorageUpdates(
				{ fieldMonitor: true, cheesyPort: 70000 },
				(v) => (Number(v) > 65535 ? 8080 : Number(v)),
				now,
			),
		).toEqual({ fieldMonitor: true, cheesyPort: 8080 });
	});
	test("ignores the remoteDisabled marker", () => {
		const delivery = { enabled: false, remoteDisabled: true };
		expect(remoteConfigToStorageUpdates(delivery, Number, now)).toEqual({ enabled: false });
	});
	test("a remote enable restarts the expiry, so an extension idle for over four days runs", () => {
		const updates = remoteConfigToStorageUpdates({ enabled: true }, Number, now);
		expect(updates).toEqual({ enabled: true, changed: now });
		const stored = {
			enabled: true,
			remoteDisabled: false,
			changed: now - EXTENSION_EXPIRY_MS - 1,
			eventToken: "tok",
		};
		expect(deriveExtensionState({ ...stored, now })).toBe("expired");
		expect(deriveExtensionState({ ...stored, changed: updates.changed as number, now })).toBe("running");
	});
	test("a remote disable or a config without enabled leaves the expiry alone", () => {
		expect(remoteConfigToStorageUpdates({ enabled: false }, Number, now)).toEqual({ enabled: false });
		expect(remoteConfigToStorageUpdates({ useSignalR: false }, Number, now)).toEqual({ useSignalR: false });
	});
});

describe("remoteSwitchToStorageUpdates", () => {
	const now = 1_800_000_000_000;
	const stale = now - EXTENSION_EXPIRY_MS * 3;
	test("switch-on after more than four days off resumes an enabled extension", () => {
		const updates = remoteSwitchToStorageUpdates(false, true, now);
		expect(updates).toEqual({ remoteDisabled: false, changed: now });
		expect(
			deriveExtensionState({
				enabled: true,
				remoteDisabled: false,
				changed: updates.changed as number,
				eventToken: "tok",
				now,
			}),
		).toBe("running");
	});
	test("switch-on leaves an extension the host disabled disabled, expiry untouched", () => {
		const updates = remoteSwitchToStorageUpdates(false, false, now);
		expect(updates).toEqual({ remoteDisabled: false });
		expect(
			deriveExtensionState({ enabled: false, remoteDisabled: false, changed: stale, eventToken: "tok", now }),
		).toBe("disabled");
	});
	test("switch-off only sets the flag", () => {
		expect(remoteSwitchToStorageUpdates(true, true, now)).toEqual({ remoteDisabled: true });
	});
});

describe("popup expiry", () => {
	const now = 1_800_000_000_000;
	const stale = now - EXTENSION_EXPIRY_MS - 1;
	test("an enabled extension with expired settings is disabled", () => {
		expect(shouldDisableForExpiry({ enabled: true, remoteDisabled: false, changed: stale, now })).toBe(true);
	});
	test("fresh settings, already disabled, or switched off by an admin: no write", () => {
		expect(shouldDisableForExpiry({ enabled: true, remoteDisabled: false, changed: now - 1000, now })).toBe(false);
		expect(shouldDisableForExpiry({ enabled: false, remoteDisabled: false, changed: stale, now })).toBe(false);
		expect(shouldDisableForExpiry({ enabled: true, remoteDisabled: true, changed: stale, now })).toBe(false);
	});
	test("a remote enable that landed after the popup read storage wins", () => {
		// Worker check: newest of the stored `changed` and the one it just wrote for the remote enable.
		const { changed: renewed } = remoteConfigToStorageUpdates({ enabled: true }, Number, now);
		const changed = Math.max(stale, renewed as number);
		expect(shouldDisableForExpiry({ enabled: true, remoteDisabled: false, changed, now })).toBe(false);
	});
	test("a changed write that lifts the expiry restarts the worker; others do not", () => {
		expect(expiryRenewed(stale, now, now)).toBe(true);
		expect(expiryRenewed(now - 1000, now, now)).toBe(false);
		expect(expiryRenewed(stale - 5, stale, now)).toBe(false);
		expect(expiryRenewed(undefined, now, now)).toBe(false);
		expect(expiryRenewed(stale, undefined, now)).toBe(false);
	});
});

// #endregion

// #region Heartbeat and pending config (Redis)

function heartbeatInput(extensionId: string, state: "disabled" | "running" = "disabled") {
	return {
		extensionId,
		version: "1.26.29",
		state,
		config: { enabled: state !== "disabled" },
		stats: { framesSent: 0 },
	} as const;
}

function track(extensionId: string) {
	createdKeys.push(`ftabuddy:ext:presence:${extensionId}`, `ftabuddy:ext:pending:${extensionId}`);
}

describe("heartbeat pending config", () => {
	test("a disabled extension's heartbeat receives a pending { enabled: true } once, then it is cleared", async () => {
		const id = `test-${randomUUID()}`;
		track(id);
		await presence.setPendingConfig(id, { enabled: true });

		const first = await presence.recordHeartbeat(heartbeatInput(id), {
			eventCode: null,
			ip: "1.2.3.4",
			userAgent: "test",
		});
		expect(first).toEqual({ enabled: true });
		expect(await redis.exists(`ftabuddy:ext:pending:${id}`)).toBe(0);

		const second = await presence.recordHeartbeat(heartbeatInput(id), {
			eventCode: null,
			ip: "1.2.3.4",
			userAgent: "test",
		});
		expect(second).toBeNull();
	});

	test("two queued changes merge", async () => {
		const id = `test-${randomUUID()}`;
		track(id);
		await presence.setPendingConfig(id, { enabled: true });
		await presence.setPendingConfig(id, { sourceMode: "cheesy" });
		expect(await presence.takePendingConfig(id)).toEqual({ enabled: true, sourceMode: "cheesy" });
		expect(await presence.takePendingConfig(id)).toBeNull();
	});

	test("pending config expires after 10 minutes", async () => {
		const id = `test-${randomUUID()}`;
		track(id);
		await presence.setPendingConfig(id, { enabled: true });
		const ttl = await redis.ttl(`ftabuddy:ext:pending:${id}`);
		expect(ttl).toBeGreaterThan(590);
		expect(ttl).toBeLessThanOrEqual(600);
	});

	test("presence keeps firstSeen, updates lastSeen, lists as online with server fields", async () => {
		const id = `test-${randomUUID()}`;
		track(id);
		const t0 = Date.now() - 60_000;
		await presence.recordHeartbeat(heartbeatInput(id, "running"), {
			eventCode: "2026test",
			ip: "9.9.9.9, 10.0.0.1",
			userAgent: "UA",
			now: t0,
		});
		await presence.recordHeartbeat(heartbeatInput(id, "running"), {
			eventCode: "2026test",
			ip: "9.9.9.9",
			userAgent: "UA",
			now: t0 + 30_000,
		});
		const list = await presence.listExtensions();
		const row = list.find((r) => r.id === id);
		expect(row).toBeDefined();
		expect(row!.legacy).toBe(false);
		expect(row!.online).toBe(true);
		expect(row!.firstSeen).toBe(t0);
		expect(row!.lastSeen).toBe(t0 + 30_000);
		expect(row!.ip).toBe("9.9.9.9");
		expect(row!.eventCode).toBe("2026test");
		await redis.zrem("ftabuddy:ext:presence-index", id);
	});
});

describe("mergeExtensionList", () => {
	const now = 1_800_000_000_000;
	const p: ExtensionPresence = {
		id: "a",
		version: "1.26.29",
		state: "disabled",
		eventCode: null,
		reportedEventCode: null,
		config: { enabled: false },
		stats: {},
		ip: null,
		userAgent: null,
		firstSeen: now - 1e6,
		lastSeen: now - 200_000,
	};
	const legacy = (id: string, lastFrame: number) => ({
		id,
		eventCode: "2026x",
		version: "1.26.0",
		config: {},
		fmsApi: true,
		ip: null,
		userAgent: null,
		connected: lastFrame - 1000,
		lastFrame,
		frames: 12,
	});

	test("presence wins, legacy-only ids are flagged, online first", () => {
		const rows = presence.mergeExtensionList(
			[p],
			[legacy("a", now), legacy("b", now - 10_000)],
			new Map([["a", { enabled: true }]]),
			now,
		);
		expect(rows.map((r) => r.id)).toEqual(["b", "a"]);
		expect(rows[0]).toMatchObject({ legacy: true, online: true, legacyFrames: 12, state: null });
		expect(rows[1]).toMatchObject({ legacy: false, online: false, pendingConfig: { enabled: true } });
	});
});

// #endregion

// #region Active users

describe("active user buckets", () => {
	const now = Date.UTC(2026, 10, 25, 12, 7, 30);

	test("5-minute window: 1152 ordered buckets ending with the current one", () => {
		const b = active.windowBuckets(now, 5);
		expect(b.length).toBe(1152);
		expect(b[b.length - 1].t).toBe(Date.UTC(2026, 10, 25, 12, 5));
		expect(b[1].t - b[0].t).toBe(300_000);
	});

	test("15-minute window: 384 buckets of three 5-minute parts on quarter hours", () => {
		const b = active.windowBuckets(now, 15);
		expect(b.length).toBe(384);
		expect(b[b.length - 1].t).toBe(Date.UTC(2026, 10, 25, 12, 0));
		expect(b[b.length - 1].parts).toEqual([
			Date.UTC(2026, 10, 25, 12, 0),
			Date.UTC(2026, 10, 25, 12, 5),
			Date.UTC(2026, 10, 25, 12, 10),
		]);
	});

	test("signed-in user beats device id", () => {
		expect(active.activeIdentity(42, "dev-123456")).toBe("u:42");
		expect(active.activeIdentity(null, "dev-123456")).toBe("d:dev-123456");
	});

	test("15-minute buckets count distinct users across the three sets, not a sum", async () => {
		// A quarter hour far in the past of the real clock would fall outside the
		// window, so use the current one, with identities unique to this test.
		const realNow = Date.now();
		const quarter = active.bucketStart(realNow, 15 * 60_000);
		const parts = [quarter, quarter + 300_000, quarter + 600_000];
		for (const t of parts) createdKeys.push(active.activeUsersKey(t), active.activeFieldMonitorsKey(t));

		const before15 = (await active.getActiveUsers(15, realNow)).at(-1)!;
		const u = `u:test-${randomUUID()}`;
		const d = `d:test-${randomUUID()}`;
		// u in all three 5-minute buckets (on the field monitor in one), d in one.
		await active.recordActive(u, true, parts[0]);
		await active.recordActive(u, false, parts[1]);
		await active.recordActive(u, false, parts[2]);
		await active.recordActive(d, false, parts[1]);

		const after15 = (await active.getActiveUsers(15, realNow)).at(-1)!;
		expect(after15.t).toBe(quarter);
		expect(after15.users - before15.users).toBe(2);
		expect(after15.fieldMonitors - before15.fieldMonitors).toBe(1);

		const five = await active.getActiveUsers(5, parts[2]);
		expect(five.length).toBe(1152);
		expect(five.at(-1)!.t).toBe(parts[2]);
		expect(five.every((p) => typeof p.users === "number" && typeof p.fieldMonitors === "number")).toBe(true);
	});

	test("bucket sets expire after 5 days", async () => {
		const t = active.bucketStart(Date.now());
		createdKeys.push(active.activeUsersKey(t));
		await active.recordActive(`u:test-${randomUUID()}`, false, t);
		const ttl = await redis.ttl(active.activeUsersKey(t));
		expect(ttl).toBeGreaterThan(5 * 86400 - 10);
	});
});

// #endregion

// #region Season events

describe("season event codes", () => {
	const row = (code: string, startDate: string | null, endDate: string | null, created: string) => ({
		code,
		name: code.toUpperCase(),
		startDate,
		endDate,
		created_at: new Date(created),
	});

	test("dates first, then code prefix, then creation year", () => {
		expect(season.seasonYear(row("2025abc", "2026-03-01", "2026-03-03", "2025-12-01"))).toBe(2026);
		expect(season.seasonYear(row("2026abc", null, null, "2025-12-01"))).toBe(2026);
		expect(season.seasonYear(row("offseason", null, null, "2026-07-01T00:00:00Z"))).toBe(2026);
	});

	test("filters to the year, newest first, undated last", () => {
		const rows = [
			row("2026a", "2026-03-01", "2026-03-03", "2026-01-01"),
			row("2026b", "2026-10-01", "2026-10-02", "2026-01-01"),
			row("2025z", "2025-03-01", "2025-03-03", "2025-01-01"),
			row("2026nodate", null, null, "2026-05-01"),
		];
		expect(season.filterSeasonEvents(rows, 2026).map((r) => r.code)).toEqual(["2026b", "2026a", "2026nodate"]);
	});
});

// #endregion

// #region Debug log

describe("debugLog", () => {
	test("a never-before-seen category is recorded on its first call", async () => {
		const category = `never-seen-${randomUUID()}`;
		debugLogMod.debugLog({ category, message: "first", eventCode: "2026test" });
		await debugLogMod.flushDebugLogs();
		const row = inserted.find((r) => r.category === category);
		expect(row).toMatchObject({ category, message: "first", event_code: "2026test", level: "info" });
	});
});

// #endregion
