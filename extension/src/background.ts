// background.ts
import { HubConnectionState } from "@microsoft/signalr";
import { getCurrentMatch, getEventCode, getScheduleBreakdown, getTeamNumbers } from "./fmsapi";
import { SignalR } from "./signalR";
import { trpc, updateValues, wsClient } from "./trpc";
import { ChezyMonitor } from "./chezy"; // NEW
import { chezyPageURL, chezyWsURL, defaultChezyParams } from "./chezyUrls";
import { installChezyOriginHeaderHack } from "./chezyHandshake";

const manifestData = chrome.runtime.getManifest();

export const FMS = '10.0.100.5';
export const CHEZY_HOST = '10.0.100.5:8080';
// Full Chezy WS (constant like you wanted):
export const CHEZY_WS = `ws://${CHEZY_HOST}/displays/field_monitor/websocket`;

export let signalRConnection: SignalR | null = null;    // CHANGED
export let chezyConnection: ChezyMonitor | null = null; // NEW

export let eventCode: string;
export let eventToken: string;
export let url: string;
export let id: string;
export let enabled: boolean;
export let cloud: boolean;
export let changed: number;
export let arenaType: 'FMS' | 'Chezy' = 'FMS';

export let fmsApi: boolean = false;

async function start() {
    await new Promise((resolve) => {
        chrome.storage.local.get(['url', 'cloud', 'event', 'changed', 'enabled', 'id', 'eventToken', 'arenaType'], item => {
            if (!item.id) chrome.storage.local.set({ id: crypto.randomUUID() });

            if (item.url == undefined || item.cloud == undefined || item.event == undefined || item.changed == undefined || item.enabled == undefined || item.eventToken == undefined || item.arenaType == undefined) {
                item = {
                    url: item.url || 'http://localhost:3001',
                    cloud: item.cloud ?? true,
                    event: item.event || '2024event',
                    changed: item.changed || Date.now(),
                    enabled: item.enabled ?? false,
                    eventToken: item.eventToken || '',
                    id: item.id || crypto.randomUUID(),
                    arenaType: item.arenaType || 'FMS'
                };
                chrome.storage.local.set(item);
            }

            url = item.url;
            cloud = item.cloud;
            eventCode = item.event;
            changed = item.changed;
            enabled = item.enabled;
            eventToken = item.eventToken;
            id = item.id || crypto.randomUUID();
            if (id !== item.id) chrome.storage.local.set({ id });
            arenaType = item.arenaType || 'FMS';
            resolve(void 0);
        });
    });

    // onMessage (unchanged except getState/getStatuses enhancements)
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
        if (msg?.type === "ping") {
            pingFMS().then((fms) => {
                sendResponse({ source: 'ext', version: manifestData.version, type: "pong", fms, id });
            });
            return true;
        } else if (msg?.type === "getEventCode") {
            getEventCode().then((code) => {
                getTeamNumbers().then((teams) => {
                    sendResponse({ source: 'ext', version: manifestData.version, type: "eventCode", code, teams, id });
                });
            });
            return true;
        } else if (msg?.type === "restart") {
            chrome.runtime.reload(); return false;
        } else if (msg?.type === "enable") {
            enabled = true; chrome.storage.local.set({ enabled }); return false;
        }

        if (msg?.type === "getState") {
            sendResponse({
                cloud, url, eventCode, eventToken, enabled, id, fmsApi,
                version: manifestData.version, FMS,
                arenaType,
            });
            return false;
        }

        if (msg?.type === "pingFMS") {
            (async () => {
                const ok = (arenaType === 'FMS') ? await pingFMS() : false;
                sendResponse({ ok, fmsApi, FMS });
            })();
            return true;
        }

        if (msg?.type === "getStatuses") {
            // Report SignalR status from the background instance
            const signalrStatus: HubConnectionState | string = (arenaType === 'Chezy')
                ? (chezyConnection?.status || 'unknown')
                : (signalRConnection as any)?.connection?.state ?? "Unknown";

            const wsStatus = (wsClient.connection?.state || 'unknown');

            sendResponse({ signalrStatus, wsStatus });
            return false;
        }

        return false;
    });

    // gate
    if (!enabled) { console.log('Not enabled'); return; }
    if (changed && changed + (1000 * 60 * 60 * 24 * 4) < Date.now()) { console.log('Expired'); return; }

    // Stop previous connections if we are re-entering start() after a setting change
    try { await (signalRConnection as any)?.connection?.stop?.(); } catch { }
    signalRConnection = null;
    chezyConnection = null;

    const isChezy = arenaType === "Chezy";

    await pingFMS(); // now pings Chezy when arenaType === 'Chezy'

    if (isChezy) {
        const pageUrl = chezyPageURL(CHEZY_HOST, defaultChezyParams);
        const wsUrl = chezyWsURL(CHEZY_HOST, defaultChezyParams);

        installChezyOriginHeaderHack(CHEZY_HOST, pageUrl);
        await ensureChezySession(pageUrl);

        console.log("Starting Chezy WebSocket:", wsUrl);
        chezyConnection = new ChezyMonitor(wsUrl, manifestData.version, sendFrame, sendCycletime, sendScheduleDetails);
        await chezyConnection.start();

    } else {
        console.log('Starting SignalR (FMS)');
        signalRConnection = new SignalR(FMS, manifestData.version, sendFrame, sendCycletime, sendScheduleDetails);
        await signalRConnection.start();
    }

    if (!(eventCode || eventToken)) return;
    updateValues();
    sendScheduleDetails();
}

