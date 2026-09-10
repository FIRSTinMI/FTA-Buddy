import { describe, expect, test } from "bun:test";
import { assistantKeywords, broadQuery, messageWords } from "./keywords";

describe("assistantKeywords", () => {
	test("empty input gives no keywords", () => {
		expect(assistantKeywords(undefined)).toEqual([]);
		expect(assistantKeywords("")).toEqual([]);
	});

	test("drops stopwords, short words and bare numbers, ranks by frequency", () => {
		const text = "1. Check the **radio** status light. 2. If the radio is red, power cycle the radio. Step 3: 2024";
		const kw = assistantKeywords(text);
		expect(kw[0]).toBe("radio");
		expect(kw).not.toContain("the");
		expect(kw).not.toContain("2024");
		expect(kw).not.toContain("red");
	});

	test("caps the count", () => {
		const text = Array.from({ length: 20 }, (_, i) => `word${i}xyz`).join(" ");
		expect(assistantKeywords(text, 5)).toHaveLength(5);
	});
});

describe("messageWords / broadQuery", () => {
	test("keeps dotted model names and joins with or", () => {
		expect(messageWords("The roboRIO 2.0 is not booting")).toEqual(["roborio", "2.0", "booting"]);
		expect(broadQuery("radio red light", "Power cycle the radio.")).toBe("radio or red or light or cycle or power");
	});

	test("returns empty when everything is a stopword", () => {
		expect(broadQuery("what is it", undefined)).toBe("");
	});
});
