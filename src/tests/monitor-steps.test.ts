import { describe, expect, test } from "bun:test";
import { MatchState } from "../../shared/types";
import { monitorSteps, waitingKey, type MonitorIssueKey } from "../../shared/troubleshooting/monitor-steps";
import { parseSteps } from "../../shared/troubleshooting/steps";

describe("monitorSteps", () => {
	test("every entry has a title and at least one step", () => {
		for (const [key, issue] of Object.entries(monitorSteps)) {
			expect(issue.title.length, key).toBeGreaterThan(0);
			expect(issue.steps.length, key).toBeGreaterThan(0);
		}
	});
	test("every entry parses and every parsed step has text", () => {
		for (const [key, issue] of Object.entries(monitorSteps)) {
			const parsed = parseSteps(issue.steps);
			expect(parsed.length, key).toBeGreaterThanOrEqual(issue.steps.length);
			for (const step of parsed) expect(step.text.trim().length, key).toBeGreaterThan(0);
		}
	});
	test("waitingKey maps every match state to a waiting entry", () => {
		const keys: MonitorIssueKey[] = [MatchState.OVER, MatchState.PRESTART, MatchState.RUNNING].map(waitingKey);
		expect(keys).toEqual(["waiting-over", "waiting-prestart", "waiting-running"]);
		for (const k of keys) expect(monitorSteps[k].steps.at(-1)).toMatch(/Known FMS bug/);
	});
	test("RIO status-flash items are checks", () => {
		const checks = parseSteps(monitorSteps["no-rio"].steps).filter((s) => s.kind === "check");
		expect(checks.map((c) => c.text)).toEqual([
			"Status light flashing on a roboRIO 2?",
			"Status light flashing on a roboRIO 1?",
		]);
	});
});
