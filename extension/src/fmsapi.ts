import type { FTAAddNoteBody, FTANoteRecord } from "../../shared/fmsApiTypes";
import { FMSEnums, FMSLogFrame, FMSMatch, ROBOT, ScheduleBreakdown, TournamentLevel } from "../../shared/types";
import { FMS } from "./background";

export async function getEventCode() {
	const eventCode = await (await fetch(`http://${FMS}/api/v1.0/systembase/get/get_CurrentlyActiveEventCode`)).text();
	const year = new Date().getFullYear(); // Just assume it's the current year, no point to ping the API just for that
	return year.toString() + eventCode.substring(1, eventCode.length - 1); // Substring to remove quotes around the string
}

export async function getMatches(level: FMSEnums.Level) {
	return (await (
		await fetch(`http://${FMS}/api/v1.0/fieldmonitor/get/GetResults/${FMSEnums.Level[level]}`)
	).json()) as FMSMatch[];
}

export async function getLog(matchId: string, alliance: "Red" | "Blue", station: FMSEnums.StationType) {
	return (await (
		await fetch(
			`http://${FMS}/api/v1.0/fieldmonitor/get/GetLog/${matchId}/${alliance}/${FMSEnums.StationType[station]}`,
		)
	).json()) as FMSLogFrame[];
}

export async function getCurrentMatch() {
	const response = await (await fetch(`http://${FMS}/api/v1.0/audience/get/GetCurrentMatchAndPlayNumber`)).json();
	return {
		level: response.item1 as TournamentLevel,
		matchNumber: response.item2,
		playNumber: response.item3,
	};
}

export async function getCompletedMatches(): Promise<FMSMatch[]> {
	// GetCurrentResults only returns the active tournament level.
	// Query all levels individually and merge so quals and playoffs are always included.
	const levels = [FMSEnums.Level.Practice, FMSEnums.Level.Qualification, FMSEnums.Level.Playoff];
	const results = await Promise.all(
		levels.map(async (level) => {
			try {
				return (await getMatches(level)) as FMSMatch[];
			} catch {
				return [] as FMSMatch[];
			}
		}),
	);
	// Only return matches that have actually been played (actualStartTime is set)
	return results.flat().filter((m) => !!m.actualStartTime);
}

export async function getAllLogsForMatch(matchId: string) {
	const logs: { [key in ROBOT]: FMSLogFrame[] } = {
		blue1: [],
		blue2: [],
		blue3: [],
		red1: [],
		red2: [],
		red3: [],
	};
	for (let i = 1; i <= 3; i++) {
		logs[("red" + i) as ROBOT] = await getLog(matchId, "Red", i);
		logs[("blue" + i) as ROBOT] = await getLog(matchId, "Blue", i);
	}
	return logs;
}

export async function getTeamNumbers() {
	return await (await fetch(`http://${FMS}/api/v1.0/match/get/GetAllTeamNumbers`)).json();
}

const levelMap = {
	None: 0,
	Practice: 1,
	Qualification: 2,
	Playoff: 3,
};

export async function getMatch(matchNumber: number, playNumber: number, level: TournamentLevel) {
	const matches = await getMatches(levelMap[level]);
	console.log(matches);
	for (let match of matches) {
		console.log(match.matchNumber, matchNumber, match.playNumber, playNumber);
		if (match.matchNumber === matchNumber && match.playNumber === playNumber) {
			return match;
		}
	}
	throw new Error("Match not found");
}

