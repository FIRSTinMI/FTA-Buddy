import { randomUUID } from "crypto";
import type { PowerAlertSettings, PowerMonitorStatus, Profile, ServerEvent } from "../../shared/types";
import { createNotification } from "./push-notifications";
import { redis } from "./redis";

/**
 * Alerting for the field power monitors.
 *
 * Evaluated on ingest rather than on a timer, because the extension is the only
 * thing that knows whether a monitor is still streaming - if the field loses
 * power the monitors go unreachable and stop posting, so their silence has to
 * be reported BY the extension, not inferred from the absence of rows.
 */

export type PowerAlertKind = "low_voltage" | "high_current" | "power_loss" | "monitor_offline";

/** One sample's worth of what the alert rules need. */
export interface PowerAlertSample {
	monitorId: string;
	time: Date;
	voltsMin: number;
	amps: number;
	ampsMax: number;
}

const KEY_PREFIX = "ftabuddy:power";

/** Cooldown key. The alert is only sent if this key does not exist yet. */
function cooldownKey(eventCode: string, monitorId: string, kind: PowerAlertKind) {
	return `${KEY_PREFIX}:cooldown:${eventCode}:${monitorId}:${kind}`;
}

/** When current first went above the threshold on this monitor. */
function highSinceKey(eventCode: string, monitorId: string) {
	return `${KEY_PREFIX}:highsince:${eventCode}:${monitorId}`;
}

/** When a monitor first went unhealthy, per kind. */
function downSinceKey(eventCode: string, monitorId: string, kind: PowerAlertKind) {
	return `${KEY_PREFIX}:downsince:${eventCode}:${monitorId}:${kind}`;
}

/**
 * True once a condition has held for `dwellSeconds`. The first observation only
 * starts the clock: a single dropped SSE frame or one NaN off the meter is not
 * an outage, and waking someone for it teaches them to ignore the next one.
 */
async function heldFor(
	eventCode: string,
	monitorId: string,
	kind: PowerAlertKind,
	dwellSeconds: number,
): Promise<boolean> {
	const key = downSinceKey(eventCode, monitorId, kind);
	const since = await redis.get(key);
	if (!since) {
		await redis.set(key, Date.now().toString(), "EX", dwellSeconds * 4 + 60);
		return false;
	}
	return Date.now() - Number(since) >= dwellSeconds * 1000;
}

/** The condition cleared, so the next occurrence starts its own clock. */
async function clearHold(eventCode: string, monitorId: string, kind: PowerAlertKind) {
	await redis.del(downSinceKey(eventCode, monitorId, kind));
}

/**
 * Claim the right to send one alert. SET NX is atomic across the load-balanced
 * instances, so only one of them notifies and the cooldown is shared - two
 * servers ingesting from two extensions cannot double-send.
 */
async function claim(eventCode: string, monitorId: string, kind: PowerAlertKind, cooldownMinutes: number) {
	const res = await redis.set(
		cooldownKey(eventCode, monitorId, kind),
		Date.now().toString(),
		"EX",
		Math.max(60, Math.round(cooldownMinutes * 60)),
		"NX",
	);
	return res === "OK";
}

async function notify(event: ServerEvent, kind: PowerAlertKind, title: string, body: string) {
	const userIds = (event.users as Profile[]).map((u) => u.id);
	if (userIds.length === 0) return;

	await createNotification(
		userIds,
		{
			id: randomUUID(),
			timestamp: new Date(),
			// Robot-Status is the only topic the deployed service worker maps to a
			// category it will show; an unknown topic is silently dropped by any SW
			// already installed, so a new one would go nowhere.
			topic: "Robot-Status",
			title,
			body,
			// One tag per monitor per kind: a repeat replaces the old notification
			// instead of stacking a column of them on the phone.
			tag: `power-${kind}`,
			kind: `power.${kind}`,
			urgency: "high",
		},
		event.code,
	);
}

