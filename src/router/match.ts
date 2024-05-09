import 'dotenv/config';
import { z } from "zod";
import { eventProcedure, publicProcedure, router } from "../trpc";
import { db } from '../db/db';
import { matchLogs } from '../db/schema';
import { and, asc, eq } from 'drizzle-orm';
import { inferRouterOutputs } from '@trpc/server';

export type MatchRouterOutputs = inferRouterOutputs<typeof matchRouter>;

export const matchRouter = router({
    putMatchLogs: publicProcedure.input(z.object({
        event: z.string(),
        fmsMatchId: z.string(),
        fmsEventId: z.string(),
        matchNumber: z.number(),
        playNumber: z.number(),
        level: z.enum(['None', 'Practice', 'Qualification', 'Playoff']),
        actualStartTime: z.string(),
        teamNumberBlue1: z.number().optional(),
        teamNumberBlue2: z.number().optional(),
        teamNumberBlue3: z.number().optional(),
        teamNumberRed1: z.number().optional(),
        teamNumberRed2: z.number().optional(),
        teamNumberRed3: z.number().optional(),
        logs: z.object({
            blue1: z.array(z.any()).optional(),
            blue2: z.array(z.any()).optional(),
            blue3: z.array(z.any()).optional(),
            red1: z.array(z.any()).optional(),
            red2: z.array(z.any()).optional(),
            red3: z.array(z.any().optional())
        })
    })).query(async ({ input }) => {
        await db.insert(matchLogs).values({
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
            blue1_log: input.logs.blue1,
            blue2_log: input.logs.blue2,
            blue3_log: input.logs.blue3,
            red1_log: input.logs.red1,
            red2_log: input.logs.red2,
            red3_log: input.logs.red3
        }).execute();
    }),

    getMatches: eventProcedure.input(z.object({
        level: z.enum(['None', 'Practice', 'Qualification', 'Playoff']).optional(),
        team: z.number().optional(),
    })).query(async ({ input, ctx }) => {
        const filters = [eq(matchLogs.event, ctx.event.code)];

        if (input.level) filters.push(eq(matchLogs.level, input.level));
        if (input.team) filters.push(
            eq(matchLogs.blue1, input.team),
            eq(matchLogs.blue2, input.team),
            eq(matchLogs.blue3, input.team),
            eq(matchLogs.red1, input.team),
            eq(matchLogs.red2, input.team),
            eq(matchLogs.red3, input.team)
        );

        return await db.query.matchLogs.findMany({
            where: and(...filters),
            orderBy: asc(matchLogs.start_time)
        });
    }),

    getMatch: eventProcedure.input(z.object({
        id: z.string().uuid()
    })).query(async ({ input, ctx }) => {
        return await db.query.matchLogs.findFirst({
            where: and(
                eq(matchLogs.id, input.id),
                eq(matchLogs.event, ctx.event.code) // Technically not required but like security ig?
            )
        });
    }),

    putCycleInfo: publicProcedure.input(z.object({
        matchId: z.string().uuid(),
    })).query(async ({ input }) => {
    })
});
