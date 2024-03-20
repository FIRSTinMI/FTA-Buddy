const cloudCheckbox = document.getElementById('cloud');
const urlInput = document.getElementById('url');
const urlContainer = document.getElementById('url-container');
const eventInput = document.getElementById('event');
const eventContainer = document.getElementById('event-container');

chrome.storage.local.get(['url', 'cloud', 'event'], item => {
    console.log(item);

    if (item.url == undefined || item.cloud == undefined || item.event == undefined || item.changed == undefined) {
        item = { url: item.url || '127.0.0.1', cloud: item.cloud || true, event: item.event || '2024event', changed: item.changed || new Date().getTime() };
        chrome.storage.local.set(item);
    }
    cloudCheckbox.checked = item.cloud;
    urlInput.value = item.url;
    eventInput.value = item.event;

    if (item.cloud) {
        urlContainer.style.display = 'none';
        eventContainer.style.display = 'block';
    } else {
        urlContainer.style.display = 'block';
        eventContainer.style.display = 'none';
    }

    if (item.changed + (1000 * 60 * 60 * 24 * 4) < new Date().getTime()) {
        item.event = '2024event';
        item.changed = new Date();
        chrome.storage.local.set(item);
    }
});

function handleUpdate() {
    if (eventInput.value == '' || eventInput.value == 'test') {
        eventInput.value = '2024event';
    }
    if (urlInput.value == '') {
        urlInput.value = '127.0.0.1';
    }

    console.log({ url: urlInput.value, cloud: cloudCheckbox.checked, event: eventInput.value, changed: new Date().getTime() })
    chrome.storage.local.set({ url: urlInput.value, cloud: cloudCheckbox.checked, event: eventInput.value, changed: new Date().getTime() });

    if (cloudCheckbox.checked) {
        urlContainer.style.display = 'none';
        eventContainer.style.display = 'block';
    } else {
        urlContainer.style.display = 'block';
        eventContainer.style.display = 'none';
    }
}

cloudCheckbox.addEventListener('input', handleUpdate);
urlInput.addEventListener('input', handleUpdate);
eventInput.addEventListener('input', handleUpdate);
