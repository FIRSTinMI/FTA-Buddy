import { API } from "@the-orange-alliance/api";
import Match from "@the-orange-alliance/api/lib/esm/models/Match";
import EventType from "@the-orange-alliance/api/lib/esm/models/types/EventType";
import StreamType from "@the-orange-alliance/api/lib/esm/models/types/StreamType";
import { z } from "zod";
import { publicProcedure, router } from "../trpc";
import { abortableSleep } from "../util/subscription";

process.env.TZ = "UTC";

const eventData: { [key: string]: FTCEvent } = {};
const toa = process.env.TOA_APP_NAME
	? new API("", process.env.TOA_APP_NAME)
	: new API(process.env.TOA_KEY ?? "", "FTA Buddy");

export interface FTCEvent {
	key: string;
	code: string;
	name: string;
	isLeagueMeet: boolean;
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
	qualMatchCount: number;
	// Playoff bracket size from Table 13-2 of the competition manual, 0 for league meets
	allianceCount: number;
	// FTC API event codes: the parent event of a division, and the divisions of a dual division parent
	parentCode: string | null;
	divisionCodes: string[];
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
	tournamentLevel: "PRACTICE" | "QUALIFICATION" | "PLAYOFF";
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

export interface FTCAPIScheduledMatch {
	description: string;
	tournamentLevel: "QUALIFICATION";
	series: number;
	matchNumber: number;
	teams: { teamNumber: number; station: string; surrogate: boolean; noShow: boolean }[];
}

export interface FTCAPIEvent {
	code: string;
	divisionCode: string | null;
}

interface FTCAPIAlliance {
	number: number;
	captain: { teamNumber: number } | null;
	round1: { teamNumber: number } | null;
	round2: { teamNumber: number } | null;
	round3: { teamNumber: number } | null;
	backup: { teamNumber: number } | null;
}

export interface FTCAPITeam {
	teamNumber: number;
	station: "Blue1" | "Blue2" | "Red1" | "Red2";
	dq: boolean;
	onField: boolean;
}

export const ftcRouter = router({
	dashboard: publicProcedure
		.input(
			z.object({
				region: z.string(),
				events: z.array(z.string()),
			}),
		)
		.subscription(async function* ({ input, signal }) {
			await loadEvents(input.events);

			yield getLoadedEvents(input.events);

			while (!signal?.aborted) {
				await abortableSleep(30000, signal!);
				if (!signal?.aborted) yield getLoadedEvents(input.events);
			}
		}),

	getRegions: publicProcedure.query(async () => {
		return (await toa.getRegions()).map((region) => ({
			value: region.regionKey,
			name: region.description,
		}));
	}),

	getEventsThisWeek: publicProcedure
		.input(
			z.object({
				region: z.string(),
			}),
		)
		.query(async ({ input }) => {
			return await getEventsThisWeek(input.region);
		}),

	getEventUpdates: publicProcedure
		.input(
			z.object({
				events: z.array(z.string()),
			}),
		)
		.query(async ({ input }) => {
			await loadEvents(input.events);

			return getLoadedEvents(input.events);
		}),
});

const eventLoads: { [key: string]: Promise<void> } = {};

// Loads every event at once; an event already loading or loaded is not fetched again
async function loadEvents(keys: string[]) {
	await Promise.allSettled(keys.map((key) => (eventLoads[key] ??= createEventTracker(key))));
}

// Events that failed to load are left out instead of failing the whole dashboard
function getLoadedEvents(keys: string[]) {
	return keys.map((key) => eventData[key]).filter((event) => event !== undefined);
}

async function createEventTracker(key: string) {
	console.log("Creating event tracker for ", key);
	try {
		const [event, schedule, teams, seasonEvents] = await Promise.all([
			toa.getEvent(key),
			toa.getEventMatches(key),
			toa.getEventTeams(key),
			FTCAPIgetSeasonEvents(),
		]);
		for (const match of schedule) {
			match.scheduledTime = match.scheduledTime?.substring(0, 22);
		}

		const ftcEvent: FTCEvent = {
			key: event.eventKey,
			code: event.firstEventCode,
			name: event.eventName,
			isLeagueMeet: event.eventTypeKey === EventType.LeagueMeet,
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
			qualMatchCount: 0,
			allianceCount: 0,
			parentCode: seasonEvents.find((e) => e.code === event.firstEventCode)?.divisionCode ?? null,
			divisionCodes: seasonEvents.filter((e) => e.divisionCode === event.firstEventCode).map((e) => e.code),
			// matchCount: event.matchCount
		};

		await updateEventStatus(ftcEvent);
		eventData[key] = ftcEvent;
		setInterval(
			() =>
				updateEventStatus(ftcEvent).catch((err) =>
					console.error("FTC event status update failed for", key, err),
				),
			30000,
		);
	} catch (err) {
		console.error("Creating FTC event tracker failed for", key, err);
		// Forget the failed load so the next request tries again
		delete eventLoads[key];
	}
}

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
			endDate: new Date(event.endDate),
		}));
}

