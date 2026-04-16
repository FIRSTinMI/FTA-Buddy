import { TRPCError } from "@trpc/server";
import { createHash, randomUUID } from "crypto";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { AUTO_EVENT_ISSUE_TYPES, DEFAULT_AUTO_EVENT_SETTINGS } from "../../shared/types";
import type {
	AutoEventIssueType,
	EventAutoEventSettings,
	EventChecklist,
	Profile,
	ServerEvent,
	TeamList,
	TournamentLevel,
} from "../../shared/types";
import { autoEventSettingsCache } from "../util/log-analysis";
import { db } from "../db/db";
import { eventUsers, events, notes, users } from "../db/schema";
import { adminProcedure, eventProcedure, protectedProcedure, publicProcedure, router } from "../trpc";
import { events as inMemoryEvents } from "../state";
import { getEvent } from "../util/get-event";
import * as nexusPoller from "../util/nexusInspectionPoller";
import * as nexusEventPoller from "../util/nexusEventPoller";
import { bus } from "../util/eventBus";
import { createNotification } from "../util/push-notifications";
import { generateToken } from "./user";

const fullEventList: {
	fetched: Date | undefined;
	events: {
		first_event_code: string;
		key: string;
	}[];
} = {
	fetched: undefined,
	events: [],
};

async function updateFullEventList() {
	if (!fullEventList.fetched || fullEventList.fetched.getTime() < Date.now() - 1000 * 60 * 60 * 24) {
		const year = new Date().getFullYear();
		const updatedEventList = await (
			await fetch(`https://www.thebluealliance.com/api/v3/events/${year}`, {
				headers: {
					"X-TBA-Auth-Key": process.env.TBA_API_KEY ?? "",
				},
			})
		).json();

		fullEventList.fetched = new Date();
		fullEventList.events = updatedEventList.map((event: any) => ({
			key: event.key,
			first_event_code: event.first_event_code,
		}));
	}
}

updateFullEventList();

async function getSubEventLabel(eventCode: string): Promise<string | undefined> {
	const parentRow = await db.query.events.findFirst({
		columns: { meshedEvent: true },
		where: sql`${events.meshedEvent} @> ${JSON.stringify([{ code: eventCode }])}::jsonb`,
	});
	if (!parentRow) return undefined;
	return (parentRow.meshedEvent as Array<{ code: string; label: string }>).find((e) => e.code === eventCode)?.label;
}

