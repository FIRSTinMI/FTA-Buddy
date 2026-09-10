// Pure pricing math for the troubleshooting assistant. Kept free of Redis/DB imports
// so it can be unit tested. Prices are Anthropic first-party rates for Claude Opus 4.8
// (claude-api skill, cached 2026-06-24): $5/MTok input, $25/MTok output,
// cache read 0.1x input, cache write 1.25x input (5 minute TTL).

export const TROUBLESHOOT_MODEL = "claude-opus-4-8";

/** USD per million tokens. */
export const PRICE_PER_MTOK = {
	input: 5,
	output: 25,
	cacheRead: 0.5,
	cacheWrite: 6.25,
} as const;

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
export function costMicroUsd(usage: TokenUsage): number {
	const input = usage.input_tokens * PRICE_PER_MTOK.input;
	const output = usage.output_tokens * PRICE_PER_MTOK.output;
	const cacheRead = (usage.cache_read_input_tokens ?? 0) * PRICE_PER_MTOK.cacheRead;
	const cacheWrite = (usage.cache_creation_input_tokens ?? 0) * PRICE_PER_MTOK.cacheWrite;
	return Math.round(input + output + cacheRead + cacheWrite);
}

/** Total prompt tokens billed at any rate (uncached + cache read + cache write). */
export function totalInputTokens(usage: TokenUsage): number {
	return usage.input_tokens + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);
}
