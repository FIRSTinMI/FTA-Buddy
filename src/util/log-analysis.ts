import { DisconnectionEvent, FMSLogFrame, MatchLog, ROBOT } from "../../shared/types";
import { db } from "../db/db";
import { analyzedLogs, matchLogs } from "../db/schema";
import { asc, eq } from "drizzle-orm";

export function analyzeLog(log: FMSLogFrame[]): DisconnectionEvent[] {
    const events: DisconnectionEvent[] = [];

    // Disconnection tracking variables
    let radioDisconnectStart: number | null = null;
    let rioDisconnectStart: number | null = null;
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
        if (frame.battery < 7 && brownoutStart === null && frame.rioLink && frame.radioLink) {
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

        // Sustained high trip time (>20ms for more than 30 seconds using 3-frame rolling average)
        if (tripTimeAvg > 20 && sustainedHighTripTimeStart === null) {
            sustainedHighTripTimeStart = currentTime;
        } else if (tripTimeAvg <= 20 && sustainedHighTripTimeStart !== null) {
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

        // Check if the two events are of the same type and less than 3 seconds apart
        if (
            currentEvent.issue === nextEvent.issue &&
            currentEvent.endTime - nextEvent.startTime <= 3
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

export async function logAnalysisLoop() {
    const logsToAnalyze = await db.select().from(matchLogs)
        .where(eq(matchLogs.analyzed, false))
        .orderBy(asc(matchLogs.start_time))
        .limit(10)
        .execute();

    if (logsToAnalyze.length === 0) return;
    console.log(`Analyzing ${logsToAnalyze.length} logs`);

    for (const log of logsToAnalyze) {
        for (const station in ROBOT) {
            //@ts-ignore
            const teamNumber: number = log[station];
            //@ts-ignore
            const logData = log[`${station}_log`] as FMSLogFrame[];

            // Skip bypassed teams in test match
            if (log.level === "None" && logData.length < 1) continue;

            const analyzedLog = analyzeLog(logData);
            await db.insert(analyzedLogs).values({
                id: crypto.randomUUID(),
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
