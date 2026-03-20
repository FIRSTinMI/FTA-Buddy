console.log("Loaded injector");
const manifestData = chrome.runtime.getManifest();
chrome.storage.local.get(
	["url", "cloud", "event", "changed", "enabled", "fieldMonitor", "useSignalR", "id", "useDev", "eventToken"],
	(item) => {
		console.log(item);
		let enabled = Boolean(item.enabled);
		let cloud = Boolean(item.cloud);
		let changed = Number(item.changed);
		let fieldMonitor = Boolean(item.fieldMonitor);
		let useSignalR = item.useSignalR !== false; // default true
		let useDev = Boolean(item.useDev);
		let eventToken = String(item.eventToken);

		// Don't inject if not enabled, expired, notepad-only, or using SignalR
		if (!enabled) {
			console.log("Not enabled");
			return;
		} else if (changed + 1000 * 60 * 60 * 24 * 4 < new Date().getTime()) {
			console.log("Expired");
			return;
		} else if (!fieldMonitor) {
			console.log("Field monitor disabled, not injecting");
			return;
		} else if (useSignalR) {
			console.log("Using SignalR, not injecting scraper");
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
		script.dataset.useDev = String(useDev);
		script.dataset.eventToken = String(eventToken);
		script.id = "fta-buddy";
		script.src = chrome.runtime.getURL("injected-fieldmonitor.js");
		document.body.appendChild(script);
	},
);
