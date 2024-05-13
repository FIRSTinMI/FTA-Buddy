import { eq } from "drizzle-orm";
import { EventChecklist, GREEN, MonitorFrame, StatusChanges } from "../shared/types";
import { db } from "./db/db";
import { events } from "./db/schema";

export async function processFrameForTeamData(eventCode: string, frame: MonitorFrame, changes: StatusChanges) {
    const event = await db.query.events.findFirst({ where: eq(events.code, eventCode) })

    if (!event) return console.error('Tried processing frame for event that\'s not in the database ' + eventCode);
    const checklist = event.checklist as EventChecklist;
    let changed = false;

    // Automatically check off connection test and prereqs for teams that have a connected radio
    for (let team of [frame.blue1, frame.blue2, frame.blue3, frame.red1, frame.red2, frame.red3]) {
        if (team.radio == GREEN) {
            changed = true;
            checklist[team.number].present = true;
            checklist[team.number].radioProgrammed = true;
            checklist[team.number].connectionTested = true;
        }
    }

    if (changed) {
        await db.update(events).set({ checklist }).where(eq(events.code, eventCode));
    }
}
