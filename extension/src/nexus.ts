console.log('Loaded injector');
chrome.storage.local.get(['url', 'cloud', 'event', 'changed', 'eventToken', 'enabled', 'signalR', 'id'], item => {
    console.log(item);
    if (!item.enabled) {
        console.log('Not enabled');
        return;
    } else if (item.changed + (1000 * 60 * 60 * 24 * 4) < new Date().getTime()) {
        console.log('Expired');
        return;
    }

    const script = document.createElement('script');
    script.dataset.host = item.url;
    script.dataset.cloud = item.cloud;
    script.dataset.event = item.event;
    script.dataset.eventToken = item.eventToken;
    script.dataset.extensionId = item.id;
    script.id = 'fta-buddy';

    script.src = chrome.runtime.getURL('injected-nexus.js');

    document.body.appendChild(script);
});
