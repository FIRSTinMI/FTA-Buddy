import { and, eq, ne } from "drizzle-orm";
import { db } from "../db/db";
import { events, slackServers, users } from "../db/schema";
import type { Profile } from "../../shared/types";
import { getEvent } from "./get-event";

export async function slackOAuth(code: string) {
	const url = new URL("https://slack.com/api/oauth.v2.access");
	url.searchParams.append("client_id", process.env.SLACK_CLIENT_ID ?? "");
	url.searchParams.append("client_secret", process.env.SLACK_CLIENT_SECRET ?? "");
	url.searchParams.append("code", code);
	url.searchParams.append("redirect_uri", "https://ftabuddy.com/slack/oauth");

	const response = await fetch(url.toString(), {
		method: "POST",
		signal: AbortSignal.timeout(10_000),
	});

	const data = await response.json();

	if (!data.ok) {
		throw new Error(data.error);
	}

	console.log(data);

	await db
		.insert(slackServers)
		.values({
			team_id: data.team.id,
			team_name: data.team.name,
			access_token: data.access_token,
			webhook_url: data.incoming_webhook,
		})
		.onConflictDoUpdate({
			target: slackServers.team_id,
			set: {
				team_name: data.team.name,
				access_token: data.access_token,
				webhook_url: data.incoming_webhook,
			},
		})
		.execute();

	return true;
}
export async function linkChannel(args: string[], channel_id: string, team_id: string) {
	if (!args[1]) {
		throw new Error("Usage: `/ftabuddy link [event code]`");
	}

	const eventCode = args[0];
	const eventPin = args[1];

	// Check if the event exists
	const event = (
		await db
			.select({ code: events.code, pin: events.pin, token: events.token })
			.from(events)
			.where(eq(events.code, eventCode))
			.execute()
	)[0];

	if (!event || event.pin !== eventPin) {
		throw new Error("Event not found");
	}

	// Check if the bot is in the channel
	const botInChannel = await isBotInChannel(channel_id, team_id);

	if (!botInChannel) {
		throw new Error(`Bot is not in channel, invite the bot using \`/invite @FTA Buddy\`, then try again!`);
	}

	// Unlink this channel from any previously linked events so stale events don't receive future tickets
	await db
		.update(events)
		.set({ slackChannel: null, slackTeam: null })
		.where(and(eq(events.slackChannel, channel_id), ne(events.code, eventCode)))
		.execute();

	// Store the channel in the database
	await db
		.update(events)
		.set({ slackChannel: channel_id, slackTeam: team_id })
		.where(eq(events.code, eventCode))
		.execute();

	const eventObj = await getEvent("", eventCode);
	eventObj.slackChannel = channel_id;
	eventObj.slackTeam = team_id;

	return {
		response_type: "in_channel",
		text: `FTA Buddy linked to event ${eventCode}. Join: https://ftabuddy.com/join/${event.token}`,
		blocks: [
			{
				type: "header",
				text: { type: "plain_text", text: "FTA Buddy Linked!", emoji: true },
			},
			{
				type: "section",
				fields: [
					{ type: "mrkdwn", text: `*Event Code*\n\`${eventCode}\`` },
					{ type: "mrkdwn", text: `*Event Pin*\n\`${event.pin}\`` },
				],
			},
			{
				type: "actions",
				elements: [
					{
						type: "button",
						text: { type: "plain_text", text: "Join Event", emoji: true },
						url: `https://ftabuddy.com/join/${event.token}`,
						style: "primary",
					},
				],
			},
			{ type: "divider" },
			{
				type: "section",
				text: {
					type: "mrkdwn",
					text: ":robot_face: *How this channel works*\nCSA requests from Nexus are automatically added as tickets in FTA Buddy. Use reactions on any ticket message to update its status:",
				},
			},
			{
				type: "section",
				text: {
					type: "mrkdwn",
					text: ":eyes: - Assign yourself to the ticket (you're on your way)\n:white_check_mark: - Mark the ticket resolved, and leave a thread reply explaining what you did\n:x: - Mark the team as refusing help",
				},
			},
			{ type: "divider" },
			{
				type: "section",
				text: {
					type: "mrkdwn",
					text: ":link: *Link your FTA-Buddy account*\nClick the button below to connect your Slack identity to your FTA-Buddy account.",
				},
			},
			{
				type: "actions",
				elements: [
					{
						type: "button",
						text: { type: "plain_text", text: "Link My Account", emoji: true },
						action_id: "link_ftabuddy_account",
						style: "primary",
					},
				],
			},
		],
	};
}

