import { describe, expect, test } from "bun:test";
import { redactTeamNumbers } from "../util/troubleshoot/redact";

describe("redactTeamNumbers", () => {
	test.each([
		["the 2027 season", "the 2027 season"],
		["in 2026 the rules", "in 2026 the rules"],
		["September 2026, 2027 kickoff", "September 2026, 2027 kickoff"],
		["2027 game manual", "2027 game manual"],
		["since 2025", "since 2025"],
		["TCP 1735", "TCP 1735"],
		["ports 5800-5810", "ports 5800-5810"],
		["70 A and 1234", "70 A and ####"],
		["2056 had a CAN break", "#### had a CAN break"],
		["the 2056 robot", "the #### robot"],
		["after 2056 left", "after #### left"],
		["in 2056's pit", "in ####'s pit"],
		["in 2056 pit", "in #### pit"],
		["team 2056 and 3641", "team #### and ####"],
		["2026micmp", "[event]"],
	])("%p", (input, expected) => {
		expect(redactTeamNumbers(input)).toBe(expected);
	});
});
