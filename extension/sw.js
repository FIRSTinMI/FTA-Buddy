chrome.webNavigation.onDOMContentLoaded.addListener(async ({ tabId, url }) => {
    console.log(url);
    if (!(url.endsWith('FieldMonitor') || url.endsWith('FieldMonitor.html'))) return;
    console.log('match');
    chrome.scripting.executeScript({
        target: { tabId },
        files: ['scraper.js'],
    });
});
