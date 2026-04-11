/**
 * Returns the name for the inter-divisional playoff view based on the
 * championship event code. Each major championship venue has a traditional name.
 */
export function getPlayoffViewLabel(eventCode: string): string {
	const code = eventCode.toLowerCase();
	if (code.includes("micmp")) return "Fimstein";
	if (code.includes("cmptx")) return "Einstein";
	if (code.includes("txcmp")) return "TX Championship";
	return "Finals";
}
