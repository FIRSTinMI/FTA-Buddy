import { randomUUID } from "crypto";
import { z } from "zod";
import { db } from "../db/db";
import { appTelemetry } from "../db/schema";
import { publicProcedure, router } from "../trpc";

export const telemetryRouter = router({
	batchTrack: publicProcedure
		.input(
			z.object({
				events: z
					.array(
						z.object({
							event_type: z.string().max(50),
							event_code: z.string().optional(),
							metadata: z.record(z.unknown()).optional(),
						}),
					)
					.max(20),
			}),
		)
		.mutation(async ({ input }) => {
			if (input.events.length === 0) return { ok: true };
			// Fire-and-forget — don't block the response, swallow errors
			db.insert(appTelemetry)
				.values(
					input.events.map((e) => ({
						id: randomUUID(),
						event_type: e.event_type,
						event_code: e.event_code ?? null,
						metadata: e.metadata ?? null,
					})),
				)
				.execute()
				.catch(() => {});
			return { ok: true };
		}),
});
