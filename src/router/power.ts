import { and, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import {
	DEFAULT_POWER_ALERT_SETTINGS,
	type PowerAlertSettings,
	type PowerHistoryPoint,
	type PowerMonitorSummary,
	type PowerTelemetry,
} from "../../shared/types";
import { db } from "../db/db";
import { events, powerSamples } from "../db/schema";
import { bus } from "../util/eventBus";
import { evaluatePowerAlerts } from "../util/power-alerts";
import { eventProcedure, router } from "../trpc";
import { subscriptionQueue } from "../util/subscription";

/** Live telemetry channel for an event. One message carries every monitor's latest sample. */
function liveChannel(eventCode: string) {
	return `event:${eventCode}:power`;
}

/**
 * A one-second rollup as posted by the extension. The board streams at 2 Hz;
 * the extension averages a second's worth and keeps the extremes, because the
 * sag that matters lasts less than the average that hides it.
 */
const sampleInput = z.object({
	monitorId: z.string().min(1).max(64),
	time: z.date(),
	volts: z.number(),
	voltsMin: z.number(),
	voltsMax: z.number(),
	amps: z.number(),
	ampsMax: z.number(),
	watts: z.number(),
	wattsMax: z.number(),
	hz: z.number().nullable().optional(),
	hzMin: z.number().nullable().optional(),
	pf: z.number().nullable().optional(),
	pfMin: z.number().nullable().optional(),
	kwh: z.number().nullable().optional(),
	alarm: z.boolean().optional(),
});

/** Stored settings merged over the defaults, the same shape the UI edits. */
function powerAlertSettings(event: { powerAlertSettings?: Partial<PowerAlertSettings> }): PowerAlertSettings {
	return { ...DEFAULT_POWER_ALERT_SETTINGS, ...(event.powerAlertSettings ?? {}) };
}

export const powerRouter = router({
	/**
	 * Ingest from the extension. Rejected unless the event has power monitoring
	 * turned on, so a monitor left plugged in at the next event cannot quietly
	 * fill the table.
	 */
	postSamples: eventProcedure
		.input(
			z.object({
				extensionId: z.string().optional(),
				samples: z.array(sampleInput).max(600).default([]),
				/**
				 * Per-monitor liveness from the extension. A monitor that has gone
				 * dark cannot post its own silence, so the extension reports it.
				 */
				status: z
					.array(
						z.object({
							monitorId: z.string().min(1).max(64),
							connected: z.boolean(),
							meterOk: z.boolean(),
						}),
					)
					.max(32)
					.default([]),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const event = ctx.event;
			if (!event.powerMonitoring) return { stored: 0, enabled: false };

			if (input.samples.length > 0) {
				await db.insert(powerSamples).values(
					input.samples.map((s) => ({
						event: event.code,
						monitor_id: s.monitorId,
						time: s.time,
						volts: s.volts,
						volts_min: s.voltsMin,
						volts_max: s.voltsMax,
						amps: s.amps,
						amps_max: s.ampsMax,
						watts: s.watts,
						watts_max: s.wattsMax,
						hz: s.hz ?? null,
						hz_min: s.hzMin ?? null,
						pf: s.pf ?? null,
						pf_min: s.pfMin ?? null,
						kwh: s.kwh ?? null,
						alarm: s.alarm ?? false,
					})),
				);
			}

			// Fan out to every client on this event, including the phones and
			// tablets that have no extension of their own. The whole batch goes,
			// not just the newest of each: relaying one point per five seconds
			// gave those devices a chart far coarser than the data behind it.
			const live: PowerTelemetry[] = input.samples
				.slice()
				.sort((a, b) => a.time.getTime() - b.time.getTime())
				.map((s) => ({
					id: s.monitorId,
					ok: true,
					v: s.volts,
					a: s.amps,
					w: s.watts,
					hz: s.hz ?? null,
					pf: s.pf ?? null,
					kwh: s.kwh ?? null,
					alarm: s.alarm ?? false,
					ts: s.time.getTime(),
				}));
			if (live.length > 0) bus.publish(liveChannel(event.code), live);

			const alertSettings = powerAlertSettings(event);
			const fired = await evaluatePowerAlerts(
				event,
				alertSettings,
				input.samples.map((s) => ({
					monitorId: s.monitorId,
					time: s.time,
					voltsMin: s.voltsMin,
					amps: s.amps,
					ampsMax: s.ampsMax,
				})),
				input.status,
			).catch((err) => {
				// An alerting failure must never cost the reading that triggered it.
				console.error(`[Power] alert evaluation failed for ${event.code}:`, err);
				return [];
			});

			return { stored: input.samples.length, enabled: true, alerts: fired };
		}),

	/** Live telemetry for clients without an extension (phones, tablets, the AV room). */
	live: eventProcedure.subscription(async function* ({ ctx, signal }) {
		const { push, drain } = subscriptionQueue<PowerTelemetry[]>(signal!);
		const unsubscribe = bus.subscribe(liveChannel(ctx.event.code), (data) => push(data as PowerTelemetry[]));
		try {
			yield* drain();
		} finally {
			unsubscribe();
		}
	}),

	/**
	 * Event history, bucketed server-side. A full event at one second per sample
	 * is far more points than a chart can draw, so the bucket size is chosen by
	 * the caller from the window it is showing.
	 */
	history: eventProcedure
		.input(
			z.object({
				/** How far back to read, in minutes. Omit for the whole event. */
				minutes: z
					.number()
					.int()
					.min(1)
					.max(60 * 24 * 7)
					.optional(),
				/** Seconds per bucket. 1 = raw. */
				bucketSeconds: z.number().int().min(1).max(600).default(10),
			}),
		)
		.query(async ({ ctx, input }) => {
			const bucket = input.bucketSeconds;
			const conditions = [eq(powerSamples.event, ctx.event.code)];
			if (input.minutes) {
				conditions.push(gte(powerSamples.time, new Date(Date.now() - input.minutes * 60_000)));
			}

			const rows = await db
				.select({
					monitorId: powerSamples.monitor_id,
					bucket: sql<number>`floor(extract(epoch from ${powerSamples.time}) / ${bucket}) * ${bucket}`.as(
						"bucket",
					),
					volts: sql<number>`avg(${powerSamples.volts})`,
					voltsMin: sql<number>`min(${powerSamples.volts_min})`,
					voltsMax: sql<number>`max(${powerSamples.volts_max})`,
					amps: sql<number>`avg(${powerSamples.amps})`,
					ampsMax: sql<number>`max(${powerSamples.amps_max})`,
					watts: sql<number>`avg(${powerSamples.watts})`,
					wattsMax: sql<number>`max(${powerSamples.watts_max})`,
					hz: sql<number | null>`avg(${powerSamples.hz})`,
					pf: sql<number | null>`avg(${powerSamples.pf})`,
					pfMin: sql<number | null>`min(${powerSamples.pf_min})`,
					alarm: sql<boolean>`bool_or(${powerSamples.alarm})`,
				})
				.from(powerSamples)
				.where(and(...conditions))
				.groupBy(powerSamples.monitor_id, sql`bucket`)
				.orderBy(sql`bucket`);

			const byMonitor: Record<string, PowerHistoryPoint[]> = {};
			for (const row of rows) {
				(byMonitor[row.monitorId] ??= []).push({
					time: Number(row.bucket) * 1000,
					volts: Number(row.volts),
					voltsMin: Number(row.voltsMin),
					voltsMax: Number(row.voltsMax),
					amps: Number(row.amps),
					ampsMax: Number(row.ampsMax),
					watts: Number(row.watts),
					wattsMax: Number(row.wattsMax),
					hz: row.hz === null ? null : Number(row.hz),
					pf: row.pf === null ? null : Number(row.pf),
					pfMin: row.pfMin === null ? null : Number(row.pfMin),
					alarm: Boolean(row.alarm),
				});
			}
			return { bucketSeconds: bucket, monitors: byMonitor };
		}),

	/**
	 * Per-monitor totals for the event. Energy is summed from forward movement of
	 * the meter's own counter, so a mid-event `/api/reset-energy` (or a meter
	 * swap) drops one interval instead of subtracting the whole event.
	 */
	summary: eventProcedure.query(async ({ ctx }) => {
		const rows = await db.execute<{
			monitor_id: string;
			first_seen: Date;
			last_seen: Date;
			samples: number;
			energy_kwh: number | null;
			peak_amps: number;
			min_volts: number;
			max_volts: number;
			avg_watts: number;
			peak_watts: number;
			min_pf: number | null;
			avg_pf: number | null;
			min_hz: number | null;
			max_hz: number | null;
			alarm_seconds: number;
		}>(sql`
			select
				monitor_id,
				min(time) as first_seen,
				max(time) as last_seen,
				count(*)::int as samples,
				sum(greatest(delta, 0)) as energy_kwh,
				max(amps_max) as peak_amps,
				min(volts_min) as min_volts,
				max(volts_max) as max_volts,
				avg(watts) as avg_watts,
				max(watts_max) as peak_watts,
				min(pf_min) as min_pf,
				avg(pf) as avg_pf,
				min(hz_min) as min_hz,
				max(hz) as max_hz,
				count(*) filter (where alarm)::int as alarm_seconds
			from (
				select
					monitor_id, time, amps_max, volts_min, volts_max, watts, watts_max,
					pf, pf_min, hz, hz_min, alarm,
					kwh - lag(kwh) over (partition by monitor_id order by time) as delta
				from power_samples
				where event = ${ctx.event.code}
			) deltas
			group by monitor_id
			order by monitor_id
		`);

		return (rows.rows ?? []).map(
			(r): PowerMonitorSummary => ({
				monitorId: r.monitor_id,
				firstSeen: new Date(r.first_seen).getTime(),
				lastSeen: new Date(r.last_seen).getTime(),
				samples: Number(r.samples),
				energyKwh: Number(r.energy_kwh ?? 0),
				peakAmps: Number(r.peak_amps),
				minVolts: Number(r.min_volts),
				maxVolts: Number(r.max_volts),
				avgWatts: Number(r.avg_watts),
				peakWatts: Number(r.peak_watts),
				minPf: r.min_pf === null ? null : Number(r.min_pf),
				avgPf: r.avg_pf === null ? null : Number(r.avg_pf),
				minHz: r.min_hz === null ? null : Number(r.min_hz),
				maxHz: r.max_hz === null ? null : Number(r.max_hz),
				alarmSeconds: Number(r.alarm_seconds ?? 0),
			}),
		);
	}),

	/** Which monitors have reported recently, for the connection indicators. */
	monitors: eventProcedure.query(async ({ ctx }) => {
		const rows = await db
			.select({
				monitorId: powerSamples.monitor_id,
				lastSeen: sql<Date>`max(${powerSamples.time})`,
			})
			.from(powerSamples)
			.where(eq(powerSamples.event, ctx.event.code))
			.groupBy(powerSamples.monitor_id)
			.orderBy(powerSamples.monitor_id);

		return rows.map((r) => ({ monitorId: r.monitorId, lastSeen: new Date(r.lastSeen).getTime() }));
	}),

	/** Read the event's power monitoring flag (the extension asks before sweeping). */
	getEnabled: eventProcedure.query(async ({ ctx }) => {
		return { enabled: ctx.event.powerMonitoring };
	}),

	getAlertSettings: eventProcedure.query(async ({ ctx }) => {
		return powerAlertSettings(ctx.event);
	}),

	setAlertSettings: eventProcedure
		.input(
			z.object({
				enabled: z.boolean(),
				lowVoltage: z.number().min(80).max(130),
				highCurrent: z.number().min(1).max(60),
				sustainSeconds: z.number().int().min(1).max(300),
				offlineSeconds: z.number().int().min(5).max(600),
				cooldownMinutes: z.number().int().min(1).max(120),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const event = ctx.event;
			await db.update(events).set({ powerAlertSettings: input }).where(eq(events.code, event.code));
			event.powerAlertSettings = input;
			return input;
		}),

	setEnabled: eventProcedure.input(z.object({ enabled: z.boolean() })).mutation(async ({ ctx, input }) => {
		const event = ctx.event;
		await db.update(events).set({ powerMonitoring: input.enabled }).where(eq(events.code, event.code));
		event.powerMonitoring = input.enabled;
		bus.publish(`event:${event.code}:power_monitoring`, input.enabled);
		return { enabled: input.enabled };
	}),
});
