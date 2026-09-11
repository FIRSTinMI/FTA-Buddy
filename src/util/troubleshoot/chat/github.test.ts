import { describe, expect, test } from "bun:test";
import { parseRepoFromTurns, parseRepoUrl } from "./github";

describe("parseRepoUrl", () => {
	test("plain https url", () => {
		expect(parseRepoUrl("https://github.com/frc1234/Robot2026")).toEqual({ owner: "frc1234", repo: "Robot2026" });
	});

	test("finds the url inside a sentence", () => {
		expect(parseRepoUrl("their code is at https://github.com/Team-254/Robot, can you look?")).toEqual({
			owner: "Team-254",
			repo: "Robot",
		});
	});

	test("http, www and a bare host all work", () => {
		expect(parseRepoUrl("http://github.com/a/b")).toEqual({ owner: "a", repo: "b" });
		expect(parseRepoUrl("https://www.github.com/a/b")).toEqual({ owner: "a", repo: "b" });
		expect(parseRepoUrl("github.com/a/b")).toEqual({ owner: "a", repo: "b" });
	});

	test("strips a .git suffix", () => {
		expect(parseRepoUrl("https://github.com/frc1234/Robot2026.git")).toEqual({
			owner: "frc1234",
			repo: "Robot2026",
		});
	});

	test("keeps the branch from a /tree/ path", () => {
		expect(parseRepoUrl("https://github.com/frc1234/Robot2026/tree/comp-build")).toEqual({
			owner: "frc1234",
			repo: "Robot2026",
			ref: "comp-build",
		});
	});

	test("a deep /tree/ link keeps only the branch", () => {
		expect(parseRepoUrl("https://github.com/frc1234/Robot2026/tree/main/src/main/java")).toEqual({
			owner: "frc1234",
			repo: "Robot2026",
			ref: "main",
		});
	});

	test("trailing punctuation is not part of the repo name", () => {
		expect(parseRepoUrl("see github.com/a/b.")).toEqual({ owner: "a", repo: "b" });
		expect(parseRepoUrl("(https://github.com/a/b)")).toEqual({ owner: "a", repo: "b" });
	});

	test("takes the first repo when there are several", () => {
		expect(parseRepoUrl("https://github.com/one/first and https://github.com/two/second")).toEqual({
			owner: "one",
			repo: "first",
		});
	});

	test("other hosts are rejected", () => {
		expect(parseRepoUrl("https://gitlab.com/a/b")).toBeNull();
		expect(parseRepoUrl("https://bitbucket.org/a/b")).toBeNull();
	});

	test("a github.com path on another host is rejected", () => {
		expect(parseRepoUrl("https://evil.example/github.com/a/b")).toBeNull();
		expect(parseRepoUrl("https://notgithub.com/a/b")).toBeNull();
	});

	test("junk and partial urls give null", () => {
		expect(parseRepoUrl("")).toBeNull();
		expect(parseRepoUrl("the radio light is solid red")).toBeNull();
		expect(parseRepoUrl("github.com")).toBeNull();
		expect(parseRepoUrl("https://github.com/onlyowner")).toBeNull();
		expect(parseRepoUrl("https://github.com//b")).toBeNull();
	});
});

describe("parseRepoFromTurns", () => {
	test("newest message with a repo wins", () => {
		const turns = ["look at https://github.com/one/first", "thanks", "now try github.com/two/second"];
		expect(parseRepoFromTurns(turns)).toEqual({ owner: "two", repo: "second" });
	});

	test("falls back to an earlier message", () => {
		const turns = ["look at https://github.com/one/first", "still broken"];
		expect(parseRepoFromTurns(turns)).toEqual({ owner: "one", repo: "first" });
	});

	test("no repo anywhere gives null", () => {
		expect(parseRepoFromTurns(["robot browns out", ""])).toBeNull();
	});
});
