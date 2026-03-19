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

	// Determine which schedule day we're on using the schedule's own absolute
	// timestamps.  Each day's `date` is the scheduled start time of the first
	// match on that day (a UTC instant stored by the extension).  We pick the
	// latest day whose scheduled start is <= now.  This is completely timezone-
	// agnostic - it works correctly whether the viewer is at the venue, across
	// the country, or the event runs past midnight UTC.
	//
	// Examples:
	//   Day 0 starts 15:00 UTC Mar 13, Day 1 starts 13:30 UTC Mar 14.
	//   • 00:30 UTC Mar 14 (event running late, still on Day 1 matches):
	//     now < Day 1 start → stays on Day 0 ✓
	//   • 14:00 UTC Mar 14 (Day 2 session underway):
	//     now >= Day 1 start → advances to Day 1 ✓
	{
		const now = new Date().getTime();
		currentScheduleDay = 0;
		for (let i = 0; i < scheduleDetails.days.length; i++) {
			if (new Date(scheduleDetails.days[i].date).getTime() <= now) {
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

		// Always compare against this day's scheduled end time.  If the event is
		// running late past that point, the projection will be after it and will
		// correctly display "Xm Late".  Swapping the reference to the next day's
		// start when the scheduled end has passed produces wildly wrong "Early"
		// readings (e.g. 765m Early when actually 57m Late).
		const referenceTime = new Date(scheduleDetails.days[currentScheduleDay].endTime ?? fallbackEndOfDay);

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
