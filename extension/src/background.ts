import { SignalR } from "./signalR";

const manifestData = chrome.runtime.getManifest();
let signalRConnection = new SignalR('192.168.1.220', manifestData.version, sendFrame);
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

    chrome.runtime.onConnect.addListener((port) => {
        console.assert(port.name === 'ftabuddy');
        port.onMessage.addListener(async (msg) => {
            console.log(msg);
            if (msg.type === "eventCode") {
                const eventCode = await signalRConnection.fetchEventName();
                port.postMessage({ type: 'eventCode', code: eventCode });
            }
        });
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