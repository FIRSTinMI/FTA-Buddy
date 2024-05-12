import 'dotenv/config';
import { z } from "zod";
import { eventProcedure, publicProcedure, router } from "../trpc";
import { db } from '../db/db';
import { logPublishing, matchLogs } from '../db/schema';
import { and, asc, eq } from 'drizzle-orm';
import { inferRouterOutputs } from '@trpc/server';
import { randomUUID } from 'crypto';
import { FMSLogFrame, ROBOT } from '../../shared/types';

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
        const match = await db.query.matchLogs.findFirst({
            where: and(
                eq(matchLogs.id, input.id),
                eq(matchLogs.event, ctx.event.code) // Technically not required but like security ig?
            )
        });

        if (!match) throw new Error('Match not found');

        return match;
    }),

    getStationMatch: eventProcedure.input(z.object({
        id: z.string().uuid(),
        station: z.string()
    })).query(async ({ input, ctx }) => {
        const match = await db.query.matchLogs.findFirst({
            where: and(
                eq(matchLogs.id, input.id),
                eq(matchLogs.event, ctx.event.code) // Technically not required but like security ig?
            )
        });

        if (!match) throw new Error('Match not found');

        let station: ROBOT;

        // If there is an input for station but it's not actually a station, it might be a share id
        if (input.station && !['blue1', 'blue2', 'blue3', 'red1', 'red2', 'red3'].includes(input.station)) {
            const share = await db.query.logPublishing.findFirst({
                where: and(
                    eq(logPublishing.id, input.station),
                    eq(logPublishing.match_id, input.id),
                    eq(logPublishing.event, ctx.event.code)
                )
            });

            if (!share) throw new Error('Share not found');

            station = share.station as ROBOT;
        } else {
            station = input.station as ROBOT;
        }

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
            log: match[`${station}_log`] as FMSLogFrame[]
        };
    }),

    getPublicMatch: publicProcedure.input(z.object({
            id: z.string().uuid(),
            sharecode: z.string()
    })).query(async ({ input, ctx }) => {
        const share = await db.query.logPublishing.findFirst({
            where: and(
                eq(logPublishing.id, input.sharecode),
                eq(logPublishing.match_id, input.id)
            )
        });

        if (!share) throw new Error('Share not found');

        let station = share.station as ROBOT;

        const match = await db.query.matchLogs.findFirst({
            where: and(
                eq(matchLogs.id, input.id)
            )
        });

        if (!match) throw new Error('Match not found');

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
            log: match[`${station}_log`] as FMSLogFrame[]
        };
    }),

    publishMatch: eventProcedure.input(z.object({
        id: z.string().uuid(),
        station: z.enum(['blue1', 'blue2', 'blue3', 'red1', 'red2', 'red3']),
        team: z.number()
    })).query(async ({ input, ctx }) => {
        const existingShare = await db.query.logPublishing.findFirst({
            where: and(
                eq(logPublishing.match_id, input.id),
                eq(logPublishing.station, input.station),
                eq(logPublishing.team, input.team),
                eq(logPublishing.event, ctx.event.code)
            )
        });

        if (existingShare) return { id: existingShare.id };

        const match = await db.query.matchLogs.findFirst({
            where: and(
                eq(matchLogs.id, input.id),
                eq(matchLogs.event, ctx.event.code)
            )
        });

        if (!match) throw new Error('Match not found');

        const id = randomUUID();

        await db.insert(logPublishing).values({
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
            expire_time: new Date(new Date().getTime() + 1000 * 60 * 60 * 72) // 72 hours
        }).execute();

        return { id };
    }),

    putCycleInfo: publicProcedure.input(z.object({
        matchId: z.string().uuid(),
    })).query(async ({ input }) => {
    })
});
