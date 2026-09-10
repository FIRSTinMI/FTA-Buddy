// Pure pricing math for the troubleshooting assistant. Kept free of Redis/DB imports
// so it can be unit tested. Prices are Anthropic first-party rates for Claude Opus 4.8
// (claude-api skill, cached 2026-06-24): $5/MTok input, $25/MTok output,
// cache read 0.1x input, cache write 1.25x input (5 minute TTL).

export const TROUBLESHOOT_MODEL = "claude-opus-4-8";
/** Cheap model that turns the conversation into search queries before the main turn. */
export const PLANNER_MODEL = "claude-haiku-4-5";

export type TroubleshootModel = typeof TROUBLESHOOT_MODEL | typeof PLANNER_MODEL;

/** USD per million tokens, by model (claude-api skill, cached 2026-06-24). */
export const PRICES: Record<TroubleshootModel, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
	"claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
	"claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
};

export const PRICE_PER_MTOK = PRICES[TROUBLESHOOT_MODEL];

export interface TokenUsage {
	input_tokens: number;
	output_tokens: number;
	cache_read_input_tokens?: number | null;
	cache_creation_input_tokens?: number | null;
}

/**
 * Cost of one API call in micro-USD (1e-6 USD), rounded to the nearest integer.
 * $/MTok equals micro-USD per token, so the multiply is direct.
 */
export function costMicroUsd(usage: TokenUsage, model: TroubleshootModel = TROUBLESHOOT_MODEL): number {
	const price = PRICES[model];
	const input = usage.input_tokens * price.input;
	const output = usage.output_tokens * price.output;
	const cacheRead = (usage.cache_read_input_tokens ?? 0) * price.cacheRead;
	const cacheWrite = (usage.cache_creation_input_tokens ?? 0) * price.cacheWrite;
	return Math.round(input + output + cacheRead + cacheWrite);
}

/** Total prompt tokens billed at any rate (uncached + cache read + cache write). */
export function totalInputTokens(usage: TokenUsage): number {
	return usage.input_tokens + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);
}
