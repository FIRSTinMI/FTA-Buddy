import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import type { Note } from "../../shared/types";
import { db } from "../db/db";
import { notes } from "../db/schema";

export async function getEventNotes(event_code: string) {
	const eventNotes = await db.query.notes.findMany({
		where: eq(notes.event_code, event_code),
		orderBy: [desc(notes.team)],
	});
	if (!eventNotes) throw new TRPCError({ code: "NOT_FOUND", message: "Unable to find notes for this event" });
	return eventNotes.map((n) => ({ ...n, followers: [] as number[] })) as Note[];
}
