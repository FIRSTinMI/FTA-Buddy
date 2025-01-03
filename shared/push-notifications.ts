import 'dotenv/config';
import webpush, { PushSubscription, SendResult } from 'web-push';
import { db } from '../src/db/db';
import { inArray } from 'drizzle-orm';
import { pushSubscriptions } from '../src/db/schema';
import type { MonitorEvent } from "../app/src/util/monitorFrameHandler";
import { trpc } from '../extension/src/trpc';
import { toast } from "./toast";
import { userStore } from "../app/src/stores/user";
import { settingsStore } from "../app/src/stores/settings";
import { addNotification } from "../app/src/stores/notifications";
//import { get } from '../app/node_modules/svelte/store';

const publicVapidKey = process.env.VAPID_PUBLIC_KEY || '';
const privateVapidKey = process.env.VAPID_PRIVATE_KEY || '';

export function initializePushNotifications() {
    webpush.setVapidDetails(
        'mailto:me@filipkin.com',
        publicVapidKey,
        privateVapidKey,
    );
};

export interface NotificationData {
    title: string;
    body: string;
    icon?: string;
    tag?: string;
    data?: {
        page?: string;
    };
}

export async function sendNotification(users: number[], data: NotificationData) {
    if (users.length === 0) return;
    const subscriptions = await db.query.pushSubscriptions.findMany({ where: inArray(pushSubscriptions.user_id, users) });

    console.log(subscriptions);

    const notifications: Promise<SendResult>[] = [];
    for (let subscription of subscriptions) {
        console.log('Sending notification to', subscription.user_id);
        notifications.push(webpush.sendNotification({
            endpoint: subscription.endpoint,
            keys: subscription.keys as PushSubscription['keys'],
        }, JSON.stringify(data), {
            topic: 'test'
        }).then(res => {
            console.log('Notification sent', res);
            return res;
        }));
    }



    await Promise.all(notifications);
}

export function robotNotification(user_id: number, type: string, event: MonitorEvent["detail"]) {
    let userArray: number[] = [];
    userArray.push(user_id);

    const robot = event.frame[event.robot];
    sendNotification(userArray, {
        title: `${robot.number} Lost ${type.toLocaleUpperCase()}`,
        body: `${event.robot} lost ${type} at ${event.frame.time} in ${event.frame.match}.`,
    });
}

export function ticketNotification(context: any, users: number[], data: NotificationData) {
    let userArray: number[] = [];

    sendNotification(userArray, data);

    if (userArray.includes(context.user_id)) {
        addNotification(data);
    }
}

export function ticketCreateNotification(context: any, data: NotificationData) {
    if (context.settingsStore.ticketCreateSubscription) {
        ticketNotification(context, [context.user_id], data);
        addNotification(data);
    }
}

export function ticketAssignNotification(context: any, assigned_user_id: number, data: NotificationData) {
    if (context.user_id === assigned_user_id) {
        addNotification(data);
        ticketNotification(context, [context.user_id], data);
    }
}

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
