import { compress, compressSync, decompressSync, zlib } from "fflate";
import { DisconnectionEvent, FMSLogFrame, MatchLog, ROBOT } from "../../shared/types";
import { db } from "../db/db";
import { analyzedLogs, matchLogs } from "../db/schema";
import { asc, eq, and, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";

export function analyzeLog(log: FMSLogFrame[]): DisconnectionEvent[] {
    const events: DisconnectionEvent[] = [];

    // Disconnection tracking variables
    let codeDisconnectStart: number | null = null;
    let rioDisconnectStart: number | null = null;
    let radioDisconnectStart: number | null = null;
    let dsDisconnectStart: number | null = null;

    // New tracking variables for additional conditions
    let brownoutStart: number | null = null;
    let highTripTimeStart: number | null = null;
    let sustainedHighTripTimeStart: number | null = null;
    let lowSignalStart: number | null = null;
    let highDataRateStart: number | null = null;

    // Arrays for rolling averages
    const tripTimeWindow: number[] = [];
    const signalWindow: number[] = [];
    const dataRateWindow: number[] = [];

    log.forEach((frame, index) => {
        const currentTime = frame.matchTime;

        // Rolling average logic
        if (tripTimeWindow.length === 3) tripTimeWindow.shift();  // Keep only the last 3 frames
        tripTimeWindow.push(frame.averageTripTime);
        const tripTimeAvg = tripTimeWindow.reduce((a, b) => a + b, 0) / tripTimeWindow.length;

        if (signalWindow.length === 3) signalWindow.shift();  // Keep only the last 3 frames
        if (frame.signal !== null) signalWindow.push(frame.signal);
        const signalAvg = signalWindow.length ? signalWindow.reduce((a, b) => a + b, 0) / signalWindow.length : null;

        if (dataRateWindow.length === 3) dataRateWindow.shift();  // Keep only the last 3 frames
        dataRateWindow.push(frame.dataRateTotal);
        const dataRateAvg = dataRateWindow.reduce((a, b) => a + b, 0) / dataRateWindow.length;

        // Check for code disconnection
        if (!frame.linkActive && frame.rioLink && frame.radioLink && frame.dsLinkActive && codeDisconnectStart === null) {
            codeDisconnectStart = currentTime;
        } else if (frame.linkActive && codeDisconnectStart !== null) {
            events.push({
                issue: "Code disconnect",
                startTime: codeDisconnectStart,
                endTime: currentTime,
                duration: codeDisconnectStart - currentTime,  // Reversed
            });
            codeDisconnectStart = null;
        }

        // Check for rio disconnection (dependent on radio)
        if (!frame.rioLink && frame.radioLink && frame.dsLinkActive && rioDisconnectStart === null) {
            rioDisconnectStart = currentTime;
        } else if (frame.rioLink && rioDisconnectStart !== null) {
            events.push({
                issue: "RIO disconnect",
                startTime: rioDisconnectStart,
                endTime: currentTime,
                duration: rioDisconnectStart - currentTime,  // Reversed
            });
            rioDisconnectStart = null;
        }

        // Check for radio disconnection
        if (!frame.radioLink && frame.dsLinkActive && radioDisconnectStart === null) {
            radioDisconnectStart = currentTime;
        } else if (frame.radioLink && radioDisconnectStart !== null) {
            events.push({
                issue: "Radio disconnect",
                startTime: radioDisconnectStart,
                endTime: currentTime,
                duration: radioDisconnectStart - currentTime,  // Reversed
            });
            radioDisconnectStart = null;
        }

        // Check for driver station disconnection
        if (!frame.dsLinkActive && dsDisconnectStart === null) {
            dsDisconnectStart = currentTime;
        } else if (frame.dsLinkActive && dsDisconnectStart !== null) {
            events.push({
                issue: "DS disconnect",
                startTime: dsDisconnectStart,
                endTime: currentTime,
                duration: dsDisconnectStart - currentTime,  // Reversed
            });
            dsDisconnectStart = null;
        }

        // Battery Voltage - Brownout condition, ignore if RIO or radio is disconnected
        if (frame.battery < 7 && brownoutStart === null && frame.linkActive && frame.rioLink && frame.radioLink && frame.dsLinkActive) {
            brownoutStart = currentTime;
        } else if (frame.battery >= 7 && brownoutStart !== null) {
            events.push({
                issue: "Brownout",
                startTime: brownoutStart,
                endTime: currentTime,
                duration: brownoutStart - currentTime,  // Reversed
            });
            brownoutStart = null;
        }

        // Large spikes in trip time (>100ms) and measure how long it lasts
        if (frame.averageTripTime > 100 && highTripTimeStart === null) {
            highTripTimeStart = currentTime;
        } else if (frame.averageTripTime <= 100 && highTripTimeStart !== null) {
            events.push({
                issue: "Large spike in ping",
                startTime: highTripTimeStart,
                endTime: currentTime,
                duration: highTripTimeStart - currentTime,  // Reversed
            });
            highTripTimeStart = null;
        }

        // Sustained high trip time (>10ms for more than 30 seconds using 3-frame rolling average)
        if (tripTimeAvg > 10 && sustainedHighTripTimeStart === null) {
            sustainedHighTripTimeStart = currentTime;
        } else if (tripTimeAvg <= 10 && sustainedHighTripTimeStart !== null) {
            events.push({
                issue: "Sustained high ping",
                startTime: sustainedHighTripTimeStart,
                endTime: currentTime,
                duration: sustainedHighTripTimeStart - currentTime,  // Reversed
            });
            sustainedHighTripTimeStart = null;
        }

        // Low signal (< -70 dBm for more than 30 seconds using 3-frame rolling average)
        if (signalAvg !== null && signalAvg < -70 && lowSignalStart === null) {
            lowSignalStart = currentTime;
        } else if (signalAvg !== null && signalAvg >= -70 && lowSignalStart !== null) {
            events.push({
                issue: "Low signal",
                startTime: lowSignalStart,
                endTime: currentTime,
                duration: lowSignalStart - currentTime,  // Reversed
            });
            lowSignalStart = null;
        }

        // High data rate (> 4 Mbps for more than 30 seconds using 3-frame rolling average)
        if (dataRateAvg > 4 && highDataRateStart === null) {
            highDataRateStart = currentTime;
        } else if (dataRateAvg <= 4 && highDataRateStart !== null) {
            events.push({
                issue: "High BWU",
                startTime: highDataRateStart,
                endTime: currentTime,
                duration: highDataRateStart - currentTime,  // Reversed
            });
            highDataRateStart = null;
        }
    });

    // Merging consecutive events of the same issue within 3 seconds
    for (let i = 0; i < events.length - 1; i++) {
        const currentEvent = events[i];
        const nextEvent = events[i + 1];

        // Check if the two events are of the same type and less than 5 seconds apart
        if (
            currentEvent.issue === nextEvent.issue &&
            currentEvent.endTime - nextEvent.startTime <= 5
        ) {
            // Merge the events by updating the endTime and duration of the current event
            currentEvent.endTime = nextEvent.endTime;
            currentEvent.duration = currentEvent.startTime - currentEvent.endTime;

            // Remove the next event from the list
            events.splice(i + 1, 1);

            // Adjust the index to recheck the new next event
            i--;
        }
    }

    // Remove brownout events that start 1 second or less before a RIO disconnect
    for (let i = 0; i < events.length - 1; i++) {
        const currentEvent = events[i];
        const nextEvent = events[i + 1];

        // Check if current event is a "RIO disconnect" and next event is a "Brownout"
        if (
            currentEvent.issue === "RIO disconnect" &&
            nextEvent.issue === "Brownout" &&
            currentEvent.startTime - nextEvent.startTime <= 1
        ) {
            // Remove the brownout event
            events.splice(i + 1, 1);

            // Adjust the index to avoid skipping events
            i--;
        }
    }

    // Filter out events that last 1 second or less
    return events.filter(event => {
        if (event.issue === "High BWU") return event.duration > 30;
        if (event.issue === "Low signal") return event.duration > 30;
        if (event.issue === "Sustained high ping") return event.duration > 30;
        if (event.issue === "Brownout") return event.duration > 5;
        return event.duration > 1;
    });
}

export async function logAnalysisLoop(limit: number) {
    if (!db) return;

    const logsToAnalyze = await db.select().from(matchLogs)
        .where(eq(matchLogs.analyzed, false))
        .orderBy(asc(matchLogs.start_time))
        .limit(limit)
        .execute();

    if (logsToAnalyze.length === 0) return;
    console.log(`Analyzing ${logsToAnalyze.length} logs`);

    for (const log of logsToAnalyze) {
        for (const station in ROBOT) {
            //@ts-ignore
            const teamNumber: number = log[station];
            //@ts-ignore
            const logData = decompressStationLog(log[`${station}_log`]);

            // Skip bypassed teams in test match
            if (log.level === "None" && logData.length < 1) continue;

            const analyzedLog = analyzeLog(logData);
            await db.insert(analyzedLogs).values({
                id: randomUUID(),
                match_id: log.id,
                event: log.event,
                match_number: log.match_number,
                play_number: log.play_number,
                level: log.level,
                team: teamNumber,
                alliance: station.startsWith("blue") ? "blue" : "red",
                events: analyzedLog,
                bypassed: logData.length < 1
            }).execute();
        }
        await db.update(matchLogs).set({ analyzed: true }).where(eq(matchLogs.id, log.id)).execute();
    }
}

export function compressStationLog(log: FMSLogFrame[]) {
    const enc = new TextEncoder();
    const buf = enc.encode(JSON.stringify(log));

    // The default compression method is gzip
    // Increasing mem may increase performance at the cost of memory
    // The mem ranges from 0 to 12, where 4 is the default
    const compressed = Buffer.from(compressSync(buf, { level: 6, mem: 6 }));
    return compressed.toString('base64');
}

export function decompressStationLog(compressed: string) {
    const dec = new TextDecoder();
    const buf = Uint8Array.from(Buffer.from(compressed, 'base64'));
    const decompressed = decompressSync(buf);
    return JSON.parse(dec.decode(decompressed)) as FMSLogFrame[];
}

// This was used to migrate to compressed logs
// export async function compressLogs(limit: number) {
//     const logsToCompress = await db.select().from(matchLogs)
//         .where(and(eq(matchLogs.blue1_log_compressed, ""), eq(matchLogs.blue2_log_compressed, ""), eq(matchLogs.blue3_log_compressed, ""), eq(matchLogs.red1_log_compressed, ""), eq(matchLogs.red2_log_compressed, ""), eq(matchLogs.red3_log_compressed, "")))
//         .orderBy(asc(matchLogs.start_time))
//         .limit(limit);

//     if (logsToCompress.length === 0) return;

//     for (const log of logsToCompress) {
//         let originalSize = 0;
//         let compressedSize = 0;

//         for (const station in ROBOT) {
//             const enc = new TextEncoder();

//             // @ts-ignore
//             const buf = enc.encode(JSON.stringify(log[`${station}_log`]));
//             originalSize += buf.byteLength;

//             // The default compression method is gzip
//             // Increasing mem may increase performance at the cost of memory
//             // The mem ranges from 0 to 12, where 4 is the default
//             const compressed = Buffer.from(compressSync(buf, { level: 6, mem: 6 }));
//             compressedSize += compressed.byteLength;

//             log[`${station}_log_compressed`] = compressed.toString('base64');
//         }

//         await db.update(matchLogs).set({
//             blue1_log_compressed: log.blue1_log_compressed,
//             blue2_log_compressed: log.blue2_log_compressed,
//             blue3_log_compressed: log.blue3_log_compressed,
//             red1_log_compressed: log.red1_log_compressed,
//             red2_log_compressed: log.red2_log_compressed,
//             red3_log_compressed: log.red3_log_compressed,
//         }).where(eq(matchLogs.id, log.id)).execute();

//         console.log(`${log.event} ${log.match_number} compressed ${Math.round(originalSize / 102.4) / 10} -> ${Math.round(compressedSize / 102.4) / 10} KB`);
//     }
// }
