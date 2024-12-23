import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/db";
import { events, users } from "../db/schema";
import { adminProcedure, eventProcedure, protectedProcedure, publicProcedure, router } from "../trpc";
import { generateToken } from "./user";
import { EventChecklist, TeamList, TournamentLevel } from '../../shared/types';
import { createHash } from 'crypto';
import { getEvent } from "../util/get-event";
import { sendNotification } from "../util/push-notifications";

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

        if ("Error" in eventData) return { error: true, message: eventData.Error };

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

        const checklist = event.checklist as EventChecklist;

        for (let team of (event.teams) as TeamList) {
            team.inspected = checklist[team.number].inspected && checklist[team.number].weighed;
        }

        const eventList = ctx.user.events as string[];

        event.users = Array.from(new Set([...event.users, ctx.user.id]));

        await db.update(users).set({ events: Array.from(new Set([...eventList, event.code])) }).where(eq(users.id, ctx.user.id));
        await db.update(events).set({ users: event.users }).where(eq(events.code, event.code));

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
            archived: events.archived
        }).from(events).where(eq(events.code, input.code)))[0];

        if (eventDB.archived) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Event has been archived' });

        const event = await getEvent('', input.code);

        if (!event) throw new TRPCError({ code: 'NOT_FOUND', message: 'Event not found' });

        const checklist = event.checklist as EventChecklist;

        for (let team of (event.teams) as TeamList) {
            team.inspected = checklist[team.number].inspected && checklist[team.number].weighed;
        }

        const eventList = ctx.user.events as string[];

        event.users = Array.from(new Set([...event.users, ctx.user.id]));

        await db.update(users).set({ events: Array.from(new Set([...eventList, event.code])) }).where(eq(users.id, ctx.user.id));
        await db.update(events).set({ users: event.users }).where(eq(events.code, event.code));

        return eventDB;
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
            if (teams.find(t => t.number === team.toString())) continue;

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

        const user = await db.query.users.findFirst({ where: eq(users.token, ctx.token ?? "") });

        await db.insert(events).values({
            code: input.code,
            pin: input.pin,
            token,
            teams,
            checklist,
            users: [user?.id]
        });

        return { code: input.code, token, teams };
    }),

    getAll: publicProcedure.query(async () => {
        return await db.select({
            code: events.code,
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

    notification: adminProcedure.input(z.object({
        eventToken: z.string(),
    })).query(async ({ input }) => {
        const event = await getEvent(input.eventToken);

        console.log('Sending notification to', event.users);

        sendNotification(event.users, {
            title: 'Test',
            body: 'Test notification',
            data: {
                page: 'messages'
            }
        });
    })
});
