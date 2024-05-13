const appExtensionData = chrome.runtime.getManifest();

(async () => {
    let url: string, cloud: boolean, changed: number, enabled: boolean, signalR: boolean, eventCode: string;

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
                fms: fms.fms
            });
        } else if (evt.data.type === "enable") {
            enabled = true;
            chrome.storage.local.set({ enabled: enabled });
            window.postMessage({
                source: 'ext',
                version: appExtensionData.version,
                type: "pong",
                cloud,
                eventCode,
                enabled,
                signalR,
                fms: await pingFMS()
            });
        } else if (evt.data.type === "eventCode") {
            eventCode = evt.data.code;
            chrome.storage.local.set({ event: eventCode });
            window.postMessage({
                source: 'ext',
                version: appExtensionData.version,
                type: "pong",
                cloud,
                eventCode,
                enabled,
                signalR,
                fms: await pingFMS()
            });
        } else if (evt.data.type === "enableSignalR") {
            signalR = true;
            chrome.storage.local.set({ signalR: signalR });
            window.postMessage({
                source: 'ext',
                version: appExtensionData.version,
                type: "pong",
                cloud,
                eventCode,
                enabled,
                signalR,
                fms: await pingFMS()
            });
        } else if (evt.data.type === "getEventCode") {
            window.postMessage(await getEventCode());
        }
    });
})();

async function pingFMS() {
    return await chrome.runtime.sendMessage({ type: "ping" });
}

async function getEventCode() {
    return await chrome.runtime.sendMessage({ type: "getEventCode" });
}
