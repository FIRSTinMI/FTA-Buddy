// Copies Slack CSA channel threads into the troubleshoot corpus.
//
// Runs on one prod instance at a time (leader lock), every 3 hours with jitter.
// Sources: every slackUserTokens row (xoxp, reads what that person can see) and every
// slackServers row (bot token, reads channels the bot is in). Progress is kept per channel in
// Redis so a long backfill survives a restart; last_polled_at on the token row is the summary.

import { eq } from "drizzle-orm";
import { db } from "../../db/db";
import { slackServers, slackSessionTokens, slackUserTokens, type TroubleshootChunkInsert } from "../../db/schema";
import { acquireOrRenewLock } from "../leaderLock";
import { redis } from "../redis";
import { fetchTeamDomain, isAuthError, listConversations, slackApi, SlackApiError } from "../slack-user-oauth";
import { listSessionConversations, slackWebApi, type SlackSession } from "../slack-session";
import { upsertChunks } from "./chunks";
import { DIRTY_SET_KEY, runDistillation } from "./distill";
import { buildThreadChunk, isThreadParent, type SlackChannelContext, type SlackMessage } from "./slack-chunks";

// #region Config
export const LOCK_NAME = "troubleshoot-slack-poller";
const LOCK_TTL_SECONDS = 180;
const TICK_MS = 60_000;

const HOUR_MS = 60 * 60 * 1000;

/**
 * How often to poll, by FRC season. New CSA chatter is worth almost nothing in the offseason and a
 * lot during competition, so the cadence tracks the calendar (local time):
 *   Jan-Feb (build season): nightly.  Mar-Apr (competition): every 6 hours.  May-Dec: weekly.
 * Override with TROUBLESHOOT_SLACK_INTERVAL_HOURS.
 */
function baseIntervalMs(now = new Date()): number {
	const override = parseFloat(process.env.TROUBLESHOOT_SLACK_INTERVAL_HOURS ?? "");
	if (Number.isFinite(override) && override > 0) return override * HOUR_MS;
	const month = now.getMonth() + 1; // 1-12
	if (month <= 2) return 24 * HOUR_MS; // Jan-Feb nightly
	if (month <= 4) return 6 * HOUR_MS; // Mar-Apr every 6h
	return 7 * 24 * HOUR_MS; // May-Dec weekly
}
const OVERLAP_MS = 2 * 24 * 60 * 60 * 1000;
const BACKFILL_MS = 90 * 24 * 60 * 60 * 1000;

const NEXT_RUN_KEY = "ftabuddy:troubleshoot:slack:next-run-at";
const cursorKey = (teamId: string, channelId: string) => `ftabuddy:troubleshoot:slack:cursor:${teamId}:${channelId}`;
const botPolledKey = (teamId: string) => `ftabuddy:troubleshoot:slack:bot-last-polled:${teamId}`;

function enabled(): boolean {
	const v = (process.env.TROUBLESHOOT_SLACK_POLL_ENABLED ?? "true").toLowerCase();
	return !["0", "false", "no", "off"].includes(v);
}

/** Gap between Slack calls. conversations.history/replies are Tier 3 (about 50 per minute). */
function requestGapMs(): number {
	const n = parseInt(process.env.TROUBLESHOOT_SLACK_REQUEST_GAP_MS ?? "1300", 10);
	return Number.isFinite(n) && n >= 0 ? n : 1300;
}

/** A single paced gap with +/- 60% random jitter, so calls do not land on a fixed clock. */
function jitteredGapMs(): number {
	const base = requestGapMs();
	return Math.round(base * (0.6 + Math.random() * 0.8));
}

/** Page size for history/replies. Slack caps non-Marketplace apps lower; set 15 if calls return errors. */
function pageSize(): number {
	const n = parseInt(process.env.TROUBLESHOOT_SLACK_PAGE_SIZE ?? "200", 10);
	return Number.isFinite(n) && n > 0 ? Math.min(n, 999) : 200;
}
// #endregion

