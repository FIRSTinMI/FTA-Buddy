console.log('Loaded injector');
const manifestData = chrome.runtime.getManifest();
chrome.storage.local.get(['url', 'cloud', 'event', 'changed', 'enabled', 'signalR', 'id'], item => {
    console.log(item);
    if (!item.enabled) {
        console.log('Not enabled');
        return;
    } else if (item.changed + (1000 * 60 * 60 * 24 * 4) < new Date().getTime()) {
        console.log('Expired');
        return;
    } else if (item.signalR) {
        console.log('Using signalR so I won\'t inject');
        return;
    }

    if (!item.id) {
        item.id = crypto.randomUUID();
        chrome.storage.local.set({ id: item.id });
    }

    const script = document.createElement('script');
    script.dataset.host = item.url;
    script.dataset.cloud = item.cloud;
    script.dataset.event = item.event;
    script.dataset.version = manifestData.version;
    script.dataset.extensionId = item.id;
    script.id = 'fta-buddy';
    document.body.appendChild(script);
});
