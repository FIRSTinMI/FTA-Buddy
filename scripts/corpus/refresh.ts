// Crawl the web sources and write them to troubleshoot_chunks.
//   bun run corpus:refresh                       all default sources
//   bun run corpus:refresh --only wpilib,rev     a subset
//   bun run corpus:refresh --limit 15            first 15 pages per source (test runs; no pruning)
//   bun run corpus:refresh --no-cache            ignore /tmp/ftabuddy-corpus-cache
// "ni" is opt-in (`--only ni`), see lib/sources.json for the terms question.
//
// The same pass runs on a weekly schedule inside the server, see
// src/util/troubleshoot/corpus-scheduler.ts.

import "dotenv/config";
import { connect } from "../../src/db/db";
import { DEFAULT_SOURCES, parseSources, refreshSources } from "./lib/refresh-core";
import { parseFlags } from "./lib/run";

async function main() {
	const flags = parseFlags();
	const sourcesToRun = flags.only ? parseSources(flags.only) : DEFAULT_SOURCES;

	await connect();
	const { results, failed } = await refreshSources(sourcesToRun, {
		limit: flags.limit,
		log: (line) => console.log(`[refresh] ${line}`),
	});

	console.log("\nsource   pages  chunks  pruned");
	for (const s of results)
		console.log(
			`${s.source.padEnd(8)} ${String(s.pages).padStart(5)}  ${String(s.chunks).padStart(6)}  ${String(s.pruned).padStart(6)}`,
		);
	process.exit(failed ? 1 : 0);
}

main().catch((e) => {
	console.error("[refresh] failed:", e);
	process.exit(1);
});
