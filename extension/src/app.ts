const appExtensionData = chrome.runtime.getManifest();

(async () => {
	let url: string,
		cloud: boolean,
		changed: number,
		enabled: boolean,
		fieldMonitor: boolean,
		eventCode: string,
		eventToken: string,
		id: string;

	await new Promise((resolve) => {
		chrome.storage.local.get(
			["url", "cloud", "event", "changed", "enabled", "fieldMonitor", "eventToken", "id"],
			(item) => {
				console.log(item);
				url = String(item.url);
				cloud = Boolean(item.cloud);
				eventCode = String(item.event);
				changed = Number(item.changed);
				enabled = Boolean(item.enabled);
				fieldMonitor = Boolean(item.fieldMonitor);
				eventToken = String(item.eventToken);
				id = String(item.id);
				resolve(void 0);
			},
		);
	});

	function sendPong(extra?: Record<string, any>) {
		window.postMessage({
			source: "ext",
			version: appExtensionData.version,
			type: "pong",
			cloud,
			eventCode,
			enabled,
			signalR: enabled,
			fms: extra?.fms ?? false,
			id,
			...extra,
		});
	}

	window.addEventListener("message", async (evt) => {
		console.log(evt.data);

		if (evt.data.source !== "page") return;

		if (evt.data.type === "ping") {
			const fms = await pingFMS();
			sendPong({ fms: fms.fms });
		} else if (evt.data.type === "enable") {
			enabled = true;
			const updates: Record<string, any> = { enabled };
			if ("fieldMonitor" in evt.data) {
				fieldMonitor = Boolean(evt.data.fieldMonitor);
				updates.fieldMonitor = fieldMonitor;
			}
			await chrome.storage.local.set(updates);
			// Storage change triggers background restart automatically
			const fms = await pingFMS();
			sendPong({ fms: fms.fms });
		} else if (evt.data.type === "eventCode") {
			eventCode = evt.data.code;
			eventToken = evt.data.token;
			enabled = true;
			changed = new Date().getTime();
			const updates: Record<string, any> = { event: eventCode, eventToken, enabled, changed };
			if ("fieldMonitor" in evt.data) {
				fieldMonitor = Boolean(evt.data.fieldMonitor);
				updates.fieldMonitor = fieldMonitor;
			}
			await chrome.storage.local.set(updates);
			// Storage change triggers background restart automatically
			const fms = await pingFMS();
			sendPong({ fms: fms.fms });
		} else if (evt.data.type === "getEventCode") {
			window.postMessage(await getEventCode());
		}
	});
})();

async function pingFMS() {
	return await chrome.runtime.sendMessage({ type: "ping" });
}

async function getEventCode() {
	return await chrome.runtime.sendMessage({ type: "getEventCode" });
}
