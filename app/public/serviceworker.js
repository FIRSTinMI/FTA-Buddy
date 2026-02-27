let cacheName = "ftabuddy";
let contentToCache = [
	"/assets/{{CSS_FILE}}",
	"/assets/{{JS_FILE}}",
	"/index.html",
	"/vh109.png",
	"/frc-control-system-layout-ctre.svg",
	"/frc-control-system-layout-rev.svg",
];

self.importScripts("/localforage.js");

const localforageNotifications = localforage.createInstance({
	name: "ftabuddy-notifications",
});
const localforageSettings = localforage.createInstance({
	name: "ftabuddy-settings",
});

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

async function getSettingsStore() {
	const settings = await localforageSettings.getItem("settings");
	if (settings) {
		return JSON.parse(settings);
	}
}

async function checkIfNotificationExists(id) {
	const notifications = await localforageNotifications.getItem("notifications");
	if (notifications) {
		const parsed = JSON.parse(notifications);
		return parsed.some((n) => n.id === id);
	}
	return false;
}

async function addNotification(notification) {
	const notifications = await localforageNotifications.getItem("notifications");
	if (notifications) {
		const parsed = JSON.parse(notifications);
		parsed.push(notification);
		await localforageNotifications.setItem("notifications", JSON.stringify(parsed));
	} else {
		await localforageNotifications.setItem("notifications", JSON.stringify([notification]));
	}
}

// Map server topic -> local settings category
// Includes both canonical names (shared/types.ts) and legacy aliases
const TOPIC_CATEGORY = {
	// Canonical
	"Note-Created": "create",
	"Note-Assigned": "assign",
	"Note-Status": "follow",
	"New-Note-Message": "follow",
	"Note-Follow": "follow",
	"Robot-Status": "robot",
	// Legacy aliases
	"Ticket-Created": "create",
	"Ticket-Assigned": "assign",
	"Ticket-Status": "follow",
	"New-Ticket-Message": "follow",
};

const DEFAULT_SETTINGS = {
	notificationCategories: { create: true, follow: true, assign: true, robot: true },
};

self.addEventListener("push", (event) => {
	event.waitUntil(
		(async () => {
			// 1) Parse payload safely — PushEvent.data may be null
			let data = {};
			try {
				data = event.data ? event.data.json() : {};
			} catch (e) {
				console.warn("[SW] push: failed to parse payload", e);
			}

			// 2) Load settings safely — SW may start cold with empty storage
			let settings = DEFAULT_SETTINGS;
			try {
				const stored = await getSettingsStore();
				if (stored && stored.notificationCategories) settings = stored;
			} catch (e) {
				// keep defaults
			}

			// 3) Check whether this topic is enabled
			const category = TOPIC_CATEGORY[data.topic];
			if (!category || !settings.notificationCategories?.[category]) return;

			// 4) De-duplicate non-robot notifications
			if (data.topic !== "Robot-Status") {
				if (data.id && (await checkIfNotificationExists(data.id))) return;
				if (data.id) await addNotification(data);
			}

			// 5) Show notification — return the promise so Chromium knows a visible
			//    notification was shown and does not generate its generic fallback.
			return self.registration.showNotification(data.title || "FTA Buddy", {
				body: data.body ?? "",
				tag: data.tag,
				data: data.data,
				icon: data.icon || "/icon512_rounded.png",
			});
		})()
	);
});

self.addEventListener("notificationclick", (event) => {
	const rootUrl = new URL("/", location).href;
	const pageToOpen = event.notification.data?.page ?? "";
	const targetUrl = rootUrl + pageToOpen;
	event.notification.close();
	event.waitUntil(
		(async () => {
			const matched = await clients.matchAll({ type: "window", includeUncontrolled: true });
			for (const client of matched) {
				if (client.url === targetUrl && "focus" in client) {
					return client.focus();
				}
			}
			return clients.openWindow(targetUrl);
		})()
	);
});

// Re-subscribe when the browser rotates our push subscription.
// We can't call tRPC directly from the SW (no auth token), so we message
// an open window and let the app handle the re-registration.
self.addEventListener("pushsubscriptionchange", (event) => {
	event.waitUntil(
		(async () => {
			try {
				const newSub = await self.registration.pushManager.subscribe(
					event.oldSubscription.options
				);
				const windowClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
				for (const client of windowClients) {
					client.postMessage({ type: "pushsubscriptionchange", subscription: newSub.toJSON() });
				}
			} catch (e) {
				console.warn("[SW] pushsubscriptionchange: failed to resubscribe", e);
			}
		})()
	);
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
