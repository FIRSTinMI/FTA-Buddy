import { randomUUID } from "crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { MatchEventIssueDetail, Message, Profile, ServerEvent } from "../../shared/types";
import { db } from "../db/db";
import { matchEvents, messages, notes } from "../db/schema";

/**
 * Format a single issue detail into a human-readable description.
 */
function formatIssue(d: {
	issue: string;
	start_time: number | null;
	end_time: number | null;
	duration: number | null;
}): string {
	const dur = Math.abs(d.duration ?? 0);
	const durLabel = dur >= 60 ? `${(dur / 60).toFixed(1)}m` : `${dur.toFixed(0)}s`;
	const timeRange =
		d.start_time != null && d.end_time != null ? ` (${d.start_time}s \u2192 ${d.end_time}s match time)` : "";
	return `${d.issue} for ${durLabel} total${timeRange}`;
}

const systemAuthor: Profile = { id: -1, username: "System", role: "FTA", admin: false };

/**
 * Auto-link a list of active match events to an existing note.
 * Marks the events as "converted", adds a system message to the note,
 * and emits the appropriate events for real-time client updates.
 */
export async function autoLinkEventsToNote(
	noteId: string,
	eventRows: {
		id: string;
		issue: string;
		issues: MatchEventIssueDetail[] | null;
		start_time: number | null;
		end_time: number | null;
		duration: number | null;
	}[],
	event: ServerEvent,
) {
	if (eventRows.length === 0) return;

	const eventIds = eventRows.map((e) => e.id);

	// Build summary of auto-linked issues before the transaction
	const issueDescriptions = eventRows.flatMap((e) => {
		const issueList = e.issues ?? [
			{ issue: e.issue, start_time: e.start_time, end_time: e.end_time, duration: e.duration },
		];
		return issueList.map(formatIssue);
	});
	const summaryText = `[Auto-linked] ${issueDescriptions.join(", ")}`;

	let autoMsg: typeof messages.$inferSelect | undefined;

	await db.transaction(async (tx) => {
		await tx
			.update(matchEvents)
			.set({ status: "converted", converted_note_id: noteId })
			.where(inArray(matchEvents.id, eventIds))
			.execute();

		const [msg] = await tx
			.insert(messages)
			.values({
				id: randomUUID(),
				note_id: noteId,
				author_id: -1,
				author: systemAuthor,
				text: summaryText,
				event_code: event.code,
				created_at: new Date(),
				updated_at: new Date(),
			})
			.returning();

		await tx.update(notes).set({ updated_at: new Date() }).where(eq(notes.id, noteId));

		autoMsg = msg;
	});

	if (autoMsg) {
		event.noteUpdateEmitter.emit("note_update", {
			kind: "add_message",
			note_id: noteId,
			message: autoMsg as Message,
		});
	}

	// Emit conversion events so clients remove the match events from feeds
	for (const evtId of eventIds) {
		event.matchEventEmitter.emit("convert", {
			kind: "match_event_convert",
			id: evtId,
			note_id: noteId,
		});
	}
}

/**
 * When a new match event is created, check if there's an open note for
 * the same team + match. If so, auto-link the event to that note.
 * Returns true if the event was auto-linked (and therefore should NOT
 * be emitted as a new active event to clients).
 */
export async function tryAutoLinkNewMatchEvent(
	inserted: {
		id: string;
		issue: string;
		issues: MatchEventIssueDetail[] | null;
		start_time: number | null;
		end_time: number | null;
		duration: number | null;
		team: number;
		match_number: number;
		match_id: string;
		play_number: number;
		level: string;
	},
	eventCode: string,
	serverEvent: ServerEvent,
): Promise<boolean> {
	// Find the most recently updated open TeamIssue note for this team + match (match by match_id for precision)
	const openNote = await db.query.notes.findFirst({
		where: and(
			eq(notes.event_code, eventCode),
			eq(notes.team, inserted.team),
			eq(notes.match_id, inserted.match_id),
			eq(notes.resolution_status, "Open"),
			eq(notes.note_type, "TeamIssue"),
		),
		orderBy: [desc(notes.updated_at)],
		columns: { id: true },
	});

	if (!openNote) return false;

	await autoLinkEventsToNote(openNote.id, [inserted], serverEvent);
	return true;
}
