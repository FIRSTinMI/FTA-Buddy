let cacheName = 'ftabuddy';
let contentToCache = [
    '/assets/index.css',
    '/assets/index.js',
    '/index.html',
    '/openmesh-radio-status-lights-1100.png'
]


self.addEventListener("install", (evt) => {
    console.log("Service worker installed");
    evt.waitUntil(
        caches.open(cacheName).then((cache) => {
            console.log('[Service Worker] Caching all: app shell and content');
            return cache.addAll(contentToCache);
        })
    );
});

self.addEventListener("activate", (evt) => {
    console.log("Service worker activated");
});
/*
self.addEventListener('fetch', function(e) {
    e.respondWith(
        caches.match(e.request).then(function(r) {
            console.log('[Service Worker] Fetching resource: '+e.request.url);
            return r || fetch(e.request).then(function(response) {
                return caches.open(cacheName).then(function(cache) {
                    console.log('[Service Worker] Caching new resource: '+e.request.url);
                    cache.put(e.request, response.clone());
                    return response;
                });
            });
        });
    );
});
*/
