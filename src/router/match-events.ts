import { TRPCError } from "@trpc/server";
import { randomUUID } from "crypto";
import { and, count, desc, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import type { MatchEvent, MatchEventUpdateEventData, Note, Profile } from "../../shared/types";
import { ISSUE_SEVERITY, ISSUE_TYPE_MAP } from "../../shared/issue-severity";
import { db } from "../db/db";
import { matchEvents, notes, users } from "../db/schema";
import { eventProcedure, publicProcedure, router } from "../trpc";
import { generateReport } from "../util/report-generator";
import { getEvent } from "../util/get-event";
import { subscriptionQueue } from "../util/subscription";

interface TBASimpleMatch {
	key: string;
	comp_level: "qm" | "ef" | "qf" | "sf" | "f";
	set_number: number;
	match_number: number;
	alliances: {
		red: { score: number; team_keys: string[] };
		blue: { score: number; team_keys: string[] };
	};
	winning_alliance: "red" | "blue" | "" | null;
	event_key: string;
	time: number | null;
	actual_time: number | null;
	predicted_time: number | null;
	post_result_time: number | null;
}

export const matchEventsRouter = router({
	/** Get all match events for the current event, filtered by status. */
	getAll: eventProcedure
		.input(
			z
				.object({
					status: z.enum(["active", "dismissed", "converted"]).optional(),
					team: z.number().optional(),
				})
				.optional(),
		)
		.query(async ({ ctx, input }) => {
			const event = await getEvent(ctx.event.token);
			const filters = [eq(matchEvents.event_code, event.code)];
			if (input?.status) filters.push(eq(matchEvents.status, input.status));
			if (input?.team) filters.push(eq(matchEvents.team, input.team));

			const rows = await db
				.select()
				.from(matchEvents)
				.where(and(...filters))
				.orderBy(desc(matchEvents.created_at))
				.execute();

			return rows as MatchEvent[];
		}),

	/** Get match events for a specific team across all their matches (for field view summaries). Includes dismissed/converted events. */
	getByTeam: eventProcedure.input(z.object({ team_number: z.number() })).query(async ({ ctx, input }) => {
		const event = await getEvent(ctx.event.token);
		const rows = await db
			.select()
			.from(matchEvents)
			.where(and(eq(matchEvents.event_code, event.code), eq(matchEvents.team, input.team_number)))
			.orderBy(desc(matchEvents.created_at))
			.execute();

		return rows as MatchEvent[];
	}),

	/** Get ALL match events for a team (including dismissed/converted) for team history page. */
	getAllByTeam: eventProcedure.input(z.object({ team_number: z.number() })).query(async ({ ctx, input }) => {
		const event = await getEvent(ctx.event.token);
		const rows = await db
			.select()
			.from(matchEvents)
			.where(and(eq(matchEvents.event_code, event.code), eq(matchEvents.team, input.team_number)))
			.orderBy(desc(matchEvents.created_at))
			.execute();

		return rows as MatchEvent[];
	}),

	/** Get the next unplayed match for a team from TBA (not stored, fetched on demand). */
	getNextMatchForTeam: eventProcedure.input(z.object({ team_number: z.number() })).query(async ({ ctx, input }) => {
		const event = await getEvent(ctx.event.token);
		const tbaKey = process.env.TBA_API_KEY;
		if (!tbaKey) return null;

		try {
			const res = await fetch(
				`https://www.thebluealliance.com/api/v3/team/frc${input.team_number}/event/${event.code}/matches/simple`,
				{ headers: { "X-TBA-Auth-Key": tbaKey } },
			);
			if (!res.ok) return null;
			const matches: TBASimpleMatch[] = await res.json();
			if (!Array.isArray(matches)) return null;

			// Unplayed = actual_time is null or 0
			const upcoming = matches
				.filter((m) => !m.actual_time)
				.sort((a, b) => {
					const ta = a.predicted_time ?? a.time ?? 0;
					const tb = b.predicted_time ?? b.time ?? 0;
					return ta - tb;
				});

			return upcoming[0] ?? null;
		} catch {
			return null;
		}
	}),

	/** Dismiss a match event (mark as not needing follow-up). */
	dismiss: eventProcedure.input(z.object({ id: z.uuid() })).mutation(async ({ ctx, input }) => {
		const event = await getEvent(ctx.event.token);
		const result = await db
			.update(matchEvents)
			.set({ status: "dismissed" })
			.where(and(eq(matchEvents.id, input.id), eq(matchEvents.event_code, event.code)))
			.returning()
			.execute();

		if (result.length === 0) {
			throw new TRPCError({ code: "NOT_FOUND", message: "Match event not found" });
		}

		event.matchEventEmitter.emit("dismiss", {
			kind: "match_event_dismiss",
			id: input.id,
		});

		return { success: true };
	}),

	/** Convert a match event into a full note for follow-up. */
	convertToNote: eventProcedure
		.input(
			z.object({
				id: z.uuid(),
				text: z.string().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const event = await getEvent(ctx.event.token);

			// Get the match event
			const [matchEvent] = await db
				.select()
				.from(matchEvents)
				.where(and(eq(matchEvents.id, input.id), eq(matchEvents.event_code, event.code)))
				.execute();

			if (!matchEvent) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Match event not found" });
			}

			if (matchEvent.status === "converted") {
				throw new TRPCError({ code: "BAD_REQUEST", message: "Event already converted to a note" });
			}

			// Look up the current user from token
			if (!ctx.token) {
				throw new TRPCError({ code: "UNAUTHORIZED", message: "Missing auth token, please log in" });
			}
			const authorProfile = (await db
				.select({ id: users.id, username: users.username, role: users.role, admin: users.admin })
				.from(users)
				.where(eq(users.token, ctx.token))) as Profile[];
			if (!authorProfile[0])
				throw new TRPCError({ code: "NOT_FOUND", message: "Unable to retrieve author profile" });

			// Map log issue types to note issue types
			const issueTypeMap: Record<string, string> = {
				"Code disconnect": "RoboRioIssue",
				"RIO disconnect": "RoboRioIssue",
				"Radio disconnect": "RadioIssue",
				"DS disconnect": "DSIssue",
				Brownout: "RobotPwrIssue",
				"Large spike in ping": "RadioIssue",
				"Sustained high ping": "RadioIssue",
				"Low signal": "RadioIssue",
				"High BWU": "RadioIssue",
			};

			// Build note text from all issues in a combined event
			const issueList = (matchEvent.issues as { issue: string; duration: number | null }[] | null) ?? [
				{ issue: matchEvent.issue, duration: matchEvent.duration },
			];

			// Pick the highest-severity issue from the full list for note classification
			const primaryIssueFromList = issueList.reduce((best, d) =>
				(ISSUE_SEVERITY[d.issue] ?? 4) < (ISSUE_SEVERITY[best.issue] ?? 4) ? d : best,
			).issue;
			const noteText =
				input.text ||
				`[Auto] ${issueList.map((d) => `${d.issue} (${Math.abs(d.duration ?? 0).toFixed(0)}s)`).join(", ")} in match ${matchEvent.match_number}`;

			const { noteId, newNote } = await db.transaction(async (tx) => {
				const newNoteId = randomUUID();
				const [insertedNote] = await tx
					.insert(notes)
					.values({
						id: newNoteId,
						text: noteText,
						author_id: authorProfile[0].id,
						author: authorProfile[0],
						team: matchEvent.team,
						note_type: "TeamIssue",
						resolution_status: "Open",
						issue_type: (ISSUE_TYPE_MAP[primaryIssueFromList] ?? "Other") as any,
						match_number: matchEvent.match_number,
						play_number: matchEvent.play_number,
						tournament_level: matchEvent.level as any,
						event_code: event.code,
						match_id: matchEvent.match_id,
					})
					.returning()
					.execute();

				await tx
					.update(matchEvents)
					.set({ status: "converted", converted_note_id: newNoteId })
					.where(eq(matchEvents.id, input.id))
					.execute();

				return { noteId: newNoteId, newNote: insertedNote };
			});

			// Emit events
			event.noteUpdateEmitter.emit("note_update", { kind: "create", note: newNote as Note });
			event.matchEventEmitter.emit("convert", {
				kind: "match_event_convert",
				id: input.id,
				note_id: noteId,
			});

			return { noteId, success: true };
		}),

	/** Dismiss all active match events for this event. */
	dismissAll: eventProcedure.mutation(async ({ ctx }) => {
		const event = await getEvent(ctx.event.token);
		const dismissed = await db
			.update(matchEvents)
			.set({ status: "dismissed" })
			.where(and(eq(matchEvents.event_code, event.code), eq(matchEvents.status, "active")))
			.returning({ id: matchEvents.id })
			.execute();

		for (const row of dismissed) {
			event.matchEventEmitter.emit("dismiss", {
				kind: "match_event_dismiss",
				id: row.id,
			});
		}

		return { dismissed: dismissed.length };
	}),

	/** Generate a per-team summary PDF of match events for the event (Qual + Playoff, excludes Bypassed). */
	generateRobotEventReport: eventProcedure.query(async ({ ctx }) => {
		const abbrev: Record<string, string> = {
			"Code disconnect": "Code",
			"RIO disconnect": "RIO",
			"Radio disconnect": "Radio",
			"DS disconnect": "DS",
			"Large spike in ping": "Ping Spike",
			"Sustained high ping": "High Ping",
			"Low signal": "Low Sig",
			"High BWU": "High BWU",
			Brownout: "Brownout",
		};

		const rows = await db
			.select({
				team: matchEvents.team,
				issue: matchEvents.issue,
				issues: matchEvents.issues,
				status: matchEvents.status,
				note_resolution: notes.resolution_status,
			})
			.from(matchEvents)
			.leftJoin(notes, eq(matchEvents.converted_note_id, notes.id))
			.where(
				and(
					eq(matchEvents.event_code, ctx.event.code),
					inArray(matchEvents.level, ["Qualification", "Playoff"]),
					ne(matchEvents.issue, "Bypassed"),
				),
			)
			.execute();

		// Count bypassed matches per team
		const bypassRows = await db
			.select({ team: matchEvents.team, count: count() })
			.from(matchEvents)
			.where(
				and(
					eq(matchEvents.event_code, ctx.event.code),
					inArray(matchEvents.level, ["Qualification", "Playoff"]),
					eq(matchEvents.issue, "Bypassed"),
				),
			)
			.groupBy(matchEvents.team)
			.execute();
		const bypassCountByTeam = new Map<number, number>(bypassRows.map((r) => [r.team, r.count]));

		// Aggregate by team
		const teamMap = new Map<
			number,
			{
				total: number;
				untouched: number;
				dismissed: number;
				converted: number;
				resolved: number;
				unresolved: number;
				issueCounts: Map<string, number>;
			}
		>();

		for (const row of rows) {
			if (!teamMap.has(row.team)) {
				teamMap.set(row.team, {
					total: 0,
					untouched: 0,
					dismissed: 0,
					converted: 0,
					resolved: 0,
					unresolved: 0,
					issueCounts: new Map(),
				});
			}
			const t = teamMap.get(row.team)!;
			t.total++;
			if (row.status === "active") t.untouched++;
			if (row.status === "dismissed") t.dismissed++;
			if (row.status === "converted") {
				t.converted++;
				if (row.note_resolution === "Resolved") t.resolved++;
				else if (row.note_resolution === "Open") t.unresolved++;
			}
			// Count each sub-issue in a combined event
			const details = (row.issues as { issue: string }[] | null) ?? [{ issue: row.issue }];
			for (const d of details) {
				const label = abbrev[d.issue] ?? d.issue;
				t.issueCounts.set(label, (t.issueCounts.get(label) ?? 0) + 1);
			}
		}

		// Sort teams by total issues descending
		const sorted = Array.from(teamMap.entries()).sort((a, b) => b[1].total - a[1].total);

		const report = await generateReport(
			{
				title: "Robot Event Report",
				description: "Per-team match event summary (Qual + Playoff, excludes Bypassed)",
				headers: [
					"Team",
					"Total",
					"Untouched",
					"Dismissed",
					"Notes",
					"Resolved",
					"Unresolved",
					"Bypassed",
					"Top Issue",
					"Issue Breakdown",
				],
				fileName: "robot-events",
			},
			sorted.map(([team, data]) => {
				const sortedIssues = Array.from(data.issueCounts.entries()).sort((a, b) => b[1] - a[1]);
				const topIssue = sortedIssues[0]?.[0] ?? "-";
				const breakdown = sortedIssues.map(([label, cnt]) => `${label} x${cnt}`).join(", ");
				return [
					team,
					data.total,
					data.untouched,
					data.dismissed,
					data.converted,
					data.resolved,
					data.unresolved,
					bypassCountByTeam.get(team) ?? 0,
					topIssue,
					breakdown,
				];
			}),
			ctx.event.code,
		);

		return { path: report };
	}),

	/** Real-time subscription for match event updates. */
	updateSubscription: publicProcedure.input(z.object({ eventToken: z.string() })).subscription(async function* ({
		input,
		signal,
	}) {
		const event = await getEvent(input.eventToken);
		const { push, drain } = subscriptionQueue<MatchEventUpdateEventData>(signal!);

		const handlers: {
			event: keyof import("../../shared/types").MatchEventUpdateEvents;
			fn: (...args: any[]) => void;
		}[] = [];

		function registerHandler<K extends keyof import("../../shared/types").MatchEventUpdateEvents>(
			eventName: K,
			handler: import("../../shared/types").MatchEventUpdateEvents[K],
		) {
			handlers.push({ event: eventName, fn: handler as any });
			event.matchEventEmitter.on(eventName, handler);
		}

		registerHandler("create", (data) => push(data));
		registerHandler("dismiss", (data) => push(data));
		registerHandler("convert", (data) => push(data));

		try {
			yield* drain();
		} finally {
			for (const h of handlers) {
				event.matchEventEmitter.off(h.event, h.fn as any);
			}
		}
	}),
});
