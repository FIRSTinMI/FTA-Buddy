import { inferRouterOutputs } from "@trpc/server";
import { randomUUID } from "crypto";
import { and, asc, count, eq, gt, inArray, ne, or } from "drizzle-orm";
import { z } from "zod";
import { DisconnectionEvent, FMSLogFrame, ROBOT } from "../../shared/types";
import { db } from "../db/db";
import { analyzedLogs, events, logPublishing, matchLogs } from "../db/schema";
import { eventProcedure, publicProcedure, router } from "../trpc";
import { compressStationLog } from "../util/log-analysis";
import { generateReport } from "../util/report-generator";

// FMS generates Windows-style GUIDs which may have version nibbles outside [1-8],
// so we use a permissive hex pattern instead of the strict RFC 4122 z.string().uuid().
const fmsGuid = z
	.string()
	.regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/, "Invalid GUID");

export type MatchRouterOutputs = inferRouterOutputs<typeof matchRouter>;

export const matchRouter = router({
	putMatchLogs: publicProcedure
		.input(
			z.object({
				event: z.string().min(1, "event code must not be empty"),
				fmsMatchId: z.string(),
				fmsEventId: z.string(),
				matchNumber: z.number(),
				playNumber: z.number(),
				level: z.enum(["None", "Practice", "Qualification", "Playoff"]),
				actualStartTime: z.string(),
				teamNumberBlue1: z.number().nullish(),
				teamNumberBlue2: z.number().nullish(),
				teamNumberBlue3: z.number().nullish(),
				teamNumberRed1: z.number().nullish(),
				teamNumberRed2: z.number().nullish(),
				teamNumberRed3: z.number().nullish(),
				logs: z.object({
					blue1: z.array(z.any()).optional(),
					blue2: z.array(z.any()).optional(),
					blue3: z.array(z.any()).optional(),
					red1: z.array(z.any()).optional(),
					red2: z.array(z.any()).optional(),
					red3: z.array(z.any().optional()),
				}),
			}),
		)
		.mutation(async ({ input }) => {
			const existing = await db
				.select({ id: matchLogs.id })
				.from(matchLogs)
				.where(eq(matchLogs.id, input.fmsMatchId))
				.execute();
			if (existing.length > 0) return;

			// Discard logs where no team station is populated (e.g. empty practice slots)
			if (
				input.teamNumberBlue1 == null &&
				input.teamNumberBlue2 == null &&
				input.teamNumberBlue3 == null &&
				input.teamNumberRed1 == null &&
				input.teamNumberRed2 == null &&
				input.teamNumberRed3 == null
			)
				return;

			await db
				.insert(matchLogs)
				.values({
					id: input.fmsMatchId,
					event: input.event.trim().toLowerCase(),
					event_id: input.fmsEventId,
					match_number: input.matchNumber,
					play_number: input.playNumber,
					level: input.level,
					start_time: new Date(input.actualStartTime),
					blue1: input.teamNumberBlue1,
					blue2: input.teamNumberBlue2,
					blue3: input.teamNumberBlue3,
					red1: input.teamNumberRed1,
					red2: input.teamNumberRed2,
					red3: input.teamNumberRed3,
					blue1_log:
						input.teamNumberBlue1 != null && input.logs.blue1
							? compressStationLog(input.logs.blue1 as FMSLogFrame[])
							: null,
					blue2_log:
						input.teamNumberBlue2 != null && input.logs.blue2
							? compressStationLog(input.logs.blue2 as FMSLogFrame[])
							: null,
					blue3_log:
						input.teamNumberBlue3 != null && input.logs.blue3
							? compressStationLog(input.logs.blue3 as FMSLogFrame[])
							: null,
					red1_log:
						input.teamNumberRed1 != null && input.logs.red1
							? compressStationLog(input.logs.red1 as FMSLogFrame[])
							: null,
					red2_log:
						input.teamNumberRed2 != null && input.logs.red2
							? compressStationLog(input.logs.red2 as FMSLogFrame[])
							: null,
					red3_log:
						input.teamNumberRed3 != null && input.logs.red3
							? compressStationLog(input.logs.red3 as FMSLogFrame[])
							: null,
				})
				.execute();
		}),

	putCompressedMatchLogs: publicProcedure
		.input(
			z.object({
				event: z.string().min(1, "event code must not be empty"),
				fmsMatchId: z.string(),
				fmsEventId: z.string(),
				matchNumber: z.number(),
				playNumber: z.number(),
				level: z.enum(["None", "Practice", "Qualification", "Playoff"]),
				actualStartTime: z.string(),
				teamNumberBlue1: z.number().nullish(),
				teamNumberBlue2: z.number().nullish(),
				teamNumberBlue3: z.number().nullish(),
				teamNumberRed1: z.number().nullish(),
				teamNumberRed2: z.number().nullish(),
				teamNumberRed3: z.number().nullish(),
				logs: z.object({
					blue1: z.string().optional(),
					blue2: z.string().optional(),
					blue3: z.string().optional(),
					red1: z.string().optional(),
					red2: z.string().optional(),
					red3: z.string().optional(),
				}),
			}),
		)
		.mutation(async ({ input }) => {
			const existing = await db
				.select({ id: matchLogs.id })
				.from(matchLogs)
				.where(eq(matchLogs.id, input.fmsMatchId))
				.execute();
			if (existing.length > 0) return;

			// Discard logs where no team station is populated (e.g. empty practice slots)
			if (
				input.teamNumberBlue1 == null &&
				input.teamNumberBlue2 == null &&
				input.teamNumberBlue3 == null &&
				input.teamNumberRed1 == null &&
				input.teamNumberRed2 == null &&
				input.teamNumberRed3 == null
			)
				return;

			await db
				.insert(matchLogs)
				.values({
					id: input.fmsMatchId,
					event: input.event.trim().toLowerCase(),
					event_id: input.fmsEventId,
					match_number: input.matchNumber,
					play_number: input.playNumber,
					level: input.level,
					start_time: new Date(input.actualStartTime),
					blue1: input.teamNumberBlue1,
					blue2: input.teamNumberBlue2,
					blue3: input.teamNumberBlue3,
					red1: input.teamNumberRed1,
					red2: input.teamNumberRed2,
					red3: input.teamNumberRed3,
					blue1_log: input.teamNumberBlue1 != null ? input.logs.blue1 : null,
					blue2_log: input.teamNumberBlue2 != null ? input.logs.blue2 : null,
					blue3_log: input.teamNumberBlue3 != null ? input.logs.blue3 : null,
					red1_log: input.teamNumberRed1 != null ? input.logs.red1 : null,
					red2_log: input.teamNumberRed2 != null ? input.logs.red2 : null,
					red3_log: input.teamNumberRed3 != null ? input.logs.red3 : null,
				})
				.execute();
		}),

	/**
	 * Given a list of FMS match IDs, returns the subset that are already stored on the server.
	 * Used by the extension's "Import All" to skip matches that don't need uploading.
	 */
	getUploadedMatchIds: publicProcedure.input(z.object({ ids: z.array(z.string()) })).query(async ({ input }) => {
		if (input.ids.length === 0) return [];
		const rows = await db
			.select({ id: matchLogs.id })
			.from(matchLogs)
			.where(inArray(matchLogs.id, input.ids))
			.execute();
		return rows.map((r) => r.id);
	}),

	getMatchNumbers: eventProcedure
		.input(
			z.object({
				team: z.number(),
			}),
		)
		.query(async ({ ctx, input }) => {
			return await db
				.select({
					id: matchLogs.id,
					match_number: matchLogs.match_number,
					play_number: matchLogs.play_number,
					level: matchLogs.level,
				})
				.from(matchLogs)
				.where(
					and(
						eq(matchLogs.event, ctx.event.code),
						or(
							eq(matchLogs.blue1, input.team),
							eq(matchLogs.blue2, input.team),
							eq(matchLogs.blue3, input.team),
							eq(matchLogs.red1, input.team),
							eq(matchLogs.red2, input.team),
							eq(matchLogs.red3, input.team),
						),
					),
				);
		}),

	/** Returns matches a team has played since a given date, optionally excluding one match by id. */
	getMatchesSince: eventProcedure
		.input(
			z.object({
				team: z.number(),
				since: z.date(),
				exclude_match_id: z.string().optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const teamFilter = or(
				eq(matchLogs.blue1, input.team),
				eq(matchLogs.blue2, input.team),
				eq(matchLogs.blue3, input.team),
				eq(matchLogs.red1, input.team),
				eq(matchLogs.red2, input.team),
				eq(matchLogs.red3, input.team),
			);
			const filters = [eq(matchLogs.event, ctx.event.code), gt(matchLogs.start_time, input.since), teamFilter];
			if (input.exclude_match_id) {
				filters.push(ne(matchLogs.id, input.exclude_match_id));
			}
			return await db
				.select({
					id: matchLogs.id,
					match_number: matchLogs.match_number,
					play_number: matchLogs.play_number,
					level: matchLogs.level,
					start_time: matchLogs.start_time,
					blue1: matchLogs.blue1,
					blue2: matchLogs.blue2,
					blue3: matchLogs.blue3,
					red1: matchLogs.red1,
					red2: matchLogs.red2,
					red3: matchLogs.red3,
				})
				.from(matchLogs)
				.where(and(...filters))
				.orderBy(asc(matchLogs.start_time));
		}),

	getMatches: eventProcedure
		.input(
			z.object({
				level: z.enum(["None", "Practice", "Qualification", "Playoff"]).optional(),
				team: z.number().optional(),
			}),
		)
		.output(
			z.array(
				z.object({
					id: z.string(),
					match_number: z.number(),
					play_number: z.number(),
					level: z.string(),
					start_time: z.date(),
					blue1: z.number().nullable(),
					blue2: z.number().nullable(),
					blue3: z.number().nullable(),
					red1: z.number().nullable(),
					red2: z.number().nullable(),
					red3: z.number().nullable(),
					blue1_has_event: z.boolean(),
					blue2_has_event: z.boolean(),
					blue3_has_event: z.boolean(),
					red1_has_event: z.boolean(),
					red2_has_event: z.boolean(),
					red3_has_event: z.boolean(),
					blue1_bypassed: z.boolean(),
					blue2_bypassed: z.boolean(),
					blue3_bypassed: z.boolean(),
					red1_bypassed: z.boolean(),
					red2_bypassed: z.boolean(),
					red3_bypassed: z.boolean(),
				}),
			),
		)
		.query(async ({ input, ctx }) => {
			const filters = [eq(matchLogs.event, ctx.event.code)];

			if (input.level) filters.push(eq(matchLogs.level, input.level));
			if (input.team)
				filters.push(
					eq(matchLogs.blue1, input.team),
					eq(matchLogs.blue2, input.team),
					eq(matchLogs.blue3, input.team),
					eq(matchLogs.red1, input.team),
					eq(matchLogs.red2, input.team),
					eq(matchLogs.red3, input.team),
				);

			const matches = await db
				.select({
					id: matchLogs.id,
					match_number: matchLogs.match_number,
					play_number: matchLogs.play_number,
					level: matchLogs.level,
					start_time: matchLogs.start_time,
					blue1: matchLogs.blue1,
					blue2: matchLogs.blue2,
					blue3: matchLogs.blue3,
					red1: matchLogs.red1,
					red2: matchLogs.red2,
					red3: matchLogs.red3,
				})
				.from(matchLogs)
				.where(and(...filters))
				.orderBy(asc(matchLogs.start_time));

			if (matches.length === 0) return [];

			const analysisRows = await db
				.select({
					match_id: analyzedLogs.match_id,
					team: analyzedLogs.team,
					issue: analyzedLogs.issue,
				})
				.from(analyzedLogs)
				.where(
					and(
						eq(analyzedLogs.event, ctx.event.code),
						inArray(
							analyzedLogs.match_id,
							matches.map((match) => match.id),
						),
					),
				);

			const teamsWithEvents = new Set(
				analysisRows.filter((row) => row.issue !== "Bypassed").map((row) => `${row.match_id}:${row.team}`),
			);
			const bypassedTeams = new Set(
				analysisRows.filter((row) => row.issue === "Bypassed").map((row) => `${row.match_id}:${row.team}`),
			);

			return matches.map((match) => ({
				...match,
				blue1_has_event: match.blue1 ? teamsWithEvents.has(`${match.id}:${match.blue1}`) : false,
				blue2_has_event: match.blue2 ? teamsWithEvents.has(`${match.id}:${match.blue2}`) : false,
				blue3_has_event: match.blue3 ? teamsWithEvents.has(`${match.id}:${match.blue3}`) : false,
				red1_has_event: match.red1 ? teamsWithEvents.has(`${match.id}:${match.red1}`) : false,
				red2_has_event: match.red2 ? teamsWithEvents.has(`${match.id}:${match.red2}`) : false,
				red3_has_event: match.red3 ? teamsWithEvents.has(`${match.id}:${match.red3}`) : false,
				blue1_bypassed: match.blue1 ? bypassedTeams.has(`${match.id}:${match.blue1}`) : false,
				blue2_bypassed: match.blue2 ? bypassedTeams.has(`${match.id}:${match.blue2}`) : false,
				blue3_bypassed: match.blue3 ? bypassedTeams.has(`${match.id}:${match.blue3}`) : false,
				red1_bypassed: match.red1 ? bypassedTeams.has(`${match.id}:${match.red1}`) : false,
				red2_bypassed: match.red2 ? bypassedTeams.has(`${match.id}:${match.red2}`) : false,
				red3_bypassed: match.red3 ? bypassedTeams.has(`${match.id}:${match.red3}`) : false,
			}));
		}),

	/**
	 * Returns played matches (from DB) merged with unplayed qualifying matches from TBA.
	 * Unplayed matches have id=null and isPlayed=false.
	 */
	getScheduledMatches: eventProcedure
		.output(
			z.array(
				z.object({
					id: z.string().nullable(),
					match_number: z.number(),
					play_number: z.number(),
					level: z.string(),
					blue1: z.number().nullable(),
					blue2: z.number().nullable(),
					blue3: z.number().nullable(),
					red1: z.number().nullable(),
					red2: z.number().nullable(),
					red3: z.number().nullable(),
					isPlayed: z.boolean(),
				}),
			),
		)
		.query(async ({ ctx }) => {
			const tbaKey = process.env.TBA_API_KEY;

			// Load all played matches from DB with full team data
			const playedMatches = await db
				.select({
					id: matchLogs.id,
					match_number: matchLogs.match_number,
					play_number: matchLogs.play_number,
					level: matchLogs.level,
					blue1: matchLogs.blue1,
					blue2: matchLogs.blue2,
					blue3: matchLogs.blue3,
					red1: matchLogs.red1,
					red2: matchLogs.red2,
					red3: matchLogs.red3,
				})
				.from(matchLogs)
				.where(eq(matchLogs.event, ctx.event.code))
				.orderBy(asc(matchLogs.start_time));

			type ScheduledMatch = {
				id: string | null;
				match_number: number;
				play_number: number;
				level: string;
				blue1: number | null;
				blue2: number | null;
				blue3: number | null;
				red1: number | null;
				red2: number | null;
				red3: number | null;
				isPlayed: boolean;
			};

			const result: ScheduledMatch[] = playedMatches.map((m) => ({ ...m, isPlayed: true }));

			if (!tbaKey) return result;

			try {
				const tbaRes = await fetch(
					`https://www.thebluealliance.com/api/v3/event/${ctx.event.code}/matches/simple`,
					{ headers: { "X-TBA-Auth-Key": tbaKey } },
				);
				if (!tbaRes.ok) return result;

				const tbaMatches: {
					comp_level: string;
					match_number: number;
					alliances: {
						blue: { team_keys: string[] };
						red: { team_keys: string[] };
					} | null;
				}[] = await tbaRes.json();

				// Set of already-played qual match numbers (from DB)
				const playedQualNums = new Set(
					playedMatches.filter((m) => m.level === "Qualification").map((m) => m.match_number),
				);

				const tbaTeamNum = (key: string): number | null => {
					const n = parseInt(key.replace("frc", ""), 10);
					return isNaN(n) ? null : n;
				};

				// Add unplayed qualifying matches from TBA
				for (const m of tbaMatches) {
					if (m.comp_level !== "qm") continue;
					if (playedQualNums.has(m.match_number)) continue;
					const blue = m.alliances?.blue?.team_keys ?? [];
					const red = m.alliances?.red?.team_keys ?? [];
					result.push({
						id: null,
						match_number: m.match_number,
						play_number: 1,
						level: "Qualification",
						blue1: tbaTeamNum(blue[0] ?? ""),
						blue2: tbaTeamNum(blue[1] ?? ""),
						blue3: tbaTeamNum(blue[2] ?? ""),
						red1: tbaTeamNum(red[0] ?? ""),
						red2: tbaTeamNum(red[1] ?? ""),
						red3: tbaTeamNum(red[2] ?? ""),
						isPlayed: false,
					});
				}

				// Sort: level order, then match_number, then play_number
				const levelOrder: Record<string, number> = { None: 0, Practice: 1, Qualification: 2, Playoff: 3 };
				result.sort((a, b) => {
					const lo = (levelOrder[a.level] ?? 4) - (levelOrder[b.level] ?? 4);
					if (lo !== 0) return lo;
					if (a.match_number !== b.match_number) return a.match_number - b.match_number;
					return a.play_number - b.play_number;
				});
			} catch {
				// TBA fetch failed - return played matches only (already in result)
			}

			return result;
		}),

	getMatch: eventProcedure
		.input(
			z.object({
				id: fmsGuid,
			}),
		)
		.query(async ({ input, ctx }) => {
			const match = await db.query.matchLogs.findFirst({
				where: and(
					eq(matchLogs.id, input.id),
					eq(matchLogs.event, ctx.event.code), // Technically not required but like security ig?
				),
			});

			if (!match) throw new Error("Match not found");

			return match;
		}),

	getStationMatch: eventProcedure
		.input(
			z.object({
				id: fmsGuid,
				station: z.string(),
			}),
		)
		.query(async ({ input, ctx }) => {
			const match = await db.query.matchLogs.findFirst({
				where: and(
					eq(matchLogs.id, input.id),
					eq(matchLogs.event, ctx.event.code), // Technically not required but like security ig?
				),
			});

			if (!match) throw new Error("Match not found");

			let station: ROBOT;

			// If there is an input for station but it's not actually a station, it might be a share id
			if (input.station && !["blue1", "blue2", "blue3", "red1", "red2", "red3"].includes(input.station)) {
				const share = await db.query.logPublishing.findFirst({
					where: and(
						eq(logPublishing.id, input.station),
						eq(logPublishing.match_id, input.id),
						eq(logPublishing.event, ctx.event.code),
					),
				});

				if (!share) throw new Error("Share not found");

				station = share.station as ROBOT;
			} else {
				station = input.station as ROBOT;
			}

			const analysisRows = await db
				.select()
				.from(analyzedLogs)
				.where(and(eq(analyzedLogs.match_id, input.id), eq(analyzedLogs.team, match[station] ?? 0)));

			const analysis: DisconnectionEvent[] = analysisRows
				.filter((r) => r.issue !== "Bypassed")
				.map((r) => ({
					issue: r.issue,
					startTime: r.start_time!,
					endTime: r.end_time!,
					duration: r.duration!,
					startIndex: r.start_index ?? 0,
					endIndex: r.end_index ?? 0,
				}));
			const bypassed = analysisRows.some((r) => r.issue === "Bypassed");

			return {
				id: match.id,
				event: match.event,
				event_id: match.event_id,
				match_number: match.match_number,
				play_number: match.play_number,
				level: match.level,
				start_time: match.start_time,
				team: match[station] ?? 0,
				station: station,
				log: match[`${station}_log`] as string,
				analysis,
				bypassed,
			};
		}),

	getPublicMatch: publicProcedure
		.input(
			z.object({
				id: fmsGuid,
				sharecode: z.string(),
			}),
		)
		.query(async ({ input, ctx }) => {
			const share = await db.query.logPublishing.findFirst({
				where: and(eq(logPublishing.id, input.sharecode), eq(logPublishing.match_id, input.id)),
			});

			if (!share) throw new Error("Share not found");

			if (new Date() > share.expire_time) {
				await db.delete(logPublishing).where(eq(logPublishing.id, input.sharecode)).execute();
				throw new Error("Share expired");
			}

			let station = share.station as ROBOT;

			const match = await db.query.matchLogs.findFirst({
				where: and(eq(matchLogs.id, input.id)),
			});

			if (!match) throw new Error("Match not found");

			const analysisRows = await db
				.select()
				.from(analyzedLogs)
				.where(and(eq(analyzedLogs.match_id, input.id), eq(analyzedLogs.team, match[station] ?? 0)));

			const analysis: DisconnectionEvent[] = analysisRows
				.filter((r) => r.issue !== "Bypassed")
				.map((r) => ({
					issue: r.issue,
					startTime: r.start_time!,
					endTime: r.end_time!,
					duration: r.duration!,
					startIndex: r.start_index ?? 0,
					endIndex: r.end_index ?? 0,
				}));
			const bypassed = analysisRows.some((r) => r.issue === "Bypassed");

			return {
				id: match.id,
				event: match.event,
				event_id: match.event_id,
				match_number: match.match_number,
				play_number: match.play_number,
				level: match.level,
				start_time: match.start_time,
				team: match[station] ?? 0,
				station: station,
				log: match[`${station}_log`] as string,
				analysis,
				bypassed,
			};
		}),

	publishMatch: eventProcedure
		.input(
			z.object({
				id: fmsGuid,
				station: z.enum(["blue1", "blue2", "blue3", "red1", "red2", "red3"]),
				team: z.number(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const existingShare = await db.query.logPublishing.findFirst({
				where: and(
					eq(logPublishing.match_id, input.id),
					eq(logPublishing.station, input.station),
					eq(logPublishing.team, input.team),
					eq(logPublishing.event, ctx.event.code),
				),
			});

			if (existingShare) {
				if (existingShare.expire_time < new Date()) {
					return { id: existingShare.id };
				} else {
					await db.delete(logPublishing).where(eq(logPublishing.id, existingShare.id)).execute();
				}
			}

			const match = await db.query.matchLogs.findFirst({
				where: and(eq(matchLogs.id, input.id), eq(matchLogs.event, ctx.event.code)),
			});

			if (!match) throw new Error("Match not found");

			const id = randomUUID();

			await db
				.insert(logPublishing)
				.values({
					id: id,
					team: input.team,
					match_id: input.id,
					station: input.station,
					event: ctx.event.code,
					event_id: match.event_id,
					match_number: match.match_number,
					play_number: match.play_number,
					level: match.level,
					start_time: match.start_time,
					publish_time: new Date(),
					expire_time: new Date(new Date().getTime() + 1000 * 60 * 60 * 72), // 72 hours
				})
				.execute();

			return { id };
		}),

	putCycleInfo: publicProcedure
		.input(
			z.object({
				matchId: fmsGuid,
			}),
		)
		.query(async ({ input }) => {}),

	getNumberOfMatches: publicProcedure.query(async ({ ctx }) => {
		return {
			matches: (await db.select({ count: count() }).from(matchLogs))[0].count,
			events: (await db.select({ count: count() }).from(events))[0].count,
		};
	}),

	generateBypassReport: eventProcedure.query(async ({ ctx }) => {
		const bypassedTeams = await db
			.select()
			.from(analyzedLogs)
			.where(and(eq(analyzedLogs.issue, "Bypassed"), eq(analyzedLogs.event, ctx.event.code)));

		const report = await generateReport(
			{
				title: "Bypassed Teams Report",
				description: "A report of all bypassed teams",
				headers: ["Level", "Match Number", "Play Number", "Team"],
				fileName: "bypassed-teams",
			},
			[...bypassedTeams]
				.sort((a, b) => {
					if (a.level !== b.level) {
						const levelOrder: Record<string, number> = { Practice: 0, Qualification: 1, Playoff: 2 };
						return (levelOrder[a.level] ?? 99) - (levelOrder[b.level] ?? 99);
					}
					return a.team - b.team;
				})
				.map((team) => [team.level, team.match_number, team.play_number, team.team]),
			ctx.event.code,
		);

		return { path: report };
	}),
});
