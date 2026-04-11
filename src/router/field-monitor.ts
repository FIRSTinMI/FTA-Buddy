import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { eventLastSeen, events } from "../state";
import { bus } from "../util/eventBus";
import { redis } from "../util/redis";
import { formatTimeShortNoAgoSeconds } from "../../shared/formatTime";
import { DSState, EnableState, FieldState } from "../../shared/types";
import type { MonitorFrame, StateChange, TournamentLevel } from "../../shared/types";
import { db } from "../db/db";
import { users } from "../db/schema";
import { eventProcedure, publicProcedure, router } from "../trpc";
import {
	detectStatusChange,
	processFrameForTeamData,
	processTeamCycles,
	processTeamWarnings,
	computeOvernightOffset,
} from "../util/frame-processing";
import { getEvent } from "../util/get-event";
import { subscriptionQueue } from "../util/subscription";

export interface Post {
	type: "test";
}

export const robotInfo = z.object({
	number: z.number(),
	ds: z.nativeEnum(DSState),
	radio: z.boolean(),
	rio: z.boolean(),
	code: z.boolean(),
	bwu: z.number(),
	battery: z.number(),
	ping: z.number(),
	packets: z.number(),
	MAC: z.string().nullable(),
	RX: z.number().nullable(),
	RXMCS: z.number().nullable(),
	TX: z.number().nullable(),
	TXMCS: z.number().nullable(),
	SNR: z.number().nullable(),
	noise: z.number().nullable(),
	signal: z.number().nullable(),
	versionmm: z.boolean(),
	enabled: z.nativeEnum(EnableState),
	radioConnected: z.boolean().nullable(),
	radioConnectionQuality: z.enum(["Warning", "Caution", "Good", "Excellent"]).nullable(),
});

