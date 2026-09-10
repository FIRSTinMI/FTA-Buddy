// Shared glue for the corpus scripts: CLI flags, DB connect, upsert, exit.

import "dotenv/config";
import { connect } from "../../../src/db/db";
import type { TroubleshootChunkInsert } from "../../../src/db/schema";
import { upsertChunks } from "../../../src/util/troubleshoot/chunks";
import { setCacheEnabled } from "./fetch";

export interface CrawlOptions {
	/** Max pages to fetch for this source. Undefined = everything in scope. */
	limit?: number;
}

export type Crawler = (opts?: CrawlOptions) => Promise<TroubleshootChunkInsert[]>;

export interface CliFlags {
	only: string[] | null;
	limit: number | undefined;
	noCache: boolean;
	rest: string[];
}

export function parseFlags(argv: string[] = process.argv.slice(2)): CliFlags {
	const flags: CliFlags = { only: null, limit: undefined, noCache: false, rest: [] };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--only") flags.only = (argv[++i] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
		else if (a.startsWith("--only=")) flags.only = a.slice(7).split(",").map((s) => s.trim()).filter(Boolean);
		else if (a === "--limit") flags.limit = Number(argv[++i]);
		else if (a.startsWith("--limit=")) flags.limit = Number(a.slice(8));
		else if (a === "--no-cache") flags.noCache = true;
		else flags.rest.push(a);
	}
	if (flags.limit !== undefined && !(flags.limit > 0)) throw new Error("--limit must be a positive number");
	if (flags.noCache) setCacheEnabled(false);
	return flags;
}

export function pageCount(chunks: TroubleshootChunkInsert[]): number {
	return new Set(chunks.map((c) => c.url ?? c.source_key)).size;
}

/** Crawl one source, write it to the DB and exit. Used by each fetch-*.ts when run directly. */
export async function runStandalone(name: string, crawl: Crawler): Promise<void> {
	const flags = parseFlags();
	try {
		const chunks = await crawl({ limit: flags.limit });
		await connect();
		const written = await upsertChunks(chunks);
		console.log(`[${name}] ${pageCount(chunks)} pages, ${chunks.length} chunks, ${written} written`);
		process.exit(0);
	} catch (e) {
		console.error(`[${name}] failed:`, e);
		process.exit(1);
	}
}
