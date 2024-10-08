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

    log.forEach((frame, index) => {
        const currentTime = frame.matchTime;

        // Rolling average logic
        if (tripTimeWindow.length === 3) tripTimeWindow.shift();  // Keep only the last 3 frames
        tripTimeWindow.push(frame.averageTripTime);
        const tripTimeAvg = tripTimeWindow.reduce((a, b) => a + b, 0) / tripTimeWindow.length;

        if (signalWindow.length === 3) signalWindow.shift();  // Keep only the last 3 frames
        if (frame.signal !== null) signalWindow.push(frame.signal);
        const signalAvg = signalWindow.length ? signalWindow.reduce((a, b) => a + b, 0) / signalWindow.length : null;

        // Check for radio disconnection
        if (!frame.radioLink && radioDisconnectStart === null) {
            radioDisconnectStart = currentTime;
        } else if (frame.radioLink && radioDisconnectStart !== null) {
            events.push({
                issue: "Radio disconnected",
                startTime: radioDisconnectStart,
                endTime: currentTime,
                duration: radioDisconnectStart - currentTime,  // Reversed
            });
            radioDisconnectStart = null;
        }

        // Check for rio disconnection (dependent on radio)
        if (!frame.rioLink && frame.radioLink && rioDisconnectStart === null) {
            rioDisconnectStart = currentTime;
        } else if (frame.rioLink && rioDisconnectStart !== null) {
            events.push({
                issue: "RIO disconnected",
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
                issue: "Driver Station disconnected",
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
                issue: "Battery brownout",
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
                issue: "Large spike in trip time",
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
                issue: "Sustained high trip time",
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
                issue: "Low signal strength",
                startTime: lowSignalStart,
                endTime: currentTime,
                duration: lowSignalStart - currentTime,  // Reversed
            });
            lowSignalStart = null;
        }

        // High data rate (>4 Mbps for more than 30 seconds)
        if (frame.dataRateTotal > 4 && highDataRateStart === null) {
            highDataRateStart = currentTime;
        } else if (frame.dataRateTotal <= 4 && highDataRateStart !== null) {
            events.push({
                issue: "High data rate usage",
                startTime: highDataRateStart,
                endTime: currentTime,
                duration: highDataRateStart - currentTime,  // Reversed
            });
            highDataRateStart = null;
        }
    });

    // Filter out events that last 1 second or less
    return events.filter(event => event.duration > 1);
}

export async function logAnalysisLoop() {
    const logsToAnalyze = await db.select().from(matchLogs)
        .where(eq(matchLogs.analyzed, false))
        .orderBy(asc(matchLogs.start_time))
        .limit(10)
        .execute();

    console.log(`Analyzing ${logsToAnalyze.length} logs`);

    for (const log of logsToAnalyze) {
        for (const station in ROBOT) {
            //@ts-ignore
            const teamNumber: number = log[station];
            //@ts-ignore
            const logData = log[`${station}_log`] as FMSLogFrame[];
            const analyzedLog = analyzeLog(logData);
            await db.insert(analyzedLogs).values({
                id: crypto.randomUUID(),
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
