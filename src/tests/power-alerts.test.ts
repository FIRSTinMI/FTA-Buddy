import { beforeAll, describe, expect, mock, test } from "bun:test";
import type { PowerAlertSettings, ServerEvent } from "../../shared/types";

/**
 * The alert rules, against a real Redis (the dwell and cooldown state lives
 * there, so mocking it would test nothing). Notifications are captured rather
 * than sent.
 *
 * Needs REDIS_URL; docker-compose provides one.
 */

const sent: { kind: string; title: string; body: string }[] = [];

mock.module("../util/push-notifications", () => ({
	createNotification: async (_users: number[], data: any) => {
		sent.push({ kind: data.kind, title: data.title, body: data.body });
	},
}));

// Imported in beforeAll, after mock.module is registered and without a
// top-level await (which this tsconfig's module target rejects).
let evaluatePowerAlerts: typeof import("../util/power-alerts").evaluatePowerAlerts;
let redis: typeof import("../util/redis").redis;

const SETTINGS: PowerAlertSettings = {
	enabled: true,
	lowVoltage: 110,
	highCurrent: 15,
	sustainSeconds: 10,
	offlineSeconds: 30,
	cooldownMinutes: 5,
};

function testEvent(code: string): ServerEvent {
	return { code, users: [{ id: 1, username: "t", role: "FTA", admin: false }] } as unknown as ServerEvent;
}

function sample(monitorId: string, at: Date, opts: { volts?: number; amps?: number }) {
	return {
		monitorId,
		time: at,
		voltsMin: opts.volts ?? 121,
		amps: opts.amps ?? 1,
		ampsMax: opts.amps ?? 1,
	};
}

/** Each test gets its own event code so Redis state cannot leak between them. */
let n = 0;
function freshEvent() {
	return testEvent(`test-power-${Date.now()}-${n++}`);
}

beforeAll(async () => {
	({ evaluatePowerAlerts } = await import("../util/power-alerts"));
	({ redis } = await import("../util/redis"));
	sent.length = 0;
});

describe("power alerts", () => {
	test("a sag fires immediately, and only once inside the cooldown", async () => {
		const event = freshEvent();
		const t = new Date();

		const first = await evaluatePowerAlerts(event, SETTINGS, [sample("m1", t, { volts: 106 })], []);
		expect(first).toEqual(["low_voltage"]);

		const second = await evaluatePowerAlerts(
			event,
			SETTINGS,
			[sample("m1", new Date(t.getTime() + 1000), { volts: 104 })],
			[],
		);
		expect(second).toEqual([]);
	});

	test("normal voltage never fires", async () => {
		const event = freshEvent();
		const fired = await evaluatePowerAlerts(event, SETTINGS, [sample("m1", new Date(), { volts: 121 })], []);
		expect(fired).toEqual([]);
	});

	test("high current waits out the sustain window, then fires", async () => {
		const event = freshEvent();
		const t0 = new Date();

		// Inrush: over the limit, but only for an instant.
		expect(await evaluatePowerAlerts(event, SETTINGS, [sample("m1", t0, { amps: 22 })], [])).toEqual([]);

		// Still over, 5s in - under the 10s window.
		const t5 = new Date(t0.getTime() + 5000);
		expect(await evaluatePowerAlerts(event, SETTINGS, [sample("m1", t5, { amps: 20 })], [])).toEqual([]);

		// Held past the window.
		const t12 = new Date(t0.getTime() + 12_000);
		expect(await evaluatePowerAlerts(event, SETTINGS, [sample("m1", t12, { amps: 19 })], [])).toEqual([
			"high_current",
		]);
	});

	test("dropping back under the limit restarts the clock", async () => {
		const event = freshEvent();
		const t0 = new Date();

		await evaluatePowerAlerts(event, SETTINGS, [sample("m1", t0, { amps: 22 })], []);
		// Back to normal: the marker is cleared.
		await evaluatePowerAlerts(event, SETTINGS, [sample("m1", new Date(t0.getTime() + 3000), { amps: 4 })], []);
		// Over again, 12s after the ORIGINAL spike - must not count that gap.
		const fired = await evaluatePowerAlerts(
			event,
			SETTINGS,
			[sample("m1", new Date(t0.getTime() + 12_000), { amps: 22 })],
			[],
		);
		expect(fired).toEqual([]);
	});

	test("a monitor going quiet does not fire until it has been quiet long enough", async () => {
		const event = freshEvent();
		const offline = [{ monitorId: "m1", connected: false, meterOk: false }];

		// First sight only starts the clock.
		expect(await evaluatePowerAlerts(event, SETTINGS, [], offline)).toEqual([]);

		// Backdate the marker to simulate 60s of silence.
		await redis.set(
			`ftabuddy:power:downsince:${event.code}:m1:monitor_offline`,
			(Date.now() - 60_000).toString(),
		);
		expect(await evaluatePowerAlerts(event, SETTINGS, [], offline)).toEqual(["monitor_offline"]);
	});

	test("a board that is up with a dead meter reports lost mains, not an offline monitor", async () => {
		const event = freshEvent();
		const meterDown = [{ monitorId: "m1", connected: true, meterOk: false }];

		expect(await evaluatePowerAlerts(event, SETTINGS, [], meterDown)).toEqual([]);
		await redis.set(`ftabuddy:power:downsince:${event.code}:m1:power_loss`, (Date.now() - 60_000).toString());

		const fired = await evaluatePowerAlerts(event, SETTINGS, [], meterDown);
		expect(fired).toEqual(["power_loss"]);
		expect(sent.at(-1)?.title).toContain("no mains");
	});

	test("a healthy monitor clears a pending hold", async () => {
		const event = freshEvent();
		await evaluatePowerAlerts(event, SETTINGS, [], [{ monitorId: "m1", connected: false, meterOk: false }]);
		await evaluatePowerAlerts(event, SETTINGS, [], [{ monitorId: "m1", connected: true, meterOk: true }]);
		expect(await redis.get(`ftabuddy:power:downsince:${event.code}:m1:monitor_offline`)).toBeNull();
	});

	test("nothing fires when alerting is switched off", async () => {
		const event = freshEvent();
		const fired = await evaluatePowerAlerts(
			event,
			{ ...SETTINGS, enabled: false },
			[sample("m1", new Date(), { volts: 90 })],
			[{ monitorId: "m1", connected: false, meterOk: false }],
		);
		expect(fired).toEqual([]);
	});
});
