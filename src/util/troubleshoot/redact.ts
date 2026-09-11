// Strip team numbers, event codes and Slack user mentions from corpus text.
// Mentions of known vendor/FIRST staff resolve to their name; all other mentions become "@CSA".
// The corpus may hold CSA tickets from any event, so nothing that identifies
// a team or event may reach troubleshoot_chunks.body.

import { slackStaff } from "./slack-staff";

const UNITS = /^(a|amps?|v|volts?|hz|khz|mhz|ms|s|sec|secs|min|mins|%|mm|cm|in|ft|lbs?|kg|g|rpm|psi|mbps|kbps|w|watts?|db|deg|°|x|px|fps)$/i;

const EVENT_CODE = /\b20\d{2}[a-z]{2,6}\d?\b/gi;
const TEAM_WORD = /\b(team|frc|frc team)\s*#?\s*(\d{1,5})\b/gi;
const SLACK_MENTION = /<@([A-Z0-9]+)(\|[^>]*)?>/g;
const SLACK_CHANNEL = /<#[A-Z0-9]+\|([^>]*)>/g;
// "TCP 1735", "UDP 1180 to 1190", "port 5800-5810", "ports 5810 and 5811".
const PORT_CONTEXT =
	/\b(?:tcp|udp|ports?)\b(?:\s*(?:and|or|to|\/|,|-|&)?\s*\d{2,5})+/gi;

const SLACK_LINK = /<(https?:\/\/[^|>]+)(\|[^>]*)?>/g;

export function redactTeamNumbers(input: string): string {
	let out = input
		.replace(SLACK_MENTION, (_m, id: string) => {
			const staff = slackStaff[id];
			return staff ? `${staff.name} (${staff.org})` : "@CSA";
		})
		.replace(SLACK_CHANNEL, "#$1")
		.replace(SLACK_LINK, "$1");
	out = out.replace(EVENT_CODE, "[event]");
	// Port numbers look exactly like team numbers. Park them before the bare-number pass
	// and put them back after, so "TCP 1735" and "5800 to 5810" survive intact.
	const ports: string[] = [];
	out = out.replace(PORT_CONTEXT, (m) => `\u0000P${ports.push(m) - 1}\u0000`);
	out = out.replace(TEAM_WORD, "$1 ####");
	// Bare 3 to 5 digit numbers that are not followed by a unit are treated as team numbers.
	// "70 A" and "6.2 V" survive; "3641 had a CAN break" becomes "#### had a CAN break".
	out = out.replace(/(^|[^\d.\w:-])(\d{3,5})(?=$|[^\d.:\/-])(\s*)([A-Za-z%°]+)?/g, (m, pre, num, ws, unit) => {
		if (unit && UNITS.test(unit)) return m;
		return `${pre}####${ws}${unit ?? ""}`;
	});
	out = out.replace(/\u0000P(\d+)\u0000/g, (_m, i: string) => ports[Number(i)]);
	return out;
}
