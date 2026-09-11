// The crawl-and-write pass shared by the CLI (`bun run corpus:refresh`) and the
// in-server scheduler. Kept free of process.exit and argv so both can call it.

import { and, eq, notInArray } from "drizzle-orm";
import { db } from "../../../src/db/db";
import { troubleshootChunks, type TroubleshootChunk } from "../../../src/db/schema";
import { upsertChunks } from "../../../src/util/troubleshoot/chunks";
import { crawl as ctre } from "../fetch-ctre";
import { crawl as ni } from "../fetch-ni";
import { crawl as rev } from "../fetch-rev";
import { crawl as vivid } from "../fetch-vivid";
import { crawl as wpilib } from "../fetch-wpilib";
import { pageCount, type Crawler } from "./run";

export type WebSource = Extract<TroubleshootChunk["source"], "wpilib" | "vivid" | "rev" | "ctre" | "ni">;

export const CRAWLERS: Record<WebSource, Crawler> = { wpilib, vivid, rev, ctre, ni };

/** "ni" is opt-in, see sources.json for the terms question. */
export const DEFAULT_SOURCES: WebSource[] = ["wpilib", "vivid", "rev", "ctre"];

export interface SourceResult {
	source: WebSource;
	pages: number;
	chunks: number;
	pruned: number;
	seconds: number;
	error?: string;
}

export interface RefreshResult {
	results: SourceResult[];
	failed: boolean;
}

export function parseSources(names: string[]): WebSource[] {
	const unknown = names.filter((s) => !(s in CRAWLERS));
	if (unknown.length)
		throw new Error(`unknown source(s): ${unknown.join(", ")}; valid: ${Object.keys(CRAWLERS).join(", ")}`);
	return names as WebSource[];
}

/**
 * Crawl each source and upsert its chunks. A source that throws keeps its existing
 * rows and the pass carries on, so one vendor site being down cannot empty the corpus.
 * Pruning only runs on a full crawl, otherwise a --limit run would delete the rest.
 */
export async function refreshSources(
	sources: WebSource[],
	opts: { limit?: number; log?: (line: string) => void } = {},
): Promise<RefreshResult> {
	const log = opts.log ?? (() => {});
	const results: SourceResult[] = [];
	let failed = false;

	for (const source of sources) {
		const started = Date.now();
		let chunks;
		try {
			chunks = await CRAWLERS[source]({ limit: opts.limit });
		} catch (e) {
			const error = (e as Error).message;
			log(`${source} crawl failed, existing rows kept: ${error}`);
			results.push({ source, pages: 0, chunks: 0, pruned: 0, seconds: 0, error });
			failed = true;
			continue;
		}

		await upsertChunks(chunks);

		let pruned = 0;
		if (!opts.limit && chunks.length > 0) {
			// Full crawl: drop rows this source no longer produces (moved or deleted pages).
			const keys = chunks.map((c) => c.source_key);
			const gone = await db
				.delete(troubleshootChunks)
				.where(and(eq(troubleshootChunks.source, source), notInArray(troubleshootChunks.source_key, keys)))
				.returning({ id: troubleshootChunks.id });
			pruned = gone.length;
		}

		const seconds = Math.round((Date.now() - started) / 1000);
		results.push({ source, pages: pageCount(chunks), chunks: chunks.length, pruned, seconds });
		log(`${source}: ${pageCount(chunks)} pages, ${chunks.length} chunks, ${pruned} pruned, ${seconds}s`);
	}

	return { results, failed };
}
