import { SignalR } from "./signalR";
import { getEventCode } from "./fmsapi";
import { trpc, updateValues } from "./trpc";
const manifestData = chrome.runtime.getManifest();
export const FMS = '192.168.1.220'
let signalRConnection = new SignalR(FMS, manifestData.version, sendFrame);

let eventCode: string;
let eventToken: string;
let url: string;

async function start() {
    let cloud, changed, enabled, signalR;

    await new Promise((resolve) => {
        chrome.storage.local.get(['url', 'cloud', 'event', 'changed', 'enabled', 'signalR', 'id', 'eventToken'], item => {
            console.log(item);
            if (!item.id) chrome.storage.local.set({ id: crypto.randomUUID() });
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
                sendResponse({
                    source: 'ext',
                    version: manifestData.version,
                    type: "eventCode",
                    code
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
}

async function pingFMS() {
    try {
        const controller = new AbortController()
        setTimeout(() => controller.abort(), 500)
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

chrome.storage.local.onChanged.addListener((changes) => {
    for (const key of Object.keys(changes)) {
        if (key === 'changed') continue;
        return start();
    }
});

start();