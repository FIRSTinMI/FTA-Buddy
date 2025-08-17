import { TournamentLevel } from "@shared/types";
import { uploadMatchLogsForMatch } from "./trpc";

const cloudCheckbox = document.getElementById('cloud') as HTMLInputElement;
const urlInput = document.getElementById('url') as HTMLInputElement;
const urlContainer = document.getElementById('url-container') as HTMLDivElement;
const eventInput = document.getElementById('event') as HTMLInputElement;
const eventContainer = document.getElementById('event-container') as HTMLDivElement;
const enabledInput = document.getElementById('enabled') as HTMLInputElement;
const tokenInput = document.getElementById('eventToken') as HTMLInputElement;
const saveButton = document.getElementById('save') as HTMLButtonElement;

const matchLevelInput = document.getElementById('match-level') as HTMLSelectElement;
const matchNumberInput = document.getElementById('match-number') as HTMLInputElement;
const matchPlayInput = document.getElementById('match-play') as HTMLInputElement;
const matchimportButton = document.getElementById('import') as HTMLButtonElement;

const extensionStatusIndicator = document.getElementById('extension-status') as HTMLDivElement;
const fmsApiStatusIndicator = document.getElementById('fms-api-status') as HTMLDivElement;
const fmsSignalRStatusIndicator = document.getElementById('fms-signalr-status') as HTMLDivElement;
const ftaBuddyStatusIndicator = document.getElementById('fta-buddy-status') as HTMLDivElement;

const extensionStatusText = document.getElementById('extension-status-text') as HTMLSpanElement;
const fmsApiStatusText = document.getElementById('fms-api-status-text') as HTMLSpanElement;
const fmsSignalRStatusText = document.getElementById('fms-signalr-status-text') as HTMLSpanElement;
const ftaBuddyStatusText = document.getElementById('fta-buddy-status-text') as HTMLSpanElement;

// ---- Messaging helpers ----
async function bgGetState(): Promise<{
    cloud: boolean; url: string; eventCode: string; eventToken: string;
    enabled: boolean; id: string; fmsApi: boolean; version: string; FMS: string;
}> {
    return chrome.runtime.sendMessage({ type: "getState" });
}

async function bgPingFMS(): Promise<{ ok: boolean; fmsApi: boolean; FMS: string; }> {
    return chrome.runtime.sendMessage({ type: "pingFMS" });
}

async function bgGetStatuses(): Promise<{ signalrStatus: string; wsStatus: string; }> {
    return chrome.runtime.sendMessage({ type: "getStatuses" });
}

function load() {
    chrome.storage.local.get(['url', 'cloud', 'event', 'eventToken', 'changed', 'enabled'], item => {
        if (item.url == undefined || item.cloud == undefined || item.event == undefined || item.changed == undefined || item.enabled == undefined || item.eventToken == undefined) {
            item = {
                url: item.url || 'http://localhost:3001',
                cloud: item.cloud ?? true,
                event: item.event || '2024event',
                changed: item.changed || new Date().getTime(),
                enabled: item.enabled ?? false,
                eventToken: item.eventToken || ''
            };
            chrome.storage.local.set(item);
        }

        cloudCheckbox.checked = item.cloud;
        urlInput.value = item.url;
        eventInput.value = item.event;
        enabledInput.checked = item.enabled;
        tokenInput.value = item.eventToken;

        urlContainer.style.display = item.cloud ? 'none' : 'block';

        if (item.changed + (1000 * 60 * 60 * 24 * 4) < new Date().getTime()) {
            enabledInput.checked = false;
            chrome.storage.local.set({ enabled: false });
        }

        cloudCheckbox.addEventListener('input', handleUpdate);
        enabledInput.addEventListener('input', handleUpdate);
        saveButton.addEventListener('click', handleUpdate);

        matchimportButton.addEventListener('click', async () => {
            const level = matchLevelInput.value as TournamentLevel;
            const matchNumber = parseInt(matchNumberInput.value);
            const playNumber = parseInt(matchPlayInput.value);
            await uploadMatchLogsForMatch(matchNumber, playNumber, level);
        });

        updateStatusIndicators();
    });
}

