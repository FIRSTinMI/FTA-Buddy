// Live reads of vendor documentation during a chat turn.
//
// The corpus is re-crawled weekly, which is enough for almost every question. This
// covers the rest: a page edited mid-season, or a page that is simply not in the
// corpus scope. The model gets a URL from a retrieved chunk (or guesses one on an
// allowlisted host) and gets the page as it reads right now.
//
// Bounded three ways: the host must be on the allowlist below, robots.txt still
// applies through politeFetch, and the caller budgets pages and characters per turn.

import { politeFetch, RobotsDisallowedError } from "../../../../scripts/corpus/lib/fetch";
import { extractSections } from "../../../../scripts/corpus/lib/html-to-chunks";

// #region Allowlist
/**
 * Hosts the tool may read. Subdomains are not implied; list each one. These are the
 * same sites the corpus crawls, plus CTRE's Phoenix 5 docs and the NI roboRIO manual,
 * which are in scope for a live lookup even though they are not crawled.
 */
export const DOC_HOSTS: Record<string, string> = {
	"docs.wpilib.org": "WPILib documentation",
	"v6.docs.ctr-electronics.com": "CTRE Phoenix 6 documentation",
	"v5.docs.ctr-electronics.com": "CTRE Phoenix 5 documentation",
	"docs.revrobotics.com": "REV Robotics documentation",
	"frc-radio.vivid-hosting.net": "Vivid-Hosting VH-109 radio documentation",
	"www.ni.com": "NI hardware manuals",
	"docs.limelightvision.io": "Limelight documentation",
	"docs.photonvision.org": "PhotonVision documentation",
};

export class DocHostNotAllowedError extends Error {
	constructor(host: string) {
		super(`${host} is not a documentation site this tool can read`);
	}
}

/** Parse and check a model-supplied URL. Returns null for anything malformed. */
export function parseDocUrl(raw: string): URL | null {
	let url: URL;
	try {
		url = new URL(raw.trim());
	} catch {
		return null;
	}
	if (url.protocol !== "https:") return null;
	url.hash = "";
	return url;
}

export function isAllowedDocUrl(url: URL): boolean {
	return Object.hasOwn(DOC_HOSTS, url.hostname);
}
// #endregion

// #region Fetch
/** A live page read below this age is served from the crawl cache rather than re-fetched. */
const LIVE_MAX_AGE_MS = 15 * 60 * 1000;

export interface DocPage {
	url: string;
	title: string;
	site: string;
	text: string;
	/** True when the body came from the on-disk cache rather than a fresh request. */
	fromCache: boolean;
}

/**
 * Fetch one documentation page and flatten it to headed plain text.
 * Throws DocHostNotAllowedError, RobotsDisallowedError, or Error on a bad status.
 */
export async function fetchDocPage(raw: string, opts: { maxChars?: number } = {}): Promise<DocPage> {
	const url = parseDocUrl(raw);
	if (!url) throw new Error(`${raw} is not a valid https URL`);
	if (!isAllowedDocUrl(url)) throw new DocHostNotAllowedError(url.hostname);

	const res = await politeFetch(url.toString(), { maxAgeMs: LIVE_MAX_AGE_MS });
	if (res.status === 404) throw new Error(`That page does not exist (404). Check the URL or try the site's index.`);
	if (res.status < 200 || res.status >= 300) throw new Error(`The site returned ${res.status} for that page.`);

	const { title, sections } = extractSections(res.body);
	const parts: string[] = [];
	for (const s of sections) {
		const body = s.lines.join("\n").trim();
		if (!body && !s.heading) continue;
		parts.push(s.heading ? `## ${s.heading}\n${body}` : body);
	}
	let text = parts.join("\n\n").trim();
	if (!text) text = "(This page has no readable body text. It may be an index or a redirect.)";

	const maxChars = opts.maxChars ?? Infinity;
	if (text.length > maxChars) text = `${text.slice(0, maxChars)}\n\n[truncated]`;

	return {
		url: res.finalUrl || url.toString(),
		title: title || url.pathname,
		site: DOC_HOSTS[url.hostname],
		text,
		fromCache: res.fromCache,
	};
}

export { RobotsDisallowedError };
// #endregion
