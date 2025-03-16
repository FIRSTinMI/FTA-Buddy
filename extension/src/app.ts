const appExtensionData = chrome.runtime.getManifest();

(async () => {
    let url: string, cloud: boolean, changed: number, enabled: boolean, signalR: boolean, eventCode: string, eventToken: string;

    await new Promise((resolve) => {
        chrome.storage.local.get(['url', 'cloud', 'event', 'changed', 'enabled', 'signalR', 'eventToken'], item => {
            console.log(item);
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
            signalR = true;
            chrome.storage.local.set({ enabled: enabled, signalR: enabled });
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
            eventToken = evt.data.token;
            chrome.storage.local.set({ event: eventCode, eventToken });
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
            // Restart the extension after configuration changes
            chrome.extension.getBackgroundPage()?.location.reload();
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
