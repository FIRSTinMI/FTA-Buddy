import webpush, { PushSubscription, SendResult } from 'web-push';
import { db } from '../db/db';
import { inArray } from 'drizzle-orm';
import { pushSubscriptions } from '../db/schema';

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