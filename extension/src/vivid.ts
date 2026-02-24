console.log("Loaded injector");
chrome.storage.local.get(["url", "cloud", "event", "changed", "eventToken", "enabled", "signalR", "id"], (item) => {
	console.log(item);
	let enabled = Boolean(item.enabled);
	let cloud = Boolean(item.cloud);
	let changed = Number(item.changed);
	let signalR = Boolean(item.signalR);

	// Don't inject if not enabled, expired
	if (!enabled) {
		console.log("Not enabled");
		return;
	} else if (changed + 1000 * 60 * 60 * 24 * 4 < new Date().getTime()) {
		console.log("Expired");
		return;
	}

	const script = document.createElement("script");
	script.dataset.host = String(item.url);
	script.dataset.cloud = String(cloud);
	script.dataset.event = String(item.event);
	script.dataset.eventToken = String(item.eventToken);
	script.dataset.extensionId = String(item.id);
	script.id = "fta-buddy";

	script.src = chrome.runtime.getURL("injected-vivid.js");

	document.body.appendChild(script);
});
