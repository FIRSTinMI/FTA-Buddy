const SW_VERSION = "{{SW_VERSION}}";
const cacheName = `ftabuddy-${SW_VERSION}`;
const contentToCache = {{ALL_ASSETS}};

self.importScripts("/localforage.js");

const localforageNotifications = localforage.createInstance({
	name: "ftabuddy-notifications",
});

self.addEventListener("install", (evt) => {
	console.log("[SW] installing, version:", SW_VERSION);
	self.skipWaiting();
	evt.waitUntil(
		caches.open(cacheName).then((cache) => {
			console.log("[SW] precaching", contentToCache.length, "assets");
			return cache.addAll(contentToCache);
		}),
	);
});

self.addEventListener("activate", (evt) => {
	console.log("[SW] activated, version:", SW_VERSION);
	evt.waitUntil(
		(async () => {
			// Delete old versioned caches
			const keys = await caches.keys();
			await Promise.all(keys.filter((k) => k !== cacheName).map((k) => caches.delete(k)));
			// Claim all open windows immediately so clearing fixes apply without reload.
			await clients.claim();
			const windowClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
			for (const client of windowClients) {
				client.postMessage({ type: "sw-ready", version: SW_VERSION });
			}
		})(),
	);
});

self.addEventListener("fetch", (evt) => {
	const url = new URL(evt.request.url);
	// Never intercept tRPC, API, SSE, or cross-origin requests
	if (
		url.pathname.startsWith("/trpc") ||
		url.pathname.startsWith("/slack") ||
		url.pathname.startsWith("/report") ||
		url.origin !== self.location.origin
	) {
		return;
	}

	// HTML goes to the network first, cache second.
	//
	// A page served from the SPA fallback once gets cached under its own URL and
	// then keeps being served from there: /privacy.html is a real file, but if it
	// was ever requested before that file existed the app shell landed in the
	// cache under that key and stayed. Network-first means a real page always
	// wins, and the cache is only the offline copy it was meant to be.
	const wantsHtml = evt.request.mode === "navigate" || url.pathname.endsWith(".html");
	if (wantsHtml) {
		evt.respondWith(
			fetch(evt.request)
				.then((response) => {
					if (response && response.status === 200 && response.type !== "opaque") {
						const toCache = response.clone();
						caches.open(cacheName).then((cache) => cache.put(evt.request, toCache));
					}
					return response;
				})
				.catch(() =>
					caches
						.match(evt.request)
						.then((cached) => cached || caches.match("/index.html").then((r) => r || fetch("/index.html"))),
				),
		);
		return;
	}

	evt.respondWith(
		caches.match(evt.request).then((cached) => {
			if (cached) return cached;
			return fetch(evt.request)
				.then((response) => {
					// Only cache successful same-origin responses
					if (!response || response.status !== 200 || response.type === "opaque") return response;
					const toCache = response.clone();
					caches.open(cacheName).then((cache) => cache.put(evt.request, toCache));
					return response;
				})
				.catch(() => {
					// For navigation requests, serve the cached index.html (SPA fallback)
					if (evt.request.mode === "navigate") {
						return caches.match("/index.html").then((r) => r || fetch("/index.html"));
					}
				});
		}),
	);
});

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

self.addEventListener("push", (event) => {
	event.waitUntil(
		(async () => {
			let data = {};
			try {
				if (event.data) {
					const text = event.data.text();
					if (text.length <= 4096) {
						data = JSON.parse(text);
						console.log("[SW] push received:", data.topic, data.id);
					} else {
						console.warn("[SW] push: payload too large (", text.length, "bytes), ignoring");
					}
				}
			} catch (e) {
				console.warn("[SW] push: failed to parse payload", e);
			}

			// Every push must end in showNotification. Safari counts a push that shows nothing
			// (or shows and closes at once) as silent and revokes the subscription after three.
			// Category settings are applied on the server before the push is sent, and a
			// duplicate of a notification the open page already showed reuses its tag, so it
			// replaces that one instead of stacking.
			if (data.topic !== "Robot-Status" && data.id) {
				try {
					if (!(await checkIfNotificationExists(data.id))) await addNotification(data);
				} catch (e) {
					console.warn("[SW] push: notification store unavailable", e);
				}
			}

			console.log("[SW] showing notification:", data.title, data.id);
			return self.registration.showNotification(data.title || "FTA Buddy", {
				body: data.body ?? "",
				tag: data.tag,
				data: { ...(data.data ?? {}), notificationId: data.id },
				icon: data.icon || "/transparent.png",
				badge: data.badge || "/icon96_badge.png",
			});
		})(),
	);
});

self.addEventListener("notificationclick", (event) => {
	const rootUrl = new URL("/", location).href;
	const pageToOpen = event.notification.data?.page ?? "";
	const targetUrl = rootUrl + pageToOpen;
	const notificationId = event.notification.data?.notificationId;
	console.log("[SW] notificationclick: id=%s target=%s", notificationId, targetUrl);
	event.notification.close();
	event.waitUntil(
		(async () => {
			if (notificationId) {
				await removeNotificationFromStorage(notificationId);
				await broadcastToClients({ type: "notification_cleared", notificationId });
			}
			const matched = await clients.matchAll({ type: "window", includeUncontrolled: true });
			for (const client of matched) {
				if (client.url.startsWith(targetUrl) && "focus" in client) {
					await client.focus();
					if (client.url !== targetUrl && "navigate" in client) {
						await client.navigate(targetUrl);
					}
					return;
				}
			}
			return clients.openWindow(targetUrl);
		})(),
	);
});

self.addEventListener("notificationclose", (event) => {
	const notificationId = event.notification.data?.notificationId;
	if (!notificationId) return;
	console.log("[SW] notificationclose: id=%s", notificationId);
	event.waitUntil(
		(async () => {
			await removeNotificationFromStorage(notificationId);
			await broadcastToClients({ type: "notification_cleared", notificationId });
		})(),
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
		})(),
	);
});