export async function getScheduleBreakdown() {
	const schedule = (
		await fetch(`http://${FMS}/api/v1.0/match/get/GetCurrentSchedule`).then((res) => res.json())
	).filter((match: any) => match.tournamentLevel === "Qualification");

	const days: ScheduleBreakdown = [];

	let lastPlayed = 0;
	let day = -1;

	const matches = [];

	for (let i = 0; i < schedule.length; i++) {
		const match = schedule[i];
		const previousMatch = i > 0 && schedule[i - 1];
		const nextMatch = i + 1 < schedule.length && schedule[i + 1];
		const startTime = new Date(match.startTime);
		let today = day in days && days[day];
		let previousDay = day - 1 in days && days[day - 1];
		let todayIsNew = !today || today.date.getDate() !== startTime.getDate();

		matches.push({
			scheduledStartTime: startTime,
			match: match.matchNumber,
			level: match.tournamentLevel,
		});

		const cycleTime = Math.abs(
			Math.round(
				previousMatch && !todayIsNew
					? startTime.getTime() - new Date(previousMatch.startTime).getTime()
					: nextMatch
						? startTime.getTime() - new Date(nextMatch.startTime).getTime()
						: 8 * 60 * 1000,
			) /
				1000 /
				60,
		);

		if (!today || today.date.getDate() !== startTime.getDate()) {
			day++;
			days[day] = {
				date: startTime,
				start: match.matchNumber,
				end: match.matchNumber,
				endTime: null,
				lunch: null,
				lunchTime: null,
				cycleTimes: [
					{
						match: match.matchNumber,
						minutes: cycleTime,
					},
				],
			};

			today = days[day];
			previousDay = day - 1 in days && days[day - 1];

			// Set the previous day's end match
			if (previousDay) {
				previousDay.end = previousMatch.matchNumber;
				previousDay.endTime = new Date(previousMatch.startTime);
			}
		}

		// Assuming any break larger than 30 minutes is lunch
		if (cycleTime > 30) {
			today.lunch = previousMatch.matchNumber;
			today.lunchTime = new Date(previousMatch.startTime);

			// Check if there's a cycle time change after lunch
			if (nextMatch) {
				const postLunchCycleTime = Math.abs(
					Math.round(new Date(match.startTime).getTime() - new Date(nextMatch.startTime).getTime()) /
						1000 /
						60,
				);

				if (postLunchCycleTime !== today.cycleTimes[today.cycleTimes.length - 1].minutes) {
					today.cycleTimes.push({
						match: match.matchNumber,
						minutes: postLunchCycleTime,
					});
				}
			}
		} else if (cycleTime !== today.cycleTimes[today.cycleTimes.length - 1].minutes) {
			// Add a cycle time change if applicable
			today.cycleTimes.push({
				match: match.matchNumber,
				minutes: cycleTime,
			});
		}

		if (!nextMatch) {
			today.end = match.matchNumber;
			today.endTime = new Date(match.startTime);
		}

		if (match.matchStatus === "Played") lastPlayed = match.matchNumber;
	}

	return { days, lastPlayed, matches };
}

// ---------------------------------------------------------------------------
// FMS Notes API (/Notes/ endpoints)
// ---------------------------------------------------------------------------

const NOTES_BASE = () => `http://${FMS}/Notes`;

/** The current FMS event password (used as `token` in /Notes/ requests). */
let fmsEventPassword: string | null = null;

/**
 * The loginTime string captured when the password was set.
 * FMS expects this to be consistent across all requests in a session.
 * Formatted as en-US locale: "M/D/YYYY, h:mm:ss AM/PM"
 */
let fmsLoginTime: string | null = null;

/**
 * Update the FMS event password and capture loginTime for the session.
 * Call this whenever the password changes (e.g. on startup or event change).
 */
export function setFmsEventPassword(password: string | null) {
	fmsEventPassword = password;
	fmsLoginTime = password ? new Date().toLocaleString("en-US") : null;
}

/**
 * Apply `token` and `loginTime` auth query params to a URL.
 * Throws if the password has not been configured.
 */
function applyAuthParams(url: URL): void {
	if (!fmsEventPassword || !fmsLoginTime) throw new Error("FMS event password not configured");
	url.searchParams.set("token", fmsEventPassword);
	url.searchParams.set("loginTime", fmsLoginTime);
}

/**
 * Add a note to FMS.
 * POST /Notes/AddNote - body contains numeric enum values (see {@link FTAAddNoteBody}).
 */
export async function addNote(body: FTAAddNoteBody): Promise<FTANoteRecord> {
	const url = new URL(`${NOTES_BASE()}/AddNote`);
	applyAuthParams(url);
	const res = await fetch(url.toString(), {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	if (!res.ok) throw new Error(`FMS API error: ${res.status}`);
	return res.json() as Promise<FTANoteRecord>;
}

/**
 * Update an existing note in FMS.
 * POST /Notes/UpdateNote - all params are query params, no request body.
 * @param fmsEventNoteId - UUID of the note to update.
 * @param resolutionType - Numeric resolution status (e.g. 1 = Open, 5 = Resolved).
 * @param notes - Updated note text.
 */
export async function updateNote(
	fmsEventNoteId: string,
	resolutionType: number,
	notes: string,
): Promise<FTANoteRecord> {
	const url = new URL(`${NOTES_BASE()}/UpdateNote`);
	url.searchParams.set("fmsEventNoteId", fmsEventNoteId);
	url.searchParams.set("resolutionType", String(resolutionType));
	url.searchParams.set("notes", notes);
	applyAuthParams(url);
	const res = await fetch(url.toString(), { method: "POST" });
	if (!res.ok) throw new Error(`FMS API error: ${res.status}`);
	return res.json() as Promise<FTANoteRecord>;
}

/**
 * Delete a note in FMS.
 * POST /Notes/DeleteNote - noteId passed as a query param, no request body.
 * @param fmsEventNoteId - UUID of the note to delete.
 */
export async function deleteNote(fmsEventNoteId: string): Promise<void> {
	const url = new URL(`${NOTES_BASE()}/DeleteNote`);
	url.searchParams.set("fmsEventNoteId", fmsEventNoteId);
	applyAuthParams(url);
	const res = await fetch(url.toString(), { method: "POST" });
	if (!res.ok) throw new Error(`FMS API error: ${res.status}`);
}
