import { eq } from "drizzle-orm";
import { EventEmitter } from "events";
import { eventCodes, events } from "..";
import { DEFAULT_MONITOR } from "../../shared/constants";
import { TeamList, EventChecklist, ScheduleDetails } from "../../shared/types";
import { db } from "../db/db";
import schema from "../db/schema";
import { getTickets } from "../router/messages";

/**
 * Get the event object from either the event token or the event code
 * 
 * @param eventToken Event Token
 * @param eventCode Event Code
 * @returns Object representing the event in memory
 */
export async function getEvent(eventToken: string, eventCode?: string) {
    let event;

    if (!eventCode) {
        eventCode = eventCodes[eventToken];
    }

    if (!eventCode) {
        event = await db.query.events.findFirst({ where: eq(schema.events.token, eventToken) });
        if (!event) {
            throw new Error('Event not found');
        }
        eventCodes[eventToken] = event.code;
        eventCode = event.code;
    }

    eventCode = eventCode.toLowerCase();

    const eventInMemory = events[eventCode];

    if (!eventInMemory) {
        if (!event) {
            if (!eventToken) {
                event = await db.query.events.findFirst({ where: eq(schema.events.code, eventCode) });
            } else {
                event = await db.query.events.findFirst({ where: eq(schema.events.token, eventToken) });
            }
        }

        if (!event) {
            throw new Error('Event not found');
        }

        events[eventCode] = {
            code: eventCode,
            token: eventToken,
            teams: event.teams as TeamList,
            checklist: event.checklist as EventChecklist,
            users: event.users as number[],
            monitorFrame: DEFAULT_MONITOR,
            history: [DEFAULT_MONITOR],
            lastMatchStart: null,
            lastMatchRefDone: null,
            lastMatchScoresPosted: null,
            fieldMonitorEmitter: new EventEmitter(),
            robotStateChangeEmitter: new EventEmitter(),
            fieldStatusEmitter: new EventEmitter(),
            checklistEmitter: new EventEmitter(),
            ticketEmitter: new EventEmitter(),
            cycleEmitter: new EventEmitter(),
            scheduleDetails: event.scheduleDetails as ScheduleDetails,
            lastPrestartDone: null,
            lastMatchEnd: null,
            teamCycleTracking: {},
            tickets: await getTickets({ eventCode }),
        };

        // Keep tickets in memory so it loads faster
        events[eventCode].ticketEmitter.on('create', async () => {
            events[eventCode].tickets = await getTickets({ eventCode });
        });
        events[eventCode].ticketEmitter.on('assign', async () => {
            events[eventCode].tickets = await getTickets({ eventCode });
        });
        events[eventCode].ticketEmitter.on('status', async () => {
            events[eventCode].tickets = await getTickets({ eventCode });
        });
        events[eventCode].ticketEmitter.on('ticketReply', async () => {
            events[eventCode].tickets = await getTickets({ eventCode });
        });
    }

    return events[eventCode];
}
