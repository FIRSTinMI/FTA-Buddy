import { TRPCError } from "@trpc/server";
import { randomUUID } from "crypto";
import { and, count, desc, eq, inArray, ne, or } from "drizzle-orm";
import { z } from "zod";
import type { MatchEvent, MatchEventUpdateEventData, Note, Profile } from "../../shared/types";
import { ISSUE_SEVERITY, ISSUE_TYPE_MAP } from "../../shared/issue-severity";
import { db } from "../db/db";
import schema, { matchEvents, matchLogs, notes, users } from "../db/schema";
import { eventProcedure, publicProcedure, router } from "../trpc";
import { generateReport } from "../util/report-generator";
import { getEvent } from "../util/get-event";
import { subscriptionQueue } from "../util/subscription";
import { sendSlackMessage } from "../util/slack";
import { createSlackNoteMessage } from "./notes";
import { bus } from "../util/eventBus";

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

/** Convert a Nexus match label (e.g. "Qualification 24") to TBA comp_level / match_number fields. */
function parseNexusLabelToTBA(
	label: string,
): { comp_level: TBASimpleMatch["comp_level"]; match_number: number; set_number: number } | null {
	const qual = label.match(/^Qualification (\d+)( Replay)?$/);
	if (qual) return { comp_level: "qm", match_number: parseInt(qual[1], 10), set_number: 1 };
	const playoff = label.match(/^Playoff (\d+)$/);
	if (playoff) return { comp_level: "sf", match_number: parseInt(playoff[1], 10), set_number: 1 };
	const final_ = label.match(/^Final (\d+)$/);
	if (final_) return { comp_level: "f", match_number: parseInt(final_[1], 10), set_number: 1 };
	const practice = label.match(/^Practice (\d+)$/);
	if (practice) return { comp_level: "qm", match_number: parseInt(practice[1], 10), set_number: 1 };
	return null;
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
			const event = ctx.event;
			// For meshed events, query all sub-event codes (and the parent); otherwise just the current event.
			// In inter-divisional playoffs mode, only query the parent event.
			const eventCodes: string[] = event.meshedEvent
				? event.playoffMode
					? [event.code]
					: [event.code, ...(event.subEvents ?? []).map((e) => e.code)]
				: [event.code];
			const codeFilter =
				eventCodes.length === 1
					? eq(matchEvents.event_code, eventCodes[0])
					: inArray(matchEvents.event_code, eventCodes);
			const filters = [codeFilter];
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
		const event = ctx.event;
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
		const event = ctx.event;
		const rows = await db
			.select()
			.from(matchEvents)
			.where(and(eq(matchEvents.event_code, event.code), eq(matchEvents.team, input.team_number)))
			.orderBy(desc(matchEvents.created_at))
			.execute();

		return rows as MatchEvent[];
	}),

	/** Get the next unplayed match for a team. Prefers Nexus real-time data when available, falls back to TBA. */
	getNextMatchForTeam: eventProcedure
		.input(z.object({ team_number: z.number(), event_code: z.string().optional() }))
		.query(async ({ ctx, input }) => {
			const event = ctx.event;
			const teamStr = String(input.team_number);

			// --- Try Nexus first (real-time field data) ---
			const nexusStatus = event.nexusEventStatus;
			if (nexusStatus?.matches?.length && nexusStatus.nowQueuing) {
				const queuingIdx = nexusStatus.matches.findIndex((m) => m.label === nexusStatus.nowQueuing);
				// Field layout: on-field (queuingIdx-2), on-deck (queuingIdx-1), now-queuing (queuingIdx).
				// The current match on the field is queuingIdx-2; it hasn't completed yet,
				// so start searching from there for the team's next unfinished match.
				const currentMatchIdx = Math.max(0, queuingIdx - 2);

				for (let i = currentMatchIdx; i < nexusStatus.matches.length; i++) {
					const nm = nexusStatus.matches[i];
					const red = nm.redTeams ?? [];
					const blue = nm.blueTeams ?? [];
					const isOnTeam = red.includes(teamStr) || blue.includes(teamStr);
					if (!isOnTeam) continue;

					// Parse Nexus label into TBA-compatible fields
					const parsed = parseNexusLabelToTBA(nm.label);
					if (!parsed) continue;

					return {
						key: `nexus_${nm.label}`,
						comp_level: parsed.comp_level,
						set_number: parsed.set_number,
						match_number: parsed.match_number,
						alliances: {
							red: { score: -1, team_keys: red.filter(Boolean).map((t) => `frc${t}`) },
							blue: { score: -1, team_keys: blue.filter(Boolean).map((t) => `frc${t}`) },
						},
						winning_alliance: null,
						event_key: event.code,
						time: nm.times.estimatedStartTime ? Math.floor(nm.times.estimatedStartTime / 1000) : null,
						actual_time: null,
						predicted_time: nm.times.estimatedStartTime
							? Math.floor(nm.times.estimatedStartTime / 1000)
							: null,
						post_result_time: null,
					} satisfies TBASimpleMatch;
				}

				// Team has no upcoming Nexus matches — return null (don't fall through to stale TBA data)
				return null;
			}

			// --- Fall back to TBA + local match logs ---
			const tbaKey = process.env.TBA_API_KEY;
			if (!tbaKey) return null;

			const tbaEventCode = input.event_code ?? event.code;

			try {
				const res = await fetch(
					`https://www.thebluealliance.com/api/v3/team/frc${input.team_number}/event/${tbaEventCode}/matches/simple`,
					{ headers: { "X-TBA-Auth-Key": tbaKey } },
				);
				if (!res.ok) return null;
				const matches: TBASimpleMatch[] = await res.json();
				if (!Array.isArray(matches)) return null;

				// Also check local match logs so we don't show matches already played locally
				// (TBA's actual_time field can lag behind real-time FMS data)
				const eventCodes: string[] = event.meshedEvent
					? event.playoffMode
						? [event.code]
						: [event.code, ...(event.subEvents ?? []).map((e: { code: string }) => e.code)]
					: [event.code];
				const teamFilter = or(
					eq(matchLogs.blue1, input.team_number),
					eq(matchLogs.blue2, input.team_number),
					eq(matchLogs.blue3, input.team_number),
					eq(matchLogs.red1, input.team_number),
					eq(matchLogs.red2, input.team_number),
					eq(matchLogs.red3, input.team_number),
				);
				const eventFilter =
					eventCodes.length === 1 ? eq(matchLogs.event, eventCodes[0]) : inArray(matchLogs.event, eventCodes);
				const localMatches = await db
					.select({
						match_number: matchLogs.match_number,
						play_number: matchLogs.play_number,
						level: matchLogs.level,
					})
					.from(matchLogs)
					.where(and(eventFilter, teamFilter));

				const tbaLevelToLocal: Record<string, string> = {
					qm: "Qualification",
					ef: "Playoff",
					qf: "Playoff",
					sf: "Playoff",
					f: "Playoff",
				};

				const playedLocally = new Set(localMatches.map((m) => `${m.level}:${m.match_number}:${m.play_number}`));

				const upcoming = matches
					.filter((m) => {
						if (m.actual_time) return false;
						const localLevel = tbaLevelToLocal[m.comp_level] ?? m.comp_level;
						const key = `${localLevel}:${m.match_number}:${m.set_number}`;
						return !playedLocally.has(key);
					})
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

	/** Get completed matches for a team from TBA, merged with match log availability. */
	getCompletedMatchesForTeam: eventProcedure
		.input(z.object({ team_number: z.number() }))
		.query(async ({ ctx, input }) => {
			const event = ctx.event;
			const tbaKey = process.env.TBA_API_KEY;

			// Determine which event codes to query for match logs
			const eventCodes: string[] = event.meshedEvent
				? event.playoffMode
					? [event.code]
					: [event.code, ...(event.subEvents ?? []).map((e) => e.code)]
				: [event.code];

			// Map TBA comp_level to DB level names
			const tbaLevelMap: Record<string, string> = {
				qm: "Qualification",
				ef: "Playoff",
				qf: "Playoff",
				sf: "Playoff",
				f: "Playoff",
			};

			type CompletedMatch = {
				match_number: number;
				play_number: number;
				level: string;
				match_log_id: string | null;
			};

			// Get match logs from DB
			const teamFilter = or(
				eq(matchLogs.blue1, input.team_number),
				eq(matchLogs.blue2, input.team_number),
				eq(matchLogs.blue3, input.team_number),
				eq(matchLogs.red1, input.team_number),
				eq(matchLogs.red2, input.team_number),
				eq(matchLogs.red3, input.team_number),
			);
			const eventFilter =
				eventCodes.length === 1 ? eq(matchLogs.event, eventCodes[0]) : inArray(matchLogs.event, eventCodes);
			const dbMatches = await db
				.select({
					id: matchLogs.id,
					match_number: matchLogs.match_number,
					play_number: matchLogs.play_number,
					level: matchLogs.level,
				})
				.from(matchLogs)
				.where(and(eventFilter, teamFilter));

			const results: CompletedMatch[] = dbMatches.map((m) => ({
				match_number: m.match_number,
				play_number: m.play_number,
				level: m.level,
				match_log_id: m.id,
			}));

			// Fetch completed matches from TBA and merge
			if (tbaKey) {
				// For meshed events, try all sub-event codes on TBA
				const tbaEventCodes = eventCodes;
				for (const code of tbaEventCodes) {
					try {
						const res = await fetch(
							`https://www.thebluealliance.com/api/v3/team/frc${input.team_number}/event/${code}/matches/simple`,
							{ headers: { "X-TBA-Auth-Key": tbaKey } },
						);
						if (!res.ok) continue;
						const matches: TBASimpleMatch[] = await res.json();
						if (!Array.isArray(matches)) continue;

						for (const m of matches) {
							if (!m.actual_time) continue; // Skip unplayed matches
							const level = tbaLevelMap[m.comp_level] ?? m.comp_level;
							const matchNum = m.match_number;
							const playNum = m.set_number;
							// Check if already in results from DB
							const existing = results.find(
								(r) => r.match_number === matchNum && r.level === level && r.play_number === playNum,
							);
							if (!existing) {
								results.push({
									match_number: matchNum,
									play_number: playNum,
									level,
									match_log_id: null,
								});
							}
						}
					} catch {
						// TBA fetch failed for this code, continue with others
					}
				}
			}

			// Sort by level priority then match number
			const levelOrder: Record<string, number> = { Qualification: 0, Playoff: 1 };
			results.sort((a, b) => {
				const la = levelOrder[a.level] ?? 2;
				const lb = levelOrder[b.level] ?? 2;
				if (la !== lb) return la - lb;
				return a.match_number - b.match_number;
			});

			return results;
		}),

	/** Dismiss a match event (mark as not needing follow-up). */
	dismiss: eventProcedure.input(z.object({ id: z.uuid() })).mutation(async ({ ctx, input }) => {
		const event = ctx.event;
		// For meshed events in combined mode, allow dismissing events from any sub-event
		const eventCodes: string[] = event.meshedEvent
			? event.playoffMode
				? [event.code]
				: [event.code, ...(event.subEvents ?? []).map((e) => e.code)]
			: [event.code];
		const codeFilter =
			eventCodes.length === 1
				? eq(matchEvents.event_code, eventCodes[0])
				: inArray(matchEvents.event_code, eventCodes);
		const result = await db
			.update(matchEvents)
			.set({ status: "dismissed" })
			.where(and(eq(matchEvents.id, input.id), codeFilter))
			.returning()
			.execute();

		if (result.length === 0) {
			throw new TRPCError({ code: "NOT_FOUND", message: "Match event not found" });
		}

		bus.publish(`event:${result[0].event_code}:match_event:dismiss`, {
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
			const event = ctx.event;

			// For meshed events in combined mode, allow converting events from any sub-event
			const eventCodes: string[] = event.meshedEvent
				? event.playoffMode
					? [event.code]
					: [event.code, ...(event.subEvents ?? []).map((e) => e.code)]
				: [event.code];
			const codeFilter =
				eventCodes.length === 1
					? eq(matchEvents.event_code, eventCodes[0])
					: inArray(matchEvents.event_code, eventCodes);

			// Get the match event
			const [matchEvent] = await db
				.select()
				.from(matchEvents)
				.where(and(eq(matchEvents.id, input.id), codeFilter))
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
			bus.publish(`event:${event.code}:note_update`, { kind: "create", note: newNote as Note });
			bus.publish(`event:${event.code}:match_event:convert`, {
				kind: "match_event_convert",
				id: input.id,
				note_id: noteId,
			});

			// Send Slack message now that this has been promoted to a real note
			if (event.slackChannel && event.slackTeam) {
				try {
					const messageTS = await sendSlackMessage(
						event.slackChannel,
						event.slackTeam,
						createSlackNoteMessage(
							noteId,
							newNote.team,
							newNote.team !== null
								? ((
										await db
											.select({ name: schema.teams.name })
											.from(schema.teams)
											.where(eq(schema.teams.number, String(newNote.team)))
											.limit(1)
									)[0]?.name ?? null)
								: null,
							authorProfile[0].username,
							newNote.text,
							event.code,
							newNote.match_id ?? undefined,
							event.token,
						),
					);
					await db
						.update(notes)
						.set({ slack_ts: messageTS, slack_channel: event.slackChannel })
						.where(eq(notes.id, noteId))
						.execute();
				} catch (err) {
					console.error("Failed to send Slack message for converted note:", err);
				}
			}

			return { noteId, success: true };
		}),

	/** Dismiss all active match events for this event. */
	dismissAll: eventProcedure.mutation(async ({ ctx }) => {
		const event = ctx.event;
		// For meshed events in combined mode, dismiss events from all sub-events
		const eventCodes: string[] = event.meshedEvent
			? event.playoffMode
				? [event.code]
				: [event.code, ...(event.subEvents ?? []).map((e) => e.code)]
			: [event.code];
		const codeFilter =
			eventCodes.length === 1
				? eq(matchEvents.event_code, eventCodes[0])
				: inArray(matchEvents.event_code, eventCodes);
		const dismissed = await db
			.update(matchEvents)
			.set({ status: "dismissed" })
			.where(and(codeFilter, eq(matchEvents.status, "active")))
			.returning({ id: matchEvents.id, event_code: matchEvents.event_code })
			.execute();

		for (const row of dismissed) {
			bus.publish(`event:${row.event_code}:match_event:dismiss`, {
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

		const eventCodesToListen = [event.code];
		if (event.meshedEvent && event.subEvents && !event.playoffMode) {
			eventCodesToListen.push(...event.subEvents.map((s) => s.code));
		}

		const unsubs: Array<() => void> = [];
		for (const code of eventCodesToListen) {
			unsubs.push(
				bus.subscribe(`event:${code}:match_event:create`, (data) => push(data as MatchEventUpdateEventData)),
			);
			unsubs.push(
				bus.subscribe(`event:${code}:match_event:dismiss`, (data) => push(data as MatchEventUpdateEventData)),
			);
			unsubs.push(
				bus.subscribe(`event:${code}:match_event:convert`, (data) => push(data as MatchEventUpdateEventData)),
			);
		}

		const heartbeat = setInterval(() => push({ kind: "heartbeat" }), 30_000);

		try {
			yield* drain();
		} finally {
			for (const unsub of unsubs) unsub();
			clearInterval(heartbeat);
		}
	}),
});
