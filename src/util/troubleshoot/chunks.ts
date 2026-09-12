import { desc, eq, sql } from "drizzle-orm";
import { db } from "../../db/db";
import { troubleshootChunks, type TroubleshootChunk, type TroubleshootChunkInsert } from "../../db/schema";
import { STOPWORDS } from "./chat/keywords";
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
					ordinal: sql`excluded.ordinal`,
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

/** Split free text into lowercase alphanumeric tokens. Hyphens become separate tokens ("vh-109" -> "vh", "109"). */
function tokenize(text: string): string[] {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, " ")
		.split(/\s+/)
		.filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

export type SearchMode = "and" | "or";

/**
 * Build a to_tsquery string: every query word must match, but a word may match through any of its
 * synonyms. "radio poe" -> "(radio | vivid | (vh & 109)) & poe". Appending synonyms as plain words
 * would AND them in and make every expanded query fail.
 */
export function expandQuery(query: string, mode: SearchMode = "and"): string {
	const groups: string[] = [];
	for (const word of tokenize(query)) {
		const terms = [word, ...(SYNONYMS[word] ?? [])].map((t) => {
			const parts = tokenize(t);
			return parts.length > 1 ? `(${parts.join(" & ")})` : (parts[0] ?? "");
		}).filter(Boolean);
		if (terms.length === 0) continue;
		groups.push(terms.length > 1 ? `(${terms.join(" | ")})` : terms[0]);
	}
	return groups.join(mode === "and" ? " & " : " | ");
}

export type ChunkHit = Pick<TroubleshootChunk, "id" | "source" | "url" | "title" | "heading" | "body" | "source_date"> & {
	rank: number;
};

/**
 * Full-text search over the corpus. "and" needs every word (precise), "or" ranks by how many words match
 * (the fallback for whole-sentence questions). Highest rank first.
 */
export async function searchChunks(query: string, limit = 6, mode: SearchMode = "and"): Promise<ChunkHit[]> {
	const q = expandQuery(query, mode);
	if (!q) return [];
	// Title hits count most, then heading, then body; normalisation 1 divides by 1 + log(length) so long pages do not win by bulk.
	const rank = sql<number>`ts_rank_cd('{0.1, 0.2, 0.4, 1.0}', ${troubleshootChunks.tsv}, to_tsquery('english', ${q}), 1)`;
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
		.where(sql`${troubleshootChunks.tsv} @@ to_tsquery('english', ${q})`)
		.orderBy(desc(rank))
		.limit(limit);
	return rows;
}
// #endregion
