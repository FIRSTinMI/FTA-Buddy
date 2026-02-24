import { HubConnectionState } from "@microsoft/signalr";
import { getCurrentMatch, getEventCode, getScheduleBreakdown, getTeamNumbers } from "./fmsapi";
import { SignalR } from "./signalR";
import { trpc, updateValues } from "./trpc";

let teamPollInterval: ReturnType<typeof setInterval> | null = null;
let qualsScheduleAvailable = false;

const manifestData = chrome.runtime.getManifest();
export const FMS = "10.0.100.5";

export let signalRConnection = new SignalR(FMS, manifestData.version, sendFrame, sendCycletime, sendScheduleDetails);

export let eventCode: string;
export let eventToken: string;
export let url: string;
export let id: string;
export let enabled: boolean;
export let cloud: boolean;
export let useDev: boolean;
export let changed: number;

export let fmsApi: boolean = false;

async function stop() {
	stopTeamPolling();
	await signalRConnection.stop();
}

async function start() {
	await stop();

	await new Promise((resolve) => {
		chrome.storage.local.get(
			["url", "cloud", "useDev", "event", "changed", "enabled", "id", "eventToken"],
			(item) => {
				if (!item.id) chrome.storage.local.set({ id: crypto.randomUUID() });

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
						eventToken: item.eventToken || "",
						id: item.id || crypto.randomUUID(),
					};
					chrome.storage.local.set(item);
				}

				url = String(item.url);
				cloud = Boolean(item.cloud);
				useDev = Boolean(item.useDev);
				eventCode = String(item.event);
				changed = Number(item.changed);
				enabled = Boolean(item.enabled);
				eventToken = String(item.eventToken);
				id = String(item.id) || crypto.randomUUID();
				if (id !== item.id) chrome.storage.local.set({ id });
				resolve(void 0);
			},
		);
	});

	if (!enabled) {
		console.log("Not enabled");
		return;
	} else if (changed && changed + 1000 * 60 * 60 * 24 * 4 < new Date().getTime()) {
		console.log("Expired");
		return;
	}

	await pingFMS();

	console.log("Starting SignalR");
	await signalRConnection.start();

	if (!(eventCode || eventToken)) return;

	updateValues();
	sendScheduleDetails();
	startTeamPolling();
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
	if (msg?.type === "ping") {
		pingFMS().then((fms) => {
			sendResponse({
				source: "ext",
				version: manifestData.version,
				type: "pong",
				fms,
				id,
			});
		});
		return true;
	} else if (msg?.type === "getEventCode") {
		getEventCode().then((code) => {
			getTeamNumbers().then((teams) => {
				sendResponse({
					source: "ext",
					version: manifestData.version,
					type: "eventCode",
					code,
					teams,
					id,
				});
			});
		});
		return true;
	} else if (msg?.type === "restart") {
		chrome.runtime.reload();
		return false;
	} else if (msg?.type === "enable") {
		enabled = true;
		chrome.storage.local.set({ enabled });
		return false;
	}

	if (msg?.type === "getState") {
		sendResponse({
			cloud,
			useDev,
			url,
			eventCode,
			eventToken,
			enabled,
			id,
			fmsApi,
			version: manifestData.version,
			FMS,
		});
		return false;
	}

	if (msg?.type === "pingFMS") {
		(async () => {
			const ok = await pingFMS();
			sendResponse({ ok, fmsApi, FMS });
		})();
		return true;
	}

	if (msg?.type === "getStatuses") {
		const signalrStatus: HubConnectionState | string = (signalRConnection as any)?.connection?.state ?? "Unknown";

		sendResponse({
			signalrStatus,
		});
		return false;
	}

	return false;
});

export async function pingFMS() {
	try {
		const controller = new AbortController();
		setTimeout(() => controller.abort(), 500);
		const res = await fetch(`http://${FMS}/FieldMonitor`, { signal: controller.signal });
		fmsApi = !!res.ok;
		return res.ok;
	} catch {
		fmsApi = false;
		return false;
	}
}

async function sendFrame(data: any) {
	await trpc.field.post.mutate(
		eventToken ? { eventToken, ...data, extensionId: id } : { eventCode, ...data, extensionId: id },
	);
}

async function sendCycletime(
	type: "lastCycleTime" | "prestart" | "start" | "end" | "refsDone" | "scoresPosted",
	data: string,
) {
	const { matchNumber, playNumber, level } = await getCurrentMatch();
	await trpc.cycles.postCycleTime.mutate({
		eventToken,
		type,
		lastCycleTime: data,
		matchNumber,
		playNumber,
		level,
		extensionId: id,
	});
}

async function sendScheduleDetails() {
	const schedule = await getScheduleBreakdown();
	if (schedule.days.length === 0) return;
	await trpc.cycles.postScheduleDetails.mutate({ eventToken, ...schedule, extensionId: id });
}

async function pollTeams() {
	if (!fmsApi || !eventToken || qualsScheduleAvailable) return;

	try {
		const schedule = await getScheduleBreakdown();
		if (schedule.days.length > 0) {
			console.log("Quals schedule available, stopping team polling");
			qualsScheduleAvailable = true;
			stopTeamPolling();
			return;
		}

		const teams: number[] = await getTeamNumbers();
		if (teams && teams.length > 0) {
			const result = await trpc.event.syncTeams.mutate({ teamNumbers: teams });
			if (result.added > 0 || result.removed > 0) {
				console.log(`Team sync: +${result.added} added, -${result.removed} removed`);
			}
		}
	} catch (err) {
		console.warn("Team polling error:", err);
	}
}

function startTeamPolling() {
	if (teamPollInterval) return;
	qualsScheduleAvailable = false;
	pollTeams();
	teamPollInterval = setInterval(pollTeams, 2 * 60 * 1000);
	console.log("Started team polling (every 2 min until quals schedule available)");
}

function stopTeamPolling() {
	if (teamPollInterval) {
		clearInterval(teamPollInterval);
		teamPollInterval = null;
		console.log("Stopped team polling");
	}
}

let storageDebounce: ReturnType<typeof setTimeout> | null = null;
chrome.storage.local.onChanged.addListener((changes) => {
	for (const key of Object.keys(changes)) {
		if (key === "changed") continue;
		if (storageDebounce) clearTimeout(storageDebounce);
		storageDebounce = setTimeout(() => {
			storageDebounce = null;
			start().catch(console.error);
		}, 300);
		return;
	}
});

if (typeof self !== "undefined" && "ServiceWorkerGlobalScope" in self && self instanceof ServiceWorkerGlobalScope) {
	start().catch(console.error);
}
