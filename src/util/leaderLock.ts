import { randomUUID } from "crypto";
import { redis } from "./redis";

// Unique ID for this server process - used to verify lock ownership before renewing/releasing.
const instanceId = randomUUID();
console.log(`[LeaderLock] Instance ID: ${instanceId}`);

const LOCK_PREFIX = "ftabuddy:lock:";

/**
 * Acquire the lock if unclaimed, or renew it if this instance already owns it.
 * Returns true if this instance holds the lock after the call.
 * Single Lua round-trip - avoids the race between separate acquire and renew calls.
 * Use this for long-running loops where you want to hold leadership continuously.
 */
export async function acquireOrRenewLock(lockName: string, ttlSeconds: number): Promise<boolean> {
	const result = await redis.eval(
		`local owner = redis.call("GET", KEYS[1])
		if owner == false then
			redis.call("SET", KEYS[1], ARGV[1], "EX", ARGV[2])
			return 1
		elseif owner == ARGV[1] then
			redis.call("EXPIRE", KEYS[1], ARGV[2])
			return 1
		else
			return 0
		end`,
		1,
		LOCK_PREFIX + lockName,
		instanceId,
		String(ttlSeconds),
	);
	return result === 1;
}

/**
 * Try to acquire a named distributed lock.
 * Returns true if this instance now holds the lock, false if another instance does.
 * Uses Redis SET NX EX - atomic, no race conditions.
 */
export async function tryAcquireLock(lockName: string, ttlSeconds: number): Promise<boolean> {
	const result = await redis.set(LOCK_PREFIX + lockName, instanceId, "EX", ttlSeconds, "NX");
	return result === "OK";
}

/**
 * Renew a lock this instance already holds, resetting its TTL.
 * Uses a Lua script so the check-and-expire is atomic - prevents extending a lock
 * that expired and was re-acquired by another instance between GET and EXPIRE.
 * Returns false if this instance no longer owns the lock.
 */
export async function renewLock(lockName: string, ttlSeconds: number): Promise<boolean> {
	const result = await redis.eval(
		`if redis.call("GET", KEYS[1]) == ARGV[1] then
			return redis.call("EXPIRE", KEYS[1], ARGV[2])
		else
			return 0
		end`,
		1,
		LOCK_PREFIX + lockName,
		instanceId,
		String(ttlSeconds),
	);
	return result === 1;
}

/**
 * Release a lock - only if this instance owns it.
 * Uses a Lua script so the check-and-delete is atomic - prevents accidentally
 * deleting a lock re-acquired by another instance after expiry.
 */
export async function releaseLock(lockName: string): Promise<void> {
	await redis.eval(
		`if redis.call("GET", KEYS[1]) == ARGV[1] then
			return redis.call("DEL", KEYS[1])
		else
			return 0
		end`,
		1,
		LOCK_PREFIX + lockName,
		instanceId,
	);
}
