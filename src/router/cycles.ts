import { z } from "zod";
import { eventProcedure, publicProcedure, router } from "../trpc";
import { getEvent } from "../util/get-event";
import { observable } from "@trpc/server/observable";
import { CycleData } from "../../shared/types";
import { db } from "../db/db";
import { cycleLogs } from "../db/schema";
import { and, asc, eq, isNotNull, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { getTeamAverageCycle } from "../util/team-cycles";
import { cycleTimeToMS } from "../../shared/cycleTimeToMS";

export const cycleRouter = router({
    postCycleTime: publicProcedure.input(z.object({
        eventToken: z.string(),
        type: z.enum(['lastCycleTime', 'prestart', 'start', 'end', 'refsDone', 'scoresPosted']),
        lastCycleTime: z.string().optional(),
        matchNumber: z.number(),
        playNumber: z.number(),
        level: z.enum(['None', 'Practice', 'Qualification', 'Playoff'])
    })).mutation(async ({ input }) => {
        const event = await getEvent(input.eventToken);

        let cycle: any = await db.query.cycleLogs.findFirst({ where: and(eq(cycleLogs.event, event.code), eq(cycleLogs.match_number, input.matchNumber), eq(cycleLogs.play_number, input.playNumber), eq(cycleLogs.level, input.level)) });

        if (!cycle) {
            cycle = await db.insert(cycleLogs).values({
                id: randomUUID(),
                event: event.code,
                match_number: input.matchNumber,
                play_number: input.playNumber,
                level: input.level
            }).returning();
        }

        if (input.type === 'lastCycleTime' && input.lastCycleTime) {
            event.monitorFrame.lastCycleTime = input.lastCycleTime;
            void db.update(cycleLogs).set({ calculated_cycle_time: input.lastCycleTime }).where(eq(cycleLogs.id, cycle.id)).execute();
        } else {
            switch (input.type) {
                case 'prestart':
                    event.lastPrestartDone = new Date();
                    void db.update(cycleLogs).set({ prestart_time: event.lastPrestartDone }).where(eq(cycleLogs.id, cycle.id)).execute();
                    break;
                case 'start':
                    event.lastMatchStart = new Date();
                    void db.update(cycleLogs).set({ start_time: event.lastMatchStart }).where(eq(cycleLogs.id, cycle.id)).execute();
                    break;
                case 'end':
                    event.lastMatchEnd = new Date();
                    void db.update(cycleLogs).set({ end_time: event.lastMatchEnd }).where(eq(cycleLogs.id, cycle.id)).execute();
                    break;
                case 'refsDone':
                    event.lastMatchRefDone = new Date();
                    void db.update(cycleLogs).set({ ref_done_time: event.lastMatchRefDone }).where(eq(cycleLogs.id, cycle.id)).execute();
                    break;
                case 'scoresPosted':
                    event.lastMatchScoresPosted = new Date();
                    void db.update(cycleLogs).set({ scores_posted_time: event.lastMatchScoresPosted }).where(eq(cycleLogs.id, cycle.id)).execute();
                    break;
            };
        }

        event.cycleEmitter.emit('update');
    }),

    subscription: publicProcedure.input(z.object({
        eventToken: z.string()
    })).subscription(async ({ input }) => {
        const event = await getEvent(input.eventToken);

        return observable<CycleData>((emitter) => {
            const listener = async () => {
                emitter.next({
                    eventCode: event.code,
                    startTime: event.lastMatchStart,
                    refEndTime: event.lastMatchRefDone,
                    scoresPostedTime: event.lastMatchScoresPosted,
                    prestartTime: event.lastPrestartDone,
                    endTime: event.lastMatchEnd,
                    matchNumber: event.monitorFrame.match,
                    lastCycleTime: event.monitorFrame.lastCycleTime,
                    averageCycleTime: await getAverageCycleTime(event.code)
                });
            };

            event.cycleEmitter.on('update', listener);

            return () => {
                event.cycleEmitter.off('update', listener);
            };
        });
    }),

    getCycle: publicProcedure
        .input(z.object({
            eventCode: z.string(),
            matchNumber: z.number(),
            playNumber: z.number(),
            level: z.enum(['None', 'Practice', 'Qualification', 'Playoff'])
        })).query(async ({ input }) => {
            const cycle = await db.query.cycleLogs.findFirst({ where: and(eq(cycleLogs.event, input.eventCode), eq(cycleLogs.match_number, input.matchNumber), eq(cycleLogs.play_number, input.playNumber), eq(cycleLogs.level, input.level)) });

            return cycle;
        }),

    getEventCycles: publicProcedure
        .input(z.object({
            eventCode: z.string()
        })).query(async ({ input }) => {
            const cycles = await db.query.cycleLogs.findMany({ where: eq(cycleLogs.event, input.eventCode) });

            return cycles;
        }),

    getTeamAverageCycle: publicProcedure
        .input(z.object({
            eventCode: z.string().optional(),
            teamNumber: z.number()
        })).query(async ({ input }) => {
            return getTeamAverageCycle(input.teamNumber, input.eventCode);
        }),

    getLastPrestart: eventProcedure.query(async ({ ctx }) => {
        const event = await getEvent(ctx.eventToken ?? '');
        if (event.lastPrestartDone) {
            return event.lastPrestartDone;
        } else {
            const lastPrestartFromDB = await db.select().from(cycleLogs).where(and(
                eq(cycleLogs.event, event.code),
                isNotNull(cycleLogs.prestart_time)
            )).orderBy(desc(cycleLogs.prestart_time))
                .limit(1).execute();
            if (lastPrestartFromDB.length === 0) {
                return null;
            }
            return lastPrestartFromDB[0].prestart_time;
        }
    }),

    getLastCycleTime: eventProcedure.query(async ({ ctx }) => {
        const event = await getEvent(ctx.eventToken ?? '');
        if (event.monitorFrame.lastCycleTime == "unk") {
            const lastRecordedCycleTime = await db.select().from(cycleLogs)
                .where(and(
                    eq(cycleLogs.event, event.code),
                    isNotNull(cycleLogs.calculated_cycle_time)
                )).orderBy(desc(cycleLogs.start_time))
                .limit(1).execute();

            if (lastRecordedCycleTime.length === 0) {
                return null;
            }
            return lastRecordedCycleTime[0].calculated_cycle_time;
        };
        return event.monitorFrame.lastCycleTime;
    }),

    getBestCycleTime: eventProcedure.query(async ({ ctx }) => {
        const bestCycle = await db.select().from(cycleLogs)
            .where(eq(cycleLogs.event, ctx.event.code))
            .orderBy(asc(cycleLogs.calculated_cycle_time))
            .limit(1).execute();

        if (bestCycle.length === 0) {
            return null;
        }

        return bestCycle[0];
    }),

    getAverageCycleTime: eventProcedure.query(async ({ ctx }) => {
        return await getAverageCycleTime(ctx.event.code);
    })
});

async function getAverageCycleTime(eventCode: string) {
    const cycles = await db.query.cycleLogs.findMany({ where: eq(cycleLogs.event, eventCode) });

    if (cycles.length === 0) {
        return null;
    }

    const total = cycles.reduce((acc, cycle) => {
        if (!cycle.calculated_cycle_time) {
            return acc;
        }

        return acc + cycleTimeToMS(cycle.calculated_cycle_time);
    }, 0);

    return total / cycles.length;
}
