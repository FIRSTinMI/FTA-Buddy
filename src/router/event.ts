import { TRPCError } from "@trpc/server";
import { desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/db";
import { events, users } from "../db/schema";
import { adminProcedure, eventProcedure, protectedProcedure, publicProcedure, router } from "../trpc";
import { generateToken } from "./user";
import { EventChecklist, Profile, TeamList, TournamentLevel } from '../../shared/types';
import { createHash } from 'crypto';
import { getEvent } from "../util/get-event";
//import { sendNotification } from "../../app/src/util/push-notifications";

const fullEventList: {
    fetched: Date | undefined;
    events: {
        first_event_code: string;
        key: string;
    }[];
} = {
    fetched: undefined,
    events: []
};

async function updateFullEventList() {
    if (!fullEventList.fetched || fullEventList.fetched.getTime() < Date.now() - 1000 * 60 * 60 * 24) {
        const year = new Date().getFullYear();
        const updatedEventList = await (await fetch(`https://www.thebluealliance.com/api/v3/events/${year}`, {
            headers: {
                'X-TBA-Auth-Key': process.env.TBA_API_KEY ?? ''
            }
        })).json();

        fullEventList.fetched = new Date();
        fullEventList.events = updatedEventList.map((event: any) => ({
            key: event.key,
            first_event_code: event.first_event_code
        }));
    }
}

updateFullEventList();

export const eventRouter = router({
    checkCode: publicProcedure.input(z.object({
        code: z.string()
    })).query(async ({ input }) => {
        input.code = input.code.trim().toLowerCase();
        const event = await db.query.events.findFirst({ where: eq(events.code, input.code.trim().toLowerCase()) });

        if (event) return { error: true, message: 'Event already exists' };

        // Get event title
        const eventData = await (await fetch(`https://www.thebluealliance.com/api/v3/event/${input.code}/simple`, {
            headers: {
                'X-TBA-Auth-Key': process.env.TBA_API_KEY ?? ''
            }
        })).json();

        // Event code not found
        if ("Error" in eventData) {
            // Update full event list if needed
            await updateFullEventList();
            // Check to see if the code matches a first event code
            const inputCodeWithoutYear = input.code.replace(/\d{4}/, '');
            const event = fullEventList.events.find(e => e.first_event_code === inputCodeWithoutYear);

            if (event) {
                return { error: true, message: 'Use TBA event code ' + event.key, key: event.key };
            }

            return { error: true, message: eventData.Error };
        }

        return { error: false, message: 'Event found', eventData };
    }),

    join: protectedProcedure.input(z.object({
        code: z.string(),
        pin: z.string()
    })).query(async ({ input, ctx }) => {
        input.code = input.code.trim().toLowerCase();

        const eventDB = await db.query.events.findFirst({ where: eq(events.code, input.code) });

        if (!eventDB) throw new TRPCError({ code: 'NOT_FOUND', message: 'Event not found' });

        if (eventDB.pin !== input.pin) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Incorrect pin' });
        if (eventDB.archived) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Event has been archived' });

        const event = await getEvent(eventDB?.token ?? '');

        const eventList = ctx.user.events as string[];

        event.users = Array.from(new Set([...event.users, {
            id: ctx.user.id,
            username: ctx.user.username,
            role: ctx.user.role,
            admin: ctx.user.admin,
        }]));

        await db.update(users).set({ events: Array.from(new Set([...eventList, event.code])) }).where(eq(users.id, ctx.user.id));
        await db.update(events).set({ users: Array.from(new Set(event.users.map(u => u.id))) }).where(eq(events.code, event.code));

        return event;
    }),

    get: adminProcedure.input(z.object({
        code: z.string()
    })).query(async ({ input, ctx }) => {
        input.code = input.code.trim().toLowerCase();

        const eventDB = (await db.select({
            code: events.code,
            pin: events.pin,
            token: events.token,
            teams: events.teams,
            checklist: events.checklist,
            users: events.users,
            archived: events.archived,
            subEvents: events.meshedEvent
        }).from(events).where(eq(events.code, input.code)))[0];

        if (eventDB.archived) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Event has been archived' });

        const event = await getEvent('', input.code);

        if (!event) throw new TRPCError({ code: 'NOT_FOUND', message: 'Event not found' });

        const eventList = ctx.user.events as string[];

        event.users = Array.from(new Set([...event.users, {
            id: ctx.user.id,
            username: ctx.user.username,
            role: ctx.user.role,
            admin: ctx.user.admin,
        }]));

        await db.update(users).set({ events: Array.from(new Set([...eventList, event.code])) }).where(eq(users.id, ctx.user.id));
        await db.update(events).set({ users: Array.from(new Set(event.users.map(u => u.id))) }).where(eq(events.code, event.code));

        return {
            ...eventDB,
            subEvents: eventDB.subEvents as { code: string, label: string, token: string, teams: TeamList, pin: string, users: Profile[]; }[] ?? undefined,
        };
    }),

    create: publicProcedure.input(z.object({
        code: z.string().startsWith('202').min(6),
        pin: z.string().min(4),
        teams: z.array(z.number()).optional()
    })).query(async ({ input, ctx }) => {
        input.code = input.code.trim().toLowerCase();
        const token = generateToken();
        const teams: TeamList = [];
        const checklist: EventChecklist = {};

        if (await db.query.events.findFirst({ where: eq(events.code, input.code) })) {
            throw new TRPCError({ code: 'CONFLICT', message: 'Event already exists' });
        }

        const eventData = await (await fetch(`https://www.thebluealliance.com/api/v3/event/${input.code}/simple`, {
            headers: {
                'X-TBA-Auth-Key': process.env.TBA_API_KEY ?? ''
            }
        })).json();

        const teamsData = await fetch(`https://www.thebluealliance.com/api/v3/event/${input.code}/teams/simple`, {
            headers: {
                'X-TBA-Auth-Key': process.env.TBA_API_KEY ?? ''
            }
        }).then(res => res.json());

        if (teamsData) {
            for (let team of teamsData) {
                teams.push({ number: team.team_number, name: team.nickname, inspected: false });
                checklist[team.team_number] = {
                    present: false,
                    weighed: false,
                    inspected: false,
                    radioProgrammed: false,
                    connectionTested: false
                };
            }
        }

        const promises = [];

        for (let team of input.teams ?? []) {
            if (teams.find(t => t.number == team.toString())) continue;

            const teamData = fetch(`https://www.thebluealliance.com/api/v3/team/frc${team}/simple`, {
                headers: {
                    'X-TBA-Auth-Key': process.env.TBA_API_KEY ?? ''
                }
            }).then(res => res.json()).then((teamData) => {
                teams.push({ number: teamData.team_number, name: teamData.nickname, inspected: false });
                checklist[teamData.team_number] = {
                    present: false,
                    weighed: false,
                    inspected: false,
                    radioProgrammed: false,
                    connectionTested: false
                };
            });

            promises.push(teamData);
        }

        await Promise.all(promises);

        // Remove duplicate teams
        const uniqueTeams = Array.from(new Set(teams.map(team => team.number)))
            .map(number => teams.find(team => team.number === number));

        const user = await db.query.users.findFirst({ where: eq(users.token, ctx.token ?? "") });

        let name = eventData.name;

        if (eventData.name.includes('District')) {
            name = eventData.name.split('District')[1];
        }
        if (eventData.name.includes('Event')) {
            name = eventData.name.split('Event')[0];
        }

        const event = await db.insert(events).values({
            code: input.code,
            name: name.trim(),
            pin: input.pin,
            token,
            teams: uniqueTeams,
            checklist,
            users: [user?.id]
        }).returning();

        return event[0];
    }),

    getAll: publicProcedure.query(async () => {
        return await db.select({
            code: events.code,
            name: events.name,
            created_at: events.created_at
        }).from(events).where(eq(events.archived, false)).orderBy(desc(events.created_at));
    }),

    getMusicOrder: eventProcedure.input(z.object({
        match: z.number(),
        level: z.enum(["None", "Practice", "Qualification", "Playoff"])
    })).query(async ({ ctx, input }) => {
        let level: TournamentLevel | string = input.level;
        if (level === "None" || level === "Practice") level = (Math.random() * 10).toFixed(0);

        const hash = await createHash('md5').update(ctx.event.code + level + input.match).digest();
        const musicOrder = hash.toString('hex').split('');
        return musicOrder.map(s => parseInt(s, 16));
    }),

    createMeshedEvent: adminProcedure.input(z.object({
        code: z.string().min(4),
        pin: z.string().min(4),
        events: z.array(z.object({
            code: z.string().min(4),
            label: z.string()
        })).min(2)
    })).mutation(async ({ input, ctx }) => {
        input.code = input.code.trim().toLowerCase();
        const token = generateToken();

        if (await db.query.events.findFirst({ where: eq(events.code, input.code) })) {
            throw new TRPCError({ code: 'CONFLICT', message: 'Event already exists' });
        }

        const eventsData = await db.select().from(events).where(inArray(events.code, input.events.map(e => e.code)));

        if (eventsData.length !== input.events.length) {
            let missingEvents = input.events.filter(e => !eventsData.find(s => s.code === e.code));
            throw new TRPCError({ code: 'NOT_FOUND', message: `Events not found: ${missingEvents.map(e => e.code).join(', ')}` });
        }

        const teams: TeamList = eventsData.flatMap(e => (e.teams as TeamList));

        let subEvents: { code: string, name: string, label: string, token: string, teams: TeamList, pin: string; }[] = [];

        let usersToGet = Array.from(new Set([...eventsData.flatMap(e => e.users as number[]), ctx.user.id]));

        for (let event of input.events) {
            subEvents.push({
                code: event.code,
                name: eventsData.find(e => e.code === event.code)?.name ?? '',
                label: event.label,
                token: eventsData.find(e => e.code === event.code)?.token ?? '',
                teams: eventsData.find(e => e.code === event.code)?.teams as TeamList,
                pin: eventsData.find(e => e.code === event.code)?.pin ?? '',
            });
        }

        const meshedEvent = await db.insert(events).values({
            code: input.code,
            name: "Meshed Event: " + subEvents.map(e => e.label).join(', '),
            pin: input.pin,
            token,
            teams,
            users: [ctx.user.id],
            meshedEvent: subEvents,
            checklist: {}
        }).returning();


        const eventList = ctx.user.events as string[];
        await db.update(users).set({ events: Array.from(new Set([...eventList, input.code])) }).where(eq(users.id, ctx.user.id));

        return {
            ...meshedEvent[0],
            teams: meshedEvent[0].teams as TeamList,
            users: await db.select({
                id: users.id,
                username: users.username,
                role: users.role,
                admin: users.admin
            }).from(users).where(inArray(users.id, usersToGet)),
            subEvents
        };
    }),

    togglePublicTicketSubmit: eventProcedure.input(z.object({
        state: z.boolean()
    })).query(async ({ ctx, input }) => {
        const updatedValue = await db.update(events).set({ publicTicketSubmit: input.state })
            .where(eq(events.token, ctx.eventToken as string))
            .returning({ publicTicketSubmit: events.publicTicketSubmit });

        if (!updatedValue) {
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to update public ticket submit status' });
        }

        return updatedValue;
    }),

    getPublicTicketSubmit: eventProcedure.query(async ({ ctx }) => {
        const event = await db.query.events.findFirst({ where: eq(events.token, ctx.eventToken as string) });

        if (!event) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Unable to get event from user event token' });
        }

        return event.publicTicketSubmit;
    }),

    getName: publicProcedure.input(z.object({
        code: z.string()
    })).query(async ({ input }) => {
        const event = await db.query.events.findFirst({ where: eq(events.code, input.code) });

        if (!event) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Event not found' });
        }

        return event.name;
    }),

    getEventToken: publicProcedure.input(z.object({
        code: z.string(),
        pin: z.string()
    })).query(async ({ input }) => {
        const event = await db.query.events.findFirst({ where: eq(events.code, input.code) });

        if (!event) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Event not found' });
        }

        if (event.pin !== input.pin) {
            throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Incorrect pin' });
        }

        return event.token;
    }),
});