async function updateEventStatus(event: FTCEvent) {
	console.log("Updating event status for ", event.code);
	const [apiMatches, qualSchedule, alliances] = await Promise.all([
		FTCAPIgetMatches(event.code),
		getQualSchedule(event.code),
		event.isLeagueMeet ? new Map<number, number>() : getAlliances(event.code),
		refreshScheduleAndStreams(event),
	]);

	// Practice matches are not part of the event's progress
	const matches = apiMatches.filter((match) => match.tournamentLevel !== "PRACTICE");

	for (const match of matches) {
		match.actualStartTime = new Date(match.actualStartTime);
		match.actualStartTime.setHours(match.actualStartTime.getHours() - getTimezoneOffset(event.timezone));
		match.postResultTime = new Date(match.postResultTime);
		match.postResultTime.setHours(match.postResultTime.getHours() - getTimezoneOffset(event.timezone));
	}

	const playedQuals = matches.filter((match) => match.tournamentLevel === "QUALIFICATION");
	event.qualMatchCount = Math.max(
		qualSchedule.length,
		event.schedule.filter((match) => match.tournamentLevel === 1).length,
		playedQuals.length,
	);
	event.allianceCount = await getAllianceCount(event, qualSchedule, playedQuals, alliances);

	// If there are no matches, set the event status to empty
	if (matches.length === 0) {
		event.matches = [];
		event.currentMatch = null;
		event.currentLevel = "QUALIFICATION";
		event.completedMatches = 0;
		event.totalMatches = Math.max(event.qualMatchCount + (event.allianceCount > 0 ? 2 * event.allianceCount - 1 : 0), 1);
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
			lastCompletedMatchLevel = match.tournamentLevel === "PLAYOFF" ? "PLAYOFF" : "QUALIFICATION";
		}

		const scheduledMatch = event.schedule.find(
			(scheduledMatch) => scheduledMatch.matchKey === getTOAMatchKey(event.key, match),
		);
		const startTime = scheduledMatch?.scheduledTime ? new Date(scheduledMatch.scheduledTime) : null;

		const ftcMatch: FTCMatch = {
			...match,
			completed: match.postResultTime !== null,
			cycleTime,
			actualStartTime: match.actualStartTime,
			postResultTime: match.postResultTime,
			scheduledStartTime: startTime,
		};

		newMatches.push(ftcMatch);
	}

	const completedQuals = newMatches.filter((match) => match.completed && match.tournamentLevel === "QUALIFICATION");
	const completedPlayoffs = newMatches.filter((match) => match.completed && match.tournamentLevel === "PLAYOFF");

	event.matches = newMatches;
	event.currentMatch = newMatches[lastCompletedMatch] ?? null;
	event.currentLevel = lastCompletedMatchLevel;
	event.completedMatches = completedQuals.length + completedPlayoffs.length;
	event.totalMatches = Math.max(
		event.qualMatchCount +
			completedPlayoffs.length +
			getPlayoffMatchesLeft(completedPlayoffs, event.allianceCount, alliances),
		event.completedMatches,
		1,
	);
	event.averageCycleTime = getAverageCycleTime(
		newMatches.map((match) => match.cycleTime ?? 0).filter((time) => time !== null),
	);
	event.aheadBehind = event.currentMatch?.scheduledStartTime
		? event.currentMatch.actualStartTime.getTime() - event.currentMatch.scheduledStartTime.getTime()
		: null;
}

