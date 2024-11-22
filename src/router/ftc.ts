import { observable } from "@trpc/server/observable";
import { publicProcedure, router } from "../trpc";
import { API } from "@the-orange-alliance/api";
import { z } from "zod";
import Match from "@the-orange-alliance/api/lib/esm/models/Match";

const eventData: { [key: string]: FTCEvent; } = {};
const toa = new API(process.env.TOA_KEY ?? "", "FTA Buddy");

export interface FTCEvent {
    key: string;
    code: string;
    name: string;
    startDate: Date;
    endDate: Date;
    matches: FTCMatch[];
    currentLevel: "QUALIFICATION" | "PLAYOFF";
    currentMatch: FTCMatch | null;
    averageCycleTime: number;
    totalMatches: number;
    completedMatches: number;
    schedule: Match[];
    aheadBehind: number | null;
}

export interface FTCMatch extends FTCAPIMatch {
    completed: boolean;
    cycleTime: number | null;
    scheduledStartTime: Date | null;
}

export interface FTCAPIMatch {
    actualStartTime: Date;
    description: string;
    tournamentLevel: "QUALIFICATION" | "PLAYOFF";
    series: number;
    matchNumber: number;
    scoreRedFinal: number;
    scoreRedFoul: number;
    scoreRedAuto: number;
    scoreBlueFinal: number;
    scoreBlueFoul: number;
    scoreBlueAuto: number;
    postResultTime: Date;
    teams: FTCAPITeam[];
    modifiedOn: Date;
}

export interface FTCAPITeam {
    teamNumber: number;
    station: "Blue1" | "Blue2" | "Red1" | "Red2";
    dq: boolean;
    onField: boolean;
}

export const ftcRouter = router({
    dashboard: publicProcedure.input(z.object({
        region: z.string(),
        events: z.array(z.string()),
    })).subscription(async ({ input }) => {
        let promises = [];

        for (const key of input.events) {
            if (!eventData[key]) {
                console.log("Creating event tracker for ", key);
                const event = await toa.getEvent(key);
                const schedule = await toa.getEventMatches(key);

                eventData[key] = {
                    key: event.eventKey,
                    code: event.firstEventCode,
                    name: event.eventName,
                    startDate: new Date(event.startDate),
                    endDate: new Date(event.endDate),
                    matches: [],
                    currentLevel: "QUALIFICATION",
                    currentMatch: null,
                    averageCycleTime: 0,
                    totalMatches: 0,
                    completedMatches: 0,
                    schedule,
                    aheadBehind: null
                };
                setInterval(() => updateEventStatus(eventData[key]), 30000);
            }
            promises.push(updateEventStatus(eventData[key]));
        }

        await Promise.all(promises);

        return observable<FTCEvent[]>((emitter) => {
            function sendEvents() {
                emitter.next(input.events.map((key) => eventData[key]));
            }

            sendEvents();
            const interval = setInterval(sendEvents, 30000);

            return () => {
                console.log("Unsubscribing");
                clearInterval(interval);
            };
        });
    }),

    getRegions: publicProcedure.query(async () => {
        return (await toa.getRegions()).map((region) => ({
            value: region.regionKey,
            name: region.description
        }));
    }),

    getEventsThisWeek: publicProcedure.input(z.object({
        region: z.string(),
    })).query(async ({ input }) => {
        return await getEventsThisWeek(input.region);
    })
});

async function getEventsThisWeek(region: string) {
    const now = new Date();

    // Get the current day of the week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
    const currentDay = now.getDay();

    // Calculate the most recent Monday
    const monday = new Date(now);
    monday.setDate(now.getDate() - (currentDay === 0 ? 6 : currentDay - 1)); // If Sunday, go back 6 days; otherwise, go back to Monday

    // Calculate the following Saturday
    const saturday = new Date(monday);
    saturday.setDate(monday.getDate() + 5);

    let events = await toa.getEvents({
        region_key: region,
        start_date: monday.toISOString(),
        end_date: saturday.toISOString(),
        includeMatchCount: true,
        between: true,
    });

    return events
        .filter((event) => {
            return new Date(event.startDate) >= monday && new Date(event.endDate) <= saturday;
        })
        .sort((a, b) => {
            return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
        })
        .map((event) => ({
            key: event.eventKey,
            code: event.firstEventCode,
            name: event.eventName,
            startDate: new Date(event.startDate),
            endDate: new Date(event.endDate)
        }));
}

async function updateEventStatus(event: FTCEvent) {
    console.log("Updating event status for ", event.code);
    const matches = await FTCAPIgetMatches(event.code);

    const newMatches: FTCMatch[] = [];

    let lastCompletedMatch = -1;
    let lastCompletedMatchLevel: "QUALIFICATION" | "PLAYOFF" = "QUALIFICATION";

    for (const [i, match] of matches.entries()) {
        let cycleTime = null;

        if (match.actualStartTime && matches[i - 1] && matches[i - 1].actualStartTime) {
            cycleTime = new Date(match.actualStartTime).getTime() - new Date(matches[i - 1].actualStartTime).getTime();
        }

        if (match.postResultTime !== null) {
            lastCompletedMatch = i;
            lastCompletedMatchLevel = match.tournamentLevel;
        }

        const scheduledMatch = event.schedule.find((scheduledMatch) => scheduledMatch.matchKey === getTOAMatchKey(event.key, match.matchNumber, match.tournamentLevel));

        const ftcMatch: FTCMatch = {
            ...match,
            completed: match.postResultTime !== null,
            cycleTime,
            actualStartTime: new Date(match.actualStartTime),
            postResultTime: new Date(match.postResultTime),
            scheduledStartTime: scheduledMatch?.scheduledTime ? new Date(scheduledMatch.scheduledTime) : null,
        };

        newMatches.push(ftcMatch);
    }

    event.matches = newMatches;
    event.currentMatch = newMatches[lastCompletedMatch];
    event.currentLevel = lastCompletedMatchLevel;
    event.totalMatches = newMatches.length;
    event.completedMatches = newMatches.filter((match) => match.completed).length;
    event.averageCycleTime = getAverageCycleTime(newMatches.map(match => match.cycleTime).filter(time => time !== null));
    event.aheadBehind = event.currentMatch?.scheduledStartTime ? new Date().getTime() - event.currentMatch.scheduledStartTime.getTime() : null;
}

function getTOAMatchKey(eventKey: string, matchNumber: number, level: "QUALIFICATION" | "PLAYOFF") {
    return `${eventKey}-${level === "QUALIFICATION" ? "Q" : "E"}${matchNumber.toString().padStart(3, "0")}-1`;
}

async function FTCAPIgetMatches(eventKey: string) {
    const response = await fetch(`https://ftc-api.firstinspires.org/v2.0/2024/matches/${eventKey}?start=0&end=999`, {
        headers: {
            "Accept": "application/json",
            "Authorization": `Basic ${btoa(process.env.FTC_KEY ?? "")}`
        }
    });

    return (await response.json()).matches as FTCAPIMatch[];
}

function getAverageCycleTime(cycleTimes: number[], rollingAverage: number = 6) {
    if (cycleTimes.length < 3) {
        return 7 * 60 * 1000;
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
        return 7 * 60 * 1000;
    }

    // Calculate the average of the filtered cycle times
    const total = filteredTimes.reduce((acc, time) => (acc ?? 0) + (time ?? 0), 0);

    return (total ?? 0) / filteredTimes.length;
}
