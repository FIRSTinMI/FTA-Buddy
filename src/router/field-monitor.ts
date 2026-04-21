import { and, eq, gt } from "drizzle-orm";
import SuperJSON from "superjson";
import { z } from "zod";
import { eventLastSeen, events } from "../state";
import { bus } from "../util/eventBus";
import { redis } from "../util/redis";
import { formatTimeShortNoAgoSeconds } from "../../shared/formatTime";
import { DSState, EnableState, FieldState } from "../../shared/types";
import type { EventTiming, MonitorFrame, StateChange, TournamentLevel } from "../../shared/types";
import { DEFAULT_MONITOR } from "../../shared/constants";
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
import { getMonitorFrame, getTiming, setTiming } from "../util/event-state";
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

			// Read previous frame and timing from Redis (single source of truth across instances)
			const [prevFrame, timing] = await Promise.all([getMonitorFrame(event.code), getTiming(event.code)]);

			// Infer level from schedule when scraping mode reports "None" - match 999 is always a test match
			if (input.level === "None" && input.match > 0 && input.match !== 999) {
				const scheduledMatch = event.scheduleDetails?.matches?.find((m) => m.match === input.match);
				if (scheduledMatch) {
					(input as any).level = scheduledMatch.level;
				} else if (prevFrame.level !== "None") {
					// Preserve current level when scraper reports transient "None"
					(input as any).level = prevFrame.level;
				}
			}

			// Detects raising and falling edges
			const processed = detectStatusChange(input, prevFrame);

			// Preserve lastCycleTime BEFORE the async gap in processTeamWarnings.
			if (!processed.currentFrame.lastCycleTime || processed.currentFrame.lastCycleTime === "unk") {
				processed.currentFrame.lastCycleTime = prevFrame.lastCycleTime;
			}

			// Add emoji warnings
			processed.currentFrame = await processTeamWarnings(event.code, processed.currentFrame, prevFrame);

			const prevField = prevFrame.field;
			const fieldChanged = prevField !== processed.currentFrame.field;
			let timingChanged = false;

			if (fieldChanged) {
				if (processed.currentFrame.field === FieldState.PRESTART_COMPLETED) {
					timing.lastPrestartDone = new Date();
					timingChanged = true;
				} else if (processed.currentFrame.field === FieldState.MATCH_RUNNING_AUTO) {
					timing.lastMatchStart = new Date();
					timingChanged = true;

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
								timing.lastMatchStart.getTime();
							timeDelta += computeOvernightOffset(
								processed.currentFrame.matchScheduledStartTime,
								timing.lastMatchStart,
								event.scheduleDetails,
							);
							exactAheadBehind =
								formatTimeShortNoAgoSeconds(timeDelta) + (timeDelta >= 0 ? " ahead" : " behind");
						}
					}
					processed.currentFrame.exactAheadBehind = exactAheadBehind;
				} else if (processed.currentFrame.field === FieldState.MATCH_OVER) {
					timing.lastMatchEnd = new Date();
					timingChanged = true;
				} else if (prevField === FieldState.READY_FOR_POST_RESULT) {
					timing.lastMatchScoresPosted = new Date();
					timingChanged = true;
				}
			}

			if (!processed.currentFrame.exactAheadBehind && processed.currentFrame.level === "Qualification")
				processed.currentFrame.exactAheadBehind = prevFrame.exactAheadBehind;

			if (fieldChanged) {
				bus.publish(`event:${event.code}:field_status`, processed.currentFrame.field);
			}
			if (timingChanged) {
				setTiming(event.code, timing);
				bus.publish(`event:${event.code}:timing`, timing);
			}
			eventLastSeen[event.code] = new Date();

			bus.publish(`event:${event.code}:frame`, processed.currentFrame);
			// Pipeline the four Redis writes so trim/expire always follow the push atomically
			redis
				.multi()
				.set(`ftabuddy:event:${event.code}:monitor_frame`, SuperJSON.stringify(processed.currentFrame))
				.lpush(`ftabuddy:event:${event.code}:history`, SuperJSON.stringify(processed.currentFrame))
				.ltrim(`ftabuddy:event:${event.code}:history`, 0, 49)
				.expire(`ftabuddy:event:${event.code}:history`, 86400)
				.exec()
				.catch((err) => console.error(`[Redis] Frame pipeline failed for ${event.code}:`, err));

			for (const change of processed.changes) {
				bus.publish(`event:${event.code}:robot_state`, change);
			}

			const updatedChecklist = await processFrameForTeamData(
				event.code,
				processed.currentFrame,
				processed.changes,
			);
			if (updatedChecklist) {
				bus.publish(`event:${event.code}:checklist`, updatedChecklist);
			}

			processTeamCycles(event.code, processed.currentFrame, processed.changes, timing.lastPrestartDone);

			return;
		}),

	history: eventProcedure.query(async ({ ctx }) => {
		const items = await redis.lrange(`ftabuddy:event:${ctx.event.code}:history`, 0, 49);
		if (items.length > 0) {
			const parsed = items.flatMap((i: string) => {
				try {
					return [SuperJSON.parse<MonitorFrame>(i)];
				} catch {
					return [];
				}
			});
			if (parsed.length > 0) return parsed.reverse();
		}
		return [];
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
			try {
				yield* drain();
			} finally {
				unsub();
			}
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
			try {
				yield* drain();
			} finally {
				unsub();
			}
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
			try {
				yield* drain();
			} finally {
				unsub();
			}
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
			if (stored) push(SuperJSON.parse<MonitorFrame>(stored));
			try {
				yield* drain();
			} finally {
				unsubFrame();
				unsubRobot();
				unsubField();
			}
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
					try {
						event = await getEvent("", eventCode);
					} catch {
						return;
					}
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
				const frame = await getMonitorFrame(event.code);
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
			};

			for (const eventCode of Object.keys(events)) {
				addNewEvent(eventCode);
			}

			const unsubNew = bus.subscribe("global:new_event", (data) => addNewEvent(data as string));
			cleanups.push(unsubNew);

			try {
				yield* drain();
			} finally {
				for (const cleanup of cleanups) cleanup();
			}
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
