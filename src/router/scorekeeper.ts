import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { AllianceColor } from "../../shared/types";
import { db } from "../db/db";
import { fieldLineups, lineupCards, matchLogs, playoffAlliances, type User } from "../db/schema";
import { eventProcedure, router } from "../trpc";
import { bus } from "../util/eventBus";
import { subscriptionQueue } from "../util/subscription";
import { computePlayoffDeadline, isLate, resolveLineup } from "../util/playoff-lineups";

/** Roles allowed to create or change lineups. Admins always pass. */
const WRITE_ROLES = new Set(["Scorekeeper", "FTA", "FTAA", "System"]);

/** Throws FORBIDDEN unless the caller is an authenticated user with a write role. */
function assertCanWrite(user: User | null | undefined): asserts user is User {
	if (!user || (!user.admin && !WRITE_ROLES.has(user.role ?? ""))) {
		throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to edit lineups" });
	}
}

const stationsSchema = z.object({
	station1: z.number().int().nullable(),
	station2: z.number().int().nullable(),
	station3: z.number().int().nullable(),
});

/**
 * Given the six team numbers on a playoff match and the event's alliances,
 * work out which alliance number is red and which is blue by matching each
 * side's teams against the rosters. Returns nulls when it can't be resolved.
 */
function detectAlliancesFromMatch(
	alliances: (typeof playoffAlliances.$inferSelect)[],
	red: (number | null)[],
	blue: (number | null)[],
): { redAlliance: number | null; blueAlliance: number | null } {
	const rosterTeams = (a: (typeof playoffAlliances.$inferSelect)) =>
		[a.captain_team, a.pick1_team, a.pick2_team, a.backup_team].filter((t): t is number => t != null);

	const bestMatch = (teams: (number | null)[]) => {
		const present = teams.filter((t): t is number => t != null);
		let best: { number: number; hits: number } | null = null;
		for (const a of alliances) {
			const roster = new Set(rosterTeams(a));
			const hits = present.filter((t) => roster.has(t)).length;
			if (hits > 0 && (!best || hits > best.hits)) best = { number: a.number, hits };
		}
		return best?.number ?? null;
	};

	return { redAlliance: bestMatch(red), blueAlliance: bestMatch(blue) };
}

