import type { ScheduleDetails } from "../../../shared/types";
import { formatTimeShortNoAgoMinutesOnly } from "./formatTime";

let currentScheduleDay = 0;

export function updateScheduleText(currentMatch: number, scheduleDetails: ScheduleDetails | undefined, level: string, averageCycleTimeMS: number) {
    if (!scheduleDetails || !scheduleDetails.days) return "";
    let scheduleText = "";

    if (level !== "Qualification") {
        return "";
    }

    for (let i = 0; i < scheduleDetails.days.length; i++) {
        const day = scheduleDetails.days[i];
        if (currentMatch <= day.end) {
            currentScheduleDay = i;
            break;
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

        let endTimeFormatted = endTime.toLocaleTimeString().split(':').slice(0, 2).join(':');
        let end = formatTimeShortNoAgoMinutesOnly(endTime, new Date(scheduleDetails.days[currentScheduleDay].lunchTime ?? fallbackEndOfDay));

        console.log({ endTime, end, fallbackEndOfDay, currentMatch, goalMatch, averageCycleTimeMS, currentMatchTime: new Date().getTime() });
        let aheadBehind = endTime.getTime() <= new Date(scheduleDetails.days[currentScheduleDay].lunchTime ?? fallbackEndOfDay).getTime();

        scheduleText += `${endTimeFormatted} (${end}m ${aheadBehind ? "Early" : "Late"})`;
    } else if (currentMatch <= scheduleDetails.days[currentScheduleDay].end) {
        scheduleText = "Playing through M:" + scheduleDetails.days[currentScheduleDay].end + " @";
        goalMatch = scheduleDetails.days[currentScheduleDay].end;

        let endTime = new Date(new Date().getTime() + (goalMatch - currentMatch) * averageCycleTimeMS);
        let fallbackEndOfDay = new Date();
        fallbackEndOfDay.setHours(19, 0, 0, 0);

        let endTimeFormatted = endTime.toLocaleTimeString().split(':').slice(0, 2).join(':');
        let end = formatTimeShortNoAgoMinutesOnly(endTime, new Date(scheduleDetails.days[currentScheduleDay].endTime ?? fallbackEndOfDay));

        console.log({ endTime, end, fallbackEndOfDay, currentMatch, goalMatch, averageCycleTimeMS, currentMatchTime: new Date().getTime() });
        let aheadBehind = endTime.getTime() <= new Date(scheduleDetails.days[currentScheduleDay].endTime ?? fallbackEndOfDay).getTime();

        scheduleText += `${endTimeFormatted} (${end}m ${aheadBehind ? "Early" : "Late"})`;
    }

    return scheduleText;
}