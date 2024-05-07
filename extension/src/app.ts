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
    
    const extensionSocket = chrome.runtime.connect({ name: 'ftabuddy' });
    extensionSocket.onMessage.addListener((msg) => {
        console.log(msg);
        if (msg.type === "eventCode") {
            window.postMessage({ source: 'ext', type: 'eventCode', code: msg.code }, '*');
        }
    });

    window.addEventListener('message', (evt) => {
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
                signalR
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
                signalR
            });
        } else if (evt.data.type === "eventCode") {
            extensionSocket.postMessage({ source: 'page', type: 'eventCode' });
        }
    });
})();