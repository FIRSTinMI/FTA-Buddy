import { TRPCError } from "@trpc/server";
import { eq, sql } from "drizzle-orm";
import { db } from "../../db/db";
import { troubleshootConversations } from "../../db/schema";
import { redis } from "../redis";
import { costMicroUsd, totalInputTokens, TROUBLESHOOT_MODEL, type TokenUsage, type TroubleshootModel } from "./pricing";

export { costMicroUsd, TROUBLESHOOT_MODEL } from "./pricing";

const SPEND_PREFIX = "ftabuddy:troubleshoot:spend:";
// Keep monthly counters around for 13 months so last year's number is still readable.
const SPEND_TTL_SECONDS = 13 * 31 * 24 * 3600;

function monthKey(date = new Date()): string {
	const y = date.getUTCFullYear();
	const m = String(date.getUTCMonth() + 1).padStart(2, "0");
	return `${SPEND_PREFIX}${y}-${m}`;
}

export function monthlyCapUsd(): number {
	const raw = Number(process.env.TROUBLESHOOT_MONTHLY_CAP_USD);
	return Number.isFinite(raw) && raw > 0 ? raw : 50;
}

/** Month-to-date spend in micro-USD. */
export async function getMonthSpendMicroUsd(): Promise<number> {
	const v = await redis.get(monthKey());
	return v ? Number(v) : 0;
}

export async function getSpendStatus(): Promise<{ spentUsd: number; capUsd: number; overBudget: boolean }> {
	const spent = await getMonthSpendMicroUsd();
	const cap = monthlyCapUsd();
	return { spentUsd: spent / 1e6, capUsd: cap, overBudget: spent >= cap * 1e6 };
}

/** Throw PRECONDITION_FAILED when this month's spend has reached the cap. */
export async function assertBudget(): Promise<void> {
	const { overBudget } = await getSpendStatus();
	if (overBudget) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "The troubleshooting assistant has used its budget for this month.",
		});
	}
}

/**
 * Add one API call's cost to the monthly Redis counter (the number the cap is checked against).
 * Returns the cost in micro-USD. Used on its own by jobs with no conversation row (distillation).
 */
export async function recordMonthlySpend(
	usage: TokenUsage,
	model: TroubleshootModel = TROUBLESHOOT_MODEL,
): Promise<number> {
	const cost = costMicroUsd(usage, model);
	const key = monthKey();
	const total = await redis.incrby(key, cost);
	// First write this month creates the key; give it a TTL then.
	if (total === cost) await redis.expire(key, SPEND_TTL_SECONDS);
	return cost;
}

/**
 * Record one API call: add its cost to the monthly Redis counter and to the
 * conversation row. Returns the cost in micro-USD.
 */
export async function recordSpend(
	conversationId: string,
	usage: TokenUsage,
	model: TroubleshootModel = TROUBLESHOOT_MODEL,
): Promise<number> {
	const cost = await recordMonthlySpend(usage, model);
	await db
		.update(troubleshootConversations)
		.set({
			input_tokens: sql`${troubleshootConversations.input_tokens} + ${totalInputTokens(usage)}`,
			output_tokens: sql`${troubleshootConversations.output_tokens} + ${usage.output_tokens}`,
			cost_usd_micro: sql`${troubleshootConversations.cost_usd_micro} + ${cost}`,
			updated_at: new Date(),
		})
		.where(eq(troubleshootConversations.id, conversationId));
	return cost;
}

const REPO_READS_PREFIX = "ftabuddy:troubleshoot:reporeads:";
// A conversation is closed after 8 turns; a day is plenty of room for one.
const REPO_READS_TTL_SECONDS = 24 * 3600;

/** How many repo files this conversation has already read (cap is per conversation). */
export async function getRepoReads(conversationId: string): Promise<number> {
	const v = await redis.get(`${REPO_READS_PREFIX}${conversationId}`);
	return v ? Number(v) : 0;
}

/** Add this turn's repo reads to the conversation counter. */
export async function addRepoReads(conversationId: string, reads: number): Promise<void> {
	if (reads <= 0) return;
	const key = `${REPO_READS_PREFIX}${conversationId}`;
	await redis.incrby(key, reads);
	await redis.expire(key, REPO_READS_TTL_SECONDS);
}