export async function sendEphemeralMessage(
	channel_id: string,
	team_id: string,
	user_id: string,
	message: SlackMessage,
) {
	const response = await fetch("https://slack.com/api/chat.postEphemeral", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${await getTokenByTeam(team_id)}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ channel: channel_id, user: user_id, ...message }),
		signal: AbortSignal.timeout(10_000),
	});

	const data = await response.json();
	if (!data.ok) {
		throw new Error(`Slack postEphemeral error: ${data.error}`);
	}
	return data;
}

async function isBotInChannel(channel_id: string, team_id: string): Promise<boolean> {
	console.log(await getTokenByTeam(team_id));
	const response = await fetch(`https://slack.com/api/conversations.info?channel=${channel_id}`, {
		method: "GET",
		headers: {
			Authorization: `Bearer ${await getTokenByTeam(team_id)}`,
			"Content-Type": "application/json",
		},
		signal: AbortSignal.timeout(10_000),
	});

	const data = await response.json();

	console.log(data);

	if (!data.ok) {
		return false;
	}

	return data.channel.is_member;
}

async function getTokenByTeam(team_id: string) {
	const token = (
		await db
			.select({ access_token: slackServers.access_token })
			.from(slackServers)
			.where(eq(slackServers.team_id, team_id))
			.execute()
	)[0].access_token;

	if (!token) {
		throw new Error("Slack acces token not found for team " + team_id);
	}

	return token;
}

async function getChannelByEvent(eventCode: string) {
	const result = (
		await db
			.select({ slackChannel: events.slackChannel, slackTeam: events.slackTeam })
			.from(events)
			.where(eq(events.code, eventCode))
			.execute()
	)[0];

	if (!result) {
		throw new Error("Event not found");
	}

	if (!result.slackChannel || !result.slackTeam) {
		throw new Error("Event not linked to a channel");
	}

	return result as { slackChannel: string; slackTeam: string };
}

export async function sendSlackMessage(channel_id: string, team_id: string, message: SlackMessage, thread_ts?: string) {
	const response = await fetch("https://slack.com/api/chat.postMessage", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${await getTokenByTeam(team_id)}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ channel: channel_id, ...message, thread_ts }),
		signal: AbortSignal.timeout(10_000),
	});

	const data = await response.json();

	if (!data.ok) {
		throw new Error(data.error);
	}

	return data.ts;
}

export interface SlackMessage {
	blocks?: any[];
	text?: string;
	username?: string;
}

export async function updateSlackMessage(
	channel_id: string,
	team_id: string,
	message_ts: string,
	message: SlackMessage,
) {
	const response = await fetch("https://slack.com/api/chat.update", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${await getTokenByTeam(team_id)}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ channel: channel_id, ts: message_ts, ...message }),
		signal: AbortSignal.timeout(10_000),
	});

	return message_ts;
}

export async function deleteSlackMessage(channel_id: string, team_id: string, message_ts: string) {
	const response = await fetch("https://slack.com/api/chat.delete", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${await getTokenByTeam(team_id)}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ channel: channel_id, ts: message_ts }),
		signal: AbortSignal.timeout(10_000),
	});

	return message_ts;
}

export async function addSlackReaction(
	channel_id: string,
	team_id: string,
	message_ts: string,
	reaction: "thumbsup" | "thumbsdown" | "white_check_mark" | "x" | "eyes",
) {
	const response = await fetch("https://slack.com/api/reactions.add", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${await getTokenByTeam(team_id)}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ channel: channel_id, timestamp: message_ts, name: reaction }),
		signal: AbortSignal.timeout(10_000),
	});
}

export async function removeSlackReaction(
	channel_id: string,
	team_id: string,
	message_ts: string,
	reaction: "thumbsup" | "thumbsdown" | "white_check_mark" | "x" | "eyes",
) {
	const response = await fetch("https://slack.com/api/reactions.remove", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${await getTokenByTeam(team_id)}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ channel: channel_id, timestamp: message_ts, name: reaction }),
		signal: AbortSignal.timeout(10_000),
	});
}

/**
 * Opens a modal prompting the user to enter a team number for ticket creation.
 * Stores channel_id and message_ts in private_metadata so they survive the modal round-trip.
 */
