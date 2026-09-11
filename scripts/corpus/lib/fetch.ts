// Polite HTTP fetch for the troubleshooting corpus crawlers.
// One request per second per host, robots.txt honoured, retry on 429/5xx,
// and an on-disk cache keyed by URL so re-runs cost nothing.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const USER_AGENT = "FTA-Buddy corpus (https://ftabuddy.com)";
const CACHE_DIR = process.env.CORPUS_CACHE_DIR ?? "/tmp/ftabuddy-corpus-cache";
const MIN_INTERVAL_MS = 1000;
const MAX_ATTEMPTS = 4;

// Hosts whose servers omit their intermediate certificate. Bun refuses those
// chains, so we hand it the public intermediate ourselves.
const EXTRA_CA: Record<string, string> = {
	"knowledge.ni.com": join(__dirname, "certs", "digicert-global-g2-tls-rsa-sha256-2020-ca1.pem"),
};

export interface FetchResult {
	url: string;
	finalUrl: string;
	status: number;
	contentType: string;
	/** Text body, or base64 when fetched with { binary: true }. */
	body: string;
	binary: boolean;
	fetchedAt: string;
	fromCache: boolean;
}

export interface FetchOptions {
	/** Return the body as base64 instead of decoded text (objects.inv and friends). */
	binary?: boolean;
	/**
	 * Treat a disk-cached entry older than this as a miss and re-fetch. The crawlers leave
	 * it unset, so a cached page is reused for the whole pass. Live callers set a short
	 * value, otherwise they would keep serving whatever the last weekly crawl saw.
	 */
	maxAgeMs?: number;
}

let cacheEnabled = true;
export function setCacheEnabled(on: boolean): void {
	cacheEnabled = on;
}

// #region Cache
function cachePath(url: string, binary: boolean): string {
	return join(CACHE_DIR, createHash("sha256").update(url).digest("hex") + (binary ? ".bin.json" : ".json"));
}

function readCache(url: string, binary: boolean, maxAgeMs?: number): FetchResult | null {
	if (!cacheEnabled) return null;
	const p = cachePath(url, binary);
	if (!existsSync(p)) return null;
	try {
		const hit = { ...(JSON.parse(readFileSync(p, "utf8")) as FetchResult), fromCache: true };
		if (maxAgeMs !== undefined) {
			const age = Date.now() - Date.parse(hit.fetchedAt);
			if (!Number.isFinite(age) || age > maxAgeMs) return null;
		}
		return hit;
	} catch {
		return null;
	}
}

function writeCache(r: FetchResult): void {
	if (!cacheEnabled) return;
	mkdirSync(CACHE_DIR, { recursive: true });
	writeFileSync(cachePath(r.url, r.binary), JSON.stringify({ ...r, fromCache: false }));
}
// #endregion

// #region Rate limit
const lastRequest = new Map<string, number>();
async function throttle(host: string): Promise<void> {
	const last = lastRequest.get(host) ?? 0;
	const wait = last + MIN_INTERVAL_MS - Date.now();
	if (wait > 0) await Bun.sleep(wait);
	lastRequest.set(host, Date.now());
}
// #endregion

// #region robots.txt
interface RobotsRule {
	allow: boolean;
	pattern: string;
}
const robotsCache = new Map<string, Promise<RobotsRule[]>>();

function parseRobots(text: string): RobotsRule[] {
	// Groups keyed by user-agent token. Rules for the same agent in separate groups are merged.
	const groups = new Map<string, RobotsRule[]>();
	let current: string[] = [];
	let sawRule = false;
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.replace(/#.*$/, "").trim();
		if (!line) continue;
		const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
		if (!m) continue;
		const key = m[1].toLowerCase();
		const value = m[2].trim();
		if (key === "user-agent") {
			if (sawRule) {
				current = [];
				sawRule = false;
			}
			current.push(value.toLowerCase());
			if (!groups.has(value.toLowerCase())) groups.set(value.toLowerCase(), []);
		} else if (key === "allow" || key === "disallow") {
			sawRule = true;
			if (value === "") continue; // "Disallow:" with nothing = allow everything
			for (const agent of current) groups.get(agent)!.push({ allow: key === "allow", pattern: value });
		}
	}
	const mine = [...groups.keys()].find((a) => a !== "*" && USER_AGENT.toLowerCase().includes(a));
	return groups.get(mine ?? "*") ?? [];
}

function patternToRegex(pattern: string): RegExp {
	const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
	return new RegExp("^" + (escaped.endsWith("$") ? escaped : escaped + ".*"));
}

