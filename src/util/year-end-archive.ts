import { and, eq, isNotNull, lt, or } from "drizzle-orm";
import { db } from "../db/db";
import { events as eventsTable } from "../db/schema";
import { acquireOrRenewLock } from "./leaderLock";
import { cleanupEventSubscriptions } from "./get-event";
import { events as eventsInMemory, eventCodes } from "../state";

/**
 * Archiving a season at the end of the calendar year.
 *
 * An event's notes, match logs and uploads stop being reachable in the app once
 * the year it ran in is over. The data is not deleted; the event is marked
 * archived, which is what makes `eventProcedure` refuse its token.
 *
 * This runs as a daily sweep rather than a job fired at midnight on the 31st, so
 * a server that was off over new year still catches up the next time it starts,
 * and so an event added later with an old date is caught too.
 */

const LOCK_NAME = "year-end-archive";
const LOCK_TTL_SECONDS = 300;
const DAY_MS = 24 * 60 * 60 * 1000;

export function archiveEnabled(): boolean {
	return process.env.YEAR_END_ARCHIVE_ENABLED !== "false";
}

/** The year an event ran in, from its end date, falling back to its start. */
function eventYear(event: { startDate: string | null; endDate: string | null }): number | null {
	const raw = event.endDate || event.startDate;
	if (!raw) return null;
	const year = Number(raw.slice(0, 4));
	return Number.isInteger(year) && year > 2000 ? year : null;
}

/**
 * Archive every unarchived event that ran in a previous calendar year. Returns
 * the codes archived, so the caller can log something useful.
 */
export async function archivePastYears(now = new Date()): Promise<string[]> {
	const thisYear = now.getUTCFullYear();
	const candidates = await db
		.select({
			code: eventsTable.code,
			startDate: eventsTable.startDate,
			endDate: eventsTable.endDate,
		})
		.from(eventsTable)
		.where(
			and(
				eq(eventsTable.archived, false),
				// An event with no dates at all cannot be placed in a year, so it is
				// left alone rather than guessed at.
				or(isNotNull(eventsTable.startDate), isNotNull(eventsTable.endDate)),
			),
		)
		.execute();

	const stale = candidates.filter((event) => {
		const year = eventYear(event);
		return year !== null && year < thisYear;
	});
	if (stale.length === 0) return [];

	const codes = stale.map((event) => event.code);
	for (const code of codes) {
		await db.update(eventsTable).set({ archived: true }).where(eq(eventsTable.code, code)).execute();
		// The event is cached in memory with its old archived flag, so drop it or
		// this instance keeps letting people in until it restarts.
		const cached = eventsInMemory[code];
		if (cached) {
			for (const [token, mapped] of Object.entries(eventCodes)) {
				if (mapped === code) delete eventCodes[token];
			}
			delete eventsInMemory[code];
		}
		cleanupEventSubscriptions(code);
	}
	return codes;
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Sweep once a day, on whichever instance holds the lock. */
export function startYearEndArchive(): void {
	if (timer || !archiveEnabled()) return;

	const run = async () => {
		try {
			if (!(await acquireOrRenewLock(LOCK_NAME, LOCK_TTL_SECONDS))) return;
			const archived = await archivePastYears();
			if (archived.length > 0) {
				console.log(`[YearEndArchive] archived ${archived.length} event(s): ${archived.join(", ")}`);
			}
		} catch (err) {
			console.error("[YearEndArchive] sweep failed", err);
		}
	};

	// Once at boot, so a server that was off over new year catches up.
	void run();
	timer = setInterval(() => void run(), DAY_MS);
	timer.unref?.();
}
