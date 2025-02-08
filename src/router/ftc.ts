import { observable } from "@trpc/server/observable";
import { publicProcedure, router } from "../trpc";
import { API } from "@the-orange-alliance/api";
import { z } from "zod";
import Match from "@the-orange-alliance/api/lib/esm/models/Match";
import StreamType from "@the-orange-alliance/api/lib/esm/models/types/StreamType";
import { google } from "googleapis";
import { authenticate } from "@google-cloud/local-auth";
import { join } from "path";
import { writeFileSync } from "fs";

process.env.TZ = "UTC";

const eventData: { [key: string]: FTCEvent; } = {};
const toa = process.env.TOA_APP_NAME ? new API("", process.env.TOA_APP_NAME) : new API(process.env.TOA_KEY ?? "", "FTA Buddy");

// writeFileSync(join(__dirname, '../oauth2.keys.json'), JSON.stringify({
//     installed: {
//         type: "service_account",
//         project_id: process.env.GOOGLE_PROJECT_ID,
//         private_key_id: process.env.GOOGLE_KEY_ID,
//         private_key: process.env.GOOGLE_KEY,
//         client_email: process.env.GOOGLE_CLIENT_ID,
//         client_id: process.env.GOOGLE_KEY_CLIENT,
//         "auth_uri": "https://accounts.google.com/o/oauth2/auth",
//         "token_uri": "https://oauth2.googleapis.com/token",
//         "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
//         "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/" + encodeURIComponent(process.env.GOOGLE_CLIENT_ID ?? ""),
//         "universe_domain": "googleapis.com"
//     }
// }));

// const auth = authenticate({
//     keyfilePath: join(__dirname, '../oauth2.keys.json'),
//     scopes: ['https://www.googleapis.com/auth/youtube'],
// });
// const yt = google.youtube('v3');

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
    streams: Streams[];
    timezone: string;
    teamCount: number;
    // matchCount: number;
}

export interface Streams {
    live: boolean;
    streamKey: string;
    eventKey: string;
    streamType: StreamType;
    isActive: boolean;
    streamURL: string;
    channelName: string;
    streamName: string;
    startDateTime: string;
    endDateTime: string;
    channelURL: string;
    fullURL: string;
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
                for (const match of schedule) {
                    match.scheduledTime = match.scheduledTime?.substring(0, 22);
                }
                const teams = await toa.getEventTeams(key);

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
                    aheadBehind: null,
                    streams: [],
                    timezone: event.timeZone,
                    teamCount: teams.length,
                    // matchCount: event.matchCount
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
    }),

    getEventUpdates: publicProcedure.input(z.object({
        events: z.array(z.string()),
    })).query(async ({ input }) => {
        let promises = [];

        for (const key of input.events) {
            if (!eventData[key]) {
                console.log("Creating event tracker for ", key);
                const event = await toa.getEvent(key);
                const schedule = await toa.getEventMatches(key);
                for (const match of schedule) {
                    match.scheduledTime = match.scheduledTime?.substring(0, 22);
                }
                const teams = await toa.getEventTeams(key);

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
                    aheadBehind: null,
                    streams: [],
                    timezone: event.timeZone,
                    teamCount: teams.length,
                    // matchCount: event.matchCount
                };
                setInterval(() => updateEventStatus(eventData[key]), 30000);
                promises.push(updateEventStatus(eventData[key]));
            }
        }

        await Promise.all(promises);

        return input.events.map((key) => eventData[key]);
    }),
});

