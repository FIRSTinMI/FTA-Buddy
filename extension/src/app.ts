const appExtensionData = chrome.runtime.getManifest();

(async () => {
    let url: string, cloud: boolean, changed: number, enabled: boolean, signalR: boolean, eventCode: string, eventToken: string, id: string;

    await new Promise((resolve) => {
        chrome.storage.local.get(['url', 'cloud', 'event', 'changed', 'enabled', 'signalR', 'eventToken', 'id'], item => {
            console.log(item);
            url = item.url;
            cloud = item.cloud;
            eventCode = item.event;
            changed = item.changed;
            enabled = item.enabled;
            signalR = item.signalR;
            eventToken = item.eventToken;
            id = item.id;
            resolve(void 0);
        });
    });

    window.addEventListener('message', async (evt) => {
        console.log(evt.data);

        if (evt.data.source !== 'page') return;

        if (evt.data.type === "ping") {
            const fms = await pingFMS();
            window.postMessage({
                source: 'ext',
                version: appExtensionData.version,
                type: "pong",
                cloud,
                eventCode,
                enabled,
                signalR,
                fms: fms.fms,
                id
            });
        } else if (evt.data.type === "enable") {
            enabled = true;
            signalR = true;
            await chrome.storage.local.set({ enabled: enabled, signalR: enabled });
            await enable();
            window.postMessage({
                source: 'ext',
                version: appExtensionData.version,
                type: "pong",
                cloud,
                eventCode,
                enabled,
                signalR,
                fms: await pingFMS(),
                id
            });
        } else if (evt.data.type === "enableNoSignalR") {
            enabled = true;
            await chrome.storage.local.set({ enabled: enabled, signalR: enabled });
            await enableNoSignalR();
            window.postMessage({
                source: 'ext',
                version: appExtensionData.version,
                type: "pong",
                cloud,
                eventCode,
                enabled,
                signalR,
                fms: await pingFMS(),
                id
            });
        } else if (evt.data.type === "eventCode") {
            eventCode = evt.data.code;
            eventToken = evt.data.token;
            await chrome.storage.local.set({ event: eventCode, eventToken });
            window.postMessage({
                source: 'ext',
                version: appExtensionData.version,
                type: "pong",
                cloud,
                eventCode,
                enabled,
                signalR,
                fms: await pingFMS(),
                id
            });
            // Restart the extension after configuration changes
            await restart();
        } else if (evt.data.type === "enableSignalR") {
            signalR = true;
            await chrome.storage.local.set({ signalR: signalR });
            window.postMessage({
                source: 'ext',
                version: appExtensionData.version,
                type: "pong",
                cloud,
                eventCode,
                enabled,
                signalR,
                fms: await pingFMS(),
                id
            });
            await restart();
        } else if (evt.data.type === "getEventCode") {
            window.postMessage(await getEventCode());
        } else if (evt.data.type === "restart") {
            await restart();
        }
    });
})();

async function pingFMS() {
    return await chrome.runtime.sendMessage({ type: "ping" });
}

async function getEventCode() {
    return await chrome.runtime.sendMessage({ type: "getEventCode" });
}

async function enable() {
    return await chrome.runtime.sendMessage({ type: "enable" });
}

async function enableNoSignalR() {
    return await chrome.runtime.sendMessage({ type: "enableNoSignalR" });
}

async function restart() {
    return await chrome.runtime.sendMessage({ type: "restart" });
}