async function robotsFor(origin: string): Promise<RobotsRule[]> {
	let p = robotsCache.get(origin);
	if (!p) {
		p = (async () => {
			try {
				const r = await rawFetch(origin + "/robots.txt");
				if (r.status >= 200 && r.status < 300) return parseRobots(r.body);
				if (r.status >= 500) {
					console.warn(`[fetch] ${origin}/robots.txt returned ${r.status}; treating host as disallowed`);
					return [{ allow: false, pattern: "/" }];
				}
				return []; // 4xx = no robots file = everything allowed
			} catch (e) {
				console.warn(`[fetch] ${origin}/robots.txt unreachable (${String(e)}); treating host as disallowed`);
				return [{ allow: false, pattern: "/" }];
			}
		})();
		robotsCache.set(origin, p);
	}
	return p;
}

/** True when robots.txt lets our user agent fetch this URL. Longest matching rule wins, Allow wins ties. */
export async function isAllowed(url: string): Promise<boolean> {
	const u = new URL(url);
	const rules = await robotsFor(u.origin);
	const path = u.pathname + u.search;
	let best: RobotsRule | null = null;
	for (const rule of rules) {
		if (!patternToRegex(rule.pattern).test(path)) continue;
		if (!best || rule.pattern.length > best.pattern.length || (rule.pattern.length === best.pattern.length && rule.allow)) best = rule;
	}
	return best ? best.allow : true;
}
// #endregion

// #region Fetch
async function rawFetch(url: string, opts: FetchOptions = {}): Promise<FetchResult> {
	const host = new URL(url).host;
	const caPath = EXTRA_CA[host];
	const init: RequestInit & { tls?: { ca: string } } = {
		headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml,application/xml,text/plain,*/*;q=0.5" },
		redirect: "follow",
	};
	if (caPath) init.tls = { ca: readFileSync(caPath, "utf8") };

	let delay = 1000;
	for (let attempt = 1; ; attempt++) {
		await throttle(host);
		let res: Response;
		try {
			res = await fetch(url, init);
		} catch (e) {
			if (attempt >= MAX_ATTEMPTS) throw e;
			console.warn(`[fetch] ${url} network error (${String(e)}), retry ${attempt}/${MAX_ATTEMPTS - 1} in ${delay}ms`);
			await Bun.sleep(delay);
			delay *= 2;
			continue;
		}
		if ((res.status === 429 || res.status >= 500) && attempt < MAX_ATTEMPTS) {
			const retryAfter = Number(res.headers.get("retry-after"));
			const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : delay;
			console.warn(`[fetch] ${url} -> ${res.status}, retry ${attempt}/${MAX_ATTEMPTS - 1} in ${wait}ms`);
			await res.arrayBuffer().catch(() => undefined);
			await Bun.sleep(wait);
			delay *= 2;
			continue;
		}
		const body = res.status === 204 ? "" : opts.binary ? Buffer.from(await res.arrayBuffer()).toString("base64") : await res.text();
		return {
			url,
			finalUrl: res.url || url,
			status: res.status,
			contentType: res.headers.get("content-type") ?? "",
			body,
			binary: !!opts.binary,
			fetchedAt: new Date().toISOString(),
			fromCache: false,
		};
	}
}

export class RobotsDisallowedError extends Error {
	constructor(url: string) {
		super(`robots.txt disallows ${url}`);
	}
}

/**
 * Fetch a URL politely. Throws RobotsDisallowedError when robots.txt forbids it.
 * Successful (2xx) and 404 responses are cached on disk; everything else is not.
 */
export async function politeFetch(url: string, opts: FetchOptions = {}): Promise<FetchResult> {
	const cached = readCache(url, !!opts.binary, opts.maxAgeMs);
	if (cached) return cached;
	if (!(await isAllowed(url))) throw new RobotsDisallowedError(url);
	const r = await rawFetch(url, opts);
	if ((r.status >= 200 && r.status < 300) || r.status === 404) writeCache(r);
	return r;
}

/** Fetch and return the body, or null on a non-2xx status. Logs and skips robots-disallowed URLs. */
export async function fetchText(url: string): Promise<string | null> {
	try {
		const r = await politeFetch(url);
		if (r.status < 200 || r.status >= 300) {
			console.warn(`[fetch] ${url} -> ${r.status}`);
			return null;
		}
		return r.body;
	} catch (e) {
		if (e instanceof RobotsDisallowedError) {
			console.warn(`[fetch] skipped, ${e.message}`);
			return null;
		}
		throw e;
	}
}

/** All <loc> entries of a sitemap or sitemap index. */
export async function fetchSitemapLocs(url: string): Promise<string[]> {
	const xml = await fetchText(url);
	if (!xml) return [];
	return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
}
// #endregion