export async function pingFMS() {
    try {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 500);

        let url: string;
        if (arenaType === "FMS") {
            url = `http://${FMS}/FieldMonitor`;
        } else if (arenaType === "Chezy") {
            url = `http://${FMS}/api/arena`;
        } else {
            throw new Error("Unknown arena type");
        }

        const res = await fetch(url, { signal: controller.signal });
        fmsApi = res.ok;
        return { ok: res.ok, arenaType, FMS };
    } catch (e) {
        fmsApi = false;
        return { ok: false, arenaType, FMS };
    }
}

async function sendFrame(data: any) {
    await trpc.field.post.mutate((eventToken) ? { eventToken, ...data, extensionId: id } : { eventCode, ...data, extensionId: id });
}

async function sendCycletime(type: 'lastCycleTime' | 'prestart' | 'start' | 'end' | 'refsDone' | 'scoresPosted', data: string) {
    const { matchNumber, playNumber, level } = await getCurrentMatch();
    await trpc.cycles.postCycleTime.mutate({ eventToken, type, lastCycleTime: data, matchNumber, playNumber, level, extensionId: id });
}

async function sendScheduleDetails() {
    const schedule = await getScheduleBreakdown();
    if (schedule.days.length === 0) return;
    await trpc.cycles.postScheduleDetails.mutate({ eventToken, ...schedule, extensionId: id });
}

async function ensureChezySession(host = CHEZY_HOST) {
    // Hit the display page so the server sets any session cookies Chezy needs.
    // Extensions with host_permissions can do this without CORS issues.
    const u = `http://${host}/displays/field_monitor`;

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 1500);

    try {
        await fetch(u, {
            credentials: 'include', // <-- important so cookies persist and get sent on WS
            signal: controller.signal,
            cache: 'no-store',
        });
    } catch (e) {
        // It's okay if this times out or returns non-200 — we only need cookies set.
        // You can log if helpful.
        console.warn('ensureChezySession fetch:', e);
    } finally {
        clearTimeout(t);
    }
}


chrome.storage.local.onChanged.addListener((changes) => {
    for (const key of Object.keys(changes)) {
        if (key === 'changed') continue;
        start();
        return;
    }
});

// Ensure only the service worker runs start()
if (typeof self !== "undefined" && "ServiceWorkerGlobalScope" in self && self instanceof ServiceWorkerGlobalScope) {
    start().catch(console.error);
}
