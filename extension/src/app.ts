const appExtensionData = chrome.runtime.getManifest();

(async () => {
	let url: string,
		cloud: boolean,
		changed: number,
		enabled: boolean,
		fieldMonitor: boolean,
		useSignalR: boolean,
		fmsApiEnabled: boolean,
		scoreAutofill: boolean,
		sourceMode: "fms" | "cheesy",
		cheesyPort: number,
		eventCode: string,
		eventToken: string,
		id: string;

	await new Promise((resolve) => {
		chrome.storage.local.get(
			[
				"url",
				"cloud",
				"event",
				"changed",
				"enabled",
				"fieldMonitor",
				"useSignalR",
				"fmsApiEnabled",
				"scoreAutofill",
				"sourceMode",
				"cheesyPort",
				"eventToken",
				"id",
			],
			(item) => {
				console.log(item);
				url = String(item.url);
				cloud = Boolean(item.cloud);
				eventCode = String(item.event);
				changed = Number(item.changed);
				enabled = Boolean(item.enabled);
				fieldMonitor = Boolean(item.fieldMonitor);
				useSignalR = item.useSignalR !== false; // default true
				fmsApiEnabled = item.fmsApiEnabled !== false; // default true
				scoreAutofill = item.scoreAutofill === true; // default false
				sourceMode = item.sourceMode === "cheesy" ? "cheesy" : "fms"; // default fms
				cheesyPort = Number(item.cheesyPort) || 8080;
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
			fieldMonitor,
			useSignalR,
			fmsApiEnabled,
			scoreAutofill,
			sourceMode,
			cheesyPort,
			signalR: enabled,
			fms: extra?.fms ?? false,
			id,
			...extra,
		});
	}

	/** Apply the optional source-mode fields from a page message to the storage update set. */
	function applySourceFields(data: Record<string, any>, updates: Record<string, any>) {
		if ("sourceMode" in data) {
			sourceMode = data.sourceMode === "cheesy" ? "cheesy" : "fms";
			updates.sourceMode = sourceMode;
		}
		if ("cheesyPort" in data) {
			const port = Number(data.cheesyPort);
			cheesyPort = Number.isInteger(port) && port >= 1 && port <= 65535 ? port : 8080;
			updates.cheesyPort = cheesyPort;
		}
	}

	// Field power telemetry arrives from the background worker (it owns the SSE
	// connections) and is republished into the page, which cannot reach the
	// monitors itself - they are plain HTTP and this page is HTTPS.
	//
	// The page connects out to the worker instead of being pushed to: an MV3
	// service worker is torn down when idle, and a port lets it find us again
	// on the next wake without needing permission to enumerate tabs.
	function connectPowerTelemetry() {
		let port: chrome.runtime.Port;
		try {
			port = chrome.runtime.connect({ name: "powerTelemetry" });
		} catch {
			setTimeout(connectPowerTelemetry, 2000);
			return;
		}
		port.onMessage.addListener((msg) => {
			if (msg?.type !== "powerTelemetry") return;
			window.postMessage({ source: "ext", type: "powerTelemetry", telemetry: msg.data });
		});
		// The worker sleeping drops the port; reconnect so the stream resumes.
		port.onDisconnect.addListener(() => setTimeout(connectPowerTelemetry, 1000));
	}
	connectPowerTelemetry();

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
			if ("useSignalR" in evt.data) {
				useSignalR = Boolean(evt.data.useSignalR);
				updates.useSignalR = useSignalR;
			}
			if ("fmsApiEnabled" in evt.data) {
				fmsApiEnabled = Boolean(evt.data.fmsApiEnabled);
				updates.fmsApiEnabled = fmsApiEnabled;
			}
			if ("scoreAutofill" in evt.data) {
				scoreAutofill = Boolean(evt.data.scoreAutofill);
				updates.scoreAutofill = scoreAutofill;
			}
			applySourceFields(evt.data, updates);
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
			if ("useSignalR" in evt.data) {
				useSignalR = Boolean(evt.data.useSignalR);
				updates.useSignalR = useSignalR;
			}
			if ("fmsApiEnabled" in evt.data) {
				fmsApiEnabled = Boolean(evt.data.fmsApiEnabled);
				updates.fmsApiEnabled = fmsApiEnabled;
			}
			if ("scoreAutofill" in evt.data) {
				scoreAutofill = Boolean(evt.data.scoreAutofill);
				updates.scoreAutofill = scoreAutofill;
			}
			applySourceFields(evt.data, updates);
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
