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

    const notifications: Promise<SendResult>[] = [];
    for (let subscription of subscriptions) {
        console.log('Sending notification to', subscription.user_id);
        notifications.push(webpush.sendNotification({
            endpoint: subscription.endpoint,
            keys: subscription.keys as PushSubscription['keys'],
        }, JSON.stringify(data), {
            topic: data.topic,
        }).then(res => {
            console.log('Notification sent', res);
            return res;
        }));
    }

    await Promise.all(notifications);
}
