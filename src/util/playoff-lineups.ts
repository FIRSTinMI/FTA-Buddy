import type { LineupCard, PlayoffAlliance } from "../db/schema";
import type { LineupStations, ResolvedLineup, ScheduleDetails } from "../../shared/types";

/** REBUILT T613: lineups are due 2 minutes before the expected match start. */
export const LINEUP_DEADLINE_MS = 2 * 60 * 1000;

/**
 * Default lineup when an alliance has never submitted one (REBUILT 10.6.4.2):
 * ALLIANCE Lead -> DS2, 1st pick -> DS1, 2nd pick -> DS3.
 */
export function defaultLineupStations(alliance: Pick<PlayoffAlliance, "captain_team" | "pick1_team" | "pick2_team">): LineupStations {
	return {
		station1: alliance.pick1_team ?? null,
		station2: alliance.captain_team ?? null,
		station3: alliance.pick2_team ?? null,
	};
}

/**
 * Resolve the lineup that applies to `matchNumber` for one alliance, given that
 * alliance's accepted cards (any match) and its roster.
 *
 * 1. Newest accepted card targeting this match -> "submitted".
 * 2. else newest accepted card for an earlier match -> "carried-forward"
 *    (REBUILT T613: "the ALLIANCE'S most recent LINEUP is applied").
 * 3. else the default lineup from the roster -> "default".
 *
 * `acceptedCards` must contain only status = "accepted" rows for this alliance.
 */
export function resolveLineup(
	acceptedCards: LineupCard[],
	alliance: Pick<PlayoffAlliance, "captain_team" | "pick1_team" | "pick2_team">,
	matchNumber: number,
): ResolvedLineup {
	const toStations = (c: LineupCard): ResolvedLineup => ({
		stations: { station1: c.station1_team, station2: c.station2_team, station3: c.station3_team },
		resolution: c.match_number === matchNumber ? "submitted" : "carried-forward",
		usesBackup: c.uses_backup,
		cardId: c.id,
	});

	// Highest-version accepted card that targets exactly this match.
	const forThisMatch = acceptedCards
		.filter((c) => c.match_number === matchNumber)
		.sort((a, b) => b.version - a.version)[0];
	if (forThisMatch) return toStations(forThisMatch);

	// Otherwise the most recent accepted card from an earlier match.
	const earlier = acceptedCards
		.filter((c) => c.match_number < matchNumber)
		.sort((a, b) => b.match_number - a.match_number || b.version - a.version)[0];
	if (earlier) return toStations(earlier);

	return {
		stations: defaultLineupStations(alliance),
		resolution: "default",
		usesBackup: false,
		cardId: null,
	};
}

export interface DeadlineResult {
	/** Expected match start time from the schedule, or null when unknown. */
	expectedStart: Date | null;
	/** expectedStart - 2 minutes (T613), or null when the start is unknown. */
	deadlineAt: Date | null;
}

/**
 * Compute the T613 deadline for a playoff match from the event schedule.
 * Returns nulls (deadline unenforceable) when the schedule has no entry, which
 * the UI surfaces explicitly rather than pretending a lineup is on time.
 */
export function computePlayoffDeadline(
	scheduleDetails: ScheduleDetails | null | undefined,
	matchNumber: number,
): DeadlineResult {
	const entry = scheduleDetails?.matches?.find((m) => m.match === matchNumber && m.level === "Playoff");
	if (!entry?.scheduledStartTime) return { expectedStart: null, deadlineAt: null };

	const expectedStart = new Date(entry.scheduledStartTime);
	if (Number.isNaN(expectedStart.getTime())) return { expectedStart: null, deadlineAt: null };

	return { expectedStart, deadlineAt: new Date(expectedStart.getTime() - LINEUP_DEADLINE_MS) };
}

/** True when `submittedAt` is past the deadline. False when the deadline is unknown. */
export function isLate(deadlineAt: Date | null, submittedAt: Date): boolean {
	return deadlineAt != null && submittedAt.getTime() > deadlineAt.getTime();
}
