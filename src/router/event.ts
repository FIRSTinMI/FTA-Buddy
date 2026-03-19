import { TRPCError } from "@trpc/server";
import { createHash, randomUUID } from "crypto";
import { desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
	AUTO_EVENT_ISSUE_TYPES,
	AutoEventIssueType,
	EventAutoEventSettings,
	EventChecklist,
	Profile,
	TeamList,
	TournamentLevel,
} from "../../shared/types";
import { autoEventSettingsCache } from "../util/log-analysis";
import { db } from "../db/db";
import { events, users } from "../db/schema";
import { adminProcedure, eventProcedure, protectedProcedure, publicProcedure, router } from "../trpc";
import { events as inMemoryEvents } from "../state";
import { getEvent } from "../util/get-event";
import * as nexusPoller from "../util/nexusInspectionPoller";
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
				await fetch(`https://www.thebluealliance.com/api/v3/event/${input.code}/simple`, {
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

			const eventList = ctx.user.events as string[];

			event.users = Array.from(
				new Set([
					...event.users,
					{
						id: ctx.user.id,
						username: ctx.user.username,
						role: ctx.user.role,
						admin: ctx.user.admin,
					},
				]),
			);

			await db
				.update(users)
				.set({ events: Array.from(new Set([...eventList, event.code])) })
				.where(eq(users.id, ctx.user.id));
			await db
				.update(events)
				.set({ users: Array.from(new Set(event.users.map((u) => u.id))) })
				.where(eq(events.code, event.code));

			return event;
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
						users: events.users,
						archived: events.archived,
						subEvents: events.meshedEvent,
						notepadOnly: events.notepadOnly,
					})
					.from(events)
					.where(eq(events.code, input.code))
			)[0];

			if (eventDB.archived) throw new TRPCError({ code: "BAD_REQUEST", message: "Event has been archived" });

			const event = await getEvent("", input.code);

			if (!event) throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });

			const eventList = ctx.user.events as string[];

			event.users = Array.from(
				new Set([
					...event.users,
					{
						id: ctx.user.id,
						username: ctx.user.username,
						role: ctx.user.role,
						admin: ctx.user.admin,
					},
				]),
			);

			await db
				.update(users)
				.set({ events: Array.from(new Set([...eventList, event.code])) })
				.where(eq(users.id, ctx.user.id));
			await db
				.update(events)
				.set({ users: Array.from(new Set(event.users.map((u) => u.id))) })
				.where(eq(events.code, event.code));

			return {
				...eventDB,
				subEvents:
					(eventDB.subEvents as {
						code: string;
						label: string;
						token: string;
						teams: TeamList;
						pin: string;
						users: Profile[];
					}[]) ?? undefined,
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
				await fetch(`https://www.thebluealliance.com/api/v3/event/${input.code}/simple`, {
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
					teams.push({ number: team.team_number, name: team.nickname, inspected: false });
					checklist[team.team_number] = {
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
						teams.push({ number: teamData.team_number, name: teamData.nickname, inspected: false });
						checklist[teamData.team_number] = {
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
					users: [user?.id],
					startDate: eventData.start_date ?? null,
					endDate: eventData.end_date ?? null,
					autoEventSettings: Object.fromEntries(
						AUTO_EVENT_ISSUE_TYPES.map((t) => [t, true]),
					) as EventAutoEventSettings,
					notepadOnly: input.notepadOnly ?? false,
				})
				.returning();

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
		return await db
			.select({
				code: events.code,
				name: events.name,
				created_at: events.created_at,
			})
			.from(events)
			.where(eq(events.archived, false))
			.orderBy(desc(events.created_at));
	}),

	getAllWithUsers: adminProcedure.query(async () => {
		const eventsData = await db
			.select({
				code: events.code,
				name: events.name,
				users: events.users,
			})
			.from(events)
			.where(eq(events.archived, false))
			.orderBy(desc(events.created_at));

		const allUserIds = Array.from(new Set(eventsData.flatMap((e) => (e.users as number[]) ?? [])));
		const usersList =
			allUserIds.length > 0
				? await db
						.select({ id: users.id, username: users.username, role: users.role })
						.from(users)
						.where(inArray(users.id, allUserIds))
				: [];

		const usersMap = new Map(usersList.map((u) => [u.id, u]));
		return eventsData.map((event) => ({
			code: event.code,
			name: event.name,
			users: ((event.users as number[]) ?? [])
				.map((id) => usersMap.get(id))
				.filter((u): u is NonNullable<typeof u> => u != null),
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
				token: string;
				teams: TeamList;
				pin: string;
			}[] = [];

			let usersToGet = Array.from(new Set([...eventsData.flatMap((e) => e.users as number[]), ctx.user.id]));

			for (let event of input.events) {
				subEvents.push({
					code: event.code,
					name: eventsData.find((e) => e.code === event.code)?.name ?? "",
					label: event.label,
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
					users: [ctx.user.id],
					meshedEvent: subEvents,
					checklist: {},
				})
				.returning();

			const eventList = ctx.user.events as string[];
			await db
				.update(users)
				.set({ events: Array.from(new Set([...eventList, input.code])) })
				.where(eq(users.id, ctx.user.id));

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
			return { success: true };
		}),

	getNexusStatus: eventProcedure.query(async ({ ctx }) => {
		const event = await getEvent(ctx.event.token);
		return { ...event.nexus, nexusApiKeyIsSet: !!event.nexusApiKey };
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
			await createNotification(userIds, {
				id: randomUUID(),
				timestamp: new Date(),
				title: base?.title ?? "Test Notification",
				body: base?.body,
				topic: (base?.topic ?? "Note-Created") as any,
				tag: base?.tag,
				kind: base?.kind,
				urgency: base?.urgency,
				data: base?.data ?? { page: "/" },
			});

			return { sent: userIds.length };
		}),
});
