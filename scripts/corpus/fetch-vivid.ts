// frc-radio.vivid-hosting.net: the whole VH-109 radio site (35 pages), English only.

import type { TroubleshootChunkInsert } from "../../src/db/schema";
import { fetchSitemapLocs, fetchText } from "./lib/fetch";
import { gitbookUpdated } from "./lib/gitbook";
import { pageToChunks } from "./lib/html-to-chunks";
import { runStandalone, type CrawlOptions } from "./lib/run";
import sources from "./lib/sources.json";

const BASE = sources.sources.vivid.base_url;

export async function crawl(opts: CrawlOptions = {}): Promise<TroubleshootChunkInsert[]> {
	const locs = (await fetchSitemapLocs(BASE + "sitemap-pages.xml")).filter((u) => u.startsWith(BASE.slice(0, -1)) && !u.includes("/tuerkce/"));
	const pages = opts.limit ? locs.slice(0, opts.limit) : locs;
	console.log(`[vivid] ${pages.length} pages in sitemap`);
	const out: TroubleshootChunkInsert[] = [];
	for (const url of pages) {
		const html = await fetchText(url);
		if (!html) continue;
		// The site never says "radio" in its page titles; searches for the radio LEDs need that word to rank the page.
		const chunks = pageToChunks(html, { source: "vivid", url, sourceDate: gitbookUpdated(html) }).map((c) => ({
			...c,
			title: /radio/i.test(c.title) ? c.title : `Vivid radio: ${c.title}`,
		}));
		console.log(`[vivid] ${chunks.length} chunks  ${url.slice(BASE.length - 1)}`);
		out.push(...chunks);
	}
	return out;
}

if (require.main === module) runStandalone("vivid", crawl);
