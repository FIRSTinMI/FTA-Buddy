import { SignalR } from "./signalR";

const manifestData = chrome.runtime.getManifest();
let signalRConnection = new SignalR('10.0.100.5', manifestData.version, sendFrame);
let ws: WebSocket;

async function start() {
    let url, cloud, changed, enabled, signalR, eventCode;

    await new Promise((resolve) => {
        chrome.storage.local.get(['url', 'cloud', 'event', 'changed', 'enabled', 'signalR'], item => {
            console.log(item);
            url = item.url;
            cloud = item.cloud;
            eventCode = item.event;
            changed = item.changed;
            enabled = item.enabled;
            signalR = item.signalR;
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

    if (!cloud || !eventCode) return;

    console.log(cloud, url, eventCode);
    connectToWS(cloud, url, eventCode);
}

function connectToWS(cloud: boolean, url: string | undefined, eventCode: string) {
    if (ws) ws.close();

    console.log('Trying to connect to ' + ((cloud) ? 'cloud' : url));
    ws = new WebSocket((cloud) ? `wss://ftabuddy.com/ws/` : url ?? 'ws://localhost:8080');
    ws.onopen = () => {
        ws.send(`server-${eventCode}`);
        console.log('Connected to server');
    }
    ws.onclose = () => {
        console.log('Disconnected from server, reconnecting in 5 seconds.');
        setTimeout(connectToWS, 5000);
    }
    ws.onerror = (err) => {
        console.error(err);
    }
}

async function pingFMS() {
    try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 500)
        const res = await fetch('http://10.0.100.5/FieldMonitor', {
            signal: controller.signal
        });
        return res.ok;
    } catch (e) {
        return false;
    }
}

function sendFrame(data: any) {
    if (ws.readyState === 1) ws.send(JSON.stringify(data));
}

chrome.storage.local.onChanged.addListener((changes) => {
    for (const key of Object.keys(changes)) {
        if (key === 'changed') continue;
        return start();
    }
});

start();