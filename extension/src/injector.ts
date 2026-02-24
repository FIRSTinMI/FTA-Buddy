console.log("Loaded injector");
const manifestData = chrome.runtime.getManifest();
chrome.storage.local.get(["url", "cloud", "event", "changed", "enabled", "signalR", "id"], (item) => {
	console.log(item);
	let enabled = Boolean(item.enabled);
	let cloud = Boolean(item.cloud);
	let changed = Number(item.changed);
	let signalR = Boolean(item.signalR);

	// Don't inject if not enabled, expired, or using signalR
	if (!enabled) {
		console.log("Not enabled");
		return;
	} else if (changed + 1000 * 60 * 60 * 24 * 4 < new Date().getTime()) {
		console.log("Expired");
		return;
	} else if (signalR) {
		console.log("Using signalR so I won't inject");
		return;
	}

	if (!item.id) {
		item.id = crypto.randomUUID();
		chrome.storage.local.set({ id: item.id });
	}

	const script = document.createElement("script");
	script.dataset.host = String(item.url);
	script.dataset.cloud = String(cloud);
	script.dataset.event = String(item.event);
	script.dataset.version = String(manifestData.version);
	script.dataset.extensionId = String(item.id);
	script.id = "fta-buddy";
	document.body.appendChild(script);
});
