import { TRPCError } from "@trpc/server";
import { eq, inArray } from "drizzle-orm";
import { eventCodes, eventLastSeen, events } from "../state";
import type {
	EventAutoEventSettings,
	NexusStatus,
	Note,
	ScheduleDetails,
	ServerEvent,
} from "../../shared/types";
import { bus } from "./eventBus";
import { getChecklist } from "./event-state";
import { db } from "../db/db";
import schema from "../db/schema";
import { getEventNotes } from "../router/notes";
import * as nexusPoller from "./nexusInspectionPoller";

let loadingEvents: { [key: string]: Promise<ServerEvent> } = {};

/** Bus unsubscribe functions keyed by event code - called during event eviction. */
const eventBusCleanups = new Map<string, Array<() => void>>();

export function cleanupEventSubscriptions(eventCode: string): void {
	const fns = eventBusCleanups.get(eventCode);
	if (fns) {
		for (const fn of fns) fn();
		eventBusCleanups.delete(eventCode);
	}
}

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

			const eventCodesToQuery = [eventCode];
			if (event.meshedEvent) {
				for (const sub of event.meshedEvent as Array<{ code: string }>) {
					eventCodesToQuery.push(sub.code);
				}
			}

			const userRows = await db
				.selectDistinct({
					id: schema.users.id,
					username: schema.users.username,
					role: schema.users.role,
					admin: schema.users.admin,
				})
				.from(schema.users)
				.innerJoin(schema.eventUsers, eq(schema.users.id, schema.eventUsers.user_id))
				.where(inArray(schema.eventUsers.event_code, eventCodesToQuery));

			const users = userRows;

			events[eventCode] = {
				year: event.year,
				name: event.name,
				pin: event.pin,
				code: eventCode,
				token: eventToken,
				users: users,
				scheduleDetails: event.scheduleDetails as ScheduleDetails,
				robotCycleTracking: {},
				notes: (await getEventNotes(eventCode)) as Note[],
				meshedEvent: event.meshedEvent !== null,
				notepadOnly: event.notepadOnly ?? false,
				playoffMode: event.playoffMode ?? false,
				subEvents: event.meshedEvent ? event.meshedEvent : undefined,
				slackChannel: event.slackChannel,
				slackTeam: event.slackTeam,
				publicNoteSubmit: event.publicTicketSubmit,
				nexusApiKey: event.nexusApiKey ?? undefined,
				fmsEventPassword: event.fmsEventPassword ?? undefined,
				autoEventSettings: (event.autoEventSettings ?? {}) as EventAutoEventSettings,
				startDate: event.startDate ?? undefined,
				endDate: event.endDate ?? undefined,
				timezone: event.timezone ?? undefined,
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

			eventLastSeen[eventCode] = new Date();
			bus.publish("global:new_event", eventCode);

			// Warm the Redis checklist cache so frame processing has it immediately.
			getChecklist(eventCode).catch((err) =>
				console.warn(`[getEvent] Failed to warm checklist cache for ${eventCode}:`, err),
			);

			// Keep playoffMode in sync across instances; track unsub for cleanup on eviction
			const playoffUnsub = bus.subscribe(`event:${eventCode}:playoff_mode`, (data) => {
				if (events[eventCode]) events[eventCode].playoffMode = data as boolean;
			});
			// Keep notepadOnly in sync across instances
			const notepadUnsub = bus.subscribe(`event:${eventCode}:notepad_only`, (data) => {
				if (events[eventCode]) events[eventCode].notepadOnly = data as boolean;
			});
			const cleanups = eventBusCleanups.get(eventCode) ?? [];
			cleanups.push(playoffUnsub, notepadUnsub);
			eventBusCleanups.set(eventCode, cleanups);

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
