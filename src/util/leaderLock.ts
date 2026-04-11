import { randomUUID } from "crypto";
import { redis } from "./redis";

// Unique ID for this server process — used to verify lock ownership before renewing/releasing.
const instanceId = randomUUID();
console.log(`[LeaderLock] Instance ID: ${instanceId}`);

const LOCK_PREFIX = "ftabuddy:lock:";

/**
 * Try to acquire a named distributed lock.
 * Returns true if this instance now holds the lock, false if another instance does.
 * Uses Redis SET NX EX — atomic, no race conditions.
 */
export async function tryAcquireLock(lockName: string, ttlSeconds: number): Promise<boolean> {
	const result = await redis.set(LOCK_PREFIX + lockName, instanceId, "EX", ttlSeconds, "NX");
	return result === "OK";
}

/**
 * Renew a lock this instance already holds, resetting its TTL.
 * Returns false if another instance has since taken the lock (e.g. after a crash).
 */
export async function renewLock(lockName: string, ttlSeconds: number): Promise<boolean> {
	const owner = await redis.get(LOCK_PREFIX + lockName);
	if (owner !== instanceId) return false;
	await redis.expire(LOCK_PREFIX + lockName, ttlSeconds);
	return true;
}

/**
 * Release a lock — only if this instance owns it.
 */
export async function releaseLock(lockName: string): Promise<void> {
	const owner = await redis.get(LOCK_PREFIX + lockName);
	if (owner === instanceId) await redis.del(LOCK_PREFIX + lockName);
}
