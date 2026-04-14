import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { bus } from "../util/eventBus";
import type { EventChecklist } from "../../shared/types";
import { db } from "../db/db";
import { events } from "../db/schema";
import { eventProcedure, publicProcedure, router } from "../trpc";
import { getEvent } from "../util/get-event";
import { subscriptionQueue } from "../util/subscription";

export const checklistRouter = router({
	get: eventProcedure.query(async ({ input, ctx }) => {
		if (ctx.event.meshedEvent) {
			const subEventCodes = (ctx.event.meshedEvent as Array<{ code: string }>).map((e) => e.code);
			const rows = await db
				.select({ checklist: events.checklist })
				.from(events)
				.where(inArray(events.code, subEventCodes));
			const merged: EventChecklist = {};
			for (const row of rows) Object.assign(merged, row.checklist as EventChecklist);
			return merged;
		}
		return ctx.event.checklist as EventChecklist;
	}),

	update: eventProcedure
		.input(
			z.array(
				z.object({
					team: z.string(),
					key: z.enum(["present", "weighed", "inspected", "radioProgrammed", "connectionTested"]),
					value: z.boolean(),
				}),
			),
		)
		.mutation(async ({ input, ctx }) => {
			const checklist = ctx.event.checklist as EventChecklist;
			for (const i of input) {
				checklist[i.team][i.key] = i.value;
			}

			await db.update(events).set({ checklist }).where(eq(events.code, ctx.event.code));

			const event = await getEvent(ctx.event.token);
			event.checklist = checklist;
			bus.publish(`event:${event.code}:checklist`, checklist);

			let extensionId = ctx.extensionId;
			console.log("extensionId", extensionId, input.length);
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

			if (event.subEvents) {
				const subEventCodes = (event.subEvents as Array<{ code: string }>).map((e) => e.code);
				async function getMerged(): Promise<EventChecklist> {
					const rows = await db
						.select({ checklist: events.checklist })
						.from(events)
						.where(inArray(events.code, subEventCodes));
					const merged: EventChecklist = {};
					for (const row of rows) Object.assign(merged, row.checklist as EventChecklist);
					return merged;
				}
				unsubs = subEventCodes.map((code) =>
					bus.subscribe(`event:${code}:checklist`, async () => push(await getMerged())),
				);
				heartbeatFn = async () => push(await getMerged());
			} else {
				unsubs = [bus.subscribe(`event:${event.code}:checklist`, (data) => push(data as EventChecklist))];
				heartbeatFn = () => push(event.checklist as EventChecklist);
			}

			const heartbeat = setInterval(heartbeatFn, 30_000);
			try {
				for await (const item of drain()) {
					yield item;
				}
			} finally {
				unsubs.forEach((fn) => fn());
				clearInterval(heartbeat);
			}
		}),
});
