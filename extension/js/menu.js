chrome.storage.local.get('url', item => {
    if (item.url == undefined) {
        chrome.storage.local.set({ 'url': '127.0.0.1' });
        item = { url: '127.0.0.1' };
    }
    document.getElementById('url').value = item.url;
});
document.getElementById('url').addEventListener('change', () => {
    let url = document.getElementById('url');
    chrome.storage.local.set({ 'url': url.value });
});