async function getEventsThisWeek(region: string) {
    const now = new Date();

    // Get the current day of the week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
    const currentDay = now.getDay();

    // Calculate the most recent Monday
    const monday = new Date(now);
    monday.setDate(now.getDate() - (currentDay === 0 ? 6 : currentDay - 1)); // If Sunday, go back 6 days; otherwise, go back to Monday

    // Calculate the following Sunday
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    let events = await toa.getEvents({
        region_key: region,
        start_date: monday.toISOString(),
        end_date: sunday.toISOString(),
        includeMatchCount: true,
        between: true,
    });

    return events
        .filter((event) => {
            return new Date(event.startDate) >= monday && new Date(event.endDate) <= sunday;
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

    for (const match of matches) {
        match.actualStartTime = new Date(match.actualStartTime);
        match.actualStartTime.setHours(match.actualStartTime.getHours() - getTimezoneOffset(event.timezone));
        match.postResultTime = new Date(match.postResultTime);
        match.postResultTime.setHours(match.postResultTime.getHours() - getTimezoneOffset(event.timezone));
    }

    // If the schedule is empty, try to get it again
    if (event.schedule.length === 0) {
        event.schedule = await toa.getEventMatches(event.key);
        for (const match of event.schedule) {
            match.scheduledTime = match.scheduledTime?.substring(0, 22);
        }
    }

    if (event.streams.length === 0) {
        event.streams = (await toa.getEventStreams(event.key)).map((stream) => ({
            live: false,
            streamKey: stream.streamKey,
            eventKey: stream.eventKey,
            streamType: stream.streamType,
            isActive: stream.isActive,
            streamURL: stream.streamURL,
            channelName: stream.channelName,
            streamName: stream.streamName,
            startDateTime: stream.startDateTime,
            endDateTime: stream.endDateTime,
            channelURL: stream.channelURL,
            fullURL: stream.fullURL
        }));
    }

    // try {
    //     google.options({ auth: await auth });

    //     for (const stream of event.streams) {
    //         if (stream.streamType === StreamType.YouTube) {
    //             const streamStatus = await yt.liveStreams.list({
    //                 part: ['snippet', 'status'],
    //                 id: [stream.streamURL.split("/").pop() ?? ""]
    //             });
    //             if (streamStatus.data.items && streamStatus.data.items.length > 0) {
    //                 console.log(streamStatus.data.items[0].status?.healthStatus?.status);
    //                 stream.live = streamStatus.data.items[0].status?.healthStatus?.status === "good";
    //             }
    //         }
    //     }
    // } catch (e) {
    //     console.error('Error checking stream status: ', e);
    // }

    // If there are no matches, set the event status to empty
    if (matches.length === 0) {
        event.matches = [];
        event.currentMatch = null;
        event.currentLevel = "QUALIFICATION";
        event.completedMatches = 0;
        event.totalMatches = 1;
        event.averageCycleTime = 0;
        event.aheadBehind = null;
        return;
    }

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
        const startTime = scheduledMatch?.scheduledTime ? new Date(scheduledMatch.scheduledTime) : null;

        const ftcMatch: FTCMatch = {
            ...match,
            completed: match.postResultTime !== null,
            cycleTime,
            actualStartTime: match.actualStartTime,
            postResultTime: match.postResultTime,
            scheduledStartTime: startTime
        };

        newMatches.push(ftcMatch);
    }

    let extraMatches = 0;

    if (event.teamCount < 11) {
        extraMatches = 2; // 3 matches at most
    } else if (event.teamCount < 21) {
        extraMatches = 6; // 7 matches at most
    } else if (event.teamCount < 41) {
        extraMatches = 10; // 11 matches at most
    } else {
        extraMatches = 14; // 15 match at most
    }

    event.matches = newMatches;
    event.currentMatch = newMatches[lastCompletedMatch];
    event.currentLevel = lastCompletedMatchLevel;
    event.totalMatches = Math.max(event.schedule.length + extraMatches, newMatches.length);
    event.completedMatches = newMatches.filter((match) => match.completed).length;
    event.averageCycleTime = getAverageCycleTime(newMatches.map(match => (match.cycleTime ?? 0)).filter(time => time !== null));
    event.aheadBehind = event.currentMatch?.scheduledStartTime ? event.currentMatch.actualStartTime.getTime() - event.currentMatch.scheduledStartTime.getTime() : null;
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

function getTimezoneOffset(timezone: string): number {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        timeZoneName: 'short',
    });

    const parts = formatter.formatToParts(now);
    const timeZoneName = parts.find(part => part.type === 'timeZoneName')?.value ?? "GMT-5";

    // Match and calculate offset from timezone abbreviation (e.g., GMT-5)
    const match = timeZoneName.match(/GMT([+-]\d+)/);
    return match ? parseInt(match[1], 10) : -5;
};