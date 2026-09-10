// v6.docs.ctr-electronics.com (stable): Talon FX, CANivore, CANcoder, Pigeon, status lights, CAN bus, troubleshooting.
// pro.docs.ctr-electronics.com is the same Sphinx project (its sitemap points at v6.docs), so it is not fetched twice.

import type { TroubleshootChunkInsert } from "../../src/db/schema";
import { fetchText } from "./lib/fetch";
import { pageToChunks } from "./lib/html-to-chunks";
import { runStandalone, type CrawlOptions } from "./lib/run";
import sources from "./lib/sources.json";
import { inScope, sphinxDocs, sphinxLastUpdated } from "./lib/sphinx";

const BASE = sources.sources.ctre.base_url;
const SCOPE = sources.sources.ctre.scope;

export async function crawl(opts: CrawlOptions = {}): Promise<TroubleshootChunkInsert[]> {
	const docs = (await sphinxDocs(BASE)).filter((d) => inScope(d, SCOPE)).sort();
	const pages = opts.limit ? docs.slice(0, opts.limit) : docs;
	console.log(`[ctre] ${pages.length} pages in scope`);
	const out: TroubleshootChunkInsert[] = [];
	for (const path of pages) {
		const url = BASE + path;
		const html = await fetchText(url);
		if (!html) continue;
		const chunks = pageToChunks(html, { source: "ctre", url, sourceDate: sphinxLastUpdated(html) });
		console.log(`[ctre] ${chunks.length} chunks  ${path}`);
		out.push(...chunks);
	}
	return out;
}

if (require.main === module) runStandalone("ctre", crawl);
