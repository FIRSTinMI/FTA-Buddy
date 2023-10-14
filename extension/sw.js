chrome.webNavigation.onDOMContentLoaded.addListener(async ({ tabId, url }) => {
    console.log(url);
    if (!(url.endsWith('FieldMonitor') || url.endsWith('FieldMonitor/'))) return;
    console.log('match');
    chrome.scripting.executeScript({
        target: { tabId },
        files: ['scraper.js'],
    });
});
