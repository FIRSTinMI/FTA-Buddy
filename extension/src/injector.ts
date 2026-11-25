console.log("Loaded injector");
const manifestData = chrome.runtime.getManifest();
chrome.storage.local.get(
	[
		"url",
		"cloud",
		"event",
		"changed",
		"enabled",
		"remoteDisabled",
		"fieldMonitor",
		"useSignalR",
		"id",
		"useDev",
		"eventToken",
	],
	(item) => {
		console.log(item);
		let enabled = Boolean(item.enabled);
		let cloud = Boolean(item.cloud);
		let changed = Number(item.changed);
		let fieldMonitor = Boolean(item.fieldMonitor);
		let useSignalR = item.useSignalR !== false; // default true
		let useDev = Boolean(item.useDev);
		let eventToken = String(item.eventToken);
		let expired = changed + 1000 * 60 * 60 * 24 * 4 < new Date().getTime();

		if (!enabled) {
			console.log("Not enabled");
			return;
		}

		if (item.remoteDisabled === true) {
			console.log("Switched off for this event by an admin");
			return;
		}

		if (expired) {
			console.log("Expired");
			return;
		}

		if (!item.id) {
			item.id = crypto.randomUUID();
			chrome.storage.local.set({ id: item.id });
		}

		// The injected scripts below run in the page and keep talking to FMS until
		// the page goes away. If the extension is switched off (locally or by an
		// admin) after injecting, reload so the page comes back without them.
		chrome.storage.local.onChanged.addListener((changes) => {
			if (changes.enabled?.newValue === false || changes.remoteDisabled?.newValue === true) location.reload();
		});

		// Always inject the visual overlay (toggle button ± full FTA Buddy grid)
		const overlayScript = document.createElement("script");
		overlayScript.id = "fta-buddy-overlay";
		overlayScript.dataset.host = String(item.url);
		overlayScript.dataset.cloud = String(cloud);
		overlayScript.dataset.event = String(item.event);
		overlayScript.dataset.version = String(manifestData.version);
		overlayScript.dataset.extensionId = String(item.id);
		overlayScript.dataset.useDev = String(useDev);
		overlayScript.dataset.eventToken = String(eventToken);
		overlayScript.dataset.logoUrl = chrome.runtime.getURL("img/logo.png");
		overlayScript.src = chrome.runtime.getURL("injected-overlay.js");
		document.body.appendChild(overlayScript);

		// Inject the data scraper only when field monitor + non-SignalR mode
		if (!fieldMonitor) {
			console.log("Field monitor disabled, not injecting scraper");
			return;
		}
		if (useSignalR) {
			console.log("Using SignalR, not injecting scraper");
			return;
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
