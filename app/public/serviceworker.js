let cacheName = "ftabuddy";
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
	"/app/frc-control-system-layout-ctre.svg",
	"/app/frc-control-system-layout-rev.svg",
];

self.importScripts("/app/localforage.js");

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

self.addEventListener("push", async (evt) => {
	const data = evt.data.json();
	console.log(evt);
	console.log(evt.data);

	let sendNotification = false;

	switch (data.topic) {
		case "Ticket-Created": {
			sendNotification = (await getSettingsStore()).notificationCategories.create;
			break;
		}
		case "Ticket-Assigned": {
			sendNotification = (await getSettingsStore()).notificationCategories.assign;
			break;
		}
		case "Ticket-Status": {
			sendNotification = (await getSettingsStore()).notificationCategories.follow;
			break;
		}
		case "New-Ticket-Message": {
			sendNotification = (await getSettingsStore()).notificationCategories.follow;
			break;
		}
		case "Robot-Status": {
			sendNotification = (await getSettingsStore()).notificationCategories.robot;
			break;
		}
		default: {
			sendNotification = false;
			break;
		}
	}

	if (sendNotification) {
		// Add to notification store if not robot alert
		if (data.topic !== "Robot-Status") {
			if (await checkIfNotificationExists(data.id)) return;
			await addNotification(data);
		}

		// Send notification to browser
		self.registration.showNotification(data.title, {
			body: data.body ?? "",
			tag: data.tag,
			data: data.data,
			icon: "https://ftabuddy.com" + (data.icon ?? "/app/icon512_rounded.png"),
		});
		console.log(await clients.matchAll());
	}
});

self.addEventListener("notificationclick", (evt) => {
	console.log(evt);
	const rootUrl = new URL("/app/", location).href;
	const pageToOpen = evt.notification.data?.page ?? "";
	evt.notification.close();
	evt.waitUntil(
		clients.matchAll().then((matchedClients) => {
			console.log("Clients: ", matchedClients);
			try {
				for (let client of matchedClients) {
					if (client.url.indexOf(rootUrl + pageToOpen) >= 0) {
						console.log("Found matching client");
						return client.focus();
					}
				}

				if (clients[0]) {
					console.log("trying to take over existing client");
					client[0].focus();
					clients[0].navigate(rootUrl + pageToOpen);
					return;
				}
			} catch (e) {
				console.log(e);
			} finally {
				console.log("Opening new client");
				clients.openWindow(rootUrl + pageToOpen).then(function (client) {
					client.focus();
				});
			}
		})
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