// #region Types
interface PollSource {
	kind: "user" | "bot" | "session";
	id: number;
	teamId: string;
	teamName: string;
	token: string;
	/** Present only for kind "session": browser xoxc token + `d` cookie + workspace domain. */
	session?: SlackSession;
	/** Explicit channel ids to poll; empty = every readable channel. */
	channels: string[];
	lastPolledAt: Date | null;
}

export interface PollStats {
	sources: number;
	channels: number;
	threads: number;
	chunks: number;
	requests: number;
	errors: number;
	skippedSources: number;
}
// #endregion

// #region Slack calls
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type HistoryPage = { messages: SlackMessage[]; has_more?: boolean; response_metadata?: { next_cursor?: string } };

class Pacer {
	requests = 0;
	private last = 0;
	constructor(
		private readonly source: PollSource,
		private readonly renew: () => Promise<void>,
	) {}

	async call<T extends Record<string, unknown>>(method: string, params: Record<string, string | number | undefined>) {
		const wait = this.last + jitteredGapMs() - Date.now();
		if (wait > 0) await sleep(wait);
		// Occasionally take a longer human-like break so the traffic is not a metronome.
		if (Math.random() < 0.04) await sleep(2000 + Math.random() * 6000);
		this.last = Date.now();
		this.requests++;
		if (this.requests % 20 === 0) await this.renew();
		if (this.source.kind === "session" && this.source.session) return slackWebApi<T>(this.source.session, method, params);
		return slackApi<T>(this.source.token, method, params);
	}
}

async function fetchReplies(pacer: Pacer, channelId: string, threadTs: string): Promise<SlackMessage[]> {
	const out: SlackMessage[] = [];
	let cursor: string | undefined;
	do {
		const page = await pacer.call<HistoryPage>("conversations.replies", {
			channel: channelId,
			ts: threadTs,
			limit: pageSize(),
			cursor,
		});
		out.push(...page.messages);
		cursor = page.has_more ? page.response_metadata?.next_cursor || undefined : undefined;
	} while (cursor);
	// Index 0 is the parent when paging from the start; drop anything with the parent's ts.
	return out.filter((m) => m.ts !== threadTs).sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts));
}

async function resolveChannelNames(pacer: Pacer, channelIds: string[]): Promise<Map<string, string>> {
	const names = new Map<string, string>();
	for (const id of channelIds) {
		try {
			const info = await pacer.call<{ channel: { id: string; name: string } }>("conversations.info", {
				channel: id,
			});
			names.set(id, info.channel.name);
		} catch (err) {
			if (isAuthError(err)) throw err;
			console.warn(`[SlackPoller] conversations.info ${id}:`, (err as Error).message);
			names.set(id, id);
		}
	}
	return names;
}
// #endregion

// #region Channel pass
async function pollChannel(
	pacer: Pacer,
	source: PollSource,
	ctx: SlackChannelContext,
	stats: PollStats,
): Promise<void> {
	const key = cursorKey(source.teamId, ctx.channelId);
	const stored = await redis.get(key);
	const cursorMs = stored ? parseInt(stored, 10) : NaN;
	const baseline = Number.isFinite(cursorMs) ? cursorMs : source.lastPolledAt?.getTime();
	const oldestMs = baseline ? baseline - OVERLAP_MS : Date.now() - BACKFILL_MS;
	const oldest = (oldestMs / 1000).toFixed(6);

	let newestSeenMs = baseline ?? 0;
	let pageCursor: string | undefined;
	let threads = 0;
	let chunks = 0;

	do {
		const page = await pacer.call<HistoryPage>("conversations.history", {
			channel: ctx.channelId,
			oldest,
			limit: pageSize(),
			cursor: pageCursor,
		});

		const rows: TroubleshootChunkInsert[] = [];
		for (const parent of page.messages) {
			newestSeenMs = Math.max(newestSeenMs, parseFloat(parent.ts) * 1000);
			if (!isThreadParent(parent)) continue;
			const replies =
				(parent.reply_count ?? 0) > 0 ? await fetchReplies(pacer, ctx.channelId, parent.ts) : [];
			threads++;
			const chunk = buildThreadChunk(ctx, { parent, replies });
			if (chunk) rows.push(chunk);
		}
		if (rows.length) chunks += await upsertChunks(rows);

		pageCursor = page.has_more ? page.response_metadata?.next_cursor || undefined : undefined;
	} while (pageCursor);

	// Only advance the cursor after the whole channel succeeded so a crash mid-way re-reads it.
	await redis.set(key, String(Math.round(Math.max(newestSeenMs, Date.now() - OVERLAP_MS))));
	// New or updated content for this category. Mark it dirty so the pass-end distillation rebuilds
	// only the channels that actually changed. The category is the channel name.
	if (chunks >= 1) await redis.sadd(DIRTY_SET_KEY, ctx.channelName);
	stats.channels++;
	stats.threads += threads;
	stats.chunks += chunks;
	console.log(`[SlackPoller] ${source.teamName} #${ctx.channelName}: ${threads} threads, ${chunks} chunks`);
}
// #endregion