// Table 13-2: number of playoff alliances from the teams playing qualification matches
function getAllianceCountForTeams(teams: number) {
	if (teams <= 10) return 2;
	if (teams <= 20) return 4;
	if (teams <= 40) return 6;
	return 8;
}

// Teams in the qualification schedule, leaving out teams marked no-show in every match they had
function getQualTeams(schedule: { teams: { teamNumber: number; noShow?: boolean }[] }[]) {
	const teams = new Set<number>();
	for (const match of schedule) {
		for (const team of match.teams) {
			if (!team.noShow) teams.add(team.teamNumber);
		}
	}
	return teams.size;
}

async function getAllianceCount(
	event: FTCEvent,
	qualSchedule: FTCAPIScheduledMatch[],
	playedQuals: FTCAPIMatch[],
	alliances: Map<number, number>,
) {
	// League meets do not play playoffs (Section 14)
	if (event.isLeagueMeet) return 0;
	// After alliance selection the bracket size is known exactly
	if (alliances.size > 0) return new Set(alliances.values()).size;
	// A dual division parent event plays the 2 division winners (Section 13.8.2)
	if (event.divisionCodes.length > 0) return 2;

	let teams = getQualTeams(qualSchedule) || getQualTeams(playedQuals) || event.teamCount;

	// Divisions all use the bracket size of the smallest division (T801)
	if (event.parentCode) {
		const siblings = (await FTCAPIgetSeasonEvents()).filter(
			(e) => e.divisionCode === event.parentCode && e.code !== event.code,
		);
		for (const sibling of siblings) {
			const siblingTeams = getQualTeams(await getQualSchedule(sibling.code));
			if (siblingTeams > 0) teams = Math.min(teams, siblingTeams);
		}
	}

	return getAllianceCountForTeams(teams);
}

// Double elimination (Section 13.7.2): an alliance is out after 2 lost matches, ties are replayed.
// The bracket takes at most 2 * alliances - 1 decided matches and ends when 1 alliance is left.
function getPlayoffMatchesLeft(completedPlayoffs: FTCMatch[], allianceCount: number, alliances: Map<number, number>) {
	if (allianceCount === 0) return 0;

	const losses = new Map<string, number>();
	let decided = 0;

	for (const match of completedPlayoffs) {
		if (match.scoreRedFinal === match.scoreBlueFinal) continue;
		decided++;

		const loser = match.scoreRedFinal < match.scoreBlueFinal ? "Red" : "Blue";
		const loserTeams = match.teams
			.filter((team) => team.station.startsWith(loser))
			.map((team) => team.teamNumber)
			.sort((a, b) => a - b);
		const alliance = alliances.get(loserTeams[0]);
		const key = alliance !== undefined ? `A${alliance}` : loserTeams.join(",");
		losses.set(key, (losses.get(key) ?? 0) + 1);
	}

	const eliminated = [...losses.values()].filter((count) => count >= 2).length;
	if (decided > 0 && allianceCount - eliminated <= 1) return 0;

	return Math.max(2 * allianceCount - 1 - decided, 1);
}

const allianceSelections: { [code: string]: Map<number, number> } = {};

// Team number -> playoff alliance number; fetched until alliance selection is published, then kept
async function getAlliances(code: string) {
	if (allianceSelections[code]?.size) return allianceSelections[code];
	const teams = new Map<number, number>();
	const res = await FTCAPIget<{ alliances: FTCAPIAlliance[] }>(`alliances/${code}`);
	for (const alliance of res?.alliances ?? []) {
		for (const pick of [alliance.captain, alliance.round1, alliance.round2, alliance.round3, alliance.backup]) {
			if (pick) teams.set(pick.teamNumber, alliance.number);
		}
	}
	allianceSelections[code] = teams;
	return teams;
}

const qualSchedules: { [code: string]: FTCAPIScheduledMatch[] } = {};

