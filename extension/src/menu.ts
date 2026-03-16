import { updateValues } from "./trpc";

const cloudCheckbox = document.getElementById("cloud") as HTMLInputElement;
const urlInput = document.getElementById("url") as HTMLInputElement;
const urlContainer = document.getElementById("url-container") as HTMLDivElement;
const eventInput = document.getElementById("event") as HTMLInputElement;
const eventContainer = document.getElementById("event-container") as HTMLDivElement;
const enabledInput = document.getElementById("enabled") as HTMLInputElement;
const fieldMonitorInput = document.getElementById("fieldMonitor") as HTMLInputElement;
const tokenInput = document.getElementById("eventToken") as HTMLInputElement;
const saveButton = document.getElementById("save") as HTMLButtonElement;

const extensionStatusIndicator = document.getElementById("extension-status") as HTMLDivElement;
const fmsApiStatusIndicator = document.getElementById("fms-api-status") as HTMLDivElement;
const fmsSignalRStatusIndicator = document.getElementById("fms-signalr-status") as HTMLDivElement;
const ftaBuddyStatusIndicator = document.getElementById("fta-buddy-status") as HTMLDivElement;

const extensionStatusText = document.getElementById("extension-status-text") as HTMLSpanElement;
const fmsApiStatusText = document.getElementById("fms-api-status-text") as HTMLSpanElement;
const fmsSignalRStatusText = document.getElementById("fms-signalr-status-text") as HTMLSpanElement;
const ftaBuddyStatusText = document.getElementById("fta-buddy-status-text") as HTMLSpanElement;

// ---- Messaging helpers ----
async function bgGetState(): Promise<{
	cloud: boolean;
	useDev: boolean;
	url: string;
	eventCode: string;
	eventToken: string;
	enabled: boolean;
	id: string;
	fmsApi: boolean;
	version: string;
	FMS: string;
}> {
	return chrome.runtime.sendMessage({ type: "getState" });
}

async function bgPingFMS(): Promise<{ ok: boolean; fmsApi: boolean; FMS: string }> {
	return chrome.runtime.sendMessage({ type: "pingFMS" });
}

async function bgGetStatuses(): Promise<{ signalrStatus: string }> {
	return chrome.runtime.sendMessage({ type: "getStatuses" });
}

function load() {
	chrome.storage.local.get(
		["url", "cloud", "useDev", "event", "eventToken", "changed", "enabled", "fieldMonitor"],
		(item) => {
			if (
				item.url == undefined ||
				item.cloud == undefined ||
				item.event == undefined ||
				item.changed == undefined ||
				item.enabled == undefined ||
				item.eventToken == undefined
			) {
				item = {
					url: item.url || "http://localhost:3001",
					cloud: item.cloud ?? true,
					useDev: item.useDev ?? false,
					event: item.event || "2024event",
					changed: item.changed || new Date().getTime(),
					enabled: item.enabled ?? false,
					fieldMonitor: item.fieldMonitor ?? false,
					eventToken: item.eventToken || "",
				};
				chrome.storage.local.set(item);
			}

			cloudCheckbox.checked = Boolean(item.cloud);
			const useDevCheckbox = document.getElementById("useDev") as HTMLInputElement;
			if (useDevCheckbox) useDevCheckbox.checked = Boolean(item.useDev);
			urlInput.value = String(item.url);
			eventInput.value = String(item.event);
			enabledInput.checked = Boolean(item.enabled);
			fieldMonitorInput.checked = Boolean(item.fieldMonitor);
			tokenInput.value = String(item.eventToken);
			let changed = Number(item.changed);

			urlContainer.style.display = Boolean(item.cloud) ? "none" : "block";

			if (changed + 1000 * 60 * 60 * 24 * 4 < new Date().getTime()) {
				enabledInput.checked = false;
				chrome.storage.local.set({ enabled: false });
			}

			cloudCheckbox.addEventListener("input", handleUpdate);
			enabledInput.addEventListener("input", handleUpdate);
			fieldMonitorInput.addEventListener("input", handleUpdate);
			if (useDevCheckbox) useDevCheckbox.addEventListener("input", handleUpdate);
			saveButton.addEventListener("click", handleUpdate);
			refreshButton.addEventListener("click", () => chrome.runtime.reload());

			updateStatusIndicators();
		},
	);
}

