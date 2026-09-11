import { describe, expect, test } from "bun:test";
import { MatchState } from "../../shared/types";
import { monitorIssue, monitorSteps, waitingKey, type MonitorIssueKey } from "../../shared/troubleshooting/monitor-steps";
import { parseSteps } from "../../shared/troubleshooting/steps";

describe("monitorSteps", () => {
	test("every entry resolves to a title and real steps", () => {
		for (const key of Object.keys(monitorSteps) as MonitorIssueKey[]) {
			const issue = monitorIssue(key);
			expect(issue.title.length, key).toBeGreaterThan(0);
			expect(issue.steps.length, key).toBeGreaterThan(0);
			for (const step of parseSteps(issue.steps)) expect(step.text.trim().length, key).toBeGreaterThan(0);
		}
	});

	test("guide-backed entries expose a link to the full guide", () => {
		for (const [key, entry] of Object.entries(monitorSteps)) {
			if (!entry.ref) continue;
			expect(monitorIssue(key as MonitorIssueKey).href, key).toBe(`/troubleshoot/${entry.ref.tree}/${entry.ref.node}`);
		}
	});

	test("waitingKey maps every match state to a waiting entry", () => {
		expect(waitingKey(MatchState.OVER)).toBe("waiting-over");
		expect(waitingKey(MatchState.PRESTART)).toBe("waiting-prestart");
		expect(waitingKey(MatchState.RUNNING)).toBe("waiting-running");
	});
});
