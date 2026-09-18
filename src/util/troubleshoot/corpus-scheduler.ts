// Keeps the vendor documentation in troubleshoot_chunks current.
//
// Runs on one prod instance at a time (leader lock), weekly with jitter. Vendor docs
// change a few times a season, so weekly is enough to stay current without hammering
// anyone's site. The next-run time lives in Redis, so a leader change or a redeploy
// does not restart the cadence and does not trigger an immediate re-crawl.

import { DEFAULT_SOURCES, refreshSources, type WebSource } from "../../../scripts/corpus/lib/refresh-core";
import { acquireOrRenewLock } from "../leaderLock";
import { redis } from "../redis";

// #region Config
export const LOCK_NAME = "troubleshoot-corpus-refresh";
const LOCK_TTL_SECONDS = 900;
const TICK_MS = 60_000;
/** A full crawl outlives the lock TTL, so renew it while the pass runs. */
const RENEW_MS = 60_000;
const NEXT_RUN_KEY = "troubleshoot:corpus:next_run";
const LAST_RUN_KEY = "troubleshoot:corpus:last_run";

const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_INTERVAL_HOURS = 24 * 7;

function enabled(): boolean {
	return (process.env.TROUBLESHOOT_CORPUS_REFRESH_ENABLED ?? "true").toLowerCase() !== "false";
}

/** Weekly by default. Override with TROUBLESHOOT_CORPUS_REFRESH_HOURS. */
function baseIntervalMs(): number {
	const override = Number(process.env.TROUBLESHOOT_CORPUS_REFRESH_HOURS);
	const hours = Number.isFinite(override) && override > 0 ? override : DEFAULT_INTERVAL_HOURS;
	return hours * HOUR_MS;
}

function nextDelayMs(): number {
	// +/- 10% jitter so every instance is not crawling on the same clock.
	return Math.round(baseIntervalMs() * (0.9 + Math.random() * 0.2));
}

function sources(): WebSource[] {
	const raw = process.env.TROUBLESHOOT_CORPUS_SOURCES;
	if (!raw) return DEFAULT_SOURCES;
	const names = raw
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	return names.length ? (names as WebSource[]) : DEFAULT_SOURCES;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// #endregion

// #region Pass
let passRunning: Promise<void> | null = null;

/** Run one refresh pass. Concurrent calls share the in-flight pass. */
export function runCorpusRefreshPass(): Promise<void> {
	if (passRunning) return passRunning;
	passRunning = (async () => {
		const started = Date.now();
		try {
			const { results, failed } = await refreshSources(sources(), {
				log: (line) => console.log(`[CorpusRefresh] ${line}`),
			});
			const pages = results.reduce((n, r) => n + r.pages, 0);
			const chunks = results.reduce((n, r) => n + r.chunks, 0);
			const secs = Math.round((Date.now() - started) / 1000);
			console.log(
				`[CorpusRefresh] pass done in ${secs}s: ${pages} pages, ${chunks} chunks${failed ? " (some sources failed)" : ""}`,
			);
			await redis.set(LAST_RUN_KEY, String(Date.now()));
		} catch (err) {
			console.error("[CorpusRefresh] pass failed:", (err as Error).message);
		} finally {
			passRunning = null;
		}
	})();
	return passRunning;
}
// #endregion

// #region Scheduler
/**
 * Start the scheduler. Every minute: renew or acquire the leader lock; if this instance
 * leads and the shared next-run time has passed, run a pass and schedule the next one a
 * week out. On a cold Redis the first run is scheduled one interval ahead rather than
 * immediately, so a deploy never kicks off a crawl.
 */
export function startCorpusRefresh(): void {
	if (!enabled()) {
		console.log("[CorpusRefresh] disabled by TROUBLESHOOT_CORPUS_REFRESH_ENABLED");
		return;
	}
	const hours = Math.round(baseIntervalMs() / HOUR_MS);
	console.log(`[CorpusRefresh] scheduler started, every ${hours}h, sources: ${sources().join(", ")}`);
	(async () => {
		while (true) {
			try {
				const isLeader = await acquireOrRenewLock(LOCK_NAME, LOCK_TTL_SECONDS);
				if (isLeader) {
					const stored = await redis.get(NEXT_RUN_KEY);
					if (!stored) {
						const next = Date.now() + nextDelayMs();
						await redis.set(NEXT_RUN_KEY, String(next));
						console.log(`[CorpusRefresh] first run scheduled for ${new Date(next).toISOString()}`);
					} else if (Date.now() >= parseInt(stored, 10)) {
						// Hold the lock for the whole crawl, otherwise it can expire part way
						// through and a second instance starts its own pass over the same sites.
						const renew = setInterval(() => {
							acquireOrRenewLock(LOCK_NAME, LOCK_TTL_SECONDS).catch((e) =>
								console.error("[CorpusRefresh] lock renew failed:", (e as Error).message),
							);
						}, RENEW_MS);
						try {
							await runCorpusRefreshPass();
						} finally {
							clearInterval(renew);
						}
						await redis.set(NEXT_RUN_KEY, String(Date.now() + nextDelayMs()));
					}
				}
			} catch (err) {
				console.error("[CorpusRefresh] scheduler error:", (err as Error).message);
			}
			await sleep(TICK_MS);
		}
	})();
}
// #endregion
