import { desc, eq, sql } from "drizzle-orm";
import { db } from "../../db/db";
import { troubleshootChunks, type TroubleshootChunk, type TroubleshootChunkInsert } from "../../db/schema";
import { redactTeamNumbers } from "./redact";

// #region Write
/**
 * Insert or refresh chunks by source_key. Body, title and heading are redacted here,
 * so callers can pass raw text. Batches of 200 keep the parameter count sane.
 */
export async function upsertChunks(rows: TroubleshootChunkInsert[]): Promise<number> {
	let written = 0;
	for (let i = 0; i < rows.length; i += 200) {
		const batch = rows.slice(i, i + 200).map((r) => ({
			...r,
			title: redactTeamNumbers(r.title),
			heading: r.heading ? redactTeamNumbers(r.heading) : r.heading,
			body: redactTeamNumbers(r.body),
			fetched_at: new Date(),
		}));
		if (batch.length === 0) continue;
		await db
			.insert(troubleshootChunks)
			.values(batch)
			.onConflictDoUpdate({
				target: troubleshootChunks.source_key,
				set: {
					url: sql`excluded.url`,
					title: sql`excluded.title`,
					heading: sql`excluded.heading`,
					body: sql`excluded.body`,
					source_date: sql`excluded.source_date`,
					fetched_at: sql`excluded.fetched_at`,
				},
			});
		written += batch.length;
	}
	return written;
}

export async function deleteChunksBySource(source: TroubleshootChunk["source"]): Promise<void> {
	await db.delete(troubleshootChunks).where(eq(troubleshootChunks.source, source));
}
// #endregion

// #region Search
// FRC shorthand the docs spell out in full. Applied to the query only.
const SYNONYMS: Record<string, string[]> = {
	rio: ["roborio"],
	roborio: ["rio"],
	ds: ["driver station"],
	pdh: ["power distribution hub"],
	pdp: ["power distribution panel"],
	rsl: ["robot signal light"],
	nt: ["networktables"],
	vh: ["vivid", "radio"],
	radio: ["vivid", "vh-109"],
	kraken: ["talonfx", "talon fx"],
	falcon: ["talonfx", "talon fx"],
	neo: ["spark max", "sparkmax"],
	vortex: ["spark flex", "sparkflex"],
	brownout: ["brown out", "voltage"],
	breaker: ["main breaker", "current limit"],
};

export function expandQuery(query: string): string {
	const words = query
		.toLowerCase()
		.replace(/[^a-z0-9.\s-]/g, " ")
		.split(/\s+/)
		.filter(Boolean);
	const extra = new Set<string>();
	for (const w of words) for (const syn of SYNONYMS[w] ?? []) extra.add(syn);
	return [...words, ...extra].join(" ");
}

export type ChunkHit = Pick<TroubleshootChunk, "id" | "source" | "url" | "title" | "heading" | "body" | "source_date"> & {
	rank: number;
};

/** Full-text search over the corpus. Returns the best `limit` chunks, highest rank first. */
export async function searchChunks(query: string, limit = 6): Promise<ChunkHit[]> {
	const q = expandQuery(query);
	if (!q) return [];
	const rank = sql<number>`ts_rank_cd(${troubleshootChunks.tsv}, websearch_to_tsquery('english', ${q}))`;
	const rows = await db
		.select({
			id: troubleshootChunks.id,
			source: troubleshootChunks.source,
			url: troubleshootChunks.url,
			title: troubleshootChunks.title,
			heading: troubleshootChunks.heading,
			body: troubleshootChunks.body,
			source_date: troubleshootChunks.source_date,
			rank,
		})
		.from(troubleshootChunks)
		.where(sql`${troubleshootChunks.tsv} @@ websearch_to_tsquery('english', ${q})`)
		.orderBy(desc(rank))
		.limit(limit);
	return rows;
}
// #endregion
