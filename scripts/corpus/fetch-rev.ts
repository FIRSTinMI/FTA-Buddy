// docs.revrobotics.com: SPARK MAX, SPARK Flex, PDH, PH, status LEDs, troubleshooting, REV Hardware Client.
// The site is a GitBook sitemap index with one sitemap per space; only spaces in scope are opened.

import type { TroubleshootChunkInsert } from "../../src/db/schema";
import { fetchSitemapLocs, fetchText } from "./lib/fetch";
import { gitbookUpdated } from "./lib/gitbook";
import { pageToChunks } from "./lib/html-to-chunks";
import { runStandalone, type CrawlOptions } from "./lib/run";
import sources from "./lib/sources.json";

const BASE = sources.sources.rev.base_url;
const SCOPE = sources.sources.rev.scope;
const SPACES = new Set(SCOPE.map((s) => s.split("/")[0]));

function inScope(url: string): boolean {
	const path = url.slice(BASE.length);
	return SCOPE.some((prefix) => (prefix.endsWith("/") ? path.startsWith(prefix) || path + "/" === prefix : path === prefix));
}

export async function crawl(opts: CrawlOptions = {}): Promise<TroubleshootChunkInsert[]> {
	const sitemaps = (await fetchSitemapLocs(BASE + "sitemap.xml")).filter((u) => u.endsWith("sitemap-pages.xml") && SPACES.has(u.slice(BASE.length).split("/")[0]));
	const urls = new Set<string>();
	for (const sm of sitemaps) for (const loc of await fetchSitemapLocs(sm)) if (loc.startsWith(BASE) && inScope(loc)) urls.add(loc);
	const all = [...urls].sort();
	const pages = opts.limit ? all.slice(0, opts.limit) : all;
	console.log(`[rev] ${pages.length} pages in scope across ${sitemaps.length} spaces`);
	const out: TroubleshootChunkInsert[] = [];
	for (const url of pages) {
		const html = await fetchText(url);
		if (!html) continue;
		const chunks = pageToChunks(html, { source: "rev", url, sourceDate: gitbookUpdated(html) });
		console.log(`[rev] ${chunks.length} chunks  ${url.slice(BASE.length)}`);
		out.push(...chunks);
	}
	return out;
}

if (require.main === module) runStandalone("rev", crawl);
