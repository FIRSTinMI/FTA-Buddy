import { eventYear } from "./year-end-archive";

export interface SeasonEventRow {
	code: string;
	name: string;
	startDate: string | null;
	endDate: string | null;
	created_at: Date;
}

/**
 * The season an event belongs to. Same rule the year-end archive uses (the year
 * of its end date, else its start date), so the dropdown and the archive never
 * disagree. Events with no dates fall back to a leading 4-digit year in the code
 * (TBA style, "2026miket"), then to the year the event was created.
 */
export function seasonYear(row: SeasonEventRow): number {
	const fromDates = eventYear(row);
	if (fromDates !== null) return fromDates;
	const prefix = /^(\d{4})/.exec(row.code);
	if (prefix) {
		const year = Number(prefix[1]);
		if (year > 2000) return year;
	}
	return row.created_at.getUTCFullYear();
}

/** Events in `year`, newest first (by start date, then creation). */
export function filterSeasonEvents(
	rows: SeasonEventRow[],
	year: number,
): { code: string; name: string; startDate: string | null }[] {
	return rows
		.filter((r) => seasonYear(r) === year)
		.sort(
			(a, b) =>
				(b.startDate ?? "").localeCompare(a.startDate ?? "") || b.created_at.getTime() - a.created_at.getTime(),
		)
		.map((r) => ({ code: r.code, name: r.name, startDate: r.startDate }));
}
