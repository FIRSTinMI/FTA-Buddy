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
        }
    });
})();

async function pingFMS() {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: "ping" }, (response) => {
            console.log(response);
            resolve(response.fms);
        });
    });
}
