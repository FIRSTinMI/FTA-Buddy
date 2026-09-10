// NI Knowledge Base roboRIO articles. The KB has no crawlable index, so this starts from a fixed
// list of article IDs (verified live on 2026-09-10) and follows one hop of linked articles whose
// title mentions roboRIO or FRC. Dead IDs return a 620-byte redirect stub, which is dropped.
//
// NOT in the default refresh set: NI's terms of use forbid reusing site content "on any other Web
// site or networked computer environment" (see lib/sources.json). Run with `--only ni` on purpose.

import type { TroubleshootChunkInsert } from "../../src/db/schema";
import { fetchText } from "./lib/fetch";
import { decodeEntities, pageToChunks } from "./lib/html-to-chunks";
import { runStandalone, type CrawlOptions } from "./lib/run";
import sources from "./lib/sources.json";

const BASE = sources.sources.ni.base_url;

// Titles as of 2026-09-10, for the reader; the crawl uses the live title.
export const SEED_IDS: string[] = [
	"kA03q000000kOHkCAM", // FRC roboRIO STATUS LED Constantly Flashing
	"kA00Z0000019NlbSAE", // FRC roboRIO Light is Red
	"kA00Z0000019NlgSAE", // Unable to Connect to roboRIO in Driver Station, Imaging Tool or LabVIEW
	"kA00Z0000019ZjrSAE", // LabVIEW for FRC Shows Connection Failed to My roboRIO
	"kA00Z0000019QCPSA2", // Ethernet Port is Not Working on FRC roboRIO
	"kA00Z0000019OtbSAE", // FRC roboRIO's USB Port Not Working
	"kA00Z000001DbLGSA0", // FRC roboRIO's USB Cable is Stuck
	"kA00Z000001DdgBSAS", // FRC Dashboard Is Not Showing Data From My roboRIO
	"kA00Z000001DcmwSAC", // Robot Camera Images Not Appearing in FRC Dashboard
	"kA03q000000YHhPCAW", // Restore NI Linux Real-Time Target to Factory Default Configuration (safe mode)
	"kA03q000000YHd9CAG", // Upgrading or Downgrading Firmware on an NI Linux Real-Time Device
	"kA00Z000000kFLkSAM", // Error 404: Can't Connect to the Web Interface (WIF) for Real-Time Targets
	"kA00Z0000019SX0SAM", // Failed to Connect to the Target When Using a NI Real-Time Target in LabVIEW
];

const RELEVANT = /roborio|\bfrc\b|first robotics/i;

interface Article {
	id: string;
	title: string;
	updated: Date | null;
	html: string; // article portion only
	links: string[];
}

function parseArticle(id: string, page: string): Article | null {
	if (page.length < 2000 || page.includes("ArticleErrorPage")) return null;
	const start = page.indexOf('<h1 class="blog-title"');
	if (start === -1) return null;
	const endMarker = page.indexOf("Other Support Options", start);
	const html = page.slice(start, endMarker === -1 ? undefined : page.lastIndexOf("<h2", endMarker));
	const title = decodeEntities(page.match(/<h1 class="blog-title">([^<]*)/)?.[1] ?? "").trim();
	const dateText = page.match(/lastModifiedDate">\s*Updated\s+([^<]+)</)?.[1]?.replace(/\s+/g, " ").trim();
	const updated = dateText ? new Date(dateText) : null;
	const links = [...new Set([...html.matchAll(/KnowledgeArticleDetails\?id=([A-Za-z0-9]+)/g)].map((m) => m[1]))].filter((l) => l !== id);
	return { id, title, updated: updated && !Number.isNaN(updated.getTime()) ? updated : null, html, links };
}

export async function crawl(opts: CrawlOptions = {}): Promise<TroubleshootChunkInsert[]> {
	const out: TroubleshootChunkInsert[] = [];
	const seen = new Set<string>();
	const queue: { id: string; hop: number }[] = SEED_IDS.map((id) => ({ id, hop: 0 }));
	let fetched = 0;
	while (queue.length) {
		if (opts.limit && fetched >= opts.limit) break;
		const { id, hop } = queue.shift()!;
		if (seen.has(id)) continue;
		seen.add(id);
		const url = BASE + id;
		const page = await fetchText(url);
		fetched++;
		if (!page) continue;
		const art = parseArticle(id, page);
		if (!art) {
			console.warn(`[ni] ${id} is not an article (dead or moved), skipped`);
			continue;
		}
		if (hop > 0 && !RELEVANT.test(art.title)) {
			console.log(`[ni] ${id} "${art.title}" not roboRIO related, skipped`);
			continue;
		}
		// A tag name the page never uses, so the article's own unbalanced </div> cannot close the wrapper.
		const wrapped = `<corpus-main>${art.html}</corpus-main>`;
		const chunks = pageToChunks(wrapped, {
			source: "ni",
			url,
			title: art.title,
			sourceDate: art.updated,
			mainSelectors: [(t) => t === "corpus-main"],
		});
		console.log(`[ni] ${chunks.length} chunks  ${art.title}`);
		out.push(...chunks);
		if (hop === 0) for (const l of art.links) if (!seen.has(l)) queue.push({ id: l, hop: 1 });
	}
	return out;
}

if (require.main === module) runStandalone("ni", crawl);
