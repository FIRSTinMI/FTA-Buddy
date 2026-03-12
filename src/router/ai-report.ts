import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { TRPCError } from "@trpc/server";
import { db } from "../db/db";
import { aiEventReports } from "../db/schema";
import { eventProcedure, router } from "../trpc";
import { getEvent } from "../util/get-event";
import { generateAiEventReport } from "../util/ai-report-generator";

export const aiReportRouter = router({
	/** Get the current AI report status for this event (null if never started). */
	getStatus: eventProcedure.query(async ({ ctx }) => {
		const [row] = await db
			.select()
			.from(aiEventReports)
			.where(eq(aiEventReports.event_code, ctx.event.code))
			.execute();
		return row ?? null;
	}),

	/** Kick off AI report generation. One-time per event; retryable on error status. */
	start: eventProcedure.mutation(async ({ ctx }) => {
		const event = await getEvent(ctx.eventToken as string);

		const [existing] = await db
			.select()
			.from(aiEventReports)
			.where(eq(aiEventReports.event_code, event.code))
			.execute();

		if (existing) {
			if (existing.status === "ready") {
				throw new TRPCError({
					code: "CONFLICT",
					message: "Report has already been generated for this event.",
				});
			}
			if (existing.status === "generating" || existing.status === "pending") {
				throw new TRPCError({
					code: "CONFLICT",
					message: "Report generation is already in progress.",
				});
			}
			// status === "error" — allow retry by deleting old row
			await db.delete(aiEventReports).where(eq(aiEventReports.event_code, event.code)).execute();
		}

		const reportId = randomUUID();
		await db
			.insert(aiEventReports)
			.values({
				id: reportId,
				event_code: event.code,
				status: "pending",
			})
			.execute();

		// Fire-and-forget generation (consistent with logAnalysisLoop pattern)
		(async () => {
			try {
				await db
					.update(aiEventReports)
					.set({ status: "generating" })
					.where(eq(aiEventReports.event_code, event.code))
					.execute();

				const teamCount = Array.isArray(event.teams) ? event.teams.length : 0;
				const filePath = await generateAiEventReport(
					event.code,
					event.name,
					event.startDate ?? null,
					event.endDate ?? null,
					teamCount,
				);

				await db
					.update(aiEventReports)
					.set({ status: "ready", file_path: filePath, completed_at: new Date() })
					.where(eq(aiEventReports.event_code, event.code))
					.execute();
			} catch (err: any) {
				console.error("[AI Report] Generation failed:", err);
				await db
					.update(aiEventReports)
					.set({ status: "error", error_message: String(err?.message ?? err).slice(0, 500) })
					.where(eq(aiEventReports.event_code, event.code))
					.execute();
			}
		})();

		return { status: "pending" as const };
	}),
});
