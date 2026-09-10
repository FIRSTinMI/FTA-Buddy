// Crawl the web sources and write them to troubleshoot_chunks.
//   bun run corpus:refresh                       all default sources
//   bun run corpus:refresh --only wpilib,rev     a subset
//   bun run corpus:refresh --limit 15            first 15 pages per source (test runs; no pruning)
//   bun run corpus:refresh --no-cache            ignore /tmp/ftabuddy-corpus-cache
// "ni" is opt-in (`--only ni`), see lib/sources.json for the terms question.

import "dotenv/config";
import { and, eq, notInArray } from "drizzle-orm";
import { connect, db } from "../../src/db/db";
import { troubleshootChunks, type TroubleshootChunk } from "../../src/db/schema";
import { upsertChunks } from "../../src/util/troubleshoot/chunks";
import { crawl as ctre } from "./fetch-ctre";
import { crawl as ni } from "./fetch-ni";
import { crawl as rev } from "./fetch-rev";
import { crawl as vivid } from "./fetch-vivid";
import { crawl as wpilib } from "./fetch-wpilib";
import { pageCount, parseFlags, type Crawler } from "./lib/run";

type WebSource = Extract<TroubleshootChunk["source"], "wpilib" | "vivid" | "rev" | "ctre" | "ni">;
const CRAWLERS: Record<WebSource, Crawler> = { wpilib, vivid, rev, ctre, ni };
const DEFAULT_SOURCES: WebSource[] = ["wpilib", "vivid", "rev", "ctre"];

async function main() {
	const flags = parseFlags();
	const requested = flags.only ?? DEFAULT_SOURCES;
	const unknown = requested.filter((s) => !(s in CRAWLERS));
	if (unknown.length) throw new Error(`unknown source(s): ${unknown.join(", ")}; valid: ${Object.keys(CRAWLERS).join(", ")}`);
	const sourcesToRun = requested as WebSource[];

	await connect();
	const summary: { source: string; pages: number; chunks: number; pruned: number }[] = [];
	let failed = false;
	for (const source of sourcesToRun) {
		const started = Date.now();
		let chunks;
		try {
			chunks = await CRAWLERS[source]({ limit: flags.limit });
		} catch (e) {
			console.error(`[refresh] ${source} crawl failed, existing rows kept:`, e);
			summary.push({ source, pages: 0, chunks: 0, pruned: 0 });
			failed = true;
			continue;
		}
		await upsertChunks(chunks);
		let pruned = 0;
		if (!flags.limit && chunks.length > 0) {
			// Full crawl: drop rows this source no longer produces (moved or deleted pages).
			const keys = chunks.map((c) => c.source_key);
			const gone = await db
				.delete(troubleshootChunks)
				.where(and(eq(troubleshootChunks.source, source), notInArray(troubleshootChunks.source_key, keys)))
				.returning({ id: troubleshootChunks.id });
			pruned = gone.length;
		}
		summary.push({ source, pages: pageCount(chunks), chunks: chunks.length, pruned });
		console.log(`[refresh] ${source}: ${pageCount(chunks)} pages, ${chunks.length} chunks, ${pruned} pruned, ${Math.round((Date.now() - started) / 1000)}s`);
	}
	console.log("\nsource   pages  chunks  pruned");
	for (const s of summary) console.log(`${s.source.padEnd(8)} ${String(s.pages).padStart(5)}  ${String(s.chunks).padStart(6)}  ${String(s.pruned).padStart(6)}`);
	process.exit(failed ? 1 : 0);
}

main().catch((e) => {
	console.error("[refresh] failed:", e);
	process.exit(1);
});