// A published qualification schedule does not change, so it is fetched until it exists and then kept
async function getQualSchedule(code: string) {
	if (qualSchedules[code]?.length) return qualSchedules[code];
	const schedule =
		(await FTCAPIget<{ schedule: FTCAPIScheduledMatch[] }>(`schedule/${code}?tournamentLevel=qual`))?.schedule ?? [];
	qualSchedules[code] = schedule;
	return schedule;
}

async function refreshScheduleAndStreams(event: FTCEvent) {
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
			fullURL: stream.fullURL,
		}));
	}
}

// TOA keys quals as Q045 and playoffs as E{series}{match:2}, e.g. E1001 for match 10 of the bracket
function getTOAMatchKey(eventKey: string, match: FTCAPIMatch) {
	if (match.tournamentLevel === "PLAYOFF") {
		return `${eventKey}-E${match.series}${match.matchNumber.toString().padStart(2, "0")}-1`;
	}
	return `${eventKey}-Q${match.matchNumber.toString().padStart(3, "0")}-1`;
}

// The FTC API names a season by the year it kicks off in September (2026 = the 2026-27 season)
function getFTCSeason(date: Date = new Date()) {
	return date.getMonth() >= 8 ? date.getFullYear() : date.getFullYear() - 1;
}

async function FTCAPIget<T>(path: string): Promise<T | null> {
	const response = await fetch(`https://ftc-api.firstinspires.org/v2.0/${getFTCSeason()}/${path}`, {
		headers: {
			Accept: "application/json",
			Authorization: `Basic ${btoa(process.env.FTC_KEY ?? "")}`,
		},
	});

	if (!response.ok) {
		console.error(`FTC API ${response.status} for ${path}: ${(await response.text()).substring(0, 200)}`);
		return null;
	}

	return (await response.json()) as T;
}

async function FTCAPIgetMatches(eventKey: string) {
	return (await FTCAPIget<{ matches: FTCAPIMatch[] }>(`matches/${eventKey}?start=0&end=999`))?.matches ?? [];
}

let seasonEvents: { fetched: number; events: Promise<FTCAPIEvent[]> } | null = null;

// The season's event list, for division links; refreshed every 6 hours
function FTCAPIgetSeasonEvents() {
	if (!seasonEvents || Date.now() - seasonEvents.fetched > 6 * 60 * 60 * 1000) {
		const events = FTCAPIget<{ events: FTCAPIEvent[] }>("events").then((res) => res?.events ?? []);
		seasonEvents = { fetched: Date.now(), events };
		// A failed fetch is retried on the next call instead of being kept for 6 hours
		events.then((list) => {
			if (list.length === 0) seasonEvents = null;
		});
	}
	return seasonEvents.events;
}

function getAverageCycleTime(cycleTimes: number[], rollingAverage: number = 6) {
	if (cycleTimes.length < 3) {
		return 7 * 60 * 1000;
	}

	// Sort the cycle times
	cycleTimes.sort((a, b) => (a ?? 0) - (b ?? 0));

	// Calculate Q1 (25th percentile) and Q3 (75th percentile)
	const q1 = cycleTimes[Math.floor(cycleTimes.length / 4)] ?? 5 * 60 * 1000;
	const q3 = cycleTimes[Math.floor((cycleTimes.length * 3) / 4)] ?? 12 * 60 * 1000;
	const iqr = q3 - q1;

	// Define the bounds for outliers
	const lowerBound = q1 - 1.5 * iqr;
	const upperBound = q3 + 1.5 * iqr;

	// Filter out the outliers
	let filteredTimes = cycleTimes.filter((time) => (time ? time >= lowerBound && time <= upperBound : false));
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

	const dtf = new Intl.DateTimeFormat("en-US", {
		timeZone: timezone,
		hour12: false,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});

	const parts = dtf.formatToParts(now);
	const getPart = (type: string) => parts.find((p) => p.type === type)!.value;

	const tzDate = new Date(
		`${getPart("year")}-${getPart("month")}-${getPart("day")}T${getPart("hour")}:${getPart("minute")}:${getPart("second")}Z`,
	);

	// Offset in minutes (UTC - local), negate to get (local - UTC)
	return Math.round((tzDate.getTime() - now.getTime()) / 60000 / 6) / 10;
}
