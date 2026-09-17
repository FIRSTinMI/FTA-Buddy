import { updateValues } from "./trpc";

const cloudCheckbox = document.getElementById("cloud") as HTMLInputElement;
const urlInput = document.getElementById("url") as HTMLInputElement;
const urlContainer = document.getElementById("url-container") as HTMLDivElement;
const eventInput = document.getElementById("event") as HTMLInputElement;
const eventContainer = document.getElementById("event-container") as HTMLDivElement;
const enabledInput = document.getElementById("enabled") as HTMLInputElement;
const fieldMonitorInput = document.getElementById("fieldMonitor") as HTMLInputElement;
const useSignalRInput = document.getElementById("useSignalR") as HTMLInputElement;
const signalRRow = document.getElementById("signalr-row") as HTMLDivElement;
const tokenInput = document.getElementById("eventToken") as HTMLInputElement;
const fmsApiEnabledInput = document.getElementById("fmsApiEnabled") as HTMLInputElement;
const sourceModeSelect = document.getElementById("sourceMode") as HTMLSelectElement;
const cheesyPortInput = document.getElementById("cheesyPort") as HTMLInputElement;
const cheesyPortRow = document.getElementById("cheesy-port-row") as HTMLDivElement;
const powerMonitorInput = document.getElementById("powerMonitor") as HTMLInputElement;
const powerMonitorRow = document.getElementById("power-monitor-row") as HTMLDivElement;
const powerSubnetInput = document.getElementById("powerSubnet") as HTMLInputElement;
const powerSubnetRow = document.getElementById("power-subnet-row") as HTMLDivElement;
const saveButton = document.getElementById("save") as HTMLButtonElement;

const powerMonitorIndicator = document.getElementById("power-monitor-status") as HTMLDivElement;
const powerMonitorText = document.getElementById("power-monitor-status-text") as HTMLSpanElement;

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

/** The event network by default; a bench test runs on whatever the bench is on. */
const DEFAULT_POWER_SUBNET = "10.0.100";

function isValidSubnetPrefix(prefix: string): boolean {
	const parts = prefix.trim().split(".");
	return parts.length === 3 && parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) >= 0 && Number(p) <= 255);
}

async function bgGetPowerStatus(): Promise<{
	enabled: boolean;
	subnet: string;
	permission: boolean;
	running: boolean;
	connected: number;
	monitors: { id: string; ip: string; connected: boolean }[];
}> {
	return chrome.runtime.sendMessage({ type: "getPowerStatus" });
}

/**
 * Sweeping the event subnet needs host permission for those addresses, which
 * Chrome only grants from a user gesture - so it is requested here, on the
 * toggle, and the toggle snaps back if the prompt is declined. The list comes
 * from the manifest so it is exactly the range the sweep probes.
 */
async function handlePowerMonitorToggle() {
	if (powerMonitorInput.checked) {
		const manifest = chrome.runtime.getManifest() as chrome.runtime.Manifest & {
			optional_host_permissions?: string[];
		};
		const granted = await chrome.permissions.request({ origins: manifest.optional_host_permissions ?? [] });
		if (!granted) {
			powerMonitorInput.checked = false;
			powerMonitorText.textContent = "Permission denied";
			return;
		}
	}
	powerMonitorRow.style.display = powerMonitorInput.checked ? "flex" : "none";
	powerSubnetRow.style.display = powerMonitorInput.checked ? "grid" : "none";
	await chrome.storage.local.set({ powerMonitor: powerMonitorInput.checked, changed: new Date().getTime() });
	// Storage change triggers background restart automatically
	updatePowerMonitorStatus();
}

/** Persisted on blur rather than per keystroke, or a half-typed subnet starts a sweep. */
async function handlePowerSubnetChange() {
	const value = powerSubnetInput.value.trim();
	if (value && !isValidSubnetPrefix(value)) {
		powerMonitorText.textContent = "Subnet must be three octets, e.g. 10.0.100";
		return;
	}
	await chrome.storage.local.set({ powerSubnet: value || DEFAULT_POWER_SUBNET });
	// The background re-scans on this change; show that something is happening
	// rather than leaving the last network's result sitting there.
	powerMonitorIndicator.classList.remove("red", "green");
	powerMonitorIndicator.classList.add("yellow");
	powerMonitorText.textContent = "Scanning...";
	setTimeout(updatePowerMonitorStatus, 3000);
}

