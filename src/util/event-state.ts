import SuperJSON from "superjson";
import { eq } from "drizzle-orm";
import { redis } from "./redis";
import { db } from "../db/db";
import schema from "../db/schema";
import { DEFAULT_MONITOR } from "../../shared/constants";
import type { EventChecklist, EventCycleTracking, EventTiming, MonitorFrame } from "../../shared/types";

const CHECKLIST_TTL = 86400 * 7; // 7 days
const TIMING_TTL = 86400 * 3; // 3 days

export async function getMonitorFrame(eventCode: string): Promise<MonitorFrame> {
	const stored = await redis.get(`ftabuddy:event:${eventCode}:monitor_frame`);
	return stored ? SuperJSON.parse<MonitorFrame>(stored) : { ...DEFAULT_MONITOR };
}

export async function getTiming(eventCode: string): Promise<EventTiming> {
	const stored = await redis.get(`ftabuddy:event:${eventCode}:timing`);
	if (stored) return SuperJSON.parse<EventTiming>(stored);
	return {
		lastPrestartDone: null,
		lastMatchStart: null,
		lastMatchEnd: null,
		lastMatchRefDone: null,
		lastMatchScoresPosted: null,
	};
}

export function setTiming(eventCode: string, timing: EventTiming): void {
	redis
		.set(`ftabuddy:event:${eventCode}:timing`, SuperJSON.stringify(timing), "EX", TIMING_TTL)
		.catch((err) => console.error(`[EventState] setTiming failed for ${eventCode}:`, err));
}

/** Read checklist from Redis; falls back to Postgres and warms Redis if missing. */
export async function getChecklist(eventCode: string): Promise<EventChecklist> {
	const stored = await redis.get(`ftabuddy:event:${eventCode}:checklist`);
	if (stored) return SuperJSON.parse<EventChecklist>(stored);

	const rows = await db.select().from(schema.checklist).where(eq(schema.checklist.eventCode, eventCode));

	const cl: EventChecklist = {};
	for (const row of rows) {
		cl[row.teamNumber] = {
			present: row.present,
			inspected: row.inspected,
			radioProgrammed: row.radioProgrammed,
			connectionTested: row.connectionTested,
		};
	}

	if (rows.length > 0) {
		redis
			.set(`ftabuddy:event:${eventCode}:checklist`, SuperJSON.stringify(cl), "EX", CHECKLIST_TTL)
			.catch(() => {});
	}

	return cl;
}

/** Write checklist to Redis (and Postgres upserts are done by the caller). */
export function setChecklist(eventCode: string, checklist: EventChecklist): void {
	redis
		.set(`ftabuddy:event:${eventCode}:checklist`, SuperJSON.stringify(checklist), "EX", CHECKLIST_TTL)
		.catch((err) => console.error(`[EventState] setChecklist failed for ${eventCode}:`, err));
}

const CYCLE_TTL = 86400 * 3; // 3 days

export async function getCycleTracking(eventCode: string): Promise<EventCycleTracking> {
	const stored = await redis.get(`ftabuddy:event:${eventCode}:cycle_tracking`);
	return stored ? SuperJSON.parse<EventCycleTracking>(stored) : {};
}

export function setCycleTracking(eventCode: string, tracking: EventCycleTracking): void {
	redis
		.set(`ftabuddy:event:${eventCode}:cycle_tracking`, SuperJSON.stringify(tracking), "EX", CYCLE_TTL)
		.catch((err) => console.error(`[EventState] setCycleTracking failed for ${eventCode}:`, err));
}

/** Upsert a team into the global teams table. */
export async function upsertTeam(number: string, name: string): Promise<void> {
	await db
		.insert(schema.teams)
		.values({ number, name })
		.onConflictDoUpdate({ target: schema.teams.number, set: { name } });
}
