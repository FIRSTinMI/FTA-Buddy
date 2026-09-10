// User-scope Slack OAuth (xoxp tokens) for the troubleshoot corpus poller.
// A signed-in user installs the existing FTA-Buddy Slack app with user scopes, which
// lets the poller read every channel that user can see, even in workspaces where a bot
// cannot be added (the global CSA workspace on the free plan).

import { randomBytes } from "crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../db/db";
import { slackUserTokens } from "../db/schema";
import { redis } from "./redis";

// #region Config
export const SLACK_USER_SCOPES = ["channels:history", "groups:history", "channels:read", "groups:read", "users:read"];

const STATE_PREFIX = "ftabuddy:slack-user-oauth:state:";
const STATE_TTL_SECONDS = 10 * 60;

export function userOAuthRedirectUri(): string {
	return process.env.SLACK_USER_REDIRECT_URI || "https://ftabuddy.com/slack/user-oauth/callback";
}

/** Where the callback sends the browser afterwards. The app opens Settings when it sees ?slack=. */
export function userOAuthReturnUrl(status: "connected" | "error", detail?: string): string {
	const base = process.env.SLACK_USER_RETURN_URL || "https://ftabuddy.com/";
	const url = new URL(base);
	url.searchParams.set("slack", status);
	if (detail) url.searchParams.set("reason", detail);
	return url.toString();
}
// #endregion

// #region Slack API client
export class SlackApiError extends Error {
	constructor(
		public readonly method: string,
		public readonly code: string,
	) {
		super(`Slack ${method}: ${code}`);
	}
}

export function isAuthError(err: unknown): boolean {
	return (
		err instanceof SlackApiError &&
		["invalid_auth", "token_revoked", "account_inactive", "token_expired", "not_authed"].includes(err.code)
	);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Call a Slack Web API method with a bearer token. GET with query params.
 * Retries on 429 using Retry-After (up to `maxRetries` times) and throws SlackApiError on `ok: false`.
 */
export async function slackApi<T extends Record<string, unknown>>(
	token: string,
	method: string,
	params: Record<string, string | number | undefined> = {},
	maxRetries = 5,
): Promise<T & { ok: true }> {
	const url = new URL(`https://slack.com/api/${method}`);
	for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));

	for (let attempt = 0; ; attempt++) {
		const res = await fetch(url.toString(), {
			headers: { Authorization: `Bearer ${token}` },
			signal: AbortSignal.timeout(20_000),
		});

		if (res.status === 429) {
			if (attempt >= maxRetries) throw new SlackApiError(method, "ratelimited");
			const retryAfter = Math.max(1, parseInt(res.headers.get("retry-after") ?? "30", 10) || 30);
			console.warn(`[SlackUser] 429 on ${method}, waiting ${retryAfter}s`);
			await sleep(retryAfter * 1000);
			continue;
		}

		const data = (await res.json()) as { ok: boolean; error?: string } & T;
		if (!data.ok) {
			if (data.error === "ratelimited" && attempt < maxRetries) {
				await sleep(30_000);
				continue;
			}
			throw new SlackApiError(method, data.error ?? `http_${res.status}`);
		}
		return data as T & { ok: true };
	}
}

export interface SlackConversation {
	id: string;
	name: string;
	is_private?: boolean;
	is_archived?: boolean;
	is_member?: boolean;
	num_members?: number;
}

/** All public + private channels the token can read, following pagination. */
export async function listConversations(token: string, excludeArchived = true): Promise<SlackConversation[]> {
	const out: SlackConversation[] = [];
	let cursor: string | undefined;
	do {
		const page = await slackApi<{ channels: SlackConversation[]; response_metadata?: { next_cursor?: string } }>(
			token,
			"users.conversations",
			{
				types: "public_channel,private_channel",
				exclude_archived: excludeArchived ? "true" : "false",
				limit: 200,
				cursor,
			},
		);
		out.push(...page.channels);
		cursor = page.response_metadata?.next_cursor || undefined;
	} while (cursor);
	return out;
}

