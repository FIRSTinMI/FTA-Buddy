/**
 * Tying a team's uploaded log to a match on our schedule, so the FMS station log
 * we already captured can be shown next to the team's own log.
 *
 * Two routes, because the two file formats carry different facts:
 *
 * - A data log records the match info over NetworkTables, so it names its match
 *   outright. That is an exact link.
 * - A Driver Station log carries no match info at all, only a start time from the
 *   laptop clock. So it is linked by time: any match that started inside the
 *   window the log covers. One DS log usually spans a whole session, so this can
 *   legitimately return several matches.
 *
 * Both functions are pure and take the candidate matches as an argument, so the
 * rules can be tested without a database.
 */

import type { WpilogMatchInfo } from "./wpilog";

export type MatchLevel = "None" | "Practice" | "Qualification" | "Playoff";

export type Station = "red1" | "red2" | "red3" | "blue1" | "blue2" | "blue3";

/** The fields of a `match_logs` row this module needs. */
export interface CandidateMatch {
	id: string;
	level: MatchLevel;
	match_number: number;
	play_number: number;
	start_time: Date;
	red1: number | null;
	red2: number | null;
	red3: number | null;
	blue1: number | null;
	blue2: number | null;
	blue3: number | null;
}

export interface MatchLink {
	matchId: string;
	level: MatchLevel;
	matchNumber: number;
	playNumber: number;
	startTime: Date;
	/** Set when the log also told us which driver station it was. */
	station?: Station;
	team?: number;
	/** `match-info` came out of the log's own fields; `timestamp` is a time overlap. */
	how: "match-info" | "file-name" | "timestamp";
	/** Shown in the UI so a CSA can see why we attached this match. */
	reason: string;
}

/** WPILib's MatchType ordinal, unchanged between 2026 and 2027. */
export function levelFromMatchType(matchType: number | undefined): MatchLevel | null {
	switch (matchType) {
		case 1:
			return "Practice";
		case 2:
			return "Qualification";
		case 3:
			return "Playoff";
		default:
			return null;
	}
}

export function stationFrom(stationNumber?: number, isRedAlliance?: boolean): Station | null {
	if (!stationNumber || stationNumber < 1 || stationNumber > 3) return null;
	if (isRedAlliance === undefined) return null;
	return `${isRedAlliance ? "red" : "blue"}${stationNumber}` as Station;
}

function teamAt(match: CandidateMatch, station: Station | null): number | undefined {
	if (!station) return undefined;
	return match[station] ?? undefined;
}

/**
 * Exact link from a data log's own match info. `replayNumber` maps to our
 * `play_number`; when the log did not record one, the latest play of that match
 * wins, since that is the one whose station log a CSA wants.
 */
export function linkByMatchInfo(info: WpilogMatchInfo, candidates: CandidateMatch[]): MatchLink | null {
	const level = levelFromMatchType(info.matchType);
	if (!level || !info.matchNumber) return null;
	const sameMatch = candidates
		.filter((c) => c.level === level && c.match_number === info.matchNumber)
		.sort((a, b) => b.play_number - a.play_number);
	if (sameMatch.length === 0) return null;
	const byPlay = info.replayNumber ? sameMatch.find((c) => c.play_number === info.replayNumber) : undefined;
	const match = byPlay ?? sameMatch[0];
	const station = stationFrom(info.stationNumber, info.isRedAlliance);
	const playNote = info.replayNumber && !byPlay ? `, replay ${info.replayNumber} not in our logs` : "";
	return {
		matchId: match.id,
		level: match.level,
		matchNumber: match.match_number,
		playNumber: match.play_number,
		startTime: match.start_time,
		station: station ?? undefined,
		team: teamAt(match, station),
		how: "match-info",
		reason: `The data log recorded ${level} ${info.matchNumber}${station ? ` at ${station}` : ""}${playNote}.`,
	};
}

/**
 * Link from a renamed data log file name, for the case where the file was
 * renamed by FMS attach but the NetworkTables entries were not logged. There is
 * no station in a file name, so no team comes out of this route.
 */
export function linkByFileName(
	name: { matchLevel?: MatchLevel; matchNumber?: number },
	candidates: CandidateMatch[],
): MatchLink | null {
	if (!name.matchLevel || !name.matchNumber) return null;
	const sameMatch = candidates
		.filter((c) => c.level === name.matchLevel && c.match_number === name.matchNumber)
		.sort((a, b) => b.play_number - a.play_number);
	if (sameMatch.length === 0) return null;
	const match = sameMatch[0];
	return {
		matchId: match.id,
		level: match.level,
		matchNumber: match.match_number,
		playNumber: match.play_number,
		startTime: match.start_time,
		how: "file-name",
		reason: `The file name says ${name.matchLevel} ${name.matchNumber}.`,
	};
}

/** How far before the log's first sample a match may start and still count. */
const LEAD_SECS = 30;

/**
 * Every match that started while a Driver Station log was recording. A team that
 * leaves the DS open all morning produces one log covering many matches, so this
 * returns a list, newest match last.
 */
export function linkByTimestamp(
	startTimeUnixSecs: number,
	durationSecs: number,
	candidates: CandidateMatch[],
): MatchLink[] {
	if (!Number.isFinite(startTimeUnixSecs) || startTimeUnixSecs <= 0) return [];
	const from = (startTimeUnixSecs - LEAD_SECS) * 1000;
	const to = (startTimeUnixSecs + Math.max(durationSecs, 0)) * 1000;
	return candidates
		.filter((c) => {
			const t = c.start_time.getTime();
			return t >= from && t <= to;
		})
		.sort((a, b) => a.start_time.getTime() - b.start_time.getTime())
		.map((match) => ({
			matchId: match.id,
			level: match.level,
			matchNumber: match.match_number,
			playNumber: match.play_number,
			startTime: match.start_time,
			how: "timestamp" as const,
			reason: `${match.level} ${match.match_number}${match.play_number > 1 ? ` play ${match.play_number}` : ""} started while this Driver Station log was recording.`,
		}));
}

/**
 * Which team an upload belongs to, taking the strongest evidence available.
 * An exact station from a data log beats a team number typed into the portal,
 * because the typed one is a team guessing at their own upload form.
 */
export type TeamSource = "log-station" | "robot-code" | "support-bundle" | "entered" | "none";

export const TEAM_SOURCE_RANK: Record<TeamSource, number> = {
	"log-station": 4,
	"support-bundle": 3,
	"robot-code": 2,
	entered: 1,
	none: 0,
};

export function pickTeam(
	candidates: { team: number; source: TeamSource }[],
): { team: number; source: TeamSource } | null {
	const ranked = candidates
		.filter((c) => Number.isInteger(c.team) && c.team > 0)
		.sort((a, b) => TEAM_SOURCE_RANK[b.source] - TEAM_SOURCE_RANK[a.source]);
	return ranked[0] ?? null;
}
