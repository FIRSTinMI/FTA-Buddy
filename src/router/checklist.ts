import { eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { bus } from "../util/eventBus";
import type { EventChecklist, TeamChecklist } from "../../shared/types";
import { db } from "../db/db";
import schema from "../db/schema";
import { eventProcedure, publicProcedure, router } from "../trpc";
import { getEvent } from "../util/get-event";
import { getChecklist, setChecklist } from "../util/event-state";
import { subscriptionQueue } from "../util/subscription";

function rowsToChecklist(
	rows: {
		teamNumber: string;
		present: boolean;
		inspected: boolean;
		radioProgrammed: boolean;
		connectionTested: boolean;
	}[],
): EventChecklist {
	const cl: EventChecklist = {};
	for (const row of rows) {
		cl[row.teamNumber] = {
			present: row.present,
			inspected: row.inspected,
			radioProgrammed: row.radioProgrammed,
			connectionTested: row.connectionTested,
		};
	}
	return cl;
}

export const checklistRouter = router({
	get: eventProcedure.query(async ({ ctx }) => {
		if (ctx.event.meshedEvent) {
			const subEventCodes = (ctx.event.subEvents ?? []).map((e) => e.code);
			const rows = await db
				.select()
				.from(schema.checklist)
				.where(inArray(schema.checklist.eventCode, subEventCodes));
			return rowsToChecklist(rows);
		}
		const rows = await db.select().from(schema.checklist).where(eq(schema.checklist.eventCode, ctx.event.code));
		return rowsToChecklist(rows);
	}),

	update: eventProcedure
		.input(
			z.array(
				z.object({
					team: z.string(),
					key: z.enum(["present", "inspected", "radioProgrammed", "connectionTested"]),
					value: z.boolean(),
				}),
			),
		)
		.mutation(async ({ input, ctx }) => {
			const event = ctx.event;

			// Read current checklist from Redis (fast), apply mutations, write back
			const checklist = await getChecklist(event.code);
			for (const i of input) {
				if (!checklist[i.team]) {
					checklist[i.team] = {
						present: false,
						inspected: false,
						radioProgrammed: false,
						connectionTested: false,
					};
				}
				(checklist[i.team] as any)[i.key] = i.value;
			}

			// Write to Redis and Postgres
			setChecklist(event.code, checklist);

			// Upsert all changed team rows to Postgres
			const teams = [...new Set(input.map((i) => i.team))];
			await db
				.insert(schema.checklist)
				.values(
					teams.map((team) => ({
						eventCode: event.code,
						teamNumber: team,
						present: checklist[team]?.present ?? false,
						inspected: checklist[team]?.inspected ?? false,
						radioProgrammed: checklist[team]?.radioProgrammed ?? false,
						connectionTested: checklist[team]?.connectionTested ?? false,
					})),
				)
				.onConflictDoUpdate({
					target: [schema.checklist.eventCode, schema.checklist.teamNumber],
					set: {
						present: sql`excluded.present`,
						inspected: sql`excluded.inspected`,
						radioProgrammed: sql`excluded.radio_programmed`,
						connectionTested: sql`excluded.connection_tested`,
					},
				});

			bus.publish(`event:${event.code}:checklist`, checklist);

			let extensionId = ctx.extensionId;
			if (extensionId) {
				let connection = event.stats.extensions.find((e) => e.id === extensionId);
				if (!connection) {
					connection = {
						id: extensionId,
						connected: new Date(),
						userAgent: ctx.userAgent,
						ip: ctx.ip,
						lastFrame: new Date(),
						frames: 0,
						checklistUpdates: 0,
					};
					event.stats.extensions.push(connection);
				}
				connection.checklistUpdates += input.length;
			}

			return checklist;
		}),

	subscription: publicProcedure
		.input(
			z.object({
				eventToken: z.string(),
			}),
		)
		.subscription(async function* ({ input, signal }) {
			const event = await getEvent(input.eventToken);
			const { push, drain } = subscriptionQueue<EventChecklist>(signal!);

			let unsubs: Array<() => void>;
			let heartbeatFn: () => void;
			let debounceTimer: ReturnType<typeof setTimeout> | null = null;

			if (event.subEvents) {
				const subEventCodes = event.subEvents.map((e) => e.code);

				// Seed merged state from DB once at subscription creation.
				const rows = await db
					.select()
					.from(schema.checklist)
					.where(inArray(schema.checklist.eventCode, subEventCodes));
				const merged: EventChecklist = rowsToChecklist(rows);

				function schedulePush() {
					if (signal?.aborted) return;
					if (debounceTimer) clearTimeout(debounceTimer);
					debounceTimer = setTimeout(() => {
						debounceTimer = null;
						push({ ...merged });
					}, 50);
				}

				unsubs = subEventCodes.map((code) =>
					bus.subscribe(`event:${code}:checklist`, (data) => {
						Object.assign(merged, data as EventChecklist);
						schedulePush();
					}),
				);
				heartbeatFn = () => push({ ...merged });
			} else {
				unsubs = [bus.subscribe(`event:${event.code}:checklist`, (data) => push(data as EventChecklist))];
				heartbeatFn = () => {
					getChecklist(event.code)
						.then(push)
						.catch((err) => console.error("[Checklist] heartbeat error:", err));
				};
			}

			const heartbeat = setInterval(heartbeatFn, 30_000);
			try {
				for await (const item of drain()) {
					yield item;
				}
			} finally {
				unsubs.forEach((fn) => fn());
				clearInterval(heartbeat);
				if (debounceTimer) clearTimeout(debounceTimer);
			}
		}),
});