export async function openTicketModal(trigger_id: string, team_id: string, channel_id: string, message_ts: string) {
	const token = await getTokenByTeam(team_id);
	const response = await fetch("https://slack.com/api/views.open", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			trigger_id,
			view: {
				type: "modal",
				callback_id: "ftabuddy_ticket_modal",
				private_metadata: JSON.stringify({ channel_id, message_ts }),
				title: { type: "plain_text", text: "Create FTA-Buddy Ticket" },
				submit: { type: "plain_text", text: "Create" },
				close: { type: "plain_text", text: "Cancel" },
				blocks: [
					{
						type: "input",
						block_id: "team_number_block",
						label: { type: "plain_text", text: "Team Number" },
						element: {
							type: "plain_text_input",
							action_id: "team_number_input",
							placeholder: { type: "plain_text", text: "e.g. 254" },
						},
					},
				],
			},
		}),
		signal: AbortSignal.timeout(10_000),
	});
	const data = await response.json();
	if (!data.ok) throw new Error(`views.open error: ${data.error}`);
}

/**
 * Fetches all non-parent messages in a thread (replies only, parent excluded).
 * Returns up to 200 replies; bots and messages without a user are included so
 * callers can filter as needed.
 */
export async function fetchSlackThreadReplies(
	channel_id: string,
	team_id: string,
	message_ts: string,
): Promise<Array<{ ts: string; text: string; user?: string; bot_id?: string }>> {
	const token = await getTokenByTeam(team_id);
	const url = new URL("https://slack.com/api/conversations.replies");
	url.searchParams.set("channel", channel_id);
	url.searchParams.set("ts", message_ts);
	url.searchParams.set("limit", "200");

	const response = await fetch(url.toString(), {
		headers: { Authorization: `Bearer ${token}` },
		signal: AbortSignal.timeout(10_000),
	});

	const data = await response.json();
	if (!data.ok || !data.messages?.length) return [];
	// Index 0 is always the parent message; skip it.
	return data.messages.slice(1);
}

/**
 * Fetches the current reactions on a specific Slack message.
 */
export async function fetchSlackMessageReactions(
	channel_id: string,
	team_id: string,
	message_ts: string,
): Promise<Array<{ name: string; users: string[] }>> {
	const token = await getTokenByTeam(team_id);
	const url = new URL("https://slack.com/api/reactions.get");
	url.searchParams.set("channel", channel_id);
	url.searchParams.set("timestamp", message_ts);
	url.searchParams.set("full", "true");

	const response = await fetch(url.toString(), {
		headers: { Authorization: `Bearer ${token}` },
		signal: AbortSignal.timeout(10_000),
	});

	const data = await response.json();
	if (!data.ok) return [];
	return data.message?.reactions ?? [];
}

/**
 * Fetches the text of a specific Slack message (typically the parent of a thread).
 * Uses conversations.replies with limit=1 so the first result is always the parent.
 */
export async function fetchSlackMessage(
	channel_id: string,
	team_id: string,
	message_ts: string,
): Promise<string | null> {
	const token = await getTokenByTeam(team_id);
	const url = new URL("https://slack.com/api/conversations.replies");
	url.searchParams.set("channel", channel_id);
	url.searchParams.set("ts", message_ts);
	url.searchParams.set("limit", "1");

	const response = await fetch(url.toString(), {
		headers: { Authorization: `Bearer ${token}` },
		signal: AbortSignal.timeout(10_000),
	});

	const data = await response.json();
	if (!data.ok || !data.messages?.length) return null;
	return (data.messages[0].text as string) ?? null;
}

/**
 * Resolves a Slack user ID to an FTA-Buddy Profile.
 * First checks if the Slack user has linked their FTA-Buddy account.
 * Falls back to fetching their display name from the Slack API.
 */
export async function resolveSlackUserProfile(slackUserId: string, teamId: string): Promise<Profile> {
	// Check for a linked FTA-Buddy account
	const linked = await db.query.users.findFirst({ where: eq(users.slack_user_id, slackUserId) });
	if (linked) {
		return { id: linked.id, username: linked.username, role: linked.role, admin: linked.admin };
	}

	// Fall back to Slack display name via users.info
	try {
		const token = await getTokenByTeam(teamId);
		const response = await fetch(`https://slack.com/api/users.info?user=${encodeURIComponent(slackUserId)}`, {
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
			signal: AbortSignal.timeout(10_000),
		});
		const data = await response.json();
		if (data.ok && data.user) {
			const displayName: string =
				data.user.profile?.display_name ||
				data.user.profile?.real_name ||
				data.user.real_name ||
				data.user.name ||
				"Slack User";
			return { id: -1, role: "CSA", admin: false, username: displayName, source: "Slack" };
		} else {
			console.warn(`[Slack] users.info failed for ${slackUserId}:`, data.error ?? "unknown error");
		}
	} catch (err) {
		console.warn(`[Slack] resolveSlackUserProfile error for ${slackUserId}:`, err);
	}

	return { id: -1, role: "CSA", admin: false, username: "Slack User", source: "Slack" };
}
