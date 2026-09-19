import type { ScheduleDetails } from "../../shared/types";

/**
 * Per-event correction for a schedule FMS generated on the wrong date.
 *
 * 2026mibr (Ferris State Roboday, 2026-09-19): the schedule was built for
 * 2026-09-18, so every scheduled start time FMS reports is exactly 24 hours
 * early. FMS will not regenerate a schedule once an event is underway, so the
 * server shifts the schedule forward as it comes in. Everything downstream
 * (exact ahead/behind, the monitor's schedule line, the scorekeeper table and
 * the T613 deadline) then reads against the real clock.
 *
 * Temporary. Delete this file and its single call in cycles.postScheduleDetails
 * once the event is over.
 */
const OFFSETS_MS: Record<string, number> = {
	"2026mibr": 24 * 60 * 60 * 1000,
};

type Day = ScheduleDetails["days"][number];
type Match = NonNullable<ScheduleDetails["matches"]>[number];

function shift(value: Date | string | null | undefined, ms: number) {
	if (value === null || value === undefined) return value;
	return new Date(new Date(value).getTime() + ms);
}

/**
 * Shift every absolute timestamp in an incoming schedule by the event's offset.
 * Returns the input untouched when the event has no offset configured, so the
 * normal path is a single map lookup.
 *
 * Applied at ingest only, which keeps it idempotent: FMS always posts raw times,
 * so a re-post of an already-corrected schedule shifts the raw values once again,
 * not twice.
 */
export function applyScheduleOffset<T extends { days: Day[]; matches?: Match[] }>(eventCode: string, schedule: T): T {
	const ms = OFFSETS_MS[eventCode.toLowerCase()];
	if (!ms) return schedule;

	return {
		...schedule,
		days: schedule.days.map((day) => ({
			...day,
			date: shift(day.date, ms) as Day["date"],
			endTime: shift(day.endTime, ms) as Day["endTime"],
			lunchTime: shift(day.lunchTime, ms) as Day["lunchTime"],
		})),
		matches: schedule.matches?.map((match) => ({
			...match,
			scheduledStartTime: shift(match.scheduledStartTime, ms) as Match["scheduledStartTime"],
		})),
	};
}