export const fieldMonitorRouter = router({
	// Uploading a monitor frame
	post: publicProcedure
		.input(
			z.object({
				eventToken: z.string().optional(),
				eventCode: z.string().optional(),
				field: z.nativeEnum(FieldState),
				match: z.number(),
				play: z.number(),
				level: z.enum(["None", "Practice", "Qualification", "Playoff"]),
				time: z.string(),
				version: z.string(),
				frameTime: z.number(),
				lastCycleTime: z.string(),
				red1: robotInfo,
				red2: robotInfo,
				red3: robotInfo,
				blue1: robotInfo,
				blue2: robotInfo,
				blue3: robotInfo,
				extensionId: z.string().optional(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			if (!input.eventToken && !input.eventCode) {
				throw new Error("Event token or code required");
			}

			const event = await getEvent(input.eventToken || "", input.eventCode);

			let extensionId = input.extensionId || ctx.extensionId;
			if (extensionId) {
				let connection = event.stats.extensions.find((e) => e.id === extensionId);
				if (!connection) {
					connection = {
						id: extensionId,
						connected: new Date(),
						userAgent: ctx.userAgent,
						ip: ctx.ip,
						lastFrame: new Date(),
						frames: 0,
						checklistUpdates: 0,
					};
					// Cap to 100 entries so a spoofed stream of unique IDs can't grow this unboundedly
					if (event.stats.extensions.length >= 100) event.stats.extensions.shift();
					event.stats.extensions.push(connection);
				}

				connection.lastFrame = new Date();
				connection.frames++;
			}

			// Infer level from schedule when scraping mode reports "None" - match 999 is always a test match
			if (input.level === "None" && input.match > 0 && input.match !== 999) {
				const scheduledMatch = event.scheduleDetails?.matches?.find((m) => m.match === input.match);
				if (scheduledMatch) (input as any).level = scheduledMatch.level;
			}

			// Detects raising and falling edges
			const processed = detectStatusChange(input, event.monitorFrame);

			// Add emoji warnings
			processed.currentFrame = await processTeamWarnings(event.code, processed.currentFrame, event.monitorFrame);

			if (event.monitorFrame.field !== processed.currentFrame.field) {
				if (processed.currentFrame.field === FieldState.PRESTART_COMPLETED) {
					event.lastPrestartDone = new Date();
				} else if (processed.currentFrame.field === FieldState.MATCH_RUNNING_AUTO) {
					event.lastMatchStart = new Date();

					let exactAheadBehind = undefined;
					if (event.scheduleDetails.matches) {
						processed.currentFrame.matchScheduledStartTime = event.scheduleDetails.matches.find(
							(m) => m.match === processed.currentFrame.match && m.level === processed.currentFrame.level,
						)?.scheduledStartTime;
						if (processed.currentFrame.matchScheduledStartTime !== undefined) {
							if (typeof processed.currentFrame.matchScheduledStartTime === "string") {
								processed.currentFrame.matchScheduledStartTime = new Date(
									processed.currentFrame.matchScheduledStartTime,
								);
							}
							let timeDelta =
								processed.currentFrame.matchScheduledStartTime.getTime() -
								event.lastMatchStart.getTime();
							timeDelta += computeOvernightOffset(
								processed.currentFrame.matchScheduledStartTime,
								event.lastMatchStart,
								event.scheduleDetails,
							);
							exactAheadBehind =
								formatTimeShortNoAgoSeconds(timeDelta) + (timeDelta >= 0 ? " ahead" : " behind");
						}
					}
					processed.currentFrame.exactAheadBehind = exactAheadBehind;
				} else if (processed.currentFrame.field === FieldState.MATCH_OVER) {
					event.lastMatchEnd = new Date();
				} else if (event.monitorFrame.field === FieldState.READY_FOR_POST_RESULT) {
					event.lastMatchScoresPosted = new Date();
				}

				bus.publish(`event:${event.code}:field_status`, processed.currentFrame.field);
			}

			if (!processed.currentFrame.exactAheadBehind && processed.currentFrame.level === "Qualification")
				processed.currentFrame.exactAheadBehind = event.monitorFrame.exactAheadBehind;

			// Scraper sources always send lastCycleTime: "" - preserve the existing value so
			// the server-computed cycle time (set by postCycleTime) is not overwritten.
			if (!processed.currentFrame.lastCycleTime) {
				processed.currentFrame.lastCycleTime = event.monitorFrame.lastCycleTime;
			}

			event.monitorFrame = processed.currentFrame;
			eventLastSeen[event.code] = new Date();

			event.history.push(processed.currentFrame);
			if (event.history.length > 50) event.history.shift();

			bus.publish(`event:${event.code}:frame`, event.monitorFrame);
			// Pipeline the four Redis writes so trim/expire always follow the push atomically
			redis
				.multi()
				.set(`ftabuddy:event:${event.code}:monitor_frame`, JSON.stringify(event.monitorFrame))
				.lpush(`ftabuddy:event:${event.code}:history`, JSON.stringify(event.monitorFrame))
				.ltrim(`ftabuddy:event:${event.code}:history`, 0, 49)
				.expire(`ftabuddy:event:${event.code}:history`, 86400)
				.exec()
				.catch((err) => console.error(`[Redis] Frame pipeline failed for ${event.code}:`, err));

			for (const change of processed.changes) {
				bus.publish(`event:${event.code}:robot_state`, change);
			}

			const checklist = await processFrameForTeamData(event.code, processed.currentFrame, processed.changes);
			if (checklist) {
				bus.publish(`event:${event.code}:checklist`, checklist);
			}

			processTeamCycles(event.code, processed.currentFrame, processed.changes);

			return;
		}),

	history: eventProcedure.query(async ({ ctx }) => {
		const event = await getEvent(ctx.eventToken ?? "");
		const items = await redis.lrange(`ftabuddy:event:${event.code}:history`, 0, 49);
		if (items.length > 0) {
			const parsed = items.flatMap((i: string) => { try { return [JSON.parse(i)]; } catch { return []; } });
			if (parsed.length > 0) return parsed.reverse();
		}
		return event.history;
	}),

	robots: publicProcedure
		.input(
			z.object({
				eventToken: z.string(),
			}),
		)
		.subscription(async function* ({ input, signal }) {
			const event = await getEvent(input.eventToken);
			console.log("robots subscription", event.code);
			const { push, drain } = subscriptionQueue<MonitorFrame>(signal!);
			const unsub = bus.subscribe(`event:${event.code}:frame`, (data) => push(data as MonitorFrame));
			try { yield* drain(); }
			finally { unsub(); }
		}),

	robotStatus: publicProcedure
		.input(
			z.object({
				eventToken: z.string(),
			}),
		)
		.subscription(async function* ({ input, signal }) {
			const event = await getEvent(input.eventToken);
			console.log("robot status subscription", event.code);
			const { push, drain } = subscriptionQueue<StateChange>(signal!);
			const unsub = bus.subscribe(`event:${event.code}:robot_state`, (data) => push(data as StateChange));
			try { yield* drain(); }
			finally { unsub(); }
		}),

	fieldStatus: publicProcedure
		.input(
			z.object({
				eventToken: z.string(),
			}),
		)
		.subscription(async function* ({ input, signal }) {
			const event = await getEvent(input.eventToken);
			console.log("field status subscription", event.code);
			const { push, drain } = subscriptionQueue<FieldState>(signal!);
			const unsub = bus.subscribe(`event:${event.code}:field_status`, (data) => push(data as FieldState));
			try { yield* drain(); }
			finally { unsub(); }
		}),

	combinedSubscription: publicProcedure
		.input(
			z.object({
				eventToken: z.string(),
			}),
		)
		.subscription(async function* ({ input, signal }) {
			const event = await getEvent(input.eventToken);
			console.log("combined subscription", event.code);
			const { push, drain } = subscriptionQueue<MonitorFrame | StateChange | FieldState>(signal!);
			const unsubFrame = bus.subscribe(`event:${event.code}:frame`, (data) => push(data as MonitorFrame));
			const unsubRobot = bus.subscribe(`event:${event.code}:robot_state`, (data) => push(data as StateChange));
			const unsubField = bus.subscribe(`event:${event.code}:field_status`, (data) => push(data as FieldState));
			// Seed with current frame from Redis for late joiners
			const stored = await redis.get(`ftabuddy:event:${event.code}:monitor_frame`);
			if (stored) push(JSON.parse(stored) as MonitorFrame);
			try { yield* drain(); }
			finally { unsubFrame(); unsubRobot(); unsubField(); }
		}),

	management: publicProcedure
		.input(
			z.object({
				token: z.string(),
			}),
		)
		.subscription(async function* ({ input, signal }) {
			const user = await db.query.users.findFirst({
				where: and(eq(users.token, input.token), gt(users.id, -1), eq(users.admin, true)),
			});
			if (!user) throw new Error("Unauthorized");

			const { push, drain } = subscriptionQueue<EventState>(signal!);
			const cleanups: Array<() => void> = [];

			const addNewEvent = async (eventCode: string) => {
				console.log("new event", eventCode);
				let event = events[eventCode];
				// If this instance hasn't loaded the event yet (e.g. it was created on another
				// instance), load it now so we can push current state and wire the subscription.
				if (!event) {
					try { event = await getEvent("", eventCode); } catch { return; }
				}
				const unsub = bus.subscribe(`event:${eventCode}:frame`, (data) => {
					const frame = data as MonitorFrame;
					push({
						code: event.code,
						name: event.name,
						token: event.token,
						pin: event.pin,
						field: frame.field,
						match: frame.match,
						level: frame.level,
						aheadBehind: frame.time,
						exactAheadBehind: frame.exactAheadBehind,
						clients: event.stats.clients,
						extensions: event.stats.extensions,
					});
				});
				cleanups.push(unsub);
				push({
					code: event.code,
					name: event.name,
					token: event.token,
					pin: event.pin,
					field: event.monitorFrame.field,
					match: event.monitorFrame.match,
					level: event.monitorFrame.level,
					aheadBehind: event.monitorFrame.time,
					exactAheadBehind: event.monitorFrame.exactAheadBehind,
					clients: event.stats.clients,
					extensions: event.stats.extensions,
				});
			};

			for (const eventCode of Object.keys(events)) {
				addNewEvent(eventCode);
			}

			const unsubNew = bus.subscribe("global:new_event", (data) => addNewEvent(data as string));
			cleanups.push(unsubNew);

			try { yield* drain(); }
			finally { for (const cleanup of cleanups) cleanup(); }
		}),
});

export interface EventState {
	code: string;
	name: string;
	token: string;
	pin: string;
	field: FieldState;
	match: number;
	level: TournamentLevel;
	aheadBehind: string;
	exactAheadBehind?: string;
	clients: {
		userAgent?: string;
		ip?: string;
		id: string;
		connected: Date;
	}[];
	extensions: {
		id: string;
		connected: Date;
		userAgent?: string;
		ip?: string;
		lastFrame: Date;
		frames: number;
		checklistUpdates: number;
	}[];
}
