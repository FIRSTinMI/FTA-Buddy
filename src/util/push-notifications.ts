import webpush, { SendResult } from 'web-push';
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
}

export async function sendNotification(users: number[], data: NotificationData) {
    if (users.length === 0) return;
    const subscriptions = await db.query.pushSubscriptions.findMany({ where: inArray(pushSubscriptions.user_id, users) });


    const notifications: Promise<SendResult>[] = [];
    for (let subscription of subscriptions) {
        // @ts-ignore
        notifications.push(webpush.sendNotification(subscription, JSON.stringify(data)));
    }

    await Promise.all(notifications);
}