let cacheName = "ftabuddy";
const SW_VERSION = "{{JS_FILE}}";
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
	self.skipWaiting();
	evt.waitUntil(
		caches.open(cacheName).then((cache) => {
			console.log("[Service Worker] Caching all: app shell and content");
			return cache.addAll(contentToCache);
		})
	);
});

self.addEventListener("activate", (evt) => {
	console.log("Service worker activated");
	// Claim all open windows immediately so clearing fixes apply without reload.
	evt.waitUntil(
		(async () => {
			await clients.claim();
			const windowClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
			for (const client of windowClients) {
				client.postMessage({ type: "sw-ready", version: SW_VERSION });
			}
		})()
	);
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

async function removeNotificationFromStorage(id) {
	try {
		const raw = await localforageNotifications.getItem("notifications");
		if (!raw) return;
		const filtered = JSON.parse(raw).filter((n) => n.id !== id);
		await localforageNotifications.setItem("notifications", JSON.stringify(filtered));
	} catch (e) {
		console.warn("[SW] removeNotificationFromStorage failed", e);
	}
}

async function broadcastToClients(msg) {
	const windowClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
	for (const client of windowClients) client.postMessage(msg);
}

// Map server topic -> local settings category
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
			// 1) Payload size guard + safe parse - PushEvent.data may be null or malformed
			let data = {};
			try {
				if (event.data) {
					// Ignore payloads larger than 4 KB (push services shouldn't send more)
					const text = event.data.text();
					if (text.length <= 4096) {
						data = JSON.parse(text);
					} else {
						console.warn("[SW] push: payload too large (", text.length, "bytes), ignoring");
					}
				}
			} catch (e) {
				console.warn("[SW] push: failed to parse payload", e);
			}

			// 2) Load settings safely - SW may start cold with empty storage
			let settings = DEFAULT_SETTINGS;
			try {
				const stored = await getSettingsStore();
				if (stored && stored.notificationCategories) settings = stored;
			} catch (e) {
				// keep defaults
			}

			// 3) Normalize + look up topic
			const rawTopic = typeof data.topic === "string" ? data.topic.trim() : "";
			const category = TOPIC_CATEGORY[rawTopic];
			if (!category || !settings.notificationCategories?.[category]) return;

			// 4) De-duplicate non-robot notifications
			if (data.topic !== "Robot-Status") {
				if (data.id && (await checkIfNotificationExists(data.id))) return;
				if (data.id) await addNotification(data);
			}

			// 5) Show notification
			return self.registration.showNotification(data.title || "FTA Buddy", {
				body: data.body ?? "",
				tag: data.tag,
				data: { ...(data.data ?? {}), notificationId: data.id },
				icon: data.icon || "/icon512_rounded.png",
			});
		})()
	);
});

self.addEventListener("notificationclick", (event) => {
	const rootUrl = new URL("/", location).href;
	const pageToOpen = event.notification.data?.page ?? "";
	const targetUrl = rootUrl + pageToOpen;
	const notificationId = event.notification.data?.notificationId;
	event.notification.close();
	event.waitUntil(
		(async () => {
			if (notificationId) {
				await broadcastToClients({ type: "notification_cleared", notificationId });
			}
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

self.addEventListener("notificationclose", (event) => {
	const notificationId = event.notification.data?.notificationId;
	if (!notificationId) return;
	// NOTE: notificationclose is unreliable on Android Chrome (often doesn't fire
	// when the user swipes away from the notification shade). The page-side
	// reconcile_notifications message is the authoritative fallback.
	event.waitUntil(
		(async () => {
			// Persist the removal so a fresh page load won't re-show this notification.
			await removeNotificationFromStorage(notificationId);
			await broadcastToClients({ type: "notification_cleared", notificationId });
		})()
	);
});

// Re-subscribe when the browser rotates our push subscription.
self.addEventListener("pushsubscriptionchange", (event) => {
	event.waitUntil(
		(async () => {
			const oldOptions = event.oldSubscription?.options;
			if (!oldOptions) {
				console.warn("[SW] pushsubscriptionchange: no oldSubscription - cannot resubscribe");
				await broadcastToClients({ type: "pushsubscriptionchange-error", message: "no oldSubscription" });
				return;
			}

			try {
				const newSub = await self.registration.pushManager.subscribe(oldOptions);
				await broadcastToClients({ type: "pushsubscriptionchange", subscription: newSub.toJSON() });
			} catch (e) {
				console.warn("[SW] pushsubscriptionchange: failed to resubscribe", e);
				await broadcastToClients({ type: "pushsubscriptionchange-error", message: e?.message ?? String(e) });
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
