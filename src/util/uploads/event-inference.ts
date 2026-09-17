import { and, eq, isNotNull, or, sql } from "drizzle-orm";
import { db } from "../../db/db";
import { events, matchLogs } from "../../db/schema";

/**
 * Working out which event an upload belongs to, so nobody has to type a code.
 *
 * The evidence in the files, strongest first:
 *
 * 1. The event's own name. A Hoot log is called `MIFLI_Q14_...`, a `.dsevents`
 *    file logs `FMS Event Name: ...`, and a data log records the event name over
 *    NetworkTables. Any of those names our event outright.
 * 2. A team number and a date. None of the log formats carries a team number,
 *    but a robot project and a support bundle do, and a team can type one. An
 *    event the team actually played at, whose dates cover the log, is a good
 *    answer; the nearest event they played at is a reasonable one.
 * 3. One event running that day. Weak, and only used when it is unambiguous.
 *
 * Nothing here guesses silently: every result carries the sentence explaining
 * it, which is stored on the upload and shown to the volunteer.
 */

export interface EventGuess {
	code: string;
	name: string;
	/** How it was worked out, shown to a volunteer so they can disagree. */
	why: string;
	how: "event-name" | "team-and-date" | "team-nearest" | "running-that-day";
}

/** `FIM District Flint` and `MIFLI` both reduce to something comparable. */
function normalize(value: string): string {
	return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseDay(value: string | null): Date | null {
	if (!value) return null;
	const d = new Date(`${value}T00:00:00Z`);
	return Number.isNaN(d.getTime()) ? null : d;
}

/** Inclusive: an event that ends on the 12th covers all of the 12th. */
function covers(event: { startDate: string | null; endDate: string | null }, date: Date): boolean {
	const start = parseDay(event.startDate);
	const end = parseDay(event.endDate);
	if (!start || !end) return false;
	return date.getTime() >= start.getTime() && date.getTime() < end.getTime() + 24 * 3600 * 1000;
}

/** Days between a date and an event's range, zero when inside it. */
function distanceDays(event: { startDate: string | null; endDate: string | null }, date: Date): number {
	const start = parseDay(event.startDate);
	const end = parseDay(event.endDate);
	if (!start || !end) return Number.POSITIVE_INFINITY;
	if (covers(event, date)) return 0;
	const before = (start.getTime() - date.getTime()) / 86_400_000;
	const after = (date.getTime() - (end.getTime() + 86_400_000)) / 86_400_000;
	return Math.max(before, after);
}

type EventRow = { code: string; name: string; startDate: string | null; endDate: string | null };

async function liveEvents(): Promise<EventRow[]> {
	return db
		.select({ code: events.code, name: events.name, startDate: events.startDate, endDate: events.endDate })
		.from(events)
		.where(eq(events.archived, false))
		.execute();
}

/**
 * An event named by a log. FMS event names are short codes like `MIFLI`, and our
 * codes are the season plus that code, so `2026mifli` matches. A long name from
 * a `.dsevents` file is compared against the event's own name.
 *
 * The name alone is not enough, which real data makes plain: this server holds
 * `2024mifli`, `2025mifli`, `2025mifli2` and `2025mifli3`, and their date
 * columns are empty. So the log's own date breaks the tie, first against the
 * event dates where they exist and otherwise against the season in the code.
 */
export async function eventByName(name: string, date: Date | null): Promise<EventGuess | null> {
	const wanted = normalize(name);
	if (wanted.length < 3) return null;
	const all = await liveEvents();

	const pick = (rows: EventRow[], why: string): EventGuess | null =>
		rows.length === 1 ? { code: rows[0].code, name: rows[0].name, how: "event-name", why } : null;

	/** Narrow several same-named events down with the date, then the season. */
	function narrow(rows: EventRow[], label: string): EventGuess | null {
		if (rows.length === 0) return null;
		const single = pick(rows, `The log says it was taken at ${label}, which is ${rows[0].code}.`);
		if (single) return single;
		if (!date) return null;

		const covering = rows.filter((e) => covers(e, date));
		const byDate = pick(
			covering,
			`The log says ${label} and was written on ${date.toISOString().slice(0, 10)}, which is ${covering[0]?.code}.`,
		);
		if (byDate) return byDate;

		const season = String(date.getUTCFullYear());
		const bySeason = rows.filter((e) => e.code.startsWith(season));
		return pick(
			bySeason,
			`The log says ${label} and is from ${season}, which is ${bySeason[0]?.code}. Several events share that name.`,
		);
	}

	const byCode = narrow(
		all.filter((e) => normalize(e.code).endsWith(wanted)),
		name,
	);
	if (byCode) return byCode;

	return narrow(
		all.filter((e) => {
			const en = normalize(e.name);
			return en === wanted || en.includes(wanted) || wanted.includes(en);
		}),
		`"${name}"`,
	);
}

/** Every unarchived event a team has a match log at. */
async function eventsForTeam(team: number): Promise<EventRow[]> {
	const teamColumns = or(
		eq(matchLogs.red1, team),
		eq(matchLogs.red2, team),
		eq(matchLogs.red3, team),
		eq(matchLogs.blue1, team),
		eq(matchLogs.blue2, team),
		eq(matchLogs.blue3, team),
	);
	const rows = await db
		.selectDistinct({
			code: events.code,
			name: events.name,
			startDate: events.startDate,
			endDate: events.endDate,
		})
		.from(matchLogs)
		.innerJoin(events, eq(matchLogs.event, events.code))
		.where(and(teamColumns, eq(events.archived, false)))
		.execute();
	return rows;
}

/**
 * The event a team was at when this log was written. An event whose dates cover
 * the log wins; otherwise the nearest one they played at, which is how a log
 * downloaded a week later still lands in the right place.
 */
export async function eventForTeamAndDate(team: number, date: Date): Promise<EventGuess | null> {
	const attended = await eventsForTeam(team);
	if (attended.length === 0) return null;

	const covering = attended.filter((e) => covers(e, date));
	if (covering.length === 1) {
		return {
			code: covering[0].code,
			name: covering[0].name,
			how: "team-and-date",
			why: `Team ${team} played at ${covering[0].code}, which was running on ${date.toISOString().slice(0, 10)}.`,
		};
	}
	if (covering.length > 1) {
		// Two events on the same days with the same team is a data problem, not
		// something to pick a winner from.
		return null;
	}

	const ranked = attended
		.map((e) => ({ event: e, days: distanceDays(e, date) }))
		.filter((r) => Number.isFinite(r.days))
		.sort((a, b) => a.days - b.days);
	if (ranked.length === 0) return null;
	const best = ranked[0];
	// A log from six months away is not evidence of anything.
	if (best.days > 60) return null;
	return {
		code: best.event.code,
		name: best.event.name,
		how: "team-nearest",
		why: `Team ${team} has played at ${best.event.code}, the closest event to ${date.toISOString().slice(0, 10)} by ${Math.round(best.days)} day${Math.round(best.days) === 1 ? "" : "s"}.`,
	};
}

/** Exactly one event running that day, used only when nothing better exists. */
export async function eventRunningOn(date: Date): Promise<EventGuess | null> {
	const all = await liveEvents();
	const running = all.filter((e) => covers(e, date));
	if (running.length !== 1) return null;
	return {
		code: running[0].code,
		name: running[0].name,
		how: "running-that-day",
		why: `${running[0].code} was the only event running on ${date.toISOString().slice(0, 10)}.`,
	};
}

export interface InferenceInput {
	/** Event names the files claimed, strongest evidence first. */
	eventNames: string[];
	/** Team number from a project, a support bundle, or typed on the form. */
	team: number | null;
	/** When the logs were written. */
	logDate: Date | null;
}

/** Work through the evidence in order and return the first thing that settles it. */
export async function inferEvent(input: InferenceInput): Promise<EventGuess | null> {
	for (const name of input.eventNames) {
		const guess = await eventByName(name, input.logDate);
		if (guess) return guess;
	}
	if (input.team !== null && input.logDate) {
		const guess = await eventForTeamAndDate(input.team, input.logDate);
		if (guess) return guess;
	}
	if (input.logDate) {
		const guess = await eventRunningOn(input.logDate);
		if (guess) return guess;
	}
	return null;
}

/**
 * Uploads that could not be placed. Any signed-in volunteer can see these and
 * attach one to their event, because an upload nobody can find is worse than
 * one filed in the wrong place.
 */
export const UNASSIGNED_REASON = "We could not work out which event this belongs to. A volunteer can attach it.";

/** Every team in a match log at this event, for the "which team is this" list. */
export async function teamsAtEvent(eventCode: string): Promise<number[]> {
	const rows = await db
		.select({
			teams: sql<
				number[]
			>`array_remove(array[${matchLogs.red1}, ${matchLogs.red2}, ${matchLogs.red3}, ${matchLogs.blue1}, ${matchLogs.blue2}, ${matchLogs.blue3}], null)`,
		})
		.from(matchLogs)
		.where(and(eq(matchLogs.event, eventCode), isNotNull(matchLogs.red1)))
		.execute();
	return [...new Set(rows.flatMap((r) => r.teams ?? []))].sort((a, b) => a - b);
}
