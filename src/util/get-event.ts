import { eq } from "drizzle-orm";
import { EventEmitter } from "events";
import { TypedEmitter } from 'tiny-typed-emitter';
import { eventCodes, events } from "..";
import { DEFAULT_MONITOR } from "../../shared/constants";
import { TeamList, EventChecklist, ScheduleDetails, ServerEvent, Profile, TicketEvents, NoteEvents, Ticket, Note } from "../../shared/types";
import { db } from "../db/db";
import schema from "../db/schema";
import { getEventTickets } from "../router/tickets";
import { getEventNotes } from "../router/notes";
import { getEventMessages } from "../router/messages";


let loadingEvents: { [key: string]: Promise<ServerEvent>; } = {};


/**
 * Get the event object from either the event token or the event code
 * 
 * @param eventToken Event Token
 * @param eventCode Event Code
 * @returns Object representing the event in memory
 */
export async function getEvent(eventToken: string, eventCode?: string) {
    let event: any;

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

    eventCode = eventCode?.toLowerCase() ?? "";

    if (loadingEvents.hasOwnProperty(eventCode)) {
        return await loadingEvents[eventCode];
    }

    const ticketUpdateEmitter = new TypedEmitter<TicketEvents>();

    loadingEvents[eventCode] = new Promise(async (resolve) => {
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
                year: event.year,
                code: eventCode,
                token: eventToken,
                teams: event.teams as TeamList,
                checklist: event.checklist as EventChecklist,
                users: event.users as Profile[],
                monitorFrame: DEFAULT_MONITOR,
                history: [DEFAULT_MONITOR],
                lastMatchStart: null,
                lastMatchRefDone: null,
                lastMatchScoresPosted: null,
                fieldMonitorEmitter: new EventEmitter(),
                robotStateChangeEmitter: new EventEmitter(),
                fieldStatusEmitter: new EventEmitter(),
                checklistEmitter: new EventEmitter(),
                ticketUpdateEmitter: ticketUpdateEmitter,
                //ticketPushEmitter: new TypedEmitter(),
                //notePushEmitter: new TypedEmitter(),
                cycleEmitter: new EventEmitter(),
                scheduleDetails: event.scheduleDetails as ScheduleDetails,
                lastPrestartDone: null,
                lastMatchEnd: null,
                robotCycleTracking: {},
                tickets: await getEventTickets( eventCode ) as Ticket[],
                notes: await getEventNotes( eventCode ) as Note[],
            };

            //console.log('Event loaded into memory: ', eventCode);
        }

        resolve(events[eventCode]);
    });

    await loadingEvents[eventCode];
    delete loadingEvents[eventCode];
    return events[eventCode];
}
