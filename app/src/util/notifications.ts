import { get } from "svelte/store";
import { trpc } from "../main";
import { authStore } from "../stores/auth";
import type { MonitorEvent } from "./monitorFrameHandler";
import { settingsStore } from "../stores/settings";
import { toast } from "./toast";

export interface NotificationOptions {
    title: string;
    body?: string;
    icon?: string;
}

export function createNotification(options?: NotificationOptions) {
    if (!("Notification" in window)) {
        throw new Error("This browser does not support desktop notifications");
    }
    if (Notification.permission !== "granted") {
        throw new Error("You need to grant permission to show notifications");
    }

    options = options ?? { title: "Default title" };

    const notification = new Notification(options.title, options);

    notification.onclick = () => {
        console.log('Notification clicked');
    };
}

export function robotNotification(type: string, event: MonitorEvent["detail"]) {
    const robot = event.frame[event.robot];
    createNotification({
        title: `${robot.number} Lost ${type.toLocaleUpperCase()}`,
        body: `${event.robot} lost ${type} at ${event.frame.time} in ${event.frame.match}.`,
    });
}

let backgroundSubscription: ReturnType<typeof trpc.messages.backgroundSubscription.subscribe>;

export function startBackgroundSubscription() {
    if (backgroundSubscription) backgroundSubscription.unsubscribe();

    backgroundSubscription = trpc.messages.backgroundSubscription.subscribe({
        eventToken: get(authStore).eventToken
    }, {
        onData: (data) => {
            if (get(settingsStore).notifications === false) return;

            if (data.type === "create" && data.data.is_ticket) {
                createNotification({
                    title: `New Ticket: ${data.data.team} ${data.data.summary}`,
                    body: `${data.data.message}`,
                });
            } else if (data.type === "ticketReply") {
                createNotification({
                    title: `${data.data.user?.username}: ${data.data.team}`,
                    body: `${data.data.message}`,
                });
            }
        }
    });
}

export function stopBackgroundSubscription() {
    backgroundSubscription?.unsubscribe();
}

const publicVapidKey = 'BFTN7PqbkHaSPpmQBbMANVP7NSJg2qGkSEisDlTborp3FMIlZAwvMVcEbCOS11JqPgDQLuk42DY5AU_mHQdyibs';

// Copied from the web-push documentation
const urlBase64ToUint8Array = (base64String: string) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
};

export async function subscribeToPush() {
    try {
        if (!('serviceWorker' in navigator)) throw new Error('Service workers are not supported');

        console.log('Registering service worker');
        const registration = await navigator.serviceWorker.ready;

        console.log(registration);

        // Subscribe to push notifications
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicVapidKey),
        });

        const keys = subscription.toJSON().keys ?? {};

        // Send push subscription to server
        await trpc.messages.registerPush.query({
            endpoint: subscription.endpoint,
            expirationTime: new Date(subscription.expirationTime ?? 0),
            keys: {
                p256dh: keys.p256dh,
                auth: keys.auth,
            },
        });
    } catch (e) {
        console.error(e);
        toast('Failed to subscribe to push notifications', e.message);
    }
}
