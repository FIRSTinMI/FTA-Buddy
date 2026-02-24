const appExtensionData = chrome.runtime.getManifest();

(async () => {
    let url: string, cloud: boolean, changed: number, enabled: boolean, eventCode: string, eventToken: string, id: string;

    await new Promise((resolve) => {
        chrome.storage.local.get(['url', 'cloud', 'event', 'changed', 'enabled', 'eventToken', 'id'], item => {
            console.log(item);
            url = item.url;
            cloud = item.cloud;
            eventCode = item.event;
            changed = item.changed;
            enabled = item.enabled;
            eventToken = item.eventToken;
            id = item.id;
            resolve(void 0);
        });
    });

    function sendPong(extra?: Record<string, any>) {
        window.postMessage({
            source: 'ext',
            version: appExtensionData.version,
            type: "pong",
            cloud,
            eventCode,
            enabled,
            signalR: enabled,
            fms: extra?.fms ?? false,
            id,
            ...extra,
        });
    }

    window.addEventListener('message', async (evt) => {
        console.log(evt.data);

        if (evt.data.source !== 'page') return;

        if (evt.data.type === "ping") {
            const fms = await pingFMS();
            sendPong({ fms: fms.fms });
        } else if (evt.data.type === "enable") {
            enabled = true;
            await chrome.storage.local.set({ enabled });
            // Storage change triggers background restart automatically
            const fms = await pingFMS();
            sendPong({ fms: fms.fms });
        } else if (evt.data.type === "eventCode") {
            eventCode = evt.data.code;
            eventToken = evt.data.token;
            await chrome.storage.local.set({ event: eventCode, eventToken });
            // Storage change triggers background restart automatically
            const fms = await pingFMS();
            sendPong({ fms: fms.fms });
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