// Strip team numbers, event codes and Slack user mentions from corpus text.
// The corpus may hold CSA tickets from any event, so nothing that identifies
// a team or event may reach troubleshoot_chunks.body.

const UNITS = /^(a|amps?|v|volts?|hz|khz|mhz|ms|s|sec|secs|min|mins|%|mm|cm|in|ft|lbs?|kg|g|rpm|psi|mbps|kbps|w|watts?|db|deg|°|x|px|fps)$/i;

const EVENT_CODE = /\b20\d{2}[a-z]{2,6}\d?\b/gi;
const TEAM_WORD = /\b(team|frc|frc team)\s*#?\s*(\d{1,5})\b/gi;
const SLACK_MENTION = /<@[A-Z0-9]+(\|[^>]*)?>/g;
const SLACK_CHANNEL = /<#[A-Z0-9]+\|([^>]*)>/g;
const SLACK_LINK = /<(https?:\/\/[^|>]+)(\|[^>]*)?>/g;

export function redactTeamNumbers(input: string): string {
	let out = input.replace(SLACK_MENTION, "@CSA").replace(SLACK_CHANNEL, "#$1").replace(SLACK_LINK, "$1");
	out = out.replace(EVENT_CODE, "[event]");
	out = out.replace(TEAM_WORD, "$1 ####");
	// Bare 3 to 5 digit numbers that are not followed by a unit are treated as team numbers.
	// "70 A" and "6.2 V" survive; "3641 had a CAN break" becomes "#### had a CAN break".
	out = out.replace(/(^|[^\d.\w-])(\d{3,5})(?=$|[^\d.])(\s*)([A-Za-z%°]+)?/g, (m, pre, num, ws, unit) => {
		if (unit && UNITS.test(unit)) return m;
		return `${pre}####${ws}${unit ?? ""}`;
	});
	return out;
}
