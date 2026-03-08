import type { ScheduleDetails } from "../../../shared/types";
import { formatTimeShortNoAgoMinutesOnly } from "../../../shared/formatTime";

let currentScheduleDay = 0;

export function updateScheduleText(
	currentMatch: number,
	scheduleDetails: ScheduleDetails | undefined,
	level: string,
	averageCycleTimeMS: number,
) {
	if (!scheduleDetails || !scheduleDetails.days) return "";
	let scheduleText = "";

	if (level !== "Qualification") {
		return "";
	}

	// Determine which schedule day we're currently on by calendar date, not by
	// match number range.  This ensures carry-over matches played the next morning
	// still show today's endpoint (e.g. match 80) rather than yesterday's endpoint
	// (e.g. match 54).  We pick the latest schedule day whose UTC calendar date is
	// <= today's UTC calendar date.
	{
		const now = new Date();
		const todayUTC = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}`;
		currentScheduleDay = 0;
		for (let i = 0; i < scheduleDetails.days.length; i++) {
			const d = new Date(scheduleDetails.days[i].date);
			const dayUTC = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
			if (dayUTC <= todayUTC) {
				currentScheduleDay = i;
			}
		}
	}

	let lunchMatch = scheduleDetails.days[currentScheduleDay].lunch;
	let goalMatch = 0;

	if (lunchMatch && currentMatch <= lunchMatch) {
		scheduleText = "Lunch M:" + lunchMatch + " @";
		goalMatch = lunchMatch;

		let endTime = new Date(new Date().getTime() + (goalMatch - currentMatch) * averageCycleTimeMS);
		let fallbackEndOfDay = new Date();
		fallbackEndOfDay.setHours(19, 0, 0, 0);

		let endTimeFormatted = endTime.toLocaleTimeString().split(":").slice(0, 2).join(":");
		let end = formatTimeShortNoAgoMinutesOnly(
			endTime,
			new Date(scheduleDetails.days[currentScheduleDay].lunchTime ?? fallbackEndOfDay),
		);

		console.log({
			endTime,
			end,
			fallbackEndOfDay,
			currentMatch,
			goalMatch,
			averageCycleTimeMS,
			currentMatchTime: new Date().getTime(),
		});
		let aheadBehind =
			endTime.getTime() <=
			new Date(scheduleDetails.days[currentScheduleDay].lunchTime ?? fallbackEndOfDay).getTime();

		scheduleText += `${endTimeFormatted} (${end}m ${aheadBehind ? "Early" : "Late"})`;
	} else if (currentMatch <= scheduleDetails.days[currentScheduleDay].end) {
		scheduleText = "Playing through M:" + scheduleDetails.days[currentScheduleDay].end + " @";
		goalMatch = scheduleDetails.days[currentScheduleDay].end;

		let endTime = new Date(new Date().getTime() + (goalMatch - currentMatch) * averageCycleTimeMS);
		let fallbackEndOfDay = new Date();
		fallbackEndOfDay.setHours(19, 0, 0, 0);

		// If this day's scheduled end has already passed (carry-over matches being played
		// the next morning), compare projected completion against the start of the next
		// day rather than last night's stale endTime — otherwise we'd show hundreds of
		// minutes "Late" just because the reference point is hours in the past.
		const scheduledDayEnd = new Date(scheduleDetails.days[currentScheduleDay].endTime ?? fallbackEndOfDay);
		const nextDay = scheduleDetails.days[currentScheduleDay + 1];
		const referenceTime =
			scheduledDayEnd < new Date() && nextDay
				? new Date(nextDay.date)
				: scheduledDayEnd;

		let endTimeFormatted = endTime.toLocaleTimeString().split(":").slice(0, 2).join(":");
		let end = formatTimeShortNoAgoMinutesOnly(endTime, referenceTime);

		console.log({
			endTime,
			end,
			referenceTime,
			currentMatch,
			goalMatch,
			averageCycleTimeMS,
			currentMatchTime: new Date().getTime(),
		});
		let aheadBehind = endTime.getTime() <= referenceTime.getTime();

		scheduleText += `${endTimeFormatted} (${end}m ${aheadBehind ? "Early" : "Late"})`;
	}

	return scheduleText;
}
