import { describe, expect, test } from "bun:test";
import {
	buildParentMap,
	toEventIntegrationStatus,
	type EventIntegrationRow,
	type IntegrationContext,
} from "../util/event-integrations";

const base: EventIntegrationRow = {
	code: "2026test",
	name: "Test",
	nexusApiKey: null,
	slackChannel: null,
	slackTeam: null,
	slackTeamName: null,
	fmsEventPassword: null,
	notepadOnly: false,
	publicTicketSubmit: true,
	playoffMode: false,
	extensionsEnabled: true,
	powerMonitoring: false,
	powerAlertSettings: {},
	meshedEvent: null,
	slowWarningSettings: {},
	timezone: null,
	startDate: null,
	endDate: null,
};

const ctx = (over: Partial<IntegrationContext> = {}): IntegrationContext => ({
	parentByChild: new Map(),
	live: {},
	...over,
});

describe("toEventIntegrationStatus", () => {
	test("empty event: nothing configured, no live fields", () => {
		const s = toEventIntegrationStatus(base, ctx());
		expect(s.nexus).toEqual({ configured: false });
		expect(s.slack.connected).toBe(false);
		expect(s.fms).toEqual({ passwordSet: false });
		expect(s.slowWarning).toEqual({ enabled: false, mode: "percentile_floor" });
	});

	test("secrets never appear in the payload", () => {
		const s = toEventIntegrationStatus(
			{ ...base, nexusApiKey: "NEXUS-SECRET", fmsEventPassword: "FMS-SECRET" },
			ctx(),
		);
		const json = JSON.stringify(s);
		expect(json).not.toContain("NEXUS-SECRET");
		expect(json).not.toContain("FMS-SECRET");
		expect(s.nexus.configured).toBe(true);
		expect(s.fms.passwordSet).toBe(true);
	});

	test("nexus poll omitted when key set but event not loaded; present when loaded", () => {
		const row = { ...base, nexusApiKey: "k" };
		expect(toEventIntegrationStatus(row, ctx()).nexus.poll).toBeUndefined();
		const s = toEventIntegrationStatus(
			row,
			ctx({
				live: {
					[row.code]: {
						nexus: {
							state: "error",
							intervalMinutes: 2,
							isAllInspected: false,
							lastSuccessAt: new Date("2026-03-01T10:00:00Z"),
							lastErrorAt: new Date("2026-03-01T10:05:00Z"),
							lastErrorMessage: "HTTP 401 – check Nexus API key",
						},
						nexusEventStatus: { dataAsOfTime: 123, nowQueuing: null, matches: [] },
					},
				},
			}),
		);
		expect(s.nexus.poll).toEqual({
			state: "error",
			lastSuccessAt: "2026-03-01T10:00:00.000Z",
			lastErrorAt: "2026-03-01T10:05:00.000Z",
			lastErrorMessage: "HTTP 401 – check Nexus API key",
			isAllInspected: false,
			scheduleDataAsOf: 123,
		});
	});

	test("nexus poll omitted when no key even if loaded", () => {
		const s = toEventIntegrationStatus(
			base,
			ctx({
				live: {
					[base.code]: { nexus: { state: "not_configured", intervalMinutes: 2, isAllInspected: false } },
				},
			}),
		);
		expect(s.nexus.poll).toBeUndefined();
	});

	test("slack needs both channel and team; workspace row from join", () => {
		expect(toEventIntegrationStatus({ ...base, slackChannel: "C1" }, ctx()).slack.connected).toBe(false);
		const s = toEventIntegrationStatus(
			{ ...base, slackChannel: "C1", slackTeam: "T1", slackTeamName: "FIRST CSA" },
			ctx(),
		);
		expect(s.slack).toEqual({
			connected: true,
			channelId: "C1",
			teamId: "T1",
			teamName: "FIRST CSA",
			workspaceInstalled: true,
		});
		const orphan = toEventIntegrationStatus({ ...base, slackChannel: "C1", slackTeam: "T1" }, ctx());
		expect(orphan.slack.workspaceInstalled).toBe(false);
	});

	test("slow warning merges defaults", () => {
		const s = toEventIntegrationStatus({ ...base, slowWarningSettings: { enabled: true, mode: "iqr" } }, ctx());
		expect(s.slowWarning).toEqual({ enabled: true, mode: "iqr" });
	});

	test("meshed parent lists sub-events; child points to parent", () => {
		const parent = {
			...base,
			code: "2026mesh",
			meshedEvent: [
				{ code: "2026a", label: "A" },
				{ code: "2026b", label: "B" },
			],
		};
		const map = buildParentMap([parent, { ...base, code: "2026a", meshedEvent: null }]);
		expect(toEventIntegrationStatus(parent, ctx({ parentByChild: map })).meshed).toEqual({
			subEvents: [
				{ code: "2026a", label: "A" },
				{ code: "2026b", label: "B" },
			],
			parentCode: null,
		});
		expect(toEventIntegrationStatus({ ...base, code: "2026a" }, ctx({ parentByChild: map })).meshed).toEqual({
			subEvents: [],
			parentCode: "2026mesh",
		});
	});

	test("extensionsOnline only when read", () => {
		expect(toEventIntegrationStatus(base, ctx()).fms.extensionsOnline).toBeUndefined();
		expect(toEventIntegrationStatus(base, ctx({ extensionsOnline: {} })).fms.extensionsOnline).toBeUndefined();
		expect(toEventIntegrationStatus(base, ctx({ extensionsOnline: { [base.code]: 2 } })).fms.extensionsOnline).toBe(
			2,
		);
	});
});