async function updateStatusIndicators() {
	let ftaBuddy, bgStatus;

	const state = bgGetState().then((state) => {
		const { enabled, eventCode, eventToken } = state;

		extensionStatusIndicator.classList.remove("red", "green", "yellow");
		if (!enabled) {
			extensionStatusIndicator.classList.add("red");
			extensionStatusText.textContent = "Not Enabled";
		} else if (!eventCode || !eventToken) {
			extensionStatusIndicator.classList.add("yellow");
			extensionStatusText.textContent = "Missing Event Code or Token";
		} else {
			extensionStatusIndicator.classList.add("green");
			extensionStatusText.textContent = "";
		}

		bgStatus = bgGetStatuses().then((status) => {
			const { signalrStatus } = status;

			fmsSignalRStatusIndicator.classList.remove("red", "green", "yellow");
			if (signalrStatus !== "Connected") {
				fmsSignalRStatusIndicator.classList.add("red");
				fmsSignalRStatusText.textContent = signalrStatus || "Not Connected";
			} else {
				fmsSignalRStatusIndicator.classList.add("green");
				fmsSignalRStatusText.textContent = "";
			}

			ftaBuddy = pingFTABuddy(state.cloud, state.useDev, state.url).then((ftaBuddy) => {
				ftaBuddyStatusIndicator.classList.remove("red", "green", "yellow");
				const cloudHost = state.useDev ? "https://dev.ftabuddy.com/" : "https://ftabuddy.com/";
				if (!ftaBuddy) {
					ftaBuddyStatusIndicator.classList.add("red");
					ftaBuddyStatusText.textContent =
						"Not able to reach FTA Buddy on " + (state.cloud ? cloudHost : state.url);
				} else {
					ftaBuddyStatusIndicator.classList.add("green");
					ftaBuddyStatusText.textContent = "";
				}
			});
		});
	});

	const fmsRes = bgPingFMS().then((res) => {
		fmsApiStatusIndicator.classList.remove("red", "green", "yellow");
		if (!res.ok) {
			fmsApiStatusIndicator.classList.add("red");
			fmsApiStatusText.textContent = "Not able to reach FMS on " + res.FMS;
		} else {
			fmsApiStatusIndicator.classList.add("green");
			fmsApiStatusText.textContent = "";
		}
	});

	await Promise.all([bgStatus, ftaBuddy, fmsRes]);
	setTimeout(updateStatusIndicators, 3000);
}

async function pingFTABuddy(cloud: boolean, useDev: boolean, url: string) {
	const base = cloud
		? useDev
			? "https://dev.ftabuddy.com"
			: "https://ftabuddy.com"
		: (url || "").replace(/\/+$/, "");
	const endpoints = [`${base}/trpc`, `${base}/`];

	for (const endpoint of endpoints) {
		try {
			const controller = new AbortController();
			const t = setTimeout(() => controller.abort(), 600);
			const res = await fetch(endpoint, {
				signal: controller.signal,
				cache: "no-store",
				// method: 'GET',  // default
			});
			clearTimeout(t);

			// tRPC GET often returns 404 when route names aren’t specified - host is still UP.
			if (res.status === 200 || res.status === 404) return true;
		} catch {
			// try next endpoint
		}
	}
	return false;
}

const refreshButton = document.getElementById("refresh") as HTMLButtonElement;

function handleUpdate() {
	if (eventInput.value == "") eventInput.value = "2024event";
	if (urlInput.value == "") urlInput.value = "http://localhost:3001";

	const useDevCheckbox = document.getElementById("useDev") as HTMLInputElement;

	chrome.storage.local.set({
		url: urlInput.value,
		cloud: cloudCheckbox.checked,
		useDev: useDevCheckbox?.checked ?? false,
		event: eventInput.value,
		changed: new Date().getTime(),
		enabled: enabledInput.checked,
		fieldMonitor: fieldMonitorInput.checked,
		eventToken: tokenInput.value,
	});

	urlContainer.style.display = cloudCheckbox.checked ? "none" : "block";
	// Storage change triggers background restart automatically
}

function updatePopup(
	setting: "url" | "cloud" | "useDev" | "enabled" | "fieldMonitor" | "event" | "eventToken",
	value: boolean | string,
) {
	const elm = document?.getElementById(setting);
	if (!elm) return;
	if (typeof value === "boolean") {
		(elm as HTMLInputElement).checked = value;
	} else {
		(elm as HTMLInputElement).value = value;
	}
}

chrome.storage.local.onChanged.addListener((changes) => {
	for (const key of Object.keys(changes)) {
		if (key === "changed") continue;
		updatePopup(
			key as "url" | "cloud" | "useDev" | "enabled" | "fieldMonitor" | "event" | "eventToken",
			changes[key].newValue as string | boolean,
		);
	}
});

load();
