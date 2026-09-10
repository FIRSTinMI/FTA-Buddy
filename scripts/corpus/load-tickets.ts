// Resolved CSA tickets with at least one reply -> source "ticket", one chunk per note.
// Only text, issue type and timestamps are read. team, event_code, author ids and display
// names are never selected, so they cannot reach the corpus even before redaction.

import "dotenv/config";
import { asc, eq, inArray } from "drizzle-orm";
import { connect, db } from "../../src/db/db";
import { messages, notes, type TroubleshootChunkInsert } from "../../src/db/schema";
import { upsertChunks } from "../../src/util/troubleshoot/chunks";

const BATCH = 500;

export async function loadTickets(): Promise<TroubleshootChunkInsert[]> {
	const resolved = await db
		.select({ id: notes.id, text: notes.text, issue_type: notes.issue_type, created_at: notes.created_at })
		.from(notes)
		.where(eq(notes.resolution_status, "Resolved"))
		.orderBy(asc(notes.created_at));
	const out: TroubleshootChunkInsert[] = [];
	for (let i = 0; i < resolved.length; i += BATCH) {
		const batch = resolved.slice(i, i + BATCH);
		const replies = await db
			.select({ note_id: messages.note_id, text: messages.text, created_at: messages.created_at })
			.from(messages)
			.where(inArray(messages.note_id, batch.map((n) => n.id)))
			.orderBy(asc(messages.created_at));
		const byNote = new Map<string, string[]>();
		for (const r of replies) {
			const t = r.text.trim();
			if (!t) continue;
			byNote.set(r.note_id, [...(byNote.get(r.note_id) ?? []), t]);
		}
		for (const n of batch) {
			const thread = byNote.get(n.id);
			if (!thread?.length) continue; // no reply = nothing learned
			const text = n.text.trim();
			if (!text) continue;
			const firstLine = text.replace(/\s+/g, " ").slice(0, 80);
			out.push({
				source: "ticket",
				source_key: `ticket:${n.id}`,
				url: null,
				title: `${n.issue_type ?? "Other"}: ${firstLine}`,
				heading: null,
				body: [text, ...thread.map((t) => `Reply: ${t}`)].join("\n"),
				source_date: n.created_at,
			});
		}
	}
	return out;
}

async function main() {
	await connect();
	const rows = await loadTickets();
	const written = await upsertChunks(rows);
	console.log(`[tickets] ${rows.length} resolved tickets with replies, ${written} written`);
	process.exit(0);
}

if (require.main === module) main().catch((e) => {
	console.error("[tickets] failed:", e);
	process.exit(1);
});