// #region Source pass
const teamDomains = new Map<string, string | null>();

async function pollSource(source: PollSource, stats: PollStats, renew: () => Promise<void>): Promise<void> {
	const pacer = new Pacer(source, renew);
	try {
		if (source.kind === "session" && source.session) {
			teamDomains.set(source.teamId, source.session.teamDomain);
		} else if (!teamDomains.has(source.teamId)) {
			teamDomains.set(source.teamId, await fetchTeamDomain(source.token));
		}
		const teamDomain = teamDomains.get(source.teamId) ?? null;

		let targets: { id: string; name: string }[];
		if (source.channels.length) {
			const names = await resolveChannelNames(pacer, source.channels);
			targets = source.channels.map((id) => ({ id, name: names.get(id) ?? id }));
		} else {
			pacer.requests++;
			const conversations =
				source.kind === "session" && source.session
					? await listSessionConversations(source.session)
					: // Bot tokens keep reading the private FiM CSA channels the bot was invited to; user tokens are public only.
						await listConversations(source.token, source.kind === "bot" ? "public_channel,private_channel" : "public_channel");
			targets = conversations.filter((c) => c.is_member !== false).map((c) => ({ id: c.id, name: c.name }));
		}

		// Random channel order so the read pattern is not identical every pass.
		for (let i = targets.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[targets[i], targets[j]] = [targets[j], targets[i]];
		}
		for (const ch of targets) {
			try {
				await pollChannel(
					pacer,
					source,
					{ teamId: source.teamId, teamDomain, channelId: ch.id, channelName: ch.name },
					stats,
				);
			} catch (err) {
				if (isAuthError(err)) throw err;
				stats.errors++;
				console.error(`[SlackPoller] ${source.teamName} #${ch.name}:`, (err as Error).message);
			}
		}

		const now = new Date();
		if (source.kind === "user") {
			await db
				.update(slackUserTokens)
				.set({ last_polled_at: now, updated_at: now })
				.where(eq(slackUserTokens.id, source.id));
		} else if (source.kind === "session") {
			await db
				.update(slackSessionTokens)
				.set({ last_polled_at: now, updated_at: now })
				.where(eq(slackSessionTokens.id, source.id));
		} else {
			await redis.set(botPolledKey(source.teamId), String(now.getTime()));
		}
		stats.sources++;
	} catch (err) {
		if (isAuthError(err) && source.kind === "user") {
			console.warn(
				`[SlackPoller] token ${source.id} (${source.teamName}) revoked: ${(err as SlackApiError).code}`,
			);
			await db
				.update(slackUserTokens)
				.set({ scopes: "revoked", updated_at: new Date() })
				.where(eq(slackUserTokens.id, source.id));
			stats.skippedSources++;
			return;
		}
		stats.errors++;
		console.error(
			`[SlackPoller] source ${source.kind}:${source.id} (${source.teamName}) failed:`,
			(err as Error).message,
		);
	} finally {
		stats.requests += pacer.requests;
	}
}

