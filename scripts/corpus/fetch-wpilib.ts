// docs.wpilib.org (stable): hardware, networking, driver station, roboRIO, CAN, status lights, deploy.
// Page list comes from the Sphinx objects.inv inventory filtered to the scope in sources.json,
// which keeps the crawl at ~130 pages instead of the 425 in the inventory.

import type { TroubleshootChunkInsert } from "../../src/db/schema";
import { fetchText } from "./lib/fetch";
import { pageToChunks } from "./lib/html-to-chunks";
import { runStandalone, type CrawlOptions } from "./lib/run";
import sources from "./lib/sources.json";
import { inScope, sphinxDocs, sphinxLastUpdated } from "./lib/sphinx";

const BASE = sources.sources.wpilib.base_url;
const SCOPE = sources.sources.wpilib.scope;

export async function crawl(opts: CrawlOptions = {}): Promise<TroubleshootChunkInsert[]> {
	const docs = (await sphinxDocs(BASE)).filter((d) => inScope(d, SCOPE)).sort();
	const pages = opts.limit ? docs.slice(0, opts.limit) : docs;
	console.log(`[wpilib] ${pages.length} pages in scope`);
	const out: TroubleshootChunkInsert[] = [];
	for (const path of pages) {
		const url = BASE + path;
		const html = await fetchText(url);
		if (!html) continue;
		const chunks = pageToChunks(html, { source: "wpilib", url, sourceDate: sphinxLastUpdated(html) });
		console.log(`[wpilib] ${chunks.length} chunks  ${path}`);
		out.push(...chunks);
	}
	return out;
}

if (require.main === module) runStandalone("wpilib", crawl);
