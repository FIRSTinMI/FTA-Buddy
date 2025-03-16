import { z } from "zod";
import { eventProcedure, publicProcedure, router } from "../trpc";
import { getEvent } from "../util/get-event";
import { observable } from "@trpc/server/observable";
import { CycleData } from "../../shared/types";
import { db } from "../db/db";
import { cycleLogs, events } from "../db/schema";
import { and, asc, eq, isNotNull, desc, exists } from "drizzle-orm";
import { randomUUID } from "crypto";
import { getTeamAverageCycle } from "../util/team-cycles";
import { cycleTimeToMS } from "../../shared/cycleTimeToMS";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { existsSync, mkdirSync } from "fs";
import { formatTimeShortNoAgoSeconds } from "../../shared/formatTime";
import { generateReport } from "../util/report-generator";

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
            await db.update(cycleLogs).set({ calculated_cycle_time: input.lastCycleTime }).where(eq(cycleLogs.id, cycle.id)).execute();
        } else {
            switch (input.type) {
                case 'prestart':
                    event.lastPrestartDone = new Date();
                    await db.update(cycleLogs).set({ prestart_time: event.lastPrestartDone }).where(eq(cycleLogs.id, cycle.id)).execute();
                    break;
                case 'start':
                    event.lastMatchStart = new Date();
                    await db.update(cycleLogs).set({ start_time: event.lastMatchStart }).where(eq(cycleLogs.id, cycle.id)).execute();
                    break;
                case 'end':
                    event.lastMatchEnd = new Date();
                    await db.update(cycleLogs).set({ end_time: event.lastMatchEnd }).where(eq(cycleLogs.id, cycle.id)).execute();
                    break;
                case 'refsDone':
                    event.lastMatchRefDone = new Date();
                    await db.update(cycleLogs).set({ ref_done_time: event.lastMatchRefDone }).where(eq(cycleLogs.id, cycle.id)).execute();
                    break;
                case 'scoresPosted':
                    event.lastMatchScoresPosted = new Date();
                    await db.update(cycleLogs).set({ scores_posted_time: event.lastMatchScoresPosted }).where(eq(cycleLogs.id, cycle.id)).execute();
                    break;
            };
        }

        event.cycleEmitter.emit('update');
    }),

    subscription: publicProcedure.input(z.object({
        eventToken: z.string().optional(),
        eventCode: z.string().optional()
    })).subscription(async ({ input }) => {
        let event;
        if (!input.eventToken && input.eventCode) {
            event = await getEvent('', input.eventCode);
        } else if (input.eventToken) {
            event = await getEvent(input.eventToken);
        } else {
            throw new Error('Must provide either eventToken or eventCode');
        }

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
                    averageCycleTime: await getAverageCycleTime(event.code),
                    level: event.monitorFrame.level,
                    aheadBehind: event.monitorFrame.time,
                    state: event.monitorFrame.field,
                    scheduleDetails: event.scheduleDetails,
                    exactAheadBehind: event.monitorFrame.exactAheadBehind || event.monitorFrame.time
                });
            };

            event.cycleEmitter.on('update', listener);
            event.fieldStatusEmitter.on('change', listener);

            return () => {
                event.cycleEmitter.off('update', listener);
                event.fieldStatusEmitter.off('change', listener);
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
    }),

    getCycleData: publicProcedure
        .input(z.object({
            eventCode: z.string()
        }))
        .query(async ({ input }) => {
            const event = await getEvent('', input.eventCode);

            const [bestCycle, lastRecordedCycleTime, lastPrestartFromDB] = await Promise.all([
                db.select().from(cycleLogs)
                    .where(eq(cycleLogs.event, event.code))
                    .orderBy(asc(cycleLogs.calculated_cycle_time))
                    .limit(1).execute(),

                db.select().from(cycleLogs)
                    .where(and(
                        eq(cycleLogs.event, event.code),
                        isNotNull(cycleLogs.calculated_cycle_time)
                    )).orderBy(desc(cycleLogs.start_time))
                    .limit(1).execute(),

                db.select().from(cycleLogs).where(and(
                    eq(cycleLogs.event, event.code),
                    isNotNull(cycleLogs.prestart_time)
                )).orderBy(desc(cycleLogs.prestart_time))
                    .limit(1).execute()
            ]);

            let bestCycleTime: string | null = bestCycle.length > 0 ? bestCycle[0].calculated_cycle_time : null;

            let lastCycleTime: string | null = event.monitorFrame.lastCycleTime;
            if (lastCycleTime == "unk" && lastRecordedCycleTime.length !== 0) {
                lastCycleTime = lastRecordedCycleTime[0].calculated_cycle_time;
            }

            let lastPrestartDone: Date | null = event.lastPrestartDone;
            if (!lastPrestartDone && lastPrestartFromDB.length !== 0) {
                lastPrestartDone = lastPrestartFromDB[0].prestart_time;
            }

            return {
                startTime: event.lastMatchStart,
                refEndTime: event.lastMatchRefDone,
                scoresPostedTime: event.lastMatchScoresPosted,
                prestartTime: lastPrestartDone,
                endTime: event.lastMatchEnd,
                matchNumber: event.monitorFrame.match,
                lastCycleTime,
                averageCycleTime: await getAverageCycleTime(event.code),
                bestCycleTime,
                scheduleDetails: event.scheduleDetails,
                match: event.monitorFrame.match,
                level: event.monitorFrame.level,
                aheadBehind: event.monitorFrame.time,
                exactAheadBehind: event.monitorFrame.exactAheadBehind,
                state: event.monitorFrame.field
            };
        }),

    postScheduleDetails: eventProcedure.input(z.object({
        eventToken: z.string(),
        days: z.array(z.object({
            start: z.number(),
            end: z.number(),
            endTime: z.date().nullable(),
            lunch: z.number().nullable(),
            lunchTime: z.date().nullable(),
            date: z.date(),
            cycleTimes: z.array(z.object({
                match: z.number(),
                minutes: z.number()
            }))
        })),
        lastPlayed: z.number(),
        matches: z.array(z.object({
            match: z.number(),
            level: z.enum(['None', 'Practice', 'Qualification', 'Playoff']),
            scheduledStartTime: z.date()
        })).optional()
    })).mutation(async ({ input }) => {
        const event = await getEvent(input.eventToken);

        await db.update(events).set({ scheduleDetails: { days: input.days, lastPlayed: input.lastPlayed, matches: input.matches } }).where(eq(events.code, event.code)).execute();

        event.scheduleDetails = { days: input.days, lastPlayed: input.lastPlayed, matches: input.matches };

        event.cycleEmitter.emit('update');
    }),

    getScheduleDetails: eventProcedure.query(async ({ ctx }) => {
        const event = await getEvent(ctx.eventToken ?? '');

        return event.scheduleDetails;
    }),

    generateCycleTimeReport: eventProcedure.query(async ({ ctx }) => {
        const cycles = await db.select().from(cycleLogs).where(and(
            eq(cycleLogs.event, ctx.event.code),
            isNotNull(cycleLogs.start_time)
        ))
            .orderBy(asc(cycleLogs.start_time))
            .execute();

        const averageCycleTime = await getAverageCycleTime(ctx.event.code, -1);

        const path = await generateReport({
            title: `Cycle Time Report for ${ctx.event.code}`,
            description: `Average Cycle Time: ${formatTimeShortNoAgoSeconds(averageCycleTime)}`,
            headers: ['Match Number', 'Play Number', 'Level', 'Start Time', 'Cycle Time'],
            fileName: 'CycleTimeReport'
        }, cycles.map(cycle => [
            cycle.match_number,
            cycle.play_number,
            cycle.level,
            cycle.start_time?.toLocaleString() ?? "",
            cycle.calculated_cycle_time ?? ""
        ]), ctx.event.code);

        console.log(path);

        return { path };
    }),
});