async function loadSources(): Promise<PollSource[]> {
	const users = await db.select().from(slackUserTokens);
	const bots = await db.select().from(slackServers);
	const out: PollSource[] = [];
	for (const u of users) {
		if (u.scopes === "revoked") continue;
		out.push({
			kind: "user",
			id: u.id,
			teamId: u.team_id,
			teamName: u.team_name,
			token: u.access_token,
			channels: u.channels ?? [],
			lastPolledAt: u.last_polled_at,
		});
	}
	for (const b of bots) {
		const polled = await redis.get(botPolledKey(b.team_id));
		out.push({
			kind: "bot",
			id: b.id,
			teamId: b.team_id,
			teamName: b.team_name,
			token: b.access_token,
			channels: [],
			lastPolledAt: polled ? new Date(parseInt(polled, 10)) : null,
		});
	}
	const sessions = await db.select().from(slackSessionTokens);
	for (const ss of sessions) {
		out.push({
			kind: "session",
			id: ss.id,
			teamId: ss.team_id,
			teamName: ss.team_name,
			token: ss.token,
			session: { teamDomain: ss.team_domain, token: ss.token, cookieD: ss.cookie_d },
			channels: ss.channels ?? [],
			lastPolledAt: ss.last_polled_at,
		});
	}
	return out;
}
// #endregion

// #region Pass + scheduler
let passRunning: Promise<PollStats> | null = null;

/** One full poll pass over every source. Concurrent calls share the in-flight pass. */
export function runSlackPollPass(): Promise<PollStats> {
	if (passRunning) return passRunning;
	passRunning = (async () => {
		const stats: PollStats = {
			sources: 0,
			channels: 0,
			threads: 0,
			chunks: 0,
			requests: 0,
			errors: 0,
			skippedSources: 0,
		};
		const started = Date.now();
		const renew = async () => {
			await acquireOrRenewLock(LOCK_NAME, LOCK_TTL_SECONDS);
		};
		try {
			const sources = await loadSources();
			console.log(`[SlackPoller] pass start: ${sources.length} source(s)`);
			for (const source of sources) await pollSource(source, stats, renew);
			// Rebuild the distilled docs for any categories this pass touched. No-op (zero LLM calls)
			// when nothing was marked dirty.
			try {
				const distilled = await runDistillation();
				if (distilled > 0) console.log(`[SlackPoller] distilled ${distilled} categor${distilled === 1 ? "y" : "ies"}`);
			} catch (err) {
				console.error("[SlackPoller] distillation failed:", (err as Error).message);
			}
		} catch (err) {
			stats.errors++;
			console.error("[SlackPoller] pass failed:", (err as Error).message);
		} finally {
			passRunning = null;
		}
		const secs = Math.round((Date.now() - started) / 1000);
		console.log(
			`[SlackPoller] pass done in ${secs}s: ${stats.sources} sources, ${stats.channels} channels, ${stats.threads} threads, ${stats.chunks} chunks, ${stats.requests} requests, ${stats.errors} errors, ${stats.skippedSources} revoked`,
		);
		return stats;
	})();
	return passRunning;
}

function nextDelayMs(): number {
	// +/- 10% jitter so runs are not on a predictable clock.
	const base = baseIntervalMs();
	return Math.round(base * (0.9 + Math.random() * 0.2));
}

/**
 * Start the scheduler. Every minute: renew/acquire the leader lock; if this instance leads and the
 * shared next-run time has passed, run a pass and schedule the next one 3h plus or minus 30min out.
 * The next-run time lives in Redis so a leader change does not reset the cadence.
 */
export function startSlackPoller(): void {
	if (!enabled()) {
		console.log("[SlackPoller] disabled by TROUBLESHOOT_SLACK_POLL_ENABLED");
		return;
	}
	(async () => {
		while (true) {
			try {
				const isLeader = await acquireOrRenewLock(LOCK_NAME, LOCK_TTL_SECONDS);
				if (isLeader) {
					const stored = await redis.get(NEXT_RUN_KEY);
					const nextRun = stored ? parseInt(stored, 10) : 0;
					if (Date.now() >= nextRun) {
						await runSlackPollPass();
						await redis.set(NEXT_RUN_KEY, String(Date.now() + nextDelayMs()));
					}
				}
			} catch (err) {
				console.error("[SlackPoller] scheduler error:", (err as Error).message);
			}
			await sleep(TICK_MS);
		}
	})();
}
// #endregion
