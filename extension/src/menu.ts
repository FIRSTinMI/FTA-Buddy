const cloudCheckbox = document.getElementById('cloud') as HTMLInputElement;
const urlInput = document.getElementById('url') as HTMLInputElement;
const urlContainer = document.getElementById('url-container') as HTMLDivElement;
const eventInput = document.getElementById('event') as HTMLInputElement;
const eventContainer = document.getElementById('event-container') as HTMLDivElement;
const enabled = document.getElementById('enabled') as HTMLInputElement;
const signalREnabled = document.getElementById('signalR') as HTMLInputElement;

function load() {
    chrome.storage.local.get(['url', 'cloud', 'event', 'changed', 'enabled', 'signalR'], item => {
        console.log(item);

        if (item.url == undefined || item.cloud == undefined || item.event == undefined || item.changed == undefined || item.enabled == undefined || item.signalR == undefined) {
            item = {
                url: item.url || 'ws://localhost:3001/ws/',
                cloud: item.cloud ?? true,
                event: item.event || '2024event',
                changed: item.changed || new Date().getTime(),
                enabled: item.enabled ?? false,
                signalR: item.signalR ?? false
            };
            chrome.storage.local.set(item);
        }
        cloudCheckbox.checked = item.cloud;
        urlInput.value = item.url;
        eventInput.value = item.event;
        enabled.checked = item.enabled;
        signalREnabled.checked = item.signalR;

        urlContainer.style.display = item.cloud ? 'none' : 'block';

        if (item.changed + (1000 * 60 * 60 * 24 * 4) < new Date().getTime()) {
            enabled.checked = false;
            chrome.storage.local.set({ enabled: false });
        }

        cloudCheckbox.addEventListener('input', handleUpdate);
        urlInput.addEventListener('input', handleUpdate);
        eventInput.addEventListener('input', handleUpdate);
        enabled.addEventListener('input', handleUpdate);
        signalREnabled.addEventListener('input', handleUpdate);
    });
}

function handleUpdate() {
    if (eventInput.value == '') {
        eventInput.value = '2024event';
    }
    if (urlInput.value == '') {
        urlInput.value = 'ws://localhost:3001/ws/';
    }

    console.log({ url: urlInput.value, cloud: cloudCheckbox.checked, event: eventInput.value, changed: new Date().getTime(), enabled: enabled.checked, signalR: signalREnabled.checked})
    chrome.storage.local.set({ url: urlInput.value, cloud: cloudCheckbox.checked, event: eventInput.value, changed: new Date().getTime(), enabled: enabled.checked, signalR: signalREnabled.checked});

    urlContainer.style.display = cloudCheckbox.checked ? 'none' : 'block';
}

function updatePopup(setting: 'url' | 'cloud' | 'enabled' | 'event' | 'signalR', value: boolean | string) {
    const elm = document?.getElementById(setting);
    if (!elm) return;
    if (typeof value === 'boolean') {
        (elm as HTMLInputElement).checked = value;
    } else {
        (elm as HTMLInputElement).value = value;
    }
}

chrome.storage.local.onChanged.addListener((changes) => {
    for (const key of Object.keys(changes)) {
        if (key === 'changed') continue;
        updatePopup(key as 'url' | 'cloud' | 'enabled' | 'event' | 'signalR', changes[key].newValue);
    }
});

load();
