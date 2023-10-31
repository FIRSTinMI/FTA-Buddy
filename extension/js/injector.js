console.log('Loaded injector');
chrome.storage.local.get('url', item => {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('js/injected.js');
    script.dataset.host = item.url || '127.0.0.1';
    script.id = 'fta-buddy';
    document.body.appendChild(script);
});