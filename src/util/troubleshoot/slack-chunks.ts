// Pure functions that turn Slack messages into troubleshoot corpus chunks.
// No I/O here so the poller and the unit test share the same code.

import type { TroubleshootChunkInsert } from "../../db/schema";

// #region Types
/** Subset of a Slack message object that the builder needs. */
export interface SlackMessage {
	ts: string;
	text?: string;
	user?: string;
	bot_id?: string;
	subtype?: string;
	thread_ts?: string;
	reply_count?: number;
}

export interface SlackChannelContext {
	teamId: string;
	/** Workspace subdomain (`<domain>.slack.com`). Null when unknown; the chunk url is then null. */
	teamDomain: string | null;
	channelId: string;
	channelName: string;
}

export interface SlackThread {
	parent: SlackMessage;
	/** Replies in chronological order, parent excluded. */
	replies: SlackMessage[];
}
// #endregion

// #region Rules
/** Standalone messages shorter than this are noise (thanks, ok, +1) and are skipped. */
export const MIN_STANDALONE_LENGTH = 40;
const TITLE_LENGTH = 80;

/** Subtypes that are never useful: joins, leaves, pins, topic changes and so on. */
const IGNORED_SUBTYPES = new Set([
	"channel_join",
	"channel_leave",
	"channel_topic",
	"channel_purpose",
	"channel_name",
	"channel_archive",
	"channel_unarchive",
	"group_join",
	"group_leave",
	"pinned_item",
	"unpinned_item",
	"reminder_add",
	"tombstone",
	"ekm_access_denied",
	"joiner_notification",
	"sh_room_created",
	"huddle_thread",
]);

export function isBotMessage(m: SlackMessage): boolean {
	return m.subtype === "bot_message" || (!m.user && !!m.bot_id);
}

export function isHumanMessage(m: SlackMessage): boolean {
	return !isBotMessage(m) && !!m.user;
}

/** True for messages that start a thread or stand alone in the channel. */
export function isThreadParent(m: SlackMessage): boolean {
	if (m.subtype && IGNORED_SUBTYPES.has(m.subtype)) return false;
	// A reply that was broadcast to the channel shows up in history with thread_ts != ts.
	if (m.thread_ts && m.thread_ts !== m.ts) return false;
	return true;
}

export function sourceKey(teamId: string, channelId: string, threadTs: string): string {
	return `slack:${teamId}:${channelId}:${threadTs}`;
}

export function slackPermalink(teamDomain: string | null, channelId: string, ts: string): string | null {
	if (!teamDomain) return null;
	return `https://${teamDomain}.slack.com/archives/${channelId}/p${ts.replace(".", "")}`;
}

export function tsToDate(ts: string): Date {
	return new Date(Math.round(parseFloat(ts) * 1000));
}

function clean(text: string | undefined): string {
	return (text ?? "").replace(/\r/g, "").trim();
}
// #endregion

// #region Build
/**
 * Build one chunk for a thread. Returns null when the thread is not worth keeping:
 * an ignored subtype, a bot post with no human replies, or a short standalone message.
 */
export function buildThreadChunk(ctx: SlackChannelContext, thread: SlackThread): TroubleshootChunkInsert | null {
	const { parent } = thread;
	if (!isThreadParent(parent)) return null;

	const replies = thread.replies.filter(
		(r) => clean(r.text).length > 0 && !(r.subtype && IGNORED_SUBTYPES.has(r.subtype)),
	);
	const humanReplies = replies.filter(isHumanMessage);
	const parentText = clean(parent.text);

	if (isBotMessage(parent) && humanReplies.length === 0) return null;
	if (replies.length === 0 && parentText.length < MIN_STANDALONE_LENGTH) return null;
	if (parentText.length === 0 && replies.length === 0) return null;

	const firstLine = parentText.replace(/\s+/g, " ").trim();
	const title = `#${ctx.channelName}: ${firstLine.slice(0, TITLE_LENGTH)}`;
	const body = [parentText || "(no text)", ...replies.map((r) => `Reply: ${clean(r.text)}`)].join("\n");

	return {
		source: "slack",
		source_key: sourceKey(ctx.teamId, ctx.channelId, parent.ts),
		url: slackPermalink(ctx.teamDomain, ctx.channelId, parent.ts),
		title,
		heading: null,
		body,
		source_date: tsToDate(parent.ts),
	};
}

/**
 * Build chunks for a page of channel history. `repliesByTs` holds the fetched replies
 * for every parent whose reply_count > 0; parents missing from the map are treated as standalone.
 */
export function buildSlackChunks(
	ctx: SlackChannelContext,
	messages: SlackMessage[],
	repliesByTs: Map<string, SlackMessage[]>,
): TroubleshootChunkInsert[] {
	const out: TroubleshootChunkInsert[] = [];
	for (const parent of messages) {
		const chunk = buildThreadChunk(ctx, { parent, replies: repliesByTs.get(parent.ts) ?? [] });
		if (chunk) out.push(chunk);
	}
	return out;
}
// #endregion
