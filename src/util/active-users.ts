import type { ActiveUsersPoint } from "../../shared/types";
import { redis } from "./redis";

/**
 * Active app users over time. Each app heartbeat adds the caller's identity
 * (`u:<userId>` when signed in, else `d:<deviceId>`) to a Redis set for the
 * current 5-minute bucket, and to a second set when the tab was showing the
 * field monitor. Sets expire after 5 days; the chart reads 4.
 */

// #region Bucket math

export const BUCKET_MS = 5 * 60_000;
const KEY_PREFIX = "ftabuddy:active-users:";
const FM_KEY_PREFIX = "ftabuddy:active-field-monitors:";
export const ACTIVE_USERS_KEY_TTL_SECONDS = 5 * 24 * 60 * 60;
export const ACTIVE_USERS_WINDOW_MS = 4 * 24 * 60 * 60_000;

/** Start (epoch ms) of the 5-minute bucket containing `t`. */
export function bucketStart(t: number, sizeMs = BUCKET_MS): number {
	return Math.floor(t / sizeMs) * sizeMs;
}

export function activeUsersKey(bucket: number): string {
	return KEY_PREFIX + bucket;
}

/** Same identities, but only heartbeats sent while the tab showed the field monitor. */
export function activeFieldMonitorsKey(bucket: number): string {
	return FM_KEY_PREFIX + bucket;
}

/**
 * The buckets of the last 4 days ending with the one containing `now`, oldest
 * first. 15-minute buckets are aligned to epoch quarter hours and each holds
 * its three 5-minute buckets.
 */
export function windowBuckets(now: number, bucketMinutes: 5 | 15): { t: number; parts: number[] }[] {
	const size = bucketMinutes * 60_000;
	const count = ACTIVE_USERS_WINDOW_MS / size;
	const last = bucketStart(now, size);
	const out: { t: number; parts: number[] }[] = [];
	for (let i = count - 1; i >= 0; i--) {
		const t = last - i * size;
		const parts: number[] = [];
		for (let p = t; p < t + size; p += BUCKET_MS) parts.push(p);
		out.push({ t, parts });
	}
	return out;
}

/** Identity stored in the bucket set. A resolved user always wins over the device id. */
export function activeIdentity(userId: number | null | undefined, deviceId: string): string {
	return userId != null ? `u:${userId}` : `d:${deviceId}`;
}

// #endregion

// #region Redis

export async function recordActive(identity: string, fieldMonitor: boolean, now = Date.now()): Promise<void> {
	const bucket = bucketStart(now);
	const key = activeUsersKey(bucket);
	const multi = redis.multi().sadd(key, identity).expire(key, ACTIVE_USERS_KEY_TTL_SECONDS);
	if (fieldMonitor) {
		const fmKey = activeFieldMonitorsKey(bucket);
		multi.sadd(fmKey, identity).expire(fmKey, ACTIVE_USERS_KEY_TTL_SECONDS);
	}
	await multi.exec();
}

/**
 * Distinct identities per bucket over the last 4 days, every bucket present
 * (zeros included). One pipelined round trip: SCARD per 5-minute bucket, or
 * SUNION of the three 5-minute sets per 15-minute bucket so a user active in
 * all three counts once.
 */
export async function getActiveUsers(bucketMinutes: 5 | 15, now = Date.now()): Promise<ActiveUsersPoint[]> {
	const buckets = windowBuckets(now, bucketMinutes);
	const pipeline = redis.pipeline();
	for (const b of buckets) {
		for (const keyFor of [activeUsersKey, activeFieldMonitorsKey]) {
			if (b.parts.length === 1) pipeline.scard(keyFor(b.parts[0]));
			else pipeline.sunion(...b.parts.map(keyFor));
		}
	}
	const results = (await pipeline.exec()) ?? [];
	const count = (i: number): number => {
		const [err, value] = results[i] ?? [null, null];
		if (err) throw err;
		return typeof value === "number" ? value : Array.isArray(value) ? value.length : 0;
	};
	return buckets.map((b, i) => ({ t: b.t, users: count(i * 2), fieldMonitors: count(i * 2 + 1) }));
}

// #endregion
