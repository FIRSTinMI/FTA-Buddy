import { TRPCError } from "@trpc/server";
import { eq, inArray } from "drizzle-orm";
import { EventEmitter } from "events";
import { TypedEmitter } from "tiny-typed-emitter";
import { eventCodes, events, newEventEmitter } from "..";
import { DEFAULT_MONITOR } from "../../shared/constants";
import {
	EventChecklist,
	NexusStatus,
	Note,
	NoteUpdateEvents,
	ScheduleDetails,
	ServerEvent,
	TeamList,
} from "../../shared/types";
import { db } from "../db/db";
import schema from "../db/schema";
import { getEventNotes } from "../router/notes";
import * as nexusPoller from "./nexusInspectionPoller";

let loadingEvents: { [key: string]: Promise<ServerEvent> } = {};

/**
 * Get the event object from either the event token or the event code
 *
 * @param eventToken Event Token
 * @param eventCode Event Code
 * @returns Object representing the event in memory
 */
export async function getEvent(eventToken: string, eventCode?: string) {
	let event: any;

	if (!eventToken && !eventCode) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Event token or code must be provided",
		});
	}

	if (!eventCode) {
		eventCode = eventCodes[eventToken];
	}

	if (!eventCode) {
		event = await db.query.events.findFirst({ where: eq(schema.events.token, eventToken) });
		if (!event) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "Event not found",
			});
		}
		eventCodes[eventToken] = event.code;
		eventCode = event.code;
	}

	eventCode = eventCode?.toLowerCase() ?? "";

	if (loadingEvents.hasOwnProperty(eventCode)) {
		return await loadingEvents[eventCode];
	}

	if (!eventToken) {
		eventToken =
			(await db.query.events
				.findFirst({ where: eq(schema.events.code, eventCode) })
				.then((event) => event?.token)) || "";
	}

	if (!eventToken) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Event not found",
		});
	}

	const noteUpdateEmitter = new TypedEmitter<NoteUpdateEvents>();

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
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Event not found",
				});
			}

			let usersToGet = event.users as number[];

			if (event.meshedEvent) {
				const subEvents = await db.query.events.findMany({
					where: inArray(schema.events.code, event.meshedEvent),
				});
				for (const subEvent of subEvents) {
					usersToGet = usersToGet.concat(subEvent.users as number[]);
				}
			}

			const users =
				event.users.length > 0
					? await db
							.select({
								id: schema.users.id,
								username: schema.users.username,
								role: schema.users.role,
								admin: schema.users.admin,
							})
							.from(schema.users)
							.where(inArray(schema.users.id, Array.from(new Set([...usersToGet]))))
					: [];

			events[eventCode] = {
				year: event.year,
				name: event.name,
				pin: event.pin,
				code: eventCode,
				token: eventToken,
				teams: event.teams as TeamList,
				checklist: event.checklist as EventChecklist,
				users: users,
				monitorFrame: DEFAULT_MONITOR,
				history: [DEFAULT_MONITOR],
				lastMatchStart: null,
				lastMatchRefDone: null,
				lastMatchScoresPosted: null,
				fieldMonitorEmitter: new EventEmitter(),
				robotStateChangeEmitter: new EventEmitter(),
				fieldStatusEmitter: new EventEmitter(),
				checklistEmitter: new EventEmitter(),
				noteUpdateEmitter: noteUpdateEmitter,
				cycleEmitter: new EventEmitter(),
				scheduleDetails: event.scheduleDetails as ScheduleDetails,
				lastPrestartDone: null,
				lastMatchEnd: null,
				robotCycleTracking: {},
				notes: (await getEventNotes(eventCode)) as Note[],
				meshedEvent: event.meshedEvent !== null,
				subEvents: event.meshedEvent ? event.meshedEvent : undefined,
				slackChannel: event.slackChannel,
				slackTeam: event.slackTeam,
				publicNoteSubmit: event.publicTicketSubmit,
				nexusApiKey: event.nexusApiKey ?? undefined,
				fmsEventPassword: event.fmsEventPassword ?? undefined,
				startDate: event.startDate ?? undefined,
				endDate: event.endDate ?? undefined,
				nexus: {
					state: event.nexusApiKey ? "polling" : "not_configured",
					intervalMinutes: 2,
					isAllInspected: false,
				} as NexusStatus,
				stats: {
					extensions: [],
					clients: [],
				},
			};

			newEventEmitter.emit("new", eventCode);

			if (event.nexusApiKey) {
				nexusPoller.startForEvent(events[eventCode]);
			}
		}

		resolve(events[eventCode]);
	});

	await loadingEvents[eventCode];
	delete loadingEvents[eventCode];
	return events[eventCode];
}

export async function getListenerCount(event_token: string) {
	const event = await getEvent(event_token);
	console.log(`Update Listener Count - ${event.noteUpdateEmitter.listenerCount("status")}`);
}