async function updatePowerMonitorStatus() {
	if (!powerMonitorInput.checked) {
		powerMonitorRow.style.display = "none";
		powerSubnetRow.style.display = "none";
		return;
	}
	powerMonitorRow.style.display = "flex";
	powerSubnetRow.style.display = "grid";
	powerMonitorIndicator.classList.remove("red", "green", "yellow");
	try {
		// The service worker can be asleep or mid-restart, in which case the
		// message resolves to undefined rather than a status object.
		const status = (await bgGetPowerStatus()) ?? null;
		if (!status) {
			powerMonitorIndicator.classList.add("yellow");
			powerMonitorText.textContent = "Starting...";
			return;
		}
		const monitors = status.monitors ?? [];
		const total = monitors.length;
		if (!status.permission) {
			// Chrome drops granted optional permissions when the manifest changes,
			// which otherwise looks identical to an empty network.
			powerMonitorIndicator.classList.add("red");
			powerMonitorText.textContent = "Permission missing - toggle this off and on";
		} else if (!status.running) {
			powerMonitorIndicator.classList.add("yellow");
			powerMonitorText.textContent = "Starting...";
		} else if (status.connected === 0) {
			powerMonitorIndicator.classList.add("red");
			powerMonitorText.textContent = total > 0 ? `${total} found, none streaming` : "None found";
		} else {
			powerMonitorIndicator.classList.add("green");
			powerMonitorText.textContent =
				`${status.connected} connected` +
				(status.connected === total ? "" : ` of ${total}`) +
				": " +
				monitors
					.filter((m) => m.connected)
					.map((m) => m.id)
					.join(", ");
		}
	} catch {
		powerMonitorIndicator.classList.add("red");
		powerMonitorText.textContent = "Background worker not responding";
	}
}

function load() {
	chrome.storage.local.get(
		[
			"url",
			"cloud",
			"useDev",
			"event",
			"eventToken",
			"changed",
			"enabled",
			"fieldMonitor",
			"useSignalR",
			"fmsApiEnabled",
			"sourceMode",
			"cheesyPort",
			"powerMonitor",
			"powerSubnet",
		],
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
					useSignalR: item.useSignalR ?? true,
					fmsApiEnabled: item.fmsApiEnabled ?? true,
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
			useSignalRInput.checked = item.useSignalR !== false; // default true
			fmsApiEnabledInput.checked = item.fmsApiEnabled !== false; // default true
			signalRRow.style.display = Boolean(item.fieldMonitor) ? "flex" : "none";
			sourceModeSelect.value = item.sourceMode === "cheesy" ? "cheesy" : "fms";
			cheesyPortInput.value = String(item.cheesyPort || 8080);
			cheesyPortRow.style.display = sourceModeSelect.value === "cheesy" ? "flex" : "none";
			powerMonitorInput.checked = Boolean(item.powerMonitor);
			powerMonitorRow.style.display = Boolean(item.powerMonitor) ? "flex" : "none";
			powerSubnetInput.value = String(item.powerSubnet || DEFAULT_POWER_SUBNET);
			powerSubnetRow.style.display = Boolean(item.powerMonitor) ? "grid" : "none";
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
			useSignalRInput.addEventListener("input", handleUpdate);
			fmsApiEnabledInput.addEventListener("input", handleUpdate);
			sourceModeSelect.addEventListener("input", handleUpdate);
			cheesyPortInput.addEventListener("input", handleUpdate);
			powerMonitorInput.addEventListener("change", handlePowerMonitorToggle);
			powerSubnetInput.addEventListener("change", handlePowerSubnetChange);
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
			const useSignalR = useSignalRInput.checked;

			fmsSignalRStatusIndicator.classList.remove("red", "green", "yellow");
			if (!useSignalR) {
				fmsSignalRStatusIndicator.classList.add("yellow");
				fmsSignalRStatusText.textContent = "Scraping mode";
			} else if (signalrStatus !== "Connected") {
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

	const power = updatePowerMonitorStatus();

	await Promise.all([bgStatus, ftaBuddy, fmsRes, power]);
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
		useSignalR: useSignalRInput.checked,
		fmsApiEnabled: fmsApiEnabledInput.checked,
		eventToken: tokenInput.value,
		sourceMode: sourceModeSelect.value === "cheesy" ? "cheesy" : "fms",
		cheesyPort: Number(cheesyPortInput.value) || 8080,
	});

	urlContainer.style.display = cloudCheckbox.checked ? "none" : "block";
	signalRRow.style.display = fieldMonitorInput.checked ? "flex" : "none";
	cheesyPortRow.style.display = sourceModeSelect.value === "cheesy" ? "flex" : "none";
	// Storage change triggers background restart automatically
}

function updatePopup(
	setting:
		| "url"
		| "cloud"
		| "useDev"
		| "enabled"
		| "fieldMonitor"
		| "useSignalR"
		| "fmsApiEnabled"
		| "event"
		| "eventToken"
		| "sourceMode"
		| "cheesyPort",
	value: boolean | string,
) {
	const elm = document?.getElementById(setting);
	if (!elm) return;
	if (typeof value === "boolean") {
		(elm as HTMLInputElement).checked = value;
	} else {
		(elm as HTMLInputElement).value = String(value);
	}
	// Keep the SignalR row visibility in sync
	if (setting === "fieldMonitor") {
		signalRRow.style.display = (value as boolean) ? "flex" : "none";
	}
	// Keep the Cheesy port row visibility in sync with the field system
	if (setting === "sourceMode") {
		cheesyPortRow.style.display = value === "cheesy" ? "flex" : "none";
	}
}

chrome.storage.local.onChanged.addListener((changes) => {
	for (const key of Object.keys(changes)) {
		if (key === "changed") continue;
		updatePopup(
			key as
				| "url"
				| "cloud"
				| "useDev"
				| "enabled"
				| "fieldMonitor"
				| "useSignalR"
				| "fmsApiEnabled"
				| "event"
				| "eventToken"
				| "sourceMode"
				| "cheesyPort",
			changes[key].newValue as string | boolean,
		);
	}
});

load();