async function updateStatusIndicators() {

    let ftaBuddy, bgStatus;

    const state = bgGetState().then(state => {
        const { enabled, eventCode, eventToken } = state;

        extensionStatusIndicator.classList.remove('red', 'green', 'yellow');
        if (!enabled) {
            extensionStatusIndicator.classList.add('red');
            extensionStatusText.textContent = 'Not Enabled';
        } else if (!eventCode || !eventToken) {
            extensionStatusIndicator.classList.add('yellow');
            extensionStatusText.textContent = 'Missing Event Code or Token';
        } else {
            extensionStatusIndicator.classList.add('green');
            extensionStatusText.textContent = '';
        }

        bgStatus = bgGetStatuses().then(status => {
            const { signalrStatus, wsStatus } = status;

            fmsSignalRStatusIndicator.classList.remove('red', 'green', 'yellow');
            if (signalrStatus !== 'Connected') {
                fmsSignalRStatusIndicator.classList.add('red');
                fmsSignalRStatusText.textContent = signalrStatus || 'Not Connected';
            } else {
                fmsSignalRStatusIndicator.classList.add('green');
                fmsSignalRStatusText.textContent = '';
            }

            ftaBuddy = pingFTABuddy(state.cloud, state.url).then(ftaBuddy => {
                ftaBuddyStatusIndicator.classList.remove('red', 'green', 'yellow');
                if (!ftaBuddy) {
                    ftaBuddyStatusIndicator.classList.add('red');
                    ftaBuddyStatusText.textContent = 'Not able to reach FTA Buddy on ' + (state.cloud ? 'https://ftabuddy.com/' : state.url);
                } else if (wsStatus !== "open") {
                    ftaBuddyStatusIndicator.classList.add('yellow');
                    ftaBuddyStatusText.textContent = 'WebSocket not open';
                } else {
                    ftaBuddyStatusIndicator.classList.add('green');
                    ftaBuddyStatusText.textContent = '';
                }
            });
        });
    });

    const fmsRes = bgPingFMS().then(res => {
        fmsApiStatusIndicator.classList.remove('red', 'green', 'yellow');
        if (!res.ok) {
            fmsApiStatusIndicator.classList.add('red');
            fmsApiStatusText.textContent = 'Not able to reach FMS on ' + res.FMS;
        } else {
            fmsApiStatusIndicator.classList.add('green');
            fmsApiStatusText.textContent = '';
        }
    });

    await Promise.all([bgStatus, ftaBuddy, fmsRes]);
    setTimeout(updateStatusIndicators, 3000);
}

async function pingFTABuddy(cloud: boolean, url: string) {
    const base = cloud ? 'https://ftabuddy.com' : (url || '').replace(/\/+$/, '');
    const endpoints = [`${base}/trpc`, `${base}/`];

    for (const endpoint of endpoints) {
        try {
            const controller = new AbortController();
            const t = setTimeout(() => controller.abort(), 600);
            const res = await fetch(endpoint, {
                signal: controller.signal,
                cache: 'no-store',
                // method: 'GET',  // default
            });
            clearTimeout(t);

            // tRPC GET often returns 404 when route names aren’t specified — host is still UP.
            if (res.status === 200 || res.status === 404) return true;
        } catch {
            // try next endpoint
        }
    }
    return false;
}


function handleUpdate() {
    if (eventInput.value == '') eventInput.value = '2024event';
    if (urlInput.value == '') urlInput.value = 'http://localhost:3001';

    chrome.storage.local.set({
        url: urlInput.value,
        cloud: cloudCheckbox.checked,
        event: eventInput.value,
        changed: new Date().getTime(),
        enabled: enabledInput.checked,
        eventToken: tokenInput.value
    });

    urlContainer.style.display = cloudCheckbox.checked ? 'none' : 'block';
    chrome.runtime.reload();
}

function updatePopup(setting: 'url' | 'cloud' | 'enabled' | 'event' | 'eventToken', value: boolean | string) {
    const elm = document?.getElementById(setting);
    if (!elm) return;
    if (typeof value === 'boolean') {
        (elm as HTMLInputElement).checked = value;
    } else {
        (elm as HTMLInputElement).value = value;
    }
}

chrome.storage.local.onChanged.addListener((changes) => {
    for (const key of Object.keys(changes)) {
        if (key === 'changed') continue;
        updatePopup(key as 'url' | 'cloud' | 'enabled' | 'event' | 'eventToken', changes[key].newValue);
    }
});

load();
