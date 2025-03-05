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

    const { access_token, team, incoming_webhook } = data;

    // Store the access token in a database for future API calls
    console.log("Access Token:", access_token);
    console.log("Team:", team);
    console.log("Webhook Info:", incoming_webhook);

    return true;
}
