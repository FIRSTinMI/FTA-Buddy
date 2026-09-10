import { describe, expect, test } from "bun:test";
import { costMicroUsd, PRICE_PER_MTOK, totalInputTokens, TROUBLESHOOT_MODEL } from "./pricing";

describe("troubleshoot pricing", () => {
	test("model id is Opus 4.8", () => {
		expect(TROUBLESHOOT_MODEL).toBe("claude-opus-4-8");
	});

	test("one million input tokens costs $5", () => {
		expect(costMicroUsd({ input_tokens: 1_000_000, output_tokens: 0 })).toBe(5_000_000);
	});

	test("one million output tokens costs $25", () => {
		expect(costMicroUsd({ input_tokens: 0, output_tokens: 1_000_000 })).toBe(25_000_000);
	});

	test("cache read is 0.1x input, cache write is 1.25x input", () => {
		expect(PRICE_PER_MTOK.cacheRead).toBeCloseTo(PRICE_PER_MTOK.input * 0.1);
		expect(PRICE_PER_MTOK.cacheWrite).toBeCloseTo(PRICE_PER_MTOK.input * 1.25);
		expect(
			costMicroUsd({
				input_tokens: 0,
				output_tokens: 0,
				cache_read_input_tokens: 1_000_000,
				cache_creation_input_tokens: 1_000_000,
			}),
		).toBe(500_000 + 6_250_000);
	});

	test("a typical turn rounds to whole micro-USD", () => {
		// 1200 uncached in, 2000 cached read, 600 out
		const cost = costMicroUsd({
			input_tokens: 1200,
			output_tokens: 600,
			cache_read_input_tokens: 2000,
			cache_creation_input_tokens: 0,
		});
		expect(cost).toBe(1200 * 5 + 600 * 25 + 1000);
		expect(Number.isInteger(cost)).toBe(true);
	});

	test("null cache fields count as zero", () => {
		expect(
			totalInputTokens({
				input_tokens: 10,
				output_tokens: 0,
				cache_read_input_tokens: null,
				cache_creation_input_tokens: null,
			}),
		).toBe(10);
	});
});
