import { get } from "svelte/store";
import type { Notification } from "../../../shared/types";
import { trpc } from "../main";
import { addNotification, checkIfNotificationExists } from "../stores/notifications";
import { settingsStore } from "../stores/settings";
import { userStore } from "../stores/user";
import type { MonitorEvent } from "./monitorFrameHandler";
import { toast } from "./toast";

// NOTE: Do NOT snapshot user at module load — always read freshly from the store.

export function createNotification(data: Notification) {
	//console.log('Creating notification:', data);
	if (!("Notification" in window)) {
		throw new Error("This browser does not support desktop notifications");
	}
	if (Notification.permission !== "granted") {
		throw new Error("You need to grant permission to show notifications");
	}

	const notification = new Notification(data.title, {
		body: data.body,
		icon: data.icon ?? "/icon192_rounded.png",
		tag: data.tag,
		data: {
			path: `${data.data?.page ?? ""}`,
		},
	});

	notification.onclick = () => {
		console.log("Notification clicked");
	};
}

// TODO: Wtf does this do?
export function robotNotification(type: string, event: MonitorEvent["detail"]) {
	const robot = event.frame[event.robot];
	const user = get(userStore); // always read freshly
	let path: string;

	if (user.role === "FTA" || user.role === "FTAA") {
		path = "/";
	} else {
		path = "/monitor/";
	}

	createNotification({
		id: crypto.randomUUID(),
		timestamp: new Date(),
		topic: "Robot-Status",
		title: `${robot.number} Lost ${type.toLocaleUpperCase()}`,
		body: `${event.robot} lost ${type} at ${event.frame.time} in ${event.frame.match}.`,
		icon: "/icon192_rounded.png",
		data: {
			page: path,
		},
	});
}

let backgroundNotificationSubscription: ReturnType<typeof trpc.notes.pushSubscription.subscribe>;
// Track the token the current subscription was opened with so we can skip redundant reconnects.
let currentSubscriptionToken: string | null = null;

export function startNotificationSubscription() {
	// Always read the token fresh from the store — never rely on a stale module-level snapshot.
	const token = get(userStore).token;

	console.info(
		`[PUSH] startNotificationSubscription called — token present: ${!!token}, token length: ${token?.length ?? 0}`,
	);

	// Safety guard: never open an SSE subscription without a valid token.
	// Doing so causes "No token provided" / "User not found" tRPC errors.
	if (!token) {
		console.warn("[PUSH] Aborting subscription start: token is empty");
		return;
	}

	// Idempotency guard: if we already have an active subscription for this exact token, do nothing.
	// This prevents the $effect + explicit-call combination from spinning up duplicate connections.
	if (currentSubscriptionToken === token && backgroundNotificationSubscription) {
		console.info("[PUSH] Already subscribed with this token — skipping duplicate start");
		return;
	}

	if (backgroundNotificationSubscription && typeof backgroundNotificationSubscription.unsubscribe === "function") {
		console.info("[PUSH] Tearing down existing subscription before reconnecting");
		backgroundNotificationSubscription.unsubscribe();
		currentSubscriptionToken = null;
	}

	try {
		currentSubscriptionToken = token;
		backgroundNotificationSubscription = trpc.notes.pushSubscription.subscribe(
			{
				token,
			},
			{
				onError: console.error,
				onData: (data) => {
					// console.log(Notification.permission);
					// console.log("in data reciever 1");

					let sendNotification = false;

					switch (data.topic) {
						case "Note-Created": {
							sendNotification = get(settingsStore).notificationCategories.create;
							break;
						}
						case "Note-Assigned": {
							sendNotification = get(settingsStore).notificationCategories.assign;
							break;
						}
						case "Note-Status": {
							sendNotification = get(settingsStore).notificationCategories.follow;
							break;
						}
						case "New-Note-Message": {
							sendNotification = get(settingsStore).notificationCategories.follow;
							break;
						}
						case "Robot-Status": {
							sendNotification = get(settingsStore).notificationCategories.robot;
							break;
						}
						default: {
							sendNotification = false;
							break;
						}
					}

					if (sendNotification) {
						if (checkIfNotificationExists(data.id)) return;

						// Add to notification store
						addNotification(data);

						// Send notification to browser
						createNotification(data);
					}
				},
			},
		);
	} catch (err: any) {
		console.error("Subscription setup error:", err);
	}
	//console.log(`Listeners ${event.ticketPushEmitter.listenerCount()}`);
}

