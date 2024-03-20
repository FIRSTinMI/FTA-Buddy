console.log('Loaded injector');
chrome.storage.local.get(['url', 'cloud', 'event', 'changed', 'enabled'], item => {
    console.log(item);
    if (!item.enabled) {
        console.log('Not enabled');
        return;
    } else if (item.changed + (1000 * 60 * 60 * 24 * 4) < new Date().getTime()) {
        console.log('Expired');
        return;
    }
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('js/injected.js');
    script.dataset.host = item.url;
    script.dataset.cloud = item.cloud;
    script.dataset.event = item.event;
    script.id = 'fta-buddy';
    document.body.appendChild(script);
});
