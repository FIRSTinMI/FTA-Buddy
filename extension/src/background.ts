import { SignalR } from "./signalR";
import { getCurrentMatch, getEventCode, getScheduleBreakdown, getTeamNumbers } from "./fmsapi";
import { trpc, updateValues } from "./trpc";

const manifestData = chrome.runtime.getManifest();
export const FMS = '10.0.100.5';
console.log(FMS);
export let signalRConnection = new SignalR(FMS, manifestData.version, sendFrame, sendCycletime, sendScheduleDetails);

let eventCode: string;
let eventToken: string;
let url: string;

async function start() {
    let cloud, changed, enabled, signalR;

    await new Promise((resolve) => {
        chrome.storage.local.get(['url', 'cloud', 'event', 'changed', 'enabled', 'signalR', 'id', 'eventToken'], item => {
            console.log(item);
            if (!item.id) chrome.storage.local.set({ id: crypto.randomUUID() });

            if (item.url == undefined || item.cloud == undefined || item.event == undefined || item.changed == undefined || item.enabled == undefined || item.signalR == undefined || item.eventToken == undefined) {
                item = {
                    url: item.url || 'ws://localhost:3001/ws/',
                    cloud: item.cloud ?? true,
                    event: item.event || '2024event',
                    changed: item.changed || new Date().getTime(),
                    enabled: item.enabled ?? false,
                    signalR: item.signalR ?? false,
                    eventToken: item.eventToken || ''
                };
                chrome.storage.local.set(item);
            }

            url = item.url;
            cloud = item.cloud;
            eventCode = item.event;
            changed = item.changed;
            enabled = item.enabled;
            signalR = item.signalR;
            eventToken = item.eventToken;
            resolve(void 0);
        });
    });

    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        console.log(msg);
        if (msg.type === "ping") {
            pingFMS().then((fms) => {
                sendResponse({
                    source: 'ext',
                    version: manifestData.version,
                    type: "pong",
                    fms
                });
            });
        } else if (msg.type === "getEventCode") {
            getEventCode().then((code) => {
                getTeamNumbers().then((teams) => {
                    sendResponse({
                        source: 'ext',
                        version: manifestData.version,
                        type: "eventCode",
                        code,
                        teams
                    });
                });
            });
        }
        return true;
    });

    if (!enabled) {
        console.log('Not enabled');
        return;
    } else if (changed && changed + (1000 * 60 * 60 * 24 * 4) < new Date().getTime()) {
        console.log('Expired');
        return;
    } else if (!signalR) {
        console.log('Not using signalR so I won\'t start the service');
        return;
    }

    if (signalR) {
        console.log('Starting SignalR');
        signalRConnection.start();
    }

    console.log(cloud, url, eventCode, eventToken);

    if (!(eventCode || eventToken)) return;

    updateValues();
    sendScheduleDetails();
}

async function pingFMS() {
    try {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 500);
        const res = await fetch(`http://${FMS}/FieldMonitor`, {
            signal: controller.signal
        });
        return res.ok;
    } catch (e) {
        return false;
    }
}

async function sendFrame(data: any) {
    await trpc.field.post.mutate((eventToken) ? { eventToken, ...data } : { eventCode, ...data });
}

async function sendCycletime(type: 'lastCycleTime' | 'prestart' | 'start' | 'end' | 'refsDone' | 'scoresPosted', data: string) {
    const { matchNumber, playNumber, level } = await getCurrentMatch();
    await trpc.cycles.postCycleTime.mutate({ eventToken, type, lastCycleTime: data, matchNumber, playNumber, level });
}

async function sendScheduleDetails() {
    const schedule = await getScheduleBreakdown();
    console.log(schedule);
    if (schedule.days.length === 0) return;
    await trpc.cycles.postScheduleDetails.mutate({ eventToken, ...schedule });
}

chrome.storage.local.onChanged.addListener((changes) => {
    console.log(changes);
    for (const key of Object.keys(changes)) {
        if (key === 'changed') continue;
        return start();
    }
});

start();
