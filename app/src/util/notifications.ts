import { get } from "svelte/store";
import { trpc } from "../main";
import { userStore } from "../stores/user";
import type { MonitorEvent } from "./monitorFrameHandler";
import { settingsStore } from "../stores/settings";
import { toast } from "../../../shared/toast";
import type { Notification } from "../../../shared/types";
import { addNotification, checkIfNotificationExists } from "../stores/notifications";

let user = get(userStore);

export function createNotification(data: Notification) {
    console.log('Creating notification:', data);
    if (!("Notification" in window)) {
        throw new Error("This browser does not support desktop notifications");
    }
    if (Notification.permission !== "granted") {
        throw new Error("You need to grant permission to show notifications");
    }

    const notification = new Notification(data.title, {
        body: data.body,
        icon: data.icon ?? "/app/public/icon192_rounded.png",
        tag: data.tag,
        data: {
            path: `/app/${data.data?.page ?? ""}`
        }
    });

    notification.onclick = () => {
        console.log('Notification clicked');
    };
}

// TODO: Wtf does this do?
export function robotNotification(type: string, event: MonitorEvent["detail"]) {
    const robot = event.frame[event.robot];
    let path: string;

    if (user.role === 'FTA' || user.role === "FTAA") {
        path = "/app/";
    } else {
        path = "/app/monitor/";
    }

    createNotification({
        id: crypto.randomUUID(),
        timestamp: new Date(),
        topic: 'Robot-Status',
        title: `${robot.number} Lost ${type.toLocaleUpperCase()}`,
        body: `${event.robot} lost ${type} at ${event.frame.time} in ${event.frame.match}.`,
        icon: "/app/public/icon192_rounded.png",
        data: {
            page: `/app/`
        }
    });
}

let backgroundNotificationSubscription: ReturnType<typeof trpc.tickets.pushSubscription.subscribe>;

export function startNotificationSubscription() {
    console.log("Made it to startBackgroundCreateTicketSubscription");
    if (backgroundNotificationSubscription && typeof backgroundNotificationSubscription.unsubscribe === "function") backgroundNotificationSubscription.unsubscribe();
    console.log("Checked if subscription object exists");

    try {
        backgroundNotificationSubscription = trpc.tickets.pushSubscription.subscribe(
            {
                token: user.token
            },
            {
                onError: console.error,
                onData: (data) => {
                    console.log(Notification.permission);
                    console.log("in data reciever 1");

                    let sendNotification = false;

                    switch (data.topic) {
                        case 'Ticket-Created': {
                            sendNotification = (get(settingsStore).notificationCategories.create);
                            break;
                        }
                        case 'Ticket-Assigned': {
                            sendNotification = (get(settingsStore).notificationCategories.assign);
                            break;
                        }
                        case 'Ticket-Status': {
                            sendNotification = (get(settingsStore).notificationCategories.follow);
                            break;
                        }
                        case 'New-Ticket-Message': {
                            sendNotification = (get(settingsStore).notificationCategories.follow);
                            break;
                        }
                        case 'Robot-Status': {
                            sendNotification = (get(settingsStore).notificationCategories.robot);
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
                }
            },
        );
    } catch (err: any) {
        console.error("Subscription setup error:", err);
    }
    //console.log(`Listeners ${event.ticketPushEmitter.listenerCount()}`);
}

export function stopBackgroundCreateTicketSubscription() {
    if (!backgroundNotificationSubscription) return;

    backgroundNotificationSubscription?.unsubscribe();
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
        await trpc.tickets.registerPush.query({
            endpoint: subscription.endpoint,
            expirationTime: new Date(subscription.expirationTime ?? 0),
            keys: {
                p256dh: keys.p256dh,
                auth: keys.auth,
            },
        });
    } catch (e: any) {
        console.error(e);
        toast('Failed to subscribe to push notifications', e.message);
    }
}