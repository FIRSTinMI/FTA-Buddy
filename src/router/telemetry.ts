import { randomUUID } from "crypto";
import { z } from "zod";
import { db } from "../db/db";
import { appTelemetry } from "../db/schema";
import { publicProcedure, resolveUserFromToken, router } from "../trpc";
import { activeIdentity, recordActive } from "../util/active-users";
import { eventCodeForToken } from "../util/extension-presence";
import { errorReportSchema, storeErrorReport } from "../util/error-reports";

export const telemetryRouter = router({
	batchTrack: publicProcedure
		.input(
			z.object({
				events: z
					.array(
						z.object({
							event_type: z.string().max(50),
							event_code: z.string().optional(),
							metadata: z.record(z.string(), z.unknown()).optional(),
						}),
					)
					.max(20),
			}),
		)
		.mutation(async ({ input }) => {
			if (input.events.length === 0) return { ok: true };
			// Fire-and-forget - don't block the response, swallow errors
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

	// Web app and extension -> server: batched JavaScript errors, stored as `client-error` /
	// `extension-error` debug log rows. Public (an error can happen before sign-in); the user and
	// event come from the tokens, never from the payload; rate limited per IP and identity.
	reportErrors: publicProcedure.input(errorReportSchema).mutation(async ({ ctx, input }) => {
		let userId: number | null = null;
		if (ctx.token && ctx.token !== "undefined" && ctx.token !== "null") {
			try {
				userId = (await resolveUserFromToken(ctx.token))?.id ?? null;
			} catch (err) {
				console.warn("[telemetry] reportErrors token check failed:", err);
			}
		}
		let eventCode: string | null = null;
		try {
			eventCode = await eventCodeForToken(ctx.eventToken);
		} catch (err) {
			console.warn("[telemetry] reportErrors event lookup failed:", err);
		}
		try {
			return await storeErrorReport(input, {
				ip: ctx.ip,
				userId,
				extensionId: ctx.extensionId ?? input.extensionId,
				eventCode,
				userAgent: ctx.userAgent,
			});
		} catch (err) {
			// Reporting must never fail the reporter; Redis trouble only shows in the console.
			console.error("[telemetry] reportErrors failed:", err);
			return { accepted: 0, dropped: 0 };
		}
	}),

	// App -> server every 4 minutes while a tab is visible, for the admin
	// active-users chart. The user comes from the auth token, never from the
	// client; without a valid token the random device id stands in.
	activeHeartbeat: publicProcedure
		.input(z.object({ deviceId: z.string().min(8).max(64), fieldMonitor: z.boolean().optional().default(false) }))
		.mutation(async ({ ctx, input }) => {
			let userId: number | null = null;
			if (ctx.token && ctx.token !== "undefined" && ctx.token !== "null") {
				try {
					userId = (await resolveUserFromToken(ctx.token))?.id ?? null;
				} catch (err) {
					console.warn("[telemetry] activeHeartbeat token check failed:", err);
				}
			}
			await recordActive(activeIdentity(userId, input.deviceId), input.fieldMonitor);
			return { ok: true };
		}),
});
