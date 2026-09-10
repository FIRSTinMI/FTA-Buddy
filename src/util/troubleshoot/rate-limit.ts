import { TRPCError } from "@trpc/server";
import { redis } from "../redis";

// Fixed windows keyed by the bucket start. INCR then EXPIRE on first hit.
const RL_PREFIX = "ftabuddy:troubleshoot:rl:";

export const RATE_LIMITS = {
	userPerHour: 30,
	userPerDay: 150,
	globalPerDay: 3000,
} as const;

function hourBucket(d: Date): string {
	return d.toISOString().slice(0, 13); // YYYY-MM-DDTHH
}
function dayBucket(d: Date): string {
	return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

async function bump(key: string, ttlSeconds: number): Promise<number> {
	const n = await redis.incr(key);
	if (n === 1) await redis.expire(key, ttlSeconds);
	return n;
}

/**
 * Count one turn against the user's hourly and daily limits and the global daily
 * limit. Throws TOO_MANY_REQUESTS when any limit is exceeded. Counters are bumped
 * before the check, so a rejected turn still counts; this keeps the check atomic
 * enough without a Lua script.
 */
export async function assertRateLimit(userId: number): Promise<void> {
	const now = new Date();
	const [hour, day, global] = await Promise.all([
		bump(`${RL_PREFIX}user:${userId}:h:${hourBucket(now)}`, 3600 + 60),
		bump(`${RL_PREFIX}user:${userId}:d:${dayBucket(now)}`, 86400 + 60),
		bump(`${RL_PREFIX}global:d:${dayBucket(now)}`, 86400 + 60),
	]);
	if (hour > RATE_LIMITS.userPerHour) {
		throw new TRPCError({
			code: "TOO_MANY_REQUESTS",
			message: `You have sent ${RATE_LIMITS.userPerHour} messages this hour. Wait a bit, or find a CSA.`,
		});
	}
	if (day > RATE_LIMITS.userPerDay) {
		throw new TRPCError({
			code: "TOO_MANY_REQUESTS",
			message: `You have reached today's limit of ${RATE_LIMITS.userPerDay} messages. Try again tomorrow, or find a CSA.`,
		});
	}
	if (global > RATE_LIMITS.globalPerDay) {
		throw new TRPCError({
			code: "TOO_MANY_REQUESTS",
			message: "The assistant is busy today and has reached its daily limit. Find a CSA for help.",
		});
	}
}
