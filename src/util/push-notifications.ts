import 'dotenv/config';
import webpush, { PushSubscription, SendResult } from 'web-push';
import { db } from '../db/db';
import { inArray } from 'drizzle-orm';
import { pushSubscriptions } from '../db/schema';
import { randomUUID } from "crypto";
import { timestamp } from 'drizzle-orm/mysql-core';
import { notificationEmitter } from '..';
import type { Notification } from '../../shared/types';

const publicVapidKey = process.env.VAPID_PUBLIC_KEY || '';
const privateVapidKey = process.env.VAPID_PRIVATE_KEY || '';

export function initializePushNotifications() {
    webpush.setVapidDetails(
        'mailto:me@filipkin.com',
        publicVapidKey,
        privateVapidKey,
    );
};

export async function createNotification(users: number[], data: Notification) {
    // Send notification to any active clients
    notificationEmitter.emit('send', {
        users,
        notification: data
    });

    // Send push notifications
    sendWebPushNotification(users, data);
}

export async function sendWebPushNotification(users: number[], data: Notification) {
    if (users.length === 0) return;
    const subscriptions = await db.query.pushSubscriptions.findMany({ where: inArray(pushSubscriptions.user_id, users) });

    const notifications: Promise<SendResult | void>[] = [];
    const subscriptionsToDelete: number[] = [];

    for (let subscription of subscriptions) {
        console.log('Sending notification to', subscription.user_id);

        const parsedUrl = new URL(subscription.endpoint);
        const audience = `${parsedUrl.protocol}//${parsedUrl.hostname}`;
        const vapidHeaders = webpush.getVapidHeaders(
            audience,
            'mailto:me@filipkin.com',
            publicVapidKey,
            privateVapidKey,
            'aes128gcm'
        );

        notifications.push(
            webpush.sendNotification({
                endpoint: subscription.endpoint,
                keys: subscription.keys as PushSubscription['keys'],
            }, JSON.stringify(data), {
                topic: data.topic,
                headers: vapidHeaders
            }).then(res => {
                return res;
            }).catch(err => {
                if (err.statusCode === 410) {
                    console.log('Subscription expired, deleting');
                    subscriptionsToDelete.push(subscription.id);
                } else {
                    console.error('Error sending notification', err);
                }
            })
        );
    }

    await Promise.all(notifications);

    if (subscriptionsToDelete.length > 0) {
        await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, subscriptionsToDelete)).execute();
    }
}