/** Workspace subdomain, used for permalinks. Null when the token lacks team:read. */
export async function fetchTeamDomain(token: string): Promise<string | null> {
	try {
		const data = await slackApi<{ team: { domain?: string } }>(token, "team.info", {}, 1);
		return data.team?.domain ?? null;
	} catch {
		return null;
	}
}
// #endregion

// #region Install flow
/** Mint a one-time state bound to the app user and return the Slack authorize URL. */
export async function createInstallUrl(userId: number): Promise<string> {
	const state = randomBytes(24).toString("base64url");
	await redis.set(STATE_PREFIX + state, String(userId), "EX", STATE_TTL_SECONDS);
	return buildAuthorizeUrl(state);
}

export function buildAuthorizeUrl(state: string): string {
	const url = new URL("https://slack.com/oauth/v2/authorize");
	url.searchParams.set("client_id", process.env.SLACK_CLIENT_ID ?? "");
	url.searchParams.set("user_scope", SLACK_USER_SCOPES.join(","));
	url.searchParams.set("redirect_uri", userOAuthRedirectUri());
	url.searchParams.set("state", state);
	return url.toString();
}

/** Look up (and consume) the user id behind a state token. Null when unknown or expired. */
export async function consumeInstallState(state: string): Promise<number | null> {
	if (!state) return null;
	const key = STATE_PREFIX + state;
	const value = await redis.get(key);
	if (!value) return null;
	await redis.del(key);
	const id = parseInt(value, 10);
	return Number.isFinite(id) ? id : null;
}

/** Same as consume but leaves the state in place, for the /start redirect hop. */
export async function peekInstallState(state: string): Promise<number | null> {
	if (!state) return null;
	const value = await redis.get(STATE_PREFIX + state);
	const id = value ? parseInt(value, 10) : NaN;
	return Number.isFinite(id) ? id : null;
}

interface OAuthAccessResponse {
	ok: boolean;
	error?: string;
	team?: { id: string; name: string };
	authed_user?: { id: string; scope?: string; access_token?: string; token_type?: string };
}

/**
 * Exchange the OAuth code for a user token and upsert slackUserTokens on (user_id, team_id).
 * Returns the team name for the success message.
 */
export async function completeUserInstall(code: string, userId: number): Promise<{ teamName: string; teamId: string }> {
	const body = new URLSearchParams({
		client_id: process.env.SLACK_CLIENT_ID ?? "",
		client_secret: process.env.SLACK_CLIENT_SECRET ?? "",
		code,
		redirect_uri: userOAuthRedirectUri(),
	});
	const res = await fetch("https://slack.com/api/oauth.v2.access", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body,
		signal: AbortSignal.timeout(15_000),
	});
	const data = (await res.json()) as OAuthAccessResponse;
	if (!data.ok) throw new Error(data.error ?? "oauth_failed");

	const token = data.authed_user?.access_token;
	const slackUserId = data.authed_user?.id;
	const teamId = data.team?.id;
	if (!token || !slackUserId || !teamId) throw new Error("no_user_token");

	const teamName = data.team?.name ?? teamId;
	const scopes = data.authed_user?.scope ?? "";

	// No unique index on (user_id, team_id), so do the upsert by hand.
	const existing = await db.query.slackUserTokens.findFirst({
		where: and(eq(slackUserTokens.user_id, userId), eq(slackUserTokens.team_id, teamId)),
	});
	if (existing) {
		await db
			.update(slackUserTokens)
			.set({
				team_name: teamName,
				slack_user_id: slackUserId,
				access_token: token,
				scopes,
				updated_at: new Date(),
			})
			.where(eq(slackUserTokens.id, existing.id));
	} else {
		await db.insert(slackUserTokens).values({
			user_id: userId,
			team_id: teamId,
			team_name: teamName,
			slack_user_id: slackUserId,
			access_token: token,
			scopes,
			channels: [],
		});
	}

	return { teamName, teamId };
}
// #endregion
