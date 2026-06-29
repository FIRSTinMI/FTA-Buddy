/**
 * Cheesy Arena's `/api/arena/websocket` uses gorilla/websocket's default
 * same-origin check, which rejects the extension's cross-origin upgrade (the
 * service worker sends `Origin: chrome-extension://<id>`). We use a
 * declarativeNetRequest session rule to strip the Origin header on the websocket
 * upgrade request to the configured Cheesy Arena host, so the check passes
 * (an absent Origin is treated as same-origin). No Cheesy Arena change needed.
 *
 * Requires the `declarativeNetRequestWithHostAccess` permission and host access
 * to the Cheesy Arena host.
 */

const CHEESY_ORIGIN_RULE_ID = 7301;

export async function setCheesyOriginRule(host: string): Promise<void> {
	if (!chrome.declarativeNetRequest?.updateSessionRules) {
		console.warn("declarativeNetRequest unavailable; Cheesy Arena websocket may be rejected (origin check)");
		return;
	}
	try {
		await chrome.declarativeNetRequest.updateSessionRules({
			removeRuleIds: [CHEESY_ORIGIN_RULE_ID],
			addRules: [
				{
					id: CHEESY_ORIGIN_RULE_ID,
					priority: 1,
					action: {
						type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
						requestHeaders: [
							{
								header: "Origin",
								operation: chrome.declarativeNetRequest.HeaderOperation.REMOVE,
							},
						],
					},
					condition: {
						urlFilter: `${host}/api/arena/websocket`,
						resourceTypes: [chrome.declarativeNetRequest.ResourceType.WEBSOCKET],
					},
				},
			],
		});
	} catch (err) {
		console.warn("Failed to set Cheesy Arena origin rule:", err);
	}
}

export async function clearCheesyOriginRule(): Promise<void> {
	if (!chrome.declarativeNetRequest?.updateSessionRules) return;
	try {
		await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [CHEESY_ORIGIN_RULE_ID] });
	} catch (err) {
		console.warn("Failed to clear Cheesy Arena origin rule:", err);
	}
}
