let cacheName = 'ftabuddy';
let contentToCache = [
	"/app/assets/{{CSS_FILE}}",
	"/app/assets/{{JS_FILE}}",
	"/app/index.html",
	"/app/vh103.png",
	"/app/audio/red1_ds.ogg",
	"/app/audio/red1_code.ogg",
	"/app/audio/red1_rio.ogg",
	"/app/audio/red1_radio.ogg",
	"/app/audio/red2_ds.ogg",
	"/app/audio/red2_code.ogg",
	"/app/audio/red2_rio.ogg",
	"/app/audio/red2_radio.ogg",
	"/app/audio/red3_ds.ogg",
	"/app/audio/red3_code.ogg",
	"/app/audio/red3_rio.ogg",
	"/app/audio/red3_radio.ogg",
	"/app/audio/blue1_ds.ogg",
	"/app/audio/blue1_code.ogg",
	"/app/audio/blue1_rio.ogg",
	"/app/audio/blue1_radio.ogg",
	"/app/audio/blue2_ds.ogg",
	"/app/audio/blue2_code.ogg",
	"/app/audio/blue2_rio.ogg",
	"/app/audio/blue2_radio.ogg",
	"/app/audio/blue3_ds.ogg",
	"/app/audio/blue3_code.ogg",
	"/app/audio/blue3_rio.ogg",
	"/app/audio/blue3_radio.ogg",
	"/app/audio/green1.ogg",
	"/app/audio/green2.ogg",
	"/app/audio/green3.ogg",
	"/app/audio/good_job.ogg",
	"/app/music/jass1.mp3",
	"/app/music/jass2.mp3",
	"/app/music/jass3.mp3",
	"/app/music/jass4.mp3",
	"/app/music/jass5.mp3",
	"/app/music/jass6.mp3",
	"/app/FIM_Case_23_24.pdf",
	"/app/FIM_Case_31.pdf",
	"/app/FIM_Case_32.pdf",
];

self.addEventListener("install", (evt) => {
	console.log("Service worker installed");
	evt.waitUntil(
		caches.open(cacheName).then((cache) => {
			console.log("[Service Worker] Caching all: app shell and content");
			return cache.addAll(contentToCache);
		})
	);
});

self.addEventListener("activate", (evt) => {
	console.log("Service worker activated");
});

self.addEventListener("push", (evt) => {
	const data = evt.data.json();
	self.registration.showNotification(data.title, {
		body: data.body,
		icon: data.icon,
	});
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