async function getAverageCycleTime(eventCode: string, rollingAverage: number = 10) {
    const cycles = await db.query.cycleLogs.findMany({ where: eq(cycleLogs.event, eventCode), limit: rollingAverage < 0 ? 10000 : rollingAverage * 3, orderBy: desc(cycleLogs.start_time) });

    // Extract the cycle times in milliseconds
    const cycleTimes = cycles
        .filter(cycle => cycle.calculated_cycle_time !== null)
        .map(cycle => cycleTimeToMS(cycle.calculated_cycle_time ?? '0:00'));

    if (cycleTimes.length < 3) {
        return 8 * 60 * 1000;
    }

    // Sort the cycle times
    cycleTimes.sort((a, b) => (a ?? 0) - (b ?? 0));

    // Calculate Q1 (25th percentile) and Q3 (75th percentile)
    const q1 = cycleTimes[Math.floor((cycleTimes.length / 4))] ?? (5 * 60 * 1000);
    const q3 = cycleTimes[Math.floor((cycleTimes.length * 3) / 4)] ?? (12 * 60 * 1000);
    const iqr = q3 - q1;

    // Define the bounds for outliers
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;

    // Filter out the outliers
    let filteredTimes = cycleTimes.filter(time => (time ? (time >= lowerBound && time <= upperBound) : false));
    if (rollingAverage > 0) {
        filteredTimes = filteredTimes.slice(0, rollingAverage);
    }


    if (filteredTimes.length < 3) {
        return 8 * 60 * 1000;
    }

    // Calculate the average of the filtered cycle times
    const total = filteredTimes.reduce((acc, time) => (acc ?? 0) + (time ?? 0), 0);

    return (total ?? 0) / filteredTimes.length;
}