export const scorekeeperRouter = router({
	alliances: router({
		/** All playoff alliances for the event, ordered by alliance number. */
		list: eventProcedure.query(async ({ ctx }) => {
			return db
				.select()
				.from(playoffAlliances)
				.where(eq(playoffAlliances.event_code, ctx.event.code))
				.orderBy(playoffAlliances.number);
		}),

		/** Create or update one alliance's roster. */
		upsert: eventProcedure
			.input(
				z.object({
					number: z.number().int().min(1).max(8),
					captainTeam: z.number().int(),
					pick1Team: z.number().int(),
					pick2Team: z.number().int().nullable().optional(),
					backupTeam: z.number().int().nullable().optional(),
				}),
			)
			.mutation(async ({ ctx, input }) => {
				assertCanWrite(ctx.user);
				const [row] = await db
					.insert(playoffAlliances)
					.values({
						event_code: ctx.event.code,
						number: input.number,
						captain_team: input.captainTeam,
						pick1_team: input.pick1Team,
						pick2_team: input.pick2Team ?? null,
						backup_team: input.backupTeam ?? null,
					})
					.onConflictDoUpdate({
						target: [playoffAlliances.event_code, playoffAlliances.number],
						set: {
							captain_team: input.captainTeam,
							pick1_team: input.pick1Team,
							pick2_team: input.pick2Team ?? null,
							backup_team: input.backupTeam ?? null,
							updated_at: new Date(),
						},
					})
					.returning();
				bus.publish(`event:${ctx.event.code}:lineups`, { type: "alliances" });
				return row;
			}),

		/** Import all 8 alliances from The Blue Alliance's alliance-selection data. */
		importFromTBA: eventProcedure.mutation(async ({ ctx }) => {
			assertCanWrite(ctx.user);
			const res = await fetch(`https://www.thebluealliance.com/api/v3/event/${ctx.event.code}/alliances`, {
				headers: { "X-TBA-Auth-Key": process.env.TBA_API_KEY ?? "" },
			});
			if (!res.ok) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `The Blue Alliance returned ${res.status} for ${ctx.event.code}. Alliances may not be set yet.`,
				});
			}
			const alliances = (await res.json()) as { picks?: string[]; backup?: { in?: string } | null }[] | null;
			if (!alliances?.length) {
				throw new TRPCError({ code: "BAD_REQUEST", message: "No alliances published for this event yet" });
			}

			const teamNum = (key: string | undefined) => (key ? parseInt(key.replace(/^frc/, ""), 10) : NaN);
			let imported = 0;
			for (let i = 0; i < alliances.length; i++) {
				const picks = alliances[i].picks ?? [];
				const captain = teamNum(picks[0]);
				const pick1 = teamNum(picks[1]);
				if (Number.isNaN(captain) || Number.isNaN(pick1)) continue;
				const pick2 = teamNum(picks[2]);
				const backup = teamNum(alliances[i].backup?.in);
				await db
					.insert(playoffAlliances)
					.values({
						event_code: ctx.event.code,
						number: i + 1,
						captain_team: captain,
						pick1_team: pick1,
						pick2_team: Number.isNaN(pick2) ? null : pick2,
						backup_team: Number.isNaN(backup) ? null : backup,
					})
					.onConflictDoUpdate({
						target: [playoffAlliances.event_code, playoffAlliances.number],
						set: {
							captain_team: captain,
							pick1_team: pick1,
							pick2_team: Number.isNaN(pick2) ? null : pick2,
							backup_team: Number.isNaN(backup) ? null : backup,
							updated_at: new Date(),
						},
					});
				imported++;
			}
			bus.publish(`event:${ctx.event.code}:lineups`, { type: "alliances" });
			return { imported };
		}),

		/**
		 * Sync alliances straight from FMS (posted by the extension). Authoritative:
		 * this is the normal path once playoffs start, so no user role is required -
		 * the event token is the auth, same as posting the schedule. Upserts every
		 * alliance in the payload (including the backup/alternate team) so a backup
		 * coupon accepted mid-playoffs flows through automatically.
		 */
		syncFromFMS: eventProcedure
			.input(
				z.object({
					alliances: z.array(
						z.object({
							number: z.number().int().min(1).max(8),
							captainTeam: z.number().int(),
							pick1Team: z.number().int(),
							pick2Team: z.number().int().nullable().optional(),
							backupTeam: z.number().int().nullable().optional(),
						}),
					),
				}),
			)
			.mutation(async ({ ctx, input }) => {
				let synced = 0;
				for (const a of input.alliances) {
					await db
						.insert(playoffAlliances)
						.values({
							event_code: ctx.event.code,
							number: a.number,
							captain_team: a.captainTeam,
							pick1_team: a.pick1Team,
							pick2_team: a.pick2Team ?? null,
							backup_team: a.backupTeam ?? null,
						})
						.onConflictDoUpdate({
							target: [playoffAlliances.event_code, playoffAlliances.number],
							set: {
								captain_team: a.captainTeam,
								pick1_team: a.pick1Team,
								pick2_team: a.pick2Team ?? null,
								backup_team: a.backupTeam ?? null,
								updated_at: new Date(),
							},
						});
					synced++;
				}
				if (synced > 0) bus.publish(`event:${ctx.event.code}:lineups`, { type: "alliances" });
				return { synced };
			}),
	}),

	lineups: router({
		/**
		 * The scorekeeper's main payload for a playoff match: the two alliances in
		 * the match with their resolved (latest) lineups and colors, plus the T613
		 * deadline. Alliance identity/colors come from the match's team assignments
		 * when known; otherwise the caller can pass them explicitly.
		 */
		forMatch: eventProcedure
			.input(
				z.object({
					matchNumber: z.number().int(),
					playNumber: z.number().int().default(1),
					redAlliance: z.number().int().min(1).max(8).nullable().optional(),
					blueAlliance: z.number().int().min(1).max(8).nullable().optional(),
				}),
			)
			.query(async ({ ctx, input }) => {
				const alliances = await db
					.select()
					.from(playoffAlliances)
					.where(eq(playoffAlliances.event_code, ctx.event.code))
					.orderBy(playoffAlliances.number);

				// Resolve which alliance is red/blue, in priority order:
				//   1. explicit input from the client,
				//   2. the FMS schedule's per-match alliance numbers (available before the
				//      match is played - the authoritative source once playoffs start),
				//   3. detection from the match's team assignments in a played match_log.
				let redAlliance = input.redAlliance ?? null;
				let blueAlliance = input.blueAlliance ?? null;
				let detectedFrom: "input" | "schedule" | "match" | "none" = redAlliance || blueAlliance ? "input" : "none";
				if (!redAlliance && !blueAlliance) {
					const scheduled = ctx.event.scheduleDetails?.matches?.find(
						(m) => m.match === input.matchNumber && m.level === "Playoff",
					);
					if (scheduled?.redAllianceNumber || scheduled?.blueAllianceNumber) {
						redAlliance = scheduled.redAllianceNumber ?? null;
						blueAlliance = scheduled.blueAllianceNumber ?? null;
						detectedFrom = "schedule";
					}
				}
				if (!redAlliance && !blueAlliance && alliances.length) {
					const [log] = await db
						.select()
						.from(matchLogs)
						.where(
							and(
								eq(matchLogs.event, ctx.event.code),
								eq(matchLogs.match_number, input.matchNumber),
								eq(matchLogs.play_number, input.playNumber),
								eq(matchLogs.level, "Playoff"),
							),
						)
						.limit(1);
					if (log) {
						const detected = detectAlliancesFromMatch(
							alliances,
							[log.red1, log.red2, log.red3],
							[log.blue1, log.blue2, log.blue3],
						);
						redAlliance = detected.redAlliance;
						blueAlliance = detected.blueAlliance;
						if (redAlliance || blueAlliance) detectedFrom = "match";
					}
				}

				const { expectedStart, deadlineAt } = computePlayoffDeadline(
					ctx.event.scheduleDetails,
					input.matchNumber,
				);

				const buildSide = async (color: AllianceColor, allianceNumber: number | null) => {
					if (!allianceNumber) return { color, allianceNumber: null, lineup: null, alliance: null };
					const alliance = alliances.find((a) => a.number === allianceNumber) ?? null;
					if (!alliance) return { color, allianceNumber, lineup: null, alliance: null };
					const accepted = await db
						.select()
						.from(lineupCards)
						.where(
							and(
								eq(lineupCards.event_code, ctx.event.code),
								eq(lineupCards.alliance_number, allianceNumber),
								eq(lineupCards.status, "accepted"),
							),
						);
					return {
						color,
						allianceNumber,
						alliance,
						lineup: resolveLineup(accepted, alliance, input.matchNumber, color),
					};
				};

				return {
					matchNumber: input.matchNumber,
					playNumber: input.playNumber,
					expectedStart,
					deadlineAt,
					detectedFrom,
					red: await buildSide("red", redAlliance),
					blue: await buildSide("blue", blueAlliance),
				};
			}),

		/**
		 * Submit a lineup for an alliance/match. On time it becomes the new accepted
		 * version. Late (past the T613 deadline) it is not finalized unless
		 * `acceptAnyway` (recorded as an override) or `deny` (recorded as a rejected
		 * card, previous lineup stands) is set; otherwise it returns needs_override
		 * so the client can warn and re-submit.
		 */
		submit: eventProcedure
			.input(
				z.object({
					allianceNumber: z.number().int().min(1).max(8),
					matchNumber: z.number().int(),
					playNumber: z.number().int().default(1),
					blue: stationsSchema,
					red: stationsSchema,
					submittedByName: z.string().max(120).optional(),
					note: z.string().max(300).optional(),
					acceptAnyway: z.boolean().optional(),
					deny: z.boolean().optional(),
				}),
			)
			.mutation(async ({ ctx, input }) => {
				assertCanWrite(ctx.user);

				const alliance = await db.query.playoffAlliances.findFirst({
					where: and(
						eq(playoffAlliances.event_code, ctx.event.code),
						eq(playoffAlliances.number, input.allianceNumber),
					),
				});
				if (!alliance) {
					throw new TRPCError({ code: "BAD_REQUEST", message: `Alliance ${input.allianceNumber} not set up` });
				}

				const submittedAt = new Date();
				const { expectedStart, deadlineAt } = computePlayoffDeadline(
					ctx.event.scheduleDetails,
					input.matchNumber,
				);
				const late = isLate(deadlineAt, submittedAt);

				if (late && !input.acceptAnyway && !input.deny) {
					return {
						status: "needs_override" as const,
						expectedStart,
						deadlineAt,
						secondsLate: deadlineAt ? Math.round((submittedAt.getTime() - deadlineAt.getTime()) / 1000) : 0,
					};
				}

				const stationTeams = [
					input.blue.station1,
					input.blue.station2,
					input.blue.station3,
					input.red.station1,
					input.red.station2,
					input.red.station3,
				];
				const usesBackup = alliance.backup_team != null && stationTeams.includes(alliance.backup_team);
				const denied = late && input.deny === true;

				// Next version for this (alliance, match), across all statuses.
				const [latest] = await db
					.select({ version: lineupCards.version })
					.from(lineupCards)
					.where(
						and(
							eq(lineupCards.event_code, ctx.event.code),
							eq(lineupCards.alliance_number, input.allianceNumber),
							eq(lineupCards.match_number, input.matchNumber),
						),
					)
					.orderBy(desc(lineupCards.version))
					.limit(1);
				const version = (latest?.version ?? 0) + 1;

				// An accepted submission supersedes the prior accepted card for this
				// exact match. A denial records a rejected card and touches nothing else.
				if (!denied) {
					await db
						.update(lineupCards)
						.set({ status: "superseded" })
						.where(
							and(
								eq(lineupCards.event_code, ctx.event.code),
								eq(lineupCards.alliance_number, input.allianceNumber),
								eq(lineupCards.match_number, input.matchNumber),
								eq(lineupCards.status, "accepted"),
							),
						);
				}

				const [card] = await db
					.insert(lineupCards)
					.values({
						event_code: ctx.event.code,
						alliance_number: input.allianceNumber,
						match_number: input.matchNumber,
						play_number: input.playNumber,
						version,
						blue_station1_team: input.blue.station1,
						blue_station2_team: input.blue.station2,
						blue_station3_team: input.blue.station3,
						red_station1_team: input.red.station1,
						red_station2_team: input.red.station2,
						red_station3_team: input.red.station3,
						uses_backup: usesBackup,
						status: denied ? "rejected" : "accepted",
						source: "scorekeeper",
						submitted_by_id: ctx.user.id,
						submitted_by_name: input.submittedByName ?? null,
						submitted_at: submittedAt,
						deadline_at: deadlineAt,
						is_late: late,
						accepted_anyway: late && !denied,
						accepted_anyway_by_id: late && !denied ? ctx.user.id : null,
						accepted_anyway_at: late && !denied ? submittedAt : null,
						note: input.note ?? null,
					})
					.returning();

				bus.publish(`event:${ctx.event.code}:lineups`, { type: "lineup", allianceNumber: input.allianceNumber });
				return { status: denied ? ("denied" as const) : ("ok" as const), card };
			}),

		/** Full versioned history of cards an alliance submitted, newest first. */
		history: eventProcedure
			.input(z.object({ allianceNumber: z.number().int().min(1).max(8) }))
			.query(async ({ ctx, input }) => {
				return db
					.select()
					.from(lineupCards)
					.where(
						and(
							eq(lineupCards.event_code, ctx.event.code),
							eq(lineupCards.alliance_number, input.allianceNumber),
						),
					)
					.orderBy(desc(lineupCards.submitted_at));
			}),

		/** Live push when alliances or lineups change, for a second device at the table. */
		subscribe: eventProcedure.subscription(async function* ({ ctx, signal }) {
			const { push, drain } = subscriptionQueue<{ type: string; allianceNumber?: number }>(signal!);
			const unsub = bus.subscribe(`event:${ctx.event.code}:lineups`, (data) =>
				push(data as { type: string; allianceNumber?: number }),
			);
			try {
				yield* drain();
			} finally {
				unsub();
			}
		}),
	}),

	/**
	 * Field lineups for PRACTICE and TEST matches: a roaming volunteer walks the
	 * field and enters which team is in each station for the current/next match; it
	 * syncs live to the scorekeeper. Distinct from playoff lineup cards.
	 */
	fieldLineup: router({
		/** The stored field lineup for a match, or null if none entered. */
		forMatch: eventProcedure
			.input(
				z.object({
					level: z.enum(["None", "Practice", "Qualification", "Playoff"]),
					matchNumber: z.number().int(),
					playNumber: z.number().int().default(1),
				}),
			)
			.query(async ({ ctx, input }) => {
				const [row] = await db
					.select()
					.from(fieldLineups)
					.where(
						and(
							eq(fieldLineups.event_code, ctx.event.code),
							eq(fieldLineups.level, input.level),
							eq(fieldLineups.match_number, input.matchNumber),
							eq(fieldLineups.play_number, input.playNumber),
						),
					)
					.limit(1);
				return row ?? null;
			}),

		/**
		 * Upsert the field lineup for a match. Any signed-in event user may enter it
		 * (the roaming volunteer). A null station means no robot is there (bypass it).
		 */
		set: eventProcedure
			.input(
				z.object({
					level: z.enum(["None", "Practice", "Qualification", "Playoff"]),
					matchNumber: z.number().int(),
					playNumber: z.number().int().default(1),
					red: stationsSchema,
					blue: stationsSchema,
					updatedByName: z.string().max(120).optional(),
				}),
			)
			.mutation(async ({ ctx, input }) => {
				if (!ctx.user) {
					throw new TRPCError({ code: "UNAUTHORIZED", message: "Sign in to enter a field lineup" });
				}
				const values = {
					red1_team: input.red.station1,
					red2_team: input.red.station2,
					red3_team: input.red.station3,
					blue1_team: input.blue.station1,
					blue2_team: input.blue.station2,
					blue3_team: input.blue.station3,
					updated_by_id: ctx.user.id,
					updated_by_name: input.updatedByName ?? ctx.user.username ?? null,
					updated_at: new Date(),
				};
				const [row] = await db
					.insert(fieldLineups)
					.values({
						event_code: ctx.event.code,
						level: input.level,
						match_number: input.matchNumber,
						play_number: input.playNumber,
						...values,
					})
					.onConflictDoUpdate({
						target: [
							fieldLineups.event_code,
							fieldLineups.level,
							fieldLineups.match_number,
							fieldLineups.play_number,
						],
						set: values,
					})
					.returning();
				bus.publish(`event:${ctx.event.code}:fieldLineup`, {
					level: input.level,
					matchNumber: input.matchNumber,
					playNumber: input.playNumber,
				});
				return row;
			}),

		/** Live push whenever a field lineup changes, for the scorekeeper + a 2nd device. */
		subscribe: eventProcedure.subscription(async function* ({ ctx, signal }) {
			const { push, drain } = subscriptionQueue<{ level: string; matchNumber: number; playNumber: number }>(
				signal!,
			);
			const unsub = bus.subscribe(`event:${ctx.event.code}:fieldLineup`, (data) =>
				push(data as { level: string; matchNumber: number; playNumber: number }),
			);
			try {
				yield* drain();
			} finally {
				unsub();
			}
		}),
	}),
});