/**
 * Run the alert rules over one batch of samples plus the reported monitor
 * status. Returns the kinds that fired, for logging and tests.
 */
export async function evaluatePowerAlerts(
	event: ServerEvent,
	settings: PowerAlertSettings,
	samples: PowerAlertSample[],
	status: PowerMonitorStatus[],
): Promise<PowerAlertKind[]> {
	if (!settings.enabled) return [];

	const fired: PowerAlertKind[] = [];
	const byMonitor = new Map<string, PowerAlertSample[]>();
	for (const s of samples) {
		const list = byMonitor.get(s.monitorId);
		if (list) list.push(s);
		else byMonitor.set(s.monitorId, [s]);
	}

	// #region Voltage sag
	for (const [monitorId, monitorSamples] of byMonitor) {
		const lowest = Math.min(...monitorSamples.map((s) => s.voltsMin));
		if (lowest >= settings.lowVoltage) continue;
		if (!(await claim(event.code, monitorId, "low_voltage", settings.cooldownMinutes))) continue;
		fired.push("low_voltage");
		await notify(
			event,
			"low_voltage",
			`${monitorId}: ${lowest.toFixed(1)}V`,
			`Field voltage dropped below ${settings.lowVoltage}V. Check what else is on that circuit.`,
		);
	}
	// #endregion

	// #region Sustained current
	for (const [monitorId, monitorSamples] of byMonitor) {
		const key = highSinceKey(event.code, monitorId);
		const peak = Math.max(...monitorSamples.map((s) => s.ampsMax));
		const latest = monitorSamples[monitorSamples.length - 1];

		if (peak <= settings.highCurrent) {
			// Dropped back under: the clock restarts next time it goes over.
			await redis.del(key);
			continue;
		}

		const since = await redis.get(key);
		if (!since) {
			// Keep the marker a little longer than the window it measures, so a
			// gap in posting cannot silently reset a genuinely sustained draw.
			await redis.set(key, latest.time.getTime().toString(), "EX", settings.sustainSeconds * 4 + 60);
			continue;
		}

		const heldMs = latest.time.getTime() - Number(since);
		if (heldMs < settings.sustainSeconds * 1000) continue;
		if (!(await claim(event.code, monitorId, "high_current", settings.cooldownMinutes))) continue;
		fired.push("high_current");
		await notify(
			event,
			"high_current",
			`${monitorId}: ${peak.toFixed(1)}A`,
			`Above ${settings.highCurrent}A for ${Math.round(heldMs / 1000)}s. A breaker on that circuit is at risk.`,
		);
	}
	// #endregion

	// #region Monitor and mains loss
	for (const monitor of status) {
		if (monitor.connected) {
			await clearHold(event.code, monitor.monitorId, "monitor_offline");
		} else if (await heldFor(event.code, monitor.monitorId, "monitor_offline", settings.offlineSeconds)) {
			if (await claim(event.code, monitor.monitorId, "monitor_offline", settings.cooldownMinutes)) {
				fired.push("monitor_offline");
				await notify(
					event,
					"monitor_offline",
					`${monitor.monitorId} offline`,
					`No readings for ${settings.offlineSeconds}s. It cannot report a sag while it is dark.`,
				);
			}
			continue;
		}

		if (monitor.connected && monitor.meterOk) {
			await clearHold(event.code, monitor.monitorId, "power_loss");
		} else if (
			monitor.connected &&
			(await heldFor(event.code, monitor.monitorId, "power_loss", settings.offlineSeconds))
		) {
			if (await claim(event.code, monitor.monitorId, "power_loss", settings.cooldownMinutes)) {
				fired.push("power_loss");
				await notify(
					event,
					"power_loss",
					`${monitor.monitorId}: no mains`,
					"The board is up but its meter stopped answering. That circuit has lost power.",
				);
			}
		}
	}
	// #endregion

	return fired;
}
