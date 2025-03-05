import { db } from "../db/db";
import { slackServers } from "../db/schema";

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
