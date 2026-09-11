import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../../../db/db";
import { messages, notes } from "../../../db/schema";
import { messageWords } from "./keywords";
import type { RetrievedDoc } from "./types";

// Live tickets from the user's current event. Unlike the corpus, these keep team numbers and names:
// the person asking is at the event helping that team, so the detail is theirs to see.

const APP_ORIGIN = process.env.SLACK_USER_RETURN_URL?.replace(/\/$/, "") ?? "https://ftabuddy.com";
const MAX_NOTES = 60;

/** The most relevant tickets from `eventCode` for this query, scored by keyword overlap. */
export async function searchEventTickets(eventCode: string, query: string, limit = 3): Promise<RetrievedDoc[]> {
	const rows = await db
		.select({ id: notes.id, text: notes.text, team: notes.team, issue: notes.issue_type })
		.from(notes)
		.where(and(eq(notes.event_code, eventCode), eq(notes.note_type, "TeamIssue")))
		.orderBy(desc(notes.created_at))
		.limit(MAX_NOTES);
	if (rows.length === 0) return [];

	const ids = rows.map((r) => r.id);
	const replies = await db
		.select({ note_id: messages.note_id, text: messages.text })
		.from(messages)
		.where(inArray(messages.note_id, ids));
	const repliesByNote = new Map<string, string[]>();
	for (const r of replies) {
		const list = repliesByNote.get(r.note_id) ?? [];
		list.push(r.text);
		repliesByNote.set(r.note_id, list);
	}

	const terms = new Set(messageWords(query));
	const scored = rows
		.map((r) => {
			const replyText = repliesByNote.get(r.id) ?? [];
			const blob = [r.text, ...replyText].join(" ").toLowerCase();
			let score = 0;
			for (const t of terms) if (blob.includes(t)) score++;
			return { r, replyText, score };
		})
		.filter((x) => x.score > 0)
		.sort((a, b) => b.score - a.score)
		.slice(0, limit);

	return scored.map(({ r, replyText }) => {
		const head = [r.issue, r.team ? `team ${r.team}` : null].filter(Boolean).join(", ");
		const body = [r.text, ...replyText.map((t) => `Reply: ${t}`)].join("\n");
		return {
			id: r.id,
			source: "event_ticket" as const,
			url: `${APP_ORIGIN}/notepad/view/${r.id}`,
			title: head || "ticket",
			body,
		};
	});
}
