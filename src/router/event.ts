import 'dotenv/config';
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/db";
import { events, users } from "../db/schema";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "../trpc";
import { generateToken } from "./user";
import { EventChecklist, TeamList } from '../../shared/types';

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

        const event = await db.query.events.findFirst({ where: eq(events.code, input.code) });

        if (!event) throw new TRPCError({ code: 'NOT_FOUND', message: 'Event not found' });

        if (event.pin !== input.pin) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Incorrect pin' });

        const checklist = event.checklist as EventChecklist;

        for (let team of (event.teams) as TeamList) {
            team.inspected = checklist[team.number].inspected && checklist[team.number].weighed;
        }

        const eventList = ctx.user.events as string[];

        void db.update(users).set({ events: [...eventList, event.code] }).where(eq(users.id, ctx.user.id));
        void db.update(events).set({ users: [...(event.users as number[]), ctx.user.id] }).where(eq(events.code, event.code));

        return event;
    }),

    get: adminProcedure.input(z.object({
        code: z.string()
    })).query(async ({ input }) => {
        input.code = input.code.trim().toLowerCase();

        const event = await db.query.events.findFirst({ where: eq(events.code, input.code) });

        if (!event) throw new TRPCError({ code: 'NOT_FOUND', message: 'Event not found' });

        const checklist = event.checklist as EventChecklist;

        for (let team of (event.teams) as TeamList) {
            team.inspected = checklist[team.number].inspected && checklist[team.number].weighed;
        }

        return event;
    }),

    create: publicProcedure.input(z.object({
        code: z.string().startsWith('202').min(6),
        pin: z.string().min(4),
        teams: z.array(z.number()).optional()
    })).query(async ({ input }) => {
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
                if (input.teams?.includes(team)) input.teams = input.teams?.splice(input.teams.indexOf(team), 1) ?? [];

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

        for (let team of input.teams ?? []) {
            const teamData = await fetch(`https://www.thebluealliance.com/api/v3/team/frc${team}/simple`, {
                headers: {
                    'X-TBA-Auth-Key': process.env.TBA_API_KEY ?? ''
                }
            }).then(res => res.json());

            if (teamData) {
                teams.push({ number: teamData.team_number, name: teamData.nickname, inspected: false });
                checklist[teamData.team_number] = {
                    present: false,
                    weighed: false,
                    inspected: false,
                    radioProgrammed: false,
                    connectionTested: false
                };
            }
        }

        await db.insert(events).values({
            code: input.code,
            pin: input.pin,
            token,
            teams,
            checklist
        });

        return { code: input.code, token, teams };
    }),

    getAll: adminProcedure.query(async () => {
        return (await db.query.events.findMany()).sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
    })
});
