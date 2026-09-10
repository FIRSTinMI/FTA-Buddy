// bun run corpus:search "rio unrecoverable error" [--limit 5]

import "dotenv/config";
import { connect } from "../../src/db/db";
import { searchChunks } from "../../src/util/troubleshoot/chunks";
import { parseFlags } from "./lib/run";

async function main() {
	const flags = parseFlags();
	const query = flags.rest.join(" ").trim();
	if (!query) throw new Error('usage: bun run corpus:search "<query>" [--limit N]');
	await connect();
	const hits = await searchChunks(query, flags.limit ?? 5);
	console.log(`${hits.length} hit(s) for "${query}"\n`);
	hits.forEach((h, i) => {
		console.log(
			`${i + 1}. [${h.source}] ${h.title}${h.heading ? " > " + h.heading : ""}  (rank ${h.rank.toFixed(4)})`,
		);
		if (h.url) console.log(`   ${h.url}`);
		console.log(`   ${h.body.replace(/\s+/g, " ").slice(0, 240)}\n`);
	});
	process.exit(0);
}

main().catch((e) => {
	console.error("[search] failed:", e);
	process.exit(1);
});
