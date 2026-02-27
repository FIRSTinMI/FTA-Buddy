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

/**
 * Stable fingerprint for a push subscription.
 * The endpoint is guaranteed unique per subscription — it changes whenever
 * the browser issues a new subscription, so comparing endpoints is sufficient
 * to detect "subscription rotated".
 */
function subscriptionFingerprint(endpoint: string): string {
	return endpoint;
}

const PUSH_FINGERPRINT_KEY = "ftabuddy-push-fingerprint";

/** In-flight mutex: prevents concurrent registerPush calls from racing. */
let registerPushInFlight: Promise<void> | null = null;

/**
 * Low-level helper shared by subscribeToPush, ensurePushRegistration, and
 * setupSwMessageHandler. Sends the subscription to the server and persists
 * the endpoint fingerprint to avoid redundant future calls.
 *
 * Accepts either a live PushSubscription or the plain JSON object the SW
 * sends via postMessage (both expose `.endpoint`, `.expirationTime`, `.keys`).
 */
async function doRegisterPush(
	subscription:
		| PushSubscription
		| { endpoint: string; expirationTime: number | null; keys?: Record<string, string | undefined> },
): Promise<void> {
	const endpoint = subscription.endpoint;
	const fingerprint = subscriptionFingerprint(endpoint);

	// If the same registration is already in-flight, wait for it to settle first.
	if (registerPushInFlight) {
		try {
			await registerPushInFlight;
		} catch {
			/* ignore */
		}
		// If the previous call already registered this exact endpoint, skip.
		if (localStorage.getItem(PUSH_FINGERPRINT_KEY) === fingerprint) {
			console.info("[PUSH] doRegisterPush: already registered by in-flight call — skipping");
			return;
		}
	}

	let resolve!: () => void;
	let reject!: (e: unknown) => void;
	registerPushInFlight = new Promise<void>((res, rej) => {
		resolve = res;
		reject = rej;
	});

	try {
		const json: any =
			typeof (subscription as any).toJSON === "function" ? (subscription as any).toJSON() : subscription;
		const keys = json.keys ?? {};
		const rawExpiry = (subscription as any).expirationTime;
		const expirationTime = rawExpiry != null ? new Date(rawExpiry) : null;

		await trpc.notes.registerPush.mutate({
			endpoint,
			expirationTime,
			keys: { p256dh: keys.p256dh, auth: keys.auth },
		});

		localStorage.setItem(PUSH_FINGERPRINT_KEY, fingerprint);
		console.info("[PUSH] doRegisterPush: registered successfully");
		resolve();
	} catch (e) {
		reject(e);
		throw e;
	} finally {
		registerPushInFlight = null;
	}
}

export async function subscribeToPush() {
	try {
		if (!("serviceWorker" in navigator)) {
			console.warn("[PUSH] subscribeToPush: service workers not supported in this browser/profile");
			throw new Error("Service workers are not supported");
		}

		console.info("[PUSH] subscribeToPush: awaiting serviceWorker.ready…");
		const registration = await navigator.serviceWorker.ready;
		console.info("[PUSH] subscribeToPush: SW ready, subscribing to push manager…");

		const subscription = await registration.pushManager.subscribe({
			userVisibleOnly: true,
			applicationServerKey: urlBase64ToUint8Array(publicVapidKey),
		});

		console.info(
			`[PUSH] subscribeToPush: obtained subscription endpoint, expirationTime: ${subscription.expirationTime}`,
		);
		await doRegisterPush(subscription);
	} catch (e: any) {
		console.error("[PUSH] subscribeToPush error:", e);
		toast("Failed to subscribe to push notifications", e.message);
	}
}

/**
 * Called on app startup after auth resolves. Gets the current push subscription
 * and re-registers it with the server if the endpoint has changed since the last
 * successful registration. This is the recovery path for the case where the
 * browser rotated the subscription while no app window was open (so the SW's
 * pushsubscriptionchange message had no window to deliver to).
 */
export async function ensurePushRegistration(): Promise<void> {
	if (!("serviceWorker" in navigator)) return;
	if (Notification.permission !== "granted") return;

	const token = get(userStore).token;
	if (!token) return;

	try {
		const registration = await navigator.serviceWorker.ready;
		const subscription = await registration.pushManager.getSubscription();

		if (!subscription) {
			console.info("[PUSH] ensurePushRegistration: no active subscription");
			return;
		}

		const fingerprint = subscriptionFingerprint(subscription.endpoint);
		const lastFingerprint = localStorage.getItem(PUSH_FINGERPRINT_KEY);

		if (fingerprint === lastFingerprint) {
			console.info("[PUSH] ensurePushRegistration: subscription unchanged — skipping");
			return;
		}

		console.info("[PUSH] ensurePushRegistration: fingerprint mismatch — re-registering with server");
		await doRegisterPush(subscription);
		console.info("[PUSH] ensurePushRegistration: complete");
	} catch (e: any) {
		console.error("[PUSH] ensurePushRegistration error:", e);
	}
}

/**
 * Listen for messages from the service worker:
 * - `pushsubscriptionchange`:       browser rotated subscription; re-register with server.
 * - `pushsubscriptionchange-error`: resubscribe failed in SW; log so we know to reconcile.
 * - `sw-ready`:                     new SW activated; opportunistically call update().
 */
export function setupSwMessageHandler() {
	if (!("serviceWorker" in navigator)) return;

	navigator.serviceWorker.addEventListener("message", async (event) => {
		const msg = event.data;
		if (!msg?.type) return;

		if (msg.type === "pushsubscriptionchange") {
			const sub = msg.subscription;
			if (!sub?.endpoint) {
				console.warn("[PUSH] pushsubscriptionchange message had no subscription — push may be disabled");
				return;
			}

			// Deduplicate: skip if this endpoint was already successfully registered.
			if (localStorage.getItem(PUSH_FINGERPRINT_KEY) === subscriptionFingerprint(sub.endpoint)) {
				console.info("[PUSH] pushsubscriptionchange: fingerprint unchanged — skipping");
				return;
			}

			console.info("[PUSH] SW sent pushsubscriptionchange — re-registering with server");
			try {
				await doRegisterPush(sub);
			} catch (e: any) {
				console.error("[PUSH] pushsubscriptionchange: failed to re-register", e);
			}
			return;
		}

		if (msg.type === "pushsubscriptionchange-error") {
			// SW could not resubscribe (permissions revoked, key changed, etc.).
			// ensurePushRegistration() on the next startup will reconcile if possible.
			console.warn("[PUSH] SW could not resubscribe after pushsubscriptionchange:", msg.message);
			return;
		}

		if (msg.type === "sw-ready") {
			console.info("[PUSH] New SW activated (version:", msg.version, ")");
			try {
				const reg = await navigator.serviceWorker.getRegistration();
				if (reg) await reg.update();
			} catch {
				/* non-fatal */
			}
			return;
		}
	});
}
