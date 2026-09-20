// Pure functions that turn Slack messages into troubleshoot corpus chunks.
// No I/O here so the poller and the unit test share the same code.

import type { TroubleshootChunkInsert } from "../../db/schema";
import { staffLabel } from "./slack-staff";

// #region Types
/** Subset of a Slack file object that the image captioner needs. */
export interface SlackFile {
	id: string;
	mimetype?: string;
	name?: string;
	title?: string;
	size?: number;
	url_private?: string;
	thumb_1024?: string;
	thumb_720?: string;
}

/** Subset of a Slack message object that the builder needs. */
export interface SlackMessage {
	ts: string;
	text?: string;
	user?: string;
	bot_id?: string;
	subtype?: string;
	thread_ts?: string;
	reply_count?: number;
	/** Files posted with the message. Images are captioned before the chunk is built. */
	files?: SlackFile[];
	/** One caption per readable image, filled in by the poller (see slack-images.ts). */
	captions?: string[];
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

/**
 * Message text with its image captions appended. A screenshot is often the whole content of a CSA
 * message, so a message with no text but a readable image still carries something worth keeping.
 */
export function messageText(m: SlackMessage): string {
	const captions = (m.captions ?? []).filter((c) => c.trim().length > 0).map((c) => `[Image: ${c.trim()}]`);
	return [clean(m.text), ...captions].filter((p) => p.length > 0).join("\n");
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
		(r) => messageText(r).length > 0 && !(r.subtype && IGNORED_SUBTYPES.has(r.subtype)),
	);
	const humanReplies = replies.filter(isHumanMessage);
	const parentText = messageText(parent);

	if (isBotMessage(parent) && humanReplies.length === 0) return null;
	if (replies.length === 0 && parentText.length < MIN_STANDALONE_LENGTH) return null;
	if (parentText.length === 0 && replies.length === 0) return null;

	const firstLine = parentText.replace(/\s+/g, " ").trim();
	const title = `#${ctx.channelName}: ${firstLine.slice(0, TITLE_LENGTH)}`;
	// Named vendor/FIRST staff keep their attribution; everyone else is anonymous.
	const attribute = (m: SlackMessage, text: string): string => {
		const label = staffLabel(m.user);
		return label ? `${label}: ${text}` : text;
	};
	const body = [
		attribute(parent, parentText || "(no text)"),
		...replies.map((r) => `Reply: ${attribute(r, messageText(r))}`),
	].join("\n");

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
