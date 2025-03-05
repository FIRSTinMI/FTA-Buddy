import { eq } from "drizzle-orm";
import { db } from "../db/db";
import { events, slackServers } from "../db/schema";
import { getEvent } from "./get-event";

export async function slackOAuth(code: string) {
    const url = new URL('https://slack.com/api/oauth.v2.access');
    url.searchParams.append('client_id', process.env.SLACK_CLIENT_ID ?? "");
    url.searchParams.append('client_secret', process.env.SLACK_CLIENT_SECRET ?? "");
    url.searchParams.append('code', code);
    url.searchParams.append('redirect_uri', "https://ftabuddy.com/slack/oauth");

    const response = await fetch(url.toString(), {
        method: 'POST',
    });

    const data = await response.json();

    if (!data.ok) {
        throw new Error(data.error);
    }

    console.log(data);

    await db.insert(slackServers).values({
        team_id: data.team.id,
        team_name: data.team.name,
        access_token: data.access_token,
        webhook_url: data.incoming_webhook
    }).execute();

    return true;
}
export async function linkChannel(args: string[], channel_id: string, team_id: string) {
    if (!args[1]) {
        throw new Error("Usage: `/ftabuddy link [event code]`");
    }

    const eventCode = args[1];

    // Check if the event exists
    const event = (await db.select({ code: events.code, pin: events.pin })
        .from(events)
        .where(eq(events.code, eventCode))
        .execute())[0];

    if (!event) {
        throw new Error("Event not found");
    }

    // Check if the bot is in the channel
    const botInChannel = await isBotInChannel(channel_id, team_id);

    if (!botInChannel) {
        throw new Error(`Bot is not in channel, invite the bot using \`/invite @FTA Buddy\`, then try again!`);
    }

    // Store the channel in the database
    await db.update(events)
        .set({ slackChannel: channel_id, slackTeam: team_id })
        .where(eq(events.code, eventCode))
        .execute();

    const eventObj = await getEvent("", eventCode);
    eventObj.slackChannel = channel_id;
    eventObj.slackTeam = team_id;

    return {
        response_type: "in_channel",
        text: `Linked event ${eventCode} to this channel. Use pin ${event.pin} to join the event in the app!`
    };

}

async function isBotInChannel(channel_id: string, team_id: string): Promise<boolean> {
    console.log(await getTokenByTeam(team_id));
    const response = await fetch(`https://slack.com/api/conversations.info?channel=${channel_id}`, {
        method: "GET",
        headers: {
            Authorization: `Bearer ${await getTokenByTeam(team_id)}`,
            "Content-Type": "application/json"
        },
    });

    const data = await response.json();

    console.log(data);

    if (!data.ok) {
        return false;
    }

    return data.channel.is_member;
}

async function getTokenByTeam(team_id: string) {
    const token = (await db.select({ access_token: slackServers.access_token }).from(slackServers).where(eq(slackServers.team_id, team_id)).execute())[0].access_token;

    if (!token) {
        throw new Error("Slack acces token not found for team " + team_id);
    }

    return token;
}

async function getChannelByEvent(eventCode: string) {
    const result = (await db.select({ slackChannel: events.slackChannel, slackTeam: events.slackTeam }).from(events).where(eq(events.code, eventCode)).execute())[0];

    if (!result) {
        throw new Error("Event not found");
    }

    if (!result.slackChannel || !result.slackTeam) {
        throw new Error("Event not linked to a channel");
    }

    return result as { slackChannel: string, slackTeam: string; };
}

export async function sendSlackMessage(channel_id: string, team_id: string, message: SlackMessage) {
    const response = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${await getTokenByTeam(team_id)}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ channel: channel_id, ...message })
    });

    const data = await response.json();

    if (!data.ok) {
        throw new Error(data.error);
    }

    return data.ts;
}

export async function sendMessageToEventChannel(eventCode: string, message: SlackMessage) {
    const { slackChannel, slackTeam } = await getChannelByEvent(eventCode);

    await sendSlackMessage(slackChannel, slackTeam, message);
}

export interface SlackMessage {
    blocks?: any[];
    text?: string;
}

export async function addSlackReaction(channel_id: string, team_id: string, message_ts: string, reaction: 'thumbsup' | 'thumbsdown' | 'white_check_mark' | 'x' | 'eyes') {
    const response = await fetch("https://slack.com/api/reactions.add", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${await getTokenByTeam(team_id)}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ channel: channel_id, timestamp: message_ts, name: reaction })
    });
}

export async function removeSlackReaction(channel_id: string, team_id: string, message_ts: string, reaction: 'thumbsup' | 'thumbsdown' | 'white_check_mark' | 'x' | 'eyes') {
    const response = await fetch("https://slack.com/api/reactions.remove", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${await getTokenByTeam(team_id)}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ channel: channel_id, timestamp: message_ts, name: reaction })
    });
}