export function stopNotificationSubscription() {
	if (!backgroundNotificationSubscription) return;

	backgroundNotificationSubscription.unsubscribe();
	currentSubscriptionToken = null;

	console.info("[PUSH] Stopped notification subscription");
}

const publicVapidKey = "BFTN7PqbkHaSPpmQBbMANVP7NSJg2qGkSEisDlTborp3FMIlZAwvMVcEbCOS11JqPgDQLuk42DY5AU_mHQdyibs";

// Copied from the web-push documentation
const urlBase64ToUint8Array = (base64String: string) => {
	const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
	const base64 = (base64String + padding).replace(/\-/g, "+").replace(/_/g, "/");

	const rawData = window.atob(base64);
	const outputArray = new Uint8Array(rawData.length);

	for (let i = 0; i < rawData.length; ++i) {
		outputArray[i] = rawData.charCodeAt(i);
	}
	return outputArray;
};

export async function subscribeToPush() {
	try {
		if (!("serviceWorker" in navigator)) {
			console.warn("[PUSH] subscribeToPush: service workers not supported in this browser/profile");
			throw new Error("Service workers are not supported");
		}

		console.info("[PUSH] subscribeToPush: awaiting serviceWorker.ready…");
		// This resolves once a SW is installed and active — safe in all browsers.
		const registration = await navigator.serviceWorker.ready;
		console.info("[PUSH] subscribeToPush: SW ready, subscribing to push manager…");

		// Subscribe to push notifications
		const subscription = await registration.pushManager.subscribe({
			userVisibleOnly: true,
			applicationServerKey: urlBase64ToUint8Array(publicVapidKey),
		});

		const keys = subscription.toJSON().keys ?? {};
		// expirationTime is null in most browsers — coerce to null rather than new Date(0)
		const expirationTime = subscription.expirationTime != null ? new Date(subscription.expirationTime) : null;

		console.info(`[PUSH] subscribeToPush: obtained subscription endpoint, expirationTime: ${expirationTime}`);

		// Send push subscription to server
		await trpc.notes.registerPush.mutate({
			endpoint: subscription.endpoint,
			expirationTime,
			keys: {
				p256dh: keys.p256dh,
				auth: keys.auth,
			},
		});

		console.info("[PUSH] subscribeToPush: registration sent to server successfully");
	} catch (e: any) {
		console.error("[PUSH] subscribeToPush error:", e);
		toast("Failed to subscribe to push notifications", e.message);
	}
}

/**
 * Listen for messages from the service worker.
 * Handles `pushsubscriptionchange` — when the browser rotates our push subscription,
 * the SW cannot call our tRPC endpoint directly (no auth token), so it sends the new
 * subscription JSON here and we register it with the server.
 */
export function setupSwMessageHandler() {
	if (!("serviceWorker" in navigator)) return;

	navigator.serviceWorker.addEventListener("message", async (event) => {
		if (event.data?.type !== "pushsubscriptionchange") return;

		const sub = event.data.subscription;
		if (!sub) return;

		console.info("[PUSH] SW sent pushsubscriptionchange — re-registering with server");
		try {
			const keys = sub.keys ?? {};
			const expirationTime = sub.expirationTime != null ? new Date(sub.expirationTime) : null;
			await trpc.notes.registerPush.mutate({
				endpoint: sub.endpoint,
				expirationTime,
				keys: { p256dh: keys.p256dh, auth: keys.auth },
			});
			console.info("[PUSH] pushsubscriptionchange: re-registration sent to server successfully");
		} catch (e: any) {
			console.error("[PUSH] pushsubscriptionchange: failed to re-register", e);
		}
	});
}
