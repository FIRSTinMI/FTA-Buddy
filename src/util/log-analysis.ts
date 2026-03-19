import { asc, eq } from "drizzle-orm";
import { compressSync, decompressSync } from "fflate";
import { randomUUID } from "node:crypto";
import type { AutoEventIssueType, DisconnectionEvent, EventAutoEventSettings, FMSLogFrame } from "../../shared/types";
import { ISSUE_SEVERITY } from "../../shared/issue-severity";
import { ROBOT } from "../../shared/types";
import { db } from "../db/db";
import { analyzedLogs, events as eventsTable, issueEnum, matchEvents, matchLogs } from "../db/schema";
import { events } from "../index";
import { tryAutoLinkNewMatchEvent } from "./auto-link-events";

/**
 * Global cache of autoEventSettings keyed by event code.
 * Populated from the database on the first logAnalysisLoop run and kept in sync
 * with any in-memory server events so that log analysis works for all events,
 * not just those currently loaded into memory.
 */
export const autoEventSettingsCache = new Map<string, EventAutoEventSettings>();
let autoEventSettingsCacheInitialized = false;

export function analyzeLog(log: FMSLogFrame[]): DisconnectionEvent[] {
	const events: DisconnectionEvent[] = [];

	// Disconnection tracking variables
	let codeDisconnectStart: number | null = null;
	let codeDisconnectStartIdx: number | null = null;
	let rioDisconnectStart: number | null = null;
	let rioDisconnectStartIdx: number | null = null;
	let radioDisconnectStart: number | null = null;
	let radioDisconnectStartIdx: number | null = null;
	let dsDisconnectStart: number | null = null;
	let dsDisconnectStartIdx: number | null = null;

	// New tracking variables for additional conditions
	let brownoutStart: number | null = null;
	let brownoutStartIdx: number | null = null;
	let highTripTimeStart: number | null = null;
	let highTripTimeStartIdx: number | null = null;
	let sustainedHighTripTimeStart: number | null = null;
	let sustainedHighTripTimeStartIdx: number | null = null;
	let lowSignalStart: number | null = null;
	let lowSignalStartIdx: number | null = null;
	let highDataRateStart: number | null = null;
	let highDataRateStartIdx: number | null = null;

	// Arrays for rolling averages
	const tripTimeWindow: number[] = [];
	const signalWindow: number[] = [];
	const dataRateWindow: number[] = [];

	log.forEach((frame, index) => {
		const currentTime = frame.matchTime;

		// Rolling average logic
		if (tripTimeWindow.length === 3) tripTimeWindow.shift(); // Keep only the last 3 frames
		tripTimeWindow.push(frame.averageTripTime);
		const tripTimeAvg = tripTimeWindow.reduce((a, b) => a + b, 0) / tripTimeWindow.length;

		if (signalWindow.length === 3) signalWindow.shift(); // Keep only the last 3 frames
		if (frame.signal !== null) signalWindow.push(frame.signal);
		const signalAvg = signalWindow.length ? signalWindow.reduce((a, b) => a + b, 0) / signalWindow.length : null;

		if (dataRateWindow.length === 3) dataRateWindow.shift(); // Keep only the last 3 frames
		dataRateWindow.push(frame.dataRateTotal);
		const dataRateAvg = dataRateWindow.reduce((a, b) => a + b, 0) / dataRateWindow.length;

		// Check for code disconnection
		if (
			!frame.linkActive &&
			frame.rioLink &&
			frame.radioLink &&
			frame.dsLinkActive &&
			codeDisconnectStart === null
		) {
			codeDisconnectStart = currentTime;
			codeDisconnectStartIdx = index;
		} else if (frame.linkActive && codeDisconnectStart !== null) {
			events.push({
				issue: "Code disconnect",
				startTime: codeDisconnectStart,
				endTime: currentTime,
				duration: codeDisconnectStart - currentTime, // Reversed
				startIndex: codeDisconnectStartIdx!,
				endIndex: index,
			});
			codeDisconnectStart = null;
			codeDisconnectStartIdx = null;
		}

		// Check for rio disconnection (dependent on radio)
		if (!frame.rioLink && frame.radioLink && frame.dsLinkActive && rioDisconnectStart === null) {
			rioDisconnectStart = currentTime;
			rioDisconnectStartIdx = index;
		} else if (frame.rioLink && rioDisconnectStart !== null) {
			events.push({
				issue: "RIO disconnect",
				startTime: rioDisconnectStart,
				endTime: currentTime,
				duration: rioDisconnectStart - currentTime, // Reversed
				startIndex: rioDisconnectStartIdx!,
				endIndex: index,
			});
			rioDisconnectStart = null;
			rioDisconnectStartIdx = null;
		}

		// Check for radio disconnection
		if (!frame.radioLink && frame.dsLinkActive && radioDisconnectStart === null) {
			radioDisconnectStart = currentTime;
			radioDisconnectStartIdx = index;
		} else if (frame.radioLink && radioDisconnectStart !== null) {
			events.push({
				issue: "Radio disconnect",
				startTime: radioDisconnectStart,
				endTime: currentTime,
				duration: radioDisconnectStart - currentTime, // Reversed
				startIndex: radioDisconnectStartIdx!,
				endIndex: index,
			});
			radioDisconnectStart = null;
			radioDisconnectStartIdx = null;
		}

		// Check for driver station disconnection
		if (!frame.dsLinkActive && dsDisconnectStart === null) {
			dsDisconnectStart = currentTime;
			dsDisconnectStartIdx = index;
		} else if (frame.dsLinkActive && dsDisconnectStart !== null) {
			events.push({
				issue: "DS disconnect",
				startTime: dsDisconnectStart,
				endTime: currentTime,
				duration: dsDisconnectStart - currentTime, // Reversed
				startIndex: dsDisconnectStartIdx!,
				endIndex: index,
			});
			dsDisconnectStart = null;
			dsDisconnectStartIdx = null;
		}

		// Battery Voltage - Brownout condition, ignore if RIO or radio is disconnected
		if (
			frame.battery < 7 &&
			brownoutStart === null &&
			frame.linkActive &&
			frame.rioLink &&
			frame.radioLink &&
			frame.dsLinkActive
		) {
			brownoutStart = currentTime;
			brownoutStartIdx = index;
		} else if (frame.battery >= 7 && brownoutStart !== null) {
			events.push({
				issue: "Brownout",
				startTime: brownoutStart,
				endTime: currentTime,
				duration: brownoutStart - currentTime, // Reversed
				startIndex: brownoutStartIdx!,
				endIndex: index,
			});
			brownoutStart = null;
			brownoutStartIdx = null;
		}

		// Large spikes in trip time (>100ms) and measure how long it lasts
		if (frame.averageTripTime > 100 && highTripTimeStart === null) {
			highTripTimeStart = currentTime;
			highTripTimeStartIdx = index;
		} else if (frame.averageTripTime <= 100 && highTripTimeStart !== null) {
			events.push({
				issue: "Large spike in ping",
				startTime: highTripTimeStart,
				endTime: currentTime,
				duration: highTripTimeStart - currentTime, // Reversed
				startIndex: highTripTimeStartIdx!,
				endIndex: index,
			});
			highTripTimeStart = null;
			highTripTimeStartIdx = null;
		}

		// Sustained high trip time (>10ms for more than 30 seconds using 3-frame rolling average)
		if (tripTimeAvg > 10 && sustainedHighTripTimeStart === null) {
			sustainedHighTripTimeStart = currentTime;
			sustainedHighTripTimeStartIdx = index;
		} else if (tripTimeAvg <= 10 && sustainedHighTripTimeStart !== null) {
			events.push({
				issue: "Sustained high ping",
				startTime: sustainedHighTripTimeStart,
				endTime: currentTime,
				duration: sustainedHighTripTimeStart - currentTime, // Reversed
				startIndex: sustainedHighTripTimeStartIdx!,
				endIndex: index,
			});
			sustainedHighTripTimeStart = null;
			sustainedHighTripTimeStartIdx = null;
		}

		// Low signal (< -70 dBm for more than 30 seconds using 3-frame rolling average)
		if (signalAvg !== null && signalAvg < -70 && lowSignalStart === null) {
			lowSignalStart = currentTime;
			lowSignalStartIdx = index;
		} else if (signalAvg !== null && signalAvg >= -70 && lowSignalStart !== null) {
			events.push({
				issue: "Low signal",
				startTime: lowSignalStart,
				endTime: currentTime,
				duration: lowSignalStart - currentTime, // Reversed
				startIndex: lowSignalStartIdx!,
				endIndex: index,
			});
			lowSignalStart = null;
			lowSignalStartIdx = null;
		}

		// High data rate (> 6.8 Mbps for more than 30 seconds using 3-frame rolling average)
		if (dataRateAvg > 6.8 && highDataRateStart === null) {
			highDataRateStart = currentTime;
			highDataRateStartIdx = index;
		} else if (dataRateAvg <= 6.8 && highDataRateStart !== null) {
			events.push({
				issue: "High BWU",
				startTime: highDataRateStart,
				endTime: currentTime,
				duration: highDataRateStart - currentTime, // Reversed
				startIndex: highDataRateStartIdx!,
				endIndex: index,
			});
			highDataRateStart = null;
			highDataRateStartIdx = null;
		}
	});

	// Merging consecutive events of the same issue within 3 seconds
	for (let i = 0; i < events.length - 1; i++) {
		const currentEvent = events[i];
		const nextEvent = events[i + 1];

		// Check if the two events are of the same type and less than 5 seconds apart
		if (currentEvent.issue === nextEvent.issue && currentEvent.endTime - nextEvent.startTime <= 5) {
			// Merge the events by updating the endTime and duration of the current event
			currentEvent.endTime = nextEvent.endTime;
			currentEvent.endIndex = nextEvent.endIndex;
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
	return events.filter((event) => {
		if (event.issue === "High BWU") return event.duration > 30;
		if (event.issue === "Low signal") return event.duration > 30;
		if (event.issue === "Sustained high ping") return event.duration > 30;
		if (event.issue === "Brownout") return event.duration > 5;
		return event.duration > 1;
	});
}

export async function logAnalysisLoop(limit: number) {
	if (!db) return;

	// On the first call, populate the cache from the database for every known event
	if (!autoEventSettingsCacheInitialized) {
		const allEvents = await db
			.select({ code: eventsTable.code, autoEventSettings: eventsTable.autoEventSettings })
			.from(eventsTable)
			.execute();
		for (const ev of allEvents) {
			autoEventSettingsCache.set(ev.code, (ev.autoEventSettings ?? {}) as EventAutoEventSettings);
		}
		autoEventSettingsCacheInitialized = true;
	}

	const logsToAnalyze = await db
		.select()
		.from(matchLogs)
		.where(eq(matchLogs.analyzed, false))
		.orderBy(asc(matchLogs.start_time))
		.limit(limit)
		.execute();

	if (logsToAnalyze.length === 0) return;
	console.log(`Analyzing ${logsToAnalyze.length} logs`);

	for (const log of logsToAnalyze) {
		try {
			if (!log.event) {
				console.warn(
					`Skipping log ${log.id}: empty event code (likely a manual import with no event set). Marking as analyzed to prevent crash loop.`,
				);
				await db.update(matchLogs).set({ analyzed: true }).where(eq(matchLogs.id, log.id)).execute();
				continue;
			}

			for (const station in ROBOT) {
				//@ts-ignore
				const teamNumber: number = log[station];

				// Skip stations with no team (e.g. empty stations in test matches)
				if (!teamNumber) continue;

				//@ts-ignore
				const logData = decompressStationLog(log[`${station}_log`]);

				// Skip bypassed teams in test match
				if (log.level === "None" && logData.length < 1) continue;

				// Skip bypassed teams in practice match
				if (log.level === "Practice" && logData.length < 1) continue;

				const isBypassed = logData.length < 1;
				const analyzedLog = analyzeLog(logData);
				const alliance = station.startsWith("blue") ? "blue" : "red";
				const serverEvent = events[log.event];
				const settings = autoEventSettingsCache.get(log.event) ?? {};

				if (isBypassed) {
					// Insert a single "Bypassed" row
					await db
						.insert(analyzedLogs)
						.values({
							id: randomUUID(),
							match_id: log.id,
							event: log.event,
							match_number: log.match_number,
							play_number: log.play_number,
							level: log.level,
							team: teamNumber,
							alliance,
							issue: "Bypassed",
						})
						.execute();

					const bypassEnabled = settings.Bypassed !== false;
					if (bypassEnabled) {
						const matchEventId = randomUUID();
						const [inserted] = await db
							.insert(matchEvents)
							.values({
								id: matchEventId,
								match_id: log.id,
								event_code: log.event,
								team: teamNumber,
								alliance,
								issue: "Bypassed",
								match_number: log.match_number,
								play_number: log.play_number,
								level: log.level,
								status: "active",
							})
							.returning()
							.execute();

						if (serverEvent) {
							const wasAutoLinked = await tryAutoLinkNewMatchEvent(inserted, log.event, serverEvent);
							if (!wasAutoLinked) {
								serverEvent.matchEventEmitter.emit("create", {
									kind: "match_event_create",
									matchEvent: inserted,
								});
							}
						}
					}
				} else if (analyzedLog.length > 0) {
					// Insert one row per event into analyzed_logs
					await db
						.insert(analyzedLogs)
						.values(
							analyzedLog.map((evt) => ({
								id: randomUUID(),
								match_id: log.id,
								event: log.event,
								match_number: log.match_number,
								play_number: log.play_number,
								level: log.level,
								team: teamNumber,
								alliance,
								issue: evt.issue as (typeof issueEnum.enumValues)[number],
								start_time: evt.startTime,
								end_time: evt.endTime,
								duration: evt.duration,
								start_index: evt.startIndex,
								end_index: evt.endIndex,
							})),
						)
						.execute();

					// Collect all enabled issues, grouped by issue type, then combine into one match event
					const groupedByIssue = new Map<string, DisconnectionEvent[]>();
					for (const evt of analyzedLog) {
						const issueType = evt.issue as AutoEventIssueType;
						const isEnabled = settings[issueType] !== false;
						if (isEnabled) {
							const group = groupedByIssue.get(evt.issue) ?? [];
							group.push(evt);
							groupedByIssue.set(evt.issue, group);
						}
					}

					// Build per-issue detail entries for the combined event
					const issueDetails: {
						issue: string;
						start_time: number | null;
						end_time: number | null;
						duration: number | null;
					}[] = [];
					for (const [issue, evts] of groupedByIssue) {
						const startTime = Math.max(...evts.map((e) => e.startTime));
						const endTime = Math.min(...evts.map((e) => e.endTime));
						const totalDuration = evts.reduce((sum, e) => sum + Math.abs(e.duration), 0);

						// Skip brownouts with less than 10 seconds total duration
						if (issue === "Brownout" && totalDuration < 10) continue;

						issueDetails.push({ issue, start_time: startTime, end_time: endTime, duration: totalDuration });
					}

					if (issueDetails.length > 0) {
						// Select primary issue deterministically by severity (DS > Radio > RIO > Code > others)
						const primaryIssue = issueDetails.reduce((best, d) =>
							(ISSUE_SEVERITY[d.issue] ?? 4) < (ISSUE_SEVERITY[best.issue] ?? 4) ? d : best,
						).issue;
						const overallStartTime = Math.max(...issueDetails.map((d) => d.start_time ?? 0));
						const overallEndTime = Math.min(...issueDetails.map((d) => d.end_time ?? 0));
						const overallDuration = issueDetails.reduce((sum, d) => sum + Math.abs(d.duration ?? 0), 0);

						const matchEventId = randomUUID();
						const [inserted] = await db
							.insert(matchEvents)
							.values({
								id: matchEventId,
								match_id: log.id,
								event_code: log.event,
								team: teamNumber,
								alliance,
								issue: primaryIssue as (typeof issueEnum.enumValues)[number],
								issues: issueDetails,
								match_number: log.match_number,
								play_number: log.play_number,
								level: log.level,
								start_time: overallStartTime,
								end_time: overallEndTime,
								duration: overallDuration,
								status: "active",
							})
							.returning()
							.execute();

						if (serverEvent) {
							const wasAutoLinked = await tryAutoLinkNewMatchEvent(inserted, log.event, serverEvent);
							if (!wasAutoLinked) {
								serverEvent.matchEventEmitter.emit("create", {
									kind: "match_event_create",
									matchEvent: inserted,
								});
							}
						}
					}
				}
				// If no events and not bypassed, skip - don't insert anything
			}
			await db.update(matchLogs).set({ analyzed: true }).where(eq(matchLogs.id, log.id)).execute();
		} catch (err) {
			console.error(`Error analyzing log ${log.id} (event: "${log.event}"): ${err}`);
			// Mark as analyzed so the server doesn't crash-loop retrying the same bad log
			try {
				await db.update(matchLogs).set({ analyzed: true }).where(eq(matchLogs.id, log.id)).execute();
			} catch (markErr) {
				console.error(`Failed to mark log ${log.id} as analyzed after error: ${markErr}`);
			}
		}
	}
}

export function compressStationLog(log: FMSLogFrame[]) {
	const enc = new TextEncoder();
	const buf = enc.encode(JSON.stringify(log));

	// The default compression method is gzip
	// Increasing mem may increase performance at the cost of memory
	// The mem ranges from 0 to 12, where 4 is the default
	const compressed = Buffer.from(compressSync(buf, { level: 6, mem: 6 }));
	return compressed.toString("base64");
}

export function decompressStationLog(compressed: string) {
	const dec = new TextDecoder();
	const buf = Uint8Array.from(Buffer.from(compressed, "base64"));
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
