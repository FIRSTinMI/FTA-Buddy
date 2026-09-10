// Read a Slack workspace through a logged-in browser session (xoxc token + `d` cookie) instead of
// an installed app. Used only where the workspace blocks app installs. Read-only: history, replies,
// channel list. Never posts. Activity is deliberately paced and jittered by the caller.

import { SlackApiError } from "./slack-user-oauth";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface SlackSession {
	teamDomain: string;
	token: string;
	cookieD: string;
}

/**
 * Call a Slack web-client API method the way the browser does: POST form body carrying the xoxc
 * token, with the `d` cookie attached. Retries on 429 honouring Retry-After.
 */
export async function slackWebApi<T extends Record<string, unknown>>(
	session: SlackSession,
	method: string,
	params: Record<string, string | number | undefined> = {},
	maxRetries = 5,
): Promise<T & { ok: true }> {
	const url = `https://${session.teamDomain}.slack.com/api/${method}`;
	const body = new URLSearchParams();
	body.set("token", session.token);
	for (const [k, v] of Object.entries(params)) if (v !== undefined) body.set(k, String(v));

	for (let attempt = 0; ; attempt++) {
		const res = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
				Cookie: `d=${session.cookieD}`,
				// Look like the web client, not a bot.
				"User-Agent":
					"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
			},
			body,
			signal: AbortSignal.timeout(20_000),
		});

		if (res.status === 429) {
			if (attempt >= maxRetries) throw new SlackApiError(method, "ratelimited");
			const retryAfter = Math.max(1, parseInt(res.headers.get("retry-after") ?? "30", 10) || 30);
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
	is_member?: boolean;
}

/** Public channels this session can see. */
export async function listSessionConversations(session: SlackSession): Promise<SlackConversation[]> {
	const out: SlackConversation[] = [];
	let cursor: string | undefined;
	do {
		const page = await slackWebApi<{
			channels: SlackConversation[];
			response_metadata?: { next_cursor?: string };
		}>(session, "users.conversations", {
			types: "public_channel,private_channel",
			exclude_archived: "true",
			limit: 200,
			cursor,
		});
		out.push(...page.channels);
		cursor = page.response_metadata?.next_cursor || undefined;
	} while (cursor);
	return out;
}
