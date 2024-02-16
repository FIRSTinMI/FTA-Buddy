const cloudCheckbox = document.getElementById('cloud');
const urlInput = document.getElementById('url');
const urlContainer = document.getElementById('url-container');
const eventInput = document.getElementById('event');
const eventContainer = document.getElementById('event-container');

chrome.storage.local.get(['url', 'cloud', 'event'], item => {
    console.log(item);

    if (item.url == undefined || item.cloud == undefined || item.event == undefined) {
        chrome.storage.local.set({ url: '127.0.0.1', cloud: true, event: 'test' });
        item = { url: '127.0.0.1', cloud: true, event: 'test' };
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
});

function handleUpdate() {
    console.log({ url: urlInput.value, cloud: cloudCheckbox.checked, event: eventInput.value })
    chrome.storage.local.set({ url: urlInput.value, cloud: cloudCheckbox.checked, event: eventInput.value });

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