export const eventRouter = router({
	checkCode: publicProcedure
		.input(
			z.object({
				code: z.string(),
			}),
		)
		.query(async ({ input }) => {
			input.code = input.code.trim().toLowerCase();
			const event = await db.query.events.findFirst({ where: eq(events.code, input.code.trim().toLowerCase()) });

			if (event) return { error: true, message: "Event already exists" };

			// Get event title
			const eventData = await (
				await fetch(`https://www.thebluealliance.com/api/v3/event/${input.code}`, {
					headers: {
						"X-TBA-Auth-Key": process.env.TBA_API_KEY ?? "",
					},
				})
			).json();

			// Event code not found
			if ("Error" in eventData) {
				// Update full event list if needed
				await updateFullEventList();
				// Check to see if the code matches a first event code
				const inputCodeWithoutYear = input.code.replace(/\d{4}/, "");
				const event = fullEventList.events.find((e) => e.first_event_code === inputCodeWithoutYear);

				if (event) {
					return { error: true, message: "Use TBA event code " + event.key, key: event.key };
				}

				return { error: true, message: eventData.Error };
			}

			return { error: false, message: "Event found", eventData };
		}),

	join: protectedProcedure
		.input(
			z.object({
				code: z.string(),
				pin: z.string(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			input.code = input.code.trim().toLowerCase();

			const eventDB = await db.query.events.findFirst({ where: eq(events.code, input.code) });

			if (!eventDB) throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });

			if (eventDB.pin !== input.pin) throw new TRPCError({ code: "UNAUTHORIZED", message: "Incorrect pin" });
			if (eventDB.archived) throw new TRPCError({ code: "BAD_REQUEST", message: "Event has been archived" });

			const event = await getEvent(eventDB?.token ?? "");

			if (!event.users.find((u) => u.id === ctx.user.id)) {
				event.users = [
					...event.users,
					{ id: ctx.user.id, username: ctx.user.username, role: ctx.user.role, admin: ctx.user.admin },
				];
			}

			await db.insert(eventUsers).values({ user_id: ctx.user.id, event_code: event.code }).onConflictDoNothing();
			await db.update(users).set({ active_event_code: event.code }).where(eq(users.id, ctx.user.id));

			const subEventLabel = event.meshedEvent ? undefined : await getSubEventLabel(event.code);
			return { ...event, label: subEventLabel ?? event.name };
		}),

	joinByToken: protectedProcedure.input(z.object({ token: z.string() })).mutation(async ({ input, ctx }) => {
		const eventDB = await db.query.events.findFirst({ where: eq(events.token, input.token) });

		if (!eventDB) throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
		if (eventDB.archived) throw new TRPCError({ code: "BAD_REQUEST", message: "Event has been archived" });

		const event = await getEvent(eventDB.token);

		if (!event.users.find((u) => u.id === ctx.user.id)) {
			event.users = [
				...event.users,
				{ id: ctx.user.id, username: ctx.user.username, role: ctx.user.role, admin: ctx.user.admin },
			];
		}

		await db.insert(eventUsers).values({ user_id: ctx.user.id, event_code: event.code }).onConflictDoNothing();
		await db.update(users).set({ active_event_code: event.code }).where(eq(users.id, ctx.user.id));

		const subEventLabel = event.meshedEvent ? undefined : await getSubEventLabel(event.code);
		return { ...event, label: subEventLabel ?? event.name };
	}),

	get: adminProcedure
		.input(
			z.object({
				code: z.string(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			input.code = input.code.trim().toLowerCase();

			const eventDB = (
				await db
					.select({
						code: events.code,
						pin: events.pin,
						token: events.token,
						teams: events.teams,
						checklist: events.checklist,
						archived: events.archived,
						subEvents: events.meshedEvent,
						notepadOnly: events.notepadOnly,
						startDate: events.startDate,
						endDate: events.endDate,
						playoffMode: events.playoffMode,
					})
					.from(events)
					.where(eq(events.code, input.code))
			)[0];

			if (eventDB.archived) throw new TRPCError({ code: "BAD_REQUEST", message: "Event has been archived" });

			const event = await getEvent("", input.code);

			if (!event) throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });

			if (!event.users.find((u) => u.id === ctx.user.id)) {
				event.users = [
					...event.users,
					{ id: ctx.user.id, username: ctx.user.username, role: ctx.user.role, admin: ctx.user.admin },
				];
			}

			await db.insert(eventUsers).values({ user_id: ctx.user.id, event_code: event.code }).onConflictDoNothing();
			await db.update(users).set({ active_event_code: event.code }).where(eq(users.id, ctx.user.id));

			const subEventLabel = event.meshedEvent ? undefined : await getSubEventLabel(event.code);
			return {
				...eventDB,
				users: event.users,
				label: subEventLabel ?? event.name,
				subEvents: (eventDB.subEvents as NonNullable<ServerEvent["subEvents"]>) ?? undefined,
			};
		}),

	create: publicProcedure
		.input(
			z.object({
				code: z.string().startsWith("202").min(6),
				pin: z.string().min(5),
				teams: z.array(z.number()).optional(),
				notepadOnly: z.boolean().optional().default(false),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			input.code = input.code.trim().toLowerCase();
			const token = generateToken();
			const teams: TeamList = [];
			const checklist: EventChecklist = {};

			if (await db.query.events.findFirst({ where: eq(events.code, input.code) })) {
				throw new TRPCError({ code: "CONFLICT", message: "Event already exists" });
			}

			const eventData = await (
				await fetch(`https://www.thebluealliance.com/api/v3/event/${input.code}`, {
					headers: {
						"X-TBA-Auth-Key": process.env.TBA_API_KEY ?? "",
					},
				})
			).json();

			const teamsData = await fetch(`https://www.thebluealliance.com/api/v3/event/${input.code}/teams/simple`, {
				headers: {
					"X-TBA-Auth-Key": process.env.TBA_API_KEY ?? "",
				},
			}).then((res) => res.json());

			if (teamsData) {
				for (let team of teamsData) {
					teams.push({ number: team.team_number.toString(), name: team.nickname, inspected: false });
					checklist[team.team_number.toString()] = {
						present: false,
						weighed: false,
						inspected: false,
						radioProgrammed: false,
						connectionTested: false,
					};
				}
			}

			const promises = [];

			for (let team of input.teams ?? []) {
				if (teams.find((t) => t.number == team.toString())) continue;

				const teamData = fetch(`https://www.thebluealliance.com/api/v3/team/frc${team}/simple`, {
					headers: {
						"X-TBA-Auth-Key": process.env.TBA_API_KEY ?? "",
					},
				})
					.then((res) => res.json())
					.then((teamData) => {
						teams.push({
							number: teamData.team_number.toString(),
							name: teamData.nickname,
							inspected: false,
						});
						checklist[teamData.team_number.toString()] = {
							present: false,
							weighed: false,
							inspected: false,
							radioProgrammed: false,
							connectionTested: false,
						};
					});

				promises.push(teamData);
			}

			await Promise.all(promises);

			// Remove duplicate teams
			const uniqueTeams = Array.from(new Set(teams.map((team) => team.number))).map((number) =>
				teams.find((team) => team.number === number),
			);

			const user = await db.query.users.findFirst({ where: eq(users.token, ctx.token ?? "") });

			let name = eventData.name;

			if (eventData.name.includes("District")) {
				name = eventData.name.split("District")[1];
			}
			if (eventData.name.includes("Event")) {
				name = eventData.name.split("Event")[0];
			}

			const event = await db
				.insert(events)
				.values({
					code: input.code,
					name: name.trim(),
					pin: input.pin,
					token,
					teams: uniqueTeams,
					checklist,
					startDate: eventData.start_date ?? null,
					endDate: eventData.end_date ?? null,
					timezone: eventData.timezone_id ?? null,
					autoEventSettings: DEFAULT_AUTO_EVENT_SETTINGS,
					notepadOnly: input.notepadOnly ?? false,
				})
				.returning();

			if (user) {
				await db.insert(eventUsers).values({ user_id: user.id, event_code: input.code }).onConflictDoNothing();
			}

			return event[0];
		}),

	// Returns codes of events that have an active FMS extension connection
	// (last frame received within 60 seconds).
	getActive: publicProcedure.query(() => {
		const cutoff = Date.now() - 60_000;
		return Object.values(inMemoryEvents)
			.filter((e) => e.stats.extensions.some((ext) => ext.lastFrame && ext.lastFrame.getTime() > cutoff))
			.map((e) => ({ code: e.code, name: e.name }));
	}),

	getAll: publicProcedure.query(async () => {
		const rows = await db
			.select({
				code: events.code,
				name: events.name,
				created_at: events.created_at,
				meshedEvent: events.meshedEvent,
			})
			.from(events)
			.where(eq(events.archived, false))
			.orderBy(desc(events.created_at));
		return rows.map((e) => ({
			code: e.code,
			name: e.name,
			created_at: e.created_at,
			isMeshed: e.meshedEvent !== null,
		}));
	}),

	getAllWithUsers: adminProcedure.query(async () => {
		const eventsData = await db
			.select({ code: events.code, name: events.name })
			.from(events)
			.where(eq(events.archived, false))
			.orderBy(desc(events.created_at));

		const eventCodesList = eventsData.map((e) => e.code);

		const [memberRows, noteCountRows] = await Promise.all([
			eventCodesList.length > 0
				? db
						.select({
							event_code: eventUsers.event_code,
							id: users.id,
							username: users.username,
							role: users.role,
						})
						.from(eventUsers)
						.innerJoin(users, eq(eventUsers.user_id, users.id))
						.where(inArray(eventUsers.event_code, eventCodesList))
				: Promise.resolve(
						[] as {
							event_code: string;
							id: number;
							username: string;
							role: "FTA" | "FTAA" | "CSA" | "RI";
						}[],
					),
			eventCodesList.length > 0
				? db
						.select({ event_code: notes.event_code, cnt: count() })
						.from(notes)
						.where(inArray(notes.event_code, eventCodesList))
						.groupBy(notes.event_code)
				: Promise.resolve([] as { event_code: string; cnt: number }[]),
		]);

		const membersByEvent = new Map<string, typeof memberRows>();
		for (const row of memberRows) {
			if (!membersByEvent.has(row.event_code)) membersByEvent.set(row.event_code, []);
			membersByEvent.get(row.event_code)!.push(row);
		}
		const noteCountMap = new Map(noteCountRows.map((r) => [r.event_code, r.cnt]));

		return eventsData.map((event) => ({
			code: event.code,
			name: event.name,
			noteCount: noteCountMap.get(event.code) ?? 0,
			users: (membersByEvent.get(event.code) ?? []).map(({ id, username, role }) => ({ id, username, role })),
		}));
	}),

	syncTeams: eventProcedure
		.input(
			z.object({
				teamNumbers: z.array(z.number()),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const event = await getEvent(ctx.event.token);
			const existingTeams = event.teams as TeamList;
			const existingNumbers = new Set(existingTeams.map((t) => t.number.toString()));
			const incomingNumbers = new Set(input.teamNumbers.map((n) => n.toString()));
			const checklist = event.checklist as EventChecklist;

			// Find teams to add
			const teamsToAdd: number[] = input.teamNumbers.filter((n) => !existingNumbers.has(n.toString()));

			// Find teams to remove (in existing but not in incoming FMS list)
			const teamsToRemove = new Set(
				existingTeams.map((t) => t.number.toString()).filter((n) => !incomingNumbers.has(n)),
			);

			if (teamsToAdd.length === 0 && teamsToRemove.size === 0) return { added: 0, removed: 0 };

			// Look up new team names from TBA
			const newTeams: TeamList = await Promise.all(
				teamsToAdd.map(async (num) => {
					let name = `Team ${num}`;
					try {
						const teamData = await fetch(`https://www.thebluealliance.com/api/v3/team/frc${num}/simple`, {
							headers: { "X-TBA-Auth-Key": process.env.TBA_API_KEY ?? "" },
						}).then((res) => res.json());
						name = teamData.nickname ?? teamData.name;
					} catch {
						/* fall back to generic name */
					}

					if (!checklist[num]) {
						checklist[num] = {
							present: false,
							weighed: false,
							inspected: false,
							radioProgrammed: false,
							connectionTested: false,
						};
					}
					return { number: num.toString(), name, inspected: false };
				}),
			);

			// Remove departed teams, add new ones
			const updatedTeams = [...existingTeams.filter((t) => !teamsToRemove.has(t.number.toString())), ...newTeams];

			// Clean up checklist for removed teams
			for (const num of teamsToRemove) {
				delete checklist[num];
			}

			event.teams = updatedTeams;
			event.checklist = checklist;

			await db
				.update(events)
				.set({ teams: updatedTeams, checklist })
				.where(eq(events.code, event.code))
				.execute();

			return { added: newTeams.length, removed: teamsToRemove.size };
		}),

	reimportTeamsFromTBA: eventProcedure.mutation(async ({ ctx }) => {
		const event = await getEvent(ctx.event.token);
		const existingTeams = event.teams as TeamList;
		const checklist = event.checklist as EventChecklist;

		let newTeams: TeamList;

		if (event.meshedEvent && event.subEvents?.length) {
			// For meshed events, aggregate teams from each sub-event's current DB row
			// rather than fetching from TBA (the meshed event code doesn't exist on TBA).
			const subEventRows = await db.query.events.findMany({
				where: inArray(
					events.code,
					event.subEvents.map((s) => s.code),
				),
				columns: { code: true, teams: true, meshedEvent: true },
			});

			// Merge, dedup by team number, preserve existing inspected/checklist state
			const merged = new Map<string, TeamList[number]>();
			for (const row of subEventRows) {
				for (const team of row.teams as TeamList) {
					const num = team.number.toString();
					if (!merged.has(num)) {
						const existing = existingTeams.find((t) => t.number.toString() === num);
						merged.set(num, { ...team, inspected: existing?.inspected ?? team.inspected ?? false });
					}
					if (!checklist[num]) {
						checklist[num] = {
							present: false,
							weighed: false,
							inspected: false,
							radioProgrammed: false,
							connectionTested: false,
						};
					}
				}
			}
			newTeams = Array.from(merged.values()).sort(
				(a, b) => parseInt(String(a.number)) - parseInt(String(b.number)),
			);

			// Also refresh the teams snapshot inside the meshedEvent JSON
			const updatedSubEvents = event.subEvents.map((se) => {
				const row = subEventRows.find((r) => r.code === se.code);
				return { ...se, teams: (row?.teams as TeamList) ?? se.teams };
			});
			event.subEvents = updatedSubEvents;

			await db
				.update(events)
				.set({
					teams: newTeams,
					checklist,
					meshedEvent: updatedSubEvents,
				})
				.where(eq(events.code, event.code))
				.execute();
		} else {
			const teamsData = await fetch(`https://www.thebluealliance.com/api/v3/event/${event.code}/teams/simple`, {
				headers: { "X-TBA-Auth-Key": process.env.TBA_API_KEY ?? "" },
			}).then((res) => res.json());

			if (!teamsData || "Error" in teamsData) {
				throw new TRPCError({ code: "BAD_REQUEST", message: "Failed to fetch teams from TBA" });
			}

			newTeams = (teamsData as { team_number: number; nickname: string; name: string }[]).map((team) => {
				const existing = existingTeams.find((t) => t.number.toString() === team.team_number.toString());
				if (!checklist[team.team_number.toString()]) {
					checklist[team.team_number.toString()] = {
						present: false,
						weighed: false,
						inspected: false,
						radioProgrammed: false,
						connectionTested: false,
					};
				}
				return {
					number: team.team_number.toString(),
					name: team.nickname ?? team.name,
					inspected: existing?.inspected ?? false,
				};
			});

			await db.update(events).set({ teams: newTeams, checklist }).where(eq(events.code, event.code)).execute();
		}

		event.teams = newTeams;
		event.checklist = checklist;

		return { count: newTeams.length };
	}),

	getMusicOrder: eventProcedure
		.input(
			z.object({
				match: z.number(),
				level: z.enum(["None", "Practice", "Qualification", "Playoff"]),
			}),
		)
		.query(async ({ ctx, input }) => {
			let level: TournamentLevel | string = input.level;
			if (level === "None" || level === "Practice") level = (Math.random() * 10).toFixed(0);

			const hash = await createHash("md5")
				.update(ctx.event.code + level + input.match)
				.digest();
			const musicOrder = hash.toString("hex").split("");
			return musicOrder.map((s) => parseInt(s, 16));
		}),

	createMeshedEvent: adminProcedure
		.input(
			z.object({
				code: z.string().min(4),
				pin: z.string().min(5),
				events: z
					.array(
						z.object({
							code: z.string().min(4),
							label: z.string(),
							color: z.string().optional(),
						}),
					)
					.min(2),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			input.code = input.code.trim().toLowerCase();
			const token = generateToken();

			if (await db.query.events.findFirst({ where: eq(events.code, input.code) })) {
				throw new TRPCError({ code: "CONFLICT", message: "Event already exists" });
			}

			const eventsData = await db
				.select()
				.from(events)
				.where(
					inArray(
						events.code,
						input.events.map((e) => e.code),
					),
				);

			if (eventsData.length !== input.events.length) {
				let missingEvents = input.events.filter((e) => !eventsData.find((s) => s.code === e.code));
				throw new TRPCError({
					code: "NOT_FOUND",
					message: `Events not found: ${missingEvents.map((e) => e.code).join(", ")}`,
				});
			}

			const teams: TeamList = eventsData.flatMap((e) => e.teams as TeamList);

			let subEvents: {
				code: string;
				name: string;
				label: string;
				color?: string;
				token: string;
				teams: TeamList;
				pin: string;
			}[] = [];

			const subEventUserRows = await db
				.select({ user_id: eventUsers.user_id })
				.from(eventUsers)
				.where(
					inArray(
						eventUsers.event_code,
						input.events.map((e) => e.code),
					),
				);
			let usersToGet = Array.from(new Set([...subEventUserRows.map((r) => r.user_id), ctx.user.id]));

			for (let event of input.events) {
				subEvents.push({
					code: event.code,
					name: eventsData.find((e) => e.code === event.code)?.name ?? "",
					label: event.label,
					color: event.color,
					token: eventsData.find((e) => e.code === event.code)?.token ?? "",
					teams: eventsData.find((e) => e.code === event.code)?.teams as TeamList,
					pin: eventsData.find((e) => e.code === event.code)?.pin ?? "",
				});
			}

			const meshedEvent = await db
				.insert(events)
				.values({
					code: input.code,
					name: "Meshed Event: " + subEvents.map((e) => e.label).join(", "),
					pin: input.pin,
					token,
					teams,
					meshedEvent: subEvents,
					checklist: {},
					autoEventSettings: DEFAULT_AUTO_EVENT_SETTINGS,
				})
				.returning();

			await db.insert(eventUsers).values({ user_id: ctx.user.id, event_code: input.code }).onConflictDoNothing();

			return {
				...meshedEvent[0],
				teams: meshedEvent[0].teams as TeamList,
				users: await db
					.select({
						id: users.id,
						username: users.username,
						role: users.role,
						admin: users.admin,
					})
					.from(users)
					.where(inArray(users.id, usersToGet)),
				subEvents,
			};
		}),

	updateMeshedEventLabels: eventProcedure
		.input(z.array(z.object({ code: z.string(), label: z.string(), color: z.string().optional() })))
		.mutation(async ({ ctx, input }) => {
			const eventDB = await db.query.events.findFirst({ where: eq(events.token, ctx.eventToken as string) });
			if (!eventDB) throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
			if (!eventDB.meshedEvent) throw new TRPCError({ code: "BAD_REQUEST", message: "Not a meshed event" });

			const existing = eventDB.meshedEvent as Array<{
				code: string;
				name: string;
				label: string;
				color?: string;
				token: string;
				pin: string;
				teams: TeamList;
			}>;
			const updateMap = new Map(input.map((e) => [e.code, e]));

			const updated = existing.map((sub) => {
				const upd = updateMap.get(sub.code);
				if (!upd) return sub;
				return { ...sub, label: upd.label, color: upd.color ?? sub.color };
			});

			const newName = "Meshed Event: " + updated.map((e) => e.label).join(", ");

			await db
				.update(events)
				.set({ meshedEvent: updated, name: newName })
				.where(eq(events.token, ctx.eventToken as string));

			// Update in-memory cache
			const cached = inMemoryEvents[eventDB.code];
			if (cached) {
				cached.subEvents = updated as NonNullable<ServerEvent["subEvents"]>;
				cached.name = newName;
			}

			return { subEvents: updated, name: newName };
		}),

	togglePublicNoteSubmit: eventProcedure
		.input(
			z.object({
				state: z.boolean(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const updatedValue = await db
				.update(events)
				.set({ publicTicketSubmit: input.state })
				.where(eq(events.token, ctx.eventToken as string))
				.returning({ publicNoteSubmit: events.publicTicketSubmit });

			if (!updatedValue) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to update public note submit status",
				});
			}

			return updatedValue;
		}),

	getPublicNoteSubmit: eventProcedure.query(async ({ ctx }) => {
		const event = await db.query.events.findFirst({ where: eq(events.token, ctx.eventToken as string) });

		if (!event) {
			throw new TRPCError({ code: "NOT_FOUND", message: "Unable to get event from user event token" });
		}

		return event.publicTicketSubmit;
	}),

	getName: publicProcedure
		.input(
			z.object({
				code: z.string(),
			}),
		)
		.query(async ({ input }) => {
			const event = await db.query.events.findFirst({ where: eq(events.code, input.code) });

			if (!event) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
			}

			return event.name;
		}),

	getEventToken: publicProcedure
		.input(
			z.object({
				code: z.string(),
				pin: z.string(),
			}),
		)
		.query(async ({ input }) => {
			const event = await db.query.events.findFirst({ where: eq(events.code, input.code) });

			if (!event) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
			}

			if (event.pin !== input.pin) {
				throw new TRPCError({ code: "UNAUTHORIZED", message: "Incorrect pin" });
			}

			return event.token;
		}),

	setNexusApiKey: eventProcedure
		.input(
			z.object({
				nexusApiKey: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const event = await getEvent(ctx.event.token);
			await db
				.update(events)
				.set({ nexusApiKey: input.nexusApiKey || null })
				.where(eq(events.code, event.code));
			event.nexusApiKey = input.nexusApiKey || undefined;
			nexusPoller.restartForEvent(event);
			nexusEventPoller.restartForEvent(event);
			return { success: true };
		}),

	getNexusStatus: eventProcedure.query(async ({ ctx }) => {
		const event = await getEvent(ctx.event.token);
		return { ...event.nexus, nexusApiKeyIsSet: !!event.nexusApiKey };
	}),

	getNexusLiveStatus: eventProcedure.query(async ({ ctx }) => {
		const event = await getEvent(ctx.event.token);
		const status = event.nexusEventStatus;

		if (!status || !status.nowQueuing) {
			return {
				available: !!event.nexusApiKey,
				nowQueuing: null,
				nowQueuingTeams: null,
				dataAsOfTime: status?.dataAsOfTime ?? null,
			};
		}

		const parseTeam = (s: string | null | undefined): number | null => {
			if (!s) return null;
			const n = parseInt(s, 10);
			return isNaN(n) ? null : n;
		};

		const teamsFromMatch = (m: (typeof status.matches)[number] | undefined) =>
			m
				? {
						red1: parseTeam(m.redTeams?.[0]),
						red2: parseTeam(m.redTeams?.[1]),
						red3: parseTeam(m.redTeams?.[2]),
						blue1: parseTeam(m.blueTeams?.[0]),
						blue2: parseTeam(m.blueTeams?.[1]),
						blue3: parseTeam(m.blueTeams?.[2]),
					}
				: null;

		// Use array position: nowQueuing is at idx, on-deck is idx-1, on-field is idx-2.
		const queuingIdx = status.matches.findIndex((m) => m.label === status.nowQueuing);
		const onFieldMatch = queuingIdx >= 2 ? status.matches[queuingIdx - 2] : undefined;
		const queuingMatch = queuingIdx >= 0 ? status.matches[queuingIdx] : undefined;

		return {
			available: !!event.nexusApiKey,
			nowQueuing: status.nowQueuing,
			nowQueuingTeams: teamsFromMatch(onFieldMatch) ?? teamsFromMatch(queuingMatch),
			nowOnField: onFieldMatch?.label ?? null,
			dataAsOfTime: status.dataAsOfTime,
		};
	}),

	getPitMap: eventProcedure.query(async ({ ctx }) => {
		const event = await getEvent(ctx.event.token);
		if (!event.nexusApiKey) return null;

		const CACHE_MS = 5 * 60 * 1000;
		if (event.pitMap && Date.now() - event.pitMap.fetchedAt.getTime() < CACHE_MS) {
			return event.pitMap.data;
		}

		const response = await fetch(`https://frc.nexus/api/v1/event/${event.code}/map`, {
			headers: { "Nexus-Api-Key": event.nexusApiKey },
		});

		if (response.status === 404) {
			event.pitMap = { data: null, fetchedAt: new Date() };
			return null;
		}

		if (!response.ok) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: `Nexus map fetch failed: ${response.status}`,
			});
		}

		const data = await response.json();
		event.pitMap = { data, fetchedAt: new Date() };
		return data;
	}),

	setFmsEventPassword: eventProcedure
		.input(
			z.object({
				fmsEventPassword: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const event = await getEvent(ctx.event.token);
			await db
				.update(events)
				.set({ fmsEventPassword: input.fmsEventPassword || null })
				.where(eq(events.code, event.code));
			event.fmsEventPassword = input.fmsEventPassword || undefined;
			return { success: true };
		}),

	/** Returns whether a FMS event password is configured (without revealing the value). */
	getFmsPasswordIsSet: eventProcedure.query(async ({ ctx }) => {
		const event = await getEvent(ctx.event.token);
		return { isSet: !!event.fmsEventPassword };
	}),

	/**
	 * Returns the FMS integration status: whether a password is configured and whether
	 * any extension has sent a frame in the last 90 seconds.
	 */
	getFmsIntegrationStatus: eventProcedure.query(async ({ ctx }) => {
		const event = await getEvent(ctx.event.token);
		const cutoff = new Date(Date.now() - 90_000);
		const activeExtension =
			event.stats.extensions
				.filter((e) => e.lastFrame > cutoff)
				.sort((a, b) => b.lastFrame.getTime() - a.lastFrame.getTime())[0] ?? null;
		return {
			passwordConfigured: !!event.fmsEventPassword,
			extensionConnected: !!activeExtension,
			lastSeenAt: activeExtension?.lastFrame ?? null,
		};
	}),

	/** Returns the FMS event password for use by the extension to authenticate against FMS APIs. */
	getFmsEventPassword: eventProcedure.query(async ({ ctx }) => {
		const event = await getEvent(ctx.event.token);
		return { fmsEventPassword: event.fmsEventPassword ?? null };
	}),

	/** Returns full event details needed to populate the client event store (usable with just an event token). */
	getDetails: eventProcedure.query(async ({ ctx }) => {
		const event = await getEvent(ctx.event.token);
		const subEventLabel = event.meshedEvent ? undefined : await getSubEventLabel(event.code);
		return {
			code: event.code,
			pin: event.pin,
			token: event.token,
			label: subEventLabel ?? event.name,
			teams: event.teams,
			users: event.users,
			subEvents: event.subEvents,
			meshedEventCode: event.subEvents ? event.code : undefined,
			playoffMode: event.playoffMode,
			startDate: event.startDate,
			endDate: event.endDate,
		};
	}),

	/** Returns the team list (number, name, inspected) for this event. */
	getTeams: eventProcedure.query(async ({ ctx }) => {
		const event = await getEvent(ctx.event.token);
		return event.teams;
	}),

	/** Removes a single team from the event's team list and checklist. */
	removeTeam: eventProcedure.input(z.object({ teamNumber: z.string() })).mutation(async ({ ctx, input }) => {
		const event = await getEvent(ctx.event.token);
		const teams = event.teams as TeamList;
		const checklist = event.checklist as EventChecklist;

		event.teams = teams.filter((t) => String(t.number) !== input.teamNumber);
		delete checklist[input.teamNumber];
		event.checklist = checklist;

		await db.update(events).set({ teams: event.teams, checklist }).where(eq(events.code, event.code)).execute();

		return { success: true };
	}),

	/** Returns the list of users currently joined to this event. */
	getUsers: eventProcedure.query(async ({ ctx }) => {
		const event = await getEvent(ctx.event.token);
		return (event.users as Profile[]).map((u) => ({
			id: u.id,
			username: u.username,
			role: u.role,
			admin: u.admin,
		})) as Profile[];
	}),

	/** Get the auto-event settings for this event. Missing keys default to true (enabled). */
	getAutoEventSettings: eventProcedure.query(async ({ ctx }) => {
		const event = await getEvent(ctx.event.token);
		// Fill in defaults: any missing key is treated as enabled
		const settings: EventAutoEventSettings = {};
		for (const issue of AUTO_EVENT_ISSUE_TYPES) {
			settings[issue] = event.autoEventSettings?.[issue] ?? true;
		}
		return settings;
	}),

	/** Update the auto-event settings for this event. */
	setAutoEventSettings: eventProcedure
		.input(
			z.object({
				settings: z
					.object(
						Object.fromEntries(AUTO_EVENT_ISSUE_TYPES.map((k) => [k, z.boolean()])) as Record<
							AutoEventIssueType,
							z.ZodBoolean
						>,
					)
					.partial(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const event = await getEvent(ctx.event.token);
			// Only persist keys that belong to the known issue type set
			const newSettings: EventAutoEventSettings = {};
			for (const issue of AUTO_EVENT_ISSUE_TYPES) {
				if (issue in input.settings) {
					newSettings[issue] = input.settings[issue];
				}
			}
			await db.update(events).set({ autoEventSettings: newSettings }).where(eq(events.code, event.code));
			event.autoEventSettings = newSettings;
			// Keep the global cache in sync so log analysis picks up the change
			// even for events that run across multiple analysis cycles
			autoEventSettingsCache.set(event.code, newSettings);
			return { success: true };
		}),

	/**
	 * Admin-only: send a test push notification to every user currently joined to the event
	 * identified by `eventToken`. Useful for verifying that push subscriptions are wired up.
	 */
	notification: adminProcedure
		.input(
			z.object({
				eventToken: z.string(),
				/** Optional pre-built payload from the notification preview UI. */
				notification: z
					.object({
						title: z.string(),
						body: z.string().optional(),
						topic: z.string(),
						tag: z.string().optional(),
						kind: z.string().optional(),
						urgency: z.enum(["low", "normal", "high"]).optional(),
						data: z.object({ page: z.string().optional(), note_id: z.string().optional() }).optional(),
					})
					.optional(),
			}),
		)
		.query(async ({ input }) => {
			const event = await getEvent(input.eventToken);
			const userIds = (event.users as Profile[]).map((u) => u.id);

			if (userIds.length === 0) {
				return { sent: 0, message: "No users on this event" };
			}

			const base = input.notification;
			await createNotification(
				userIds,
				{
					id: randomUUID(),
					timestamp: new Date(),
					title: base?.title ?? "Test Notification",
					body: base?.body,
					topic: (base?.topic ?? "Note-Created") as any,
					tag: base?.tag,
					kind: base?.kind,
					urgency: base?.urgency,
					data: base?.data ?? { page: "/" },
				},
				event.code,
			);

			return { sent: userIds.length };
		}),

	setActiveEvent: protectedProcedure.input(z.object({ eventCode: z.string() })).mutation(async ({ input, ctx }) => {
		if (input.eventCode === "") {
			await db.update(users).set({ active_event_code: null }).where(eq(users.id, ctx.user.id));
			return true;
		}
		const membership = await db.query.eventUsers.findFirst({
			where: and(eq(eventUsers.user_id, ctx.user.id), eq(eventUsers.event_code, input.eventCode)),
		});
		if (!membership) throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this event" });
		await db.update(users).set({ active_event_code: input.eventCode }).where(eq(users.id, ctx.user.id));
		return true;
	}),

	/**
	 * Infers the current match from The Blue Alliance by finding the last qualification
	 * match that has an actual_time set (i.e. has been played). Useful when neither
	 * field monitor nor FMS API calls are enabled.
	 */
	getCurrentMatchFromTBA: eventProcedure.query(async ({ ctx }) => {
		try {
			const res = await fetch(`https://www.thebluealliance.com/api/v3/event/${ctx.event.code}/matches/simple`, {
				headers: { "X-TBA-Auth-Key": process.env.TBA_API_KEY ?? "" },
			});
			if (!res.ok) return { matchNumber: 0, level: "None" as TournamentLevel };

			const matches: any[] = await res.json();

			// Find qual matches sorted by match_number descending
			const qualMatches = matches
				.filter((m) => m.comp_level === "qm")
				.sort((a, b) => b.match_number - a.match_number);

			// Last played qual match is the first one (highest number) with actual_time set
			const lastPlayed = qualMatches.find((m) => m.actual_time != null);

			if (lastPlayed) {
				return { matchNumber: lastPlayed.match_number as number, level: "Qualification" as TournamentLevel };
			}

			// No qual matches played yet -- check if any playoff matches are being played
			const playoffMatches = matches
				.filter((m) => m.comp_level !== "qm" && m.actual_time != null)
				.sort((a, b) => (b.actual_time ?? 0) - (a.actual_time ?? 0));

			if (playoffMatches.length > 0) {
				return { matchNumber: playoffMatches[0].match_number as number, level: "Playoff" as TournamentLevel };
			}

			return { matchNumber: 0, level: "None" as TournamentLevel };
		} catch {
			return { matchNumber: 0, level: "None" as TournamentLevel };
		}
	}),

	/**
	 * Toggles inter-divisional playoffs mode for a meshed event.
	 * When enabled, the combined view acts as a normal single-event view scoped
	 * only to the parent event - its own field monitor, logs, and notes.
	 * Divisional sub-events remain accessible via the sidebar selector.
	 */
	setNotepadOnly: eventProcedure.input(z.object({ notepadOnly: z.boolean() })).mutation(async ({ ctx, input }) => {
		const event = await getEvent(ctx.event.token);
		await db.update(events).set({ notepadOnly: input.notepadOnly }).where(eq(events.code, event.code));
		event.notepadOnly = input.notepadOnly;
		return { notepadOnly: input.notepadOnly };
	}),

	setPlayoffMode: eventProcedure.input(z.object({ playoffMode: z.boolean() })).mutation(async ({ ctx, input }) => {
		const event = await getEvent(ctx.event.token);
		if (!event.meshedEvent) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Inter-divisional playoffs mode is only available for meshed events",
			});
		}
		await db.update(events).set({ playoffMode: input.playoffMode }).where(eq(events.code, event.code));
		event.playoffMode = input.playoffMode;
		// Broadcast to all instances so their cached event stays in sync
		bus.publish(`event:${event.code}:playoff_mode`, input.playoffMode);
		return { playoffMode: input.playoffMode };
	}),
});
