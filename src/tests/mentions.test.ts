import { describe, expect, test } from "bun:test";
import { findMentions, splitMentions } from "../../shared/mentions";

const users = [
	{ id: 1, username: "Sam" },
	{ id: 2, username: "Samantha" },
	{ id: 3, username: "Brandon McDonald" },
	{ id: 4, username: "Brandon" },
];
const ids = (text: string) => findMentions(text, users).map((u) => u.id);

describe("mentions", () => {
	test("matches a username with a space", () => {
		expect(ids("@Brandon McDonald can you check the radio")).toEqual([3]);
	});
	test("prefers the longest username", () => {
		expect(ids("@Samantha and @Sam")).toEqual([2, 1]);
		expect(ids("@Brandon, thanks")).toEqual([4]);
	});
	test("needs a word boundary after the name", () => {
		expect(ids("@Samuel is here")).toEqual([]);
	});
	test("is case-insensitive and ignores emails", () => {
		expect(ids("cc @sam, mail sam@Sam.org")).toEqual([1]);
	});
	test("splits text around mentions", () => {
		expect(splitMentions("hi @Sam!", users)).toEqual([
			{ text: "hi " },
			{ text: "@Sam", user: users[0] },
			{ text: "!" },
		]);
	});
});
