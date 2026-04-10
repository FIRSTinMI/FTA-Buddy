import "dotenv/config";
import { inArray, eq } from "drizzle-orm";
import webpush from "web-push";
import type { PushSubscription, SendResult } from "web-push";
import { notificationEmitter } from "../state";
import type { Notification } from "../../shared/types";
import { db } from "../db/db";
import { pushSubscriptions, users } from "../db/schema";

const publicVapidKey = process.env.VAPID_PUBLIC_KEY || "";
const privateVapidKey = process.env.VAPID_PRIVATE_KEY || "";

export function initializePushNotifications() {
	webpush.setVapidDetails("mailto:me@filipkin.com", publicVapidKey, privateVapidKey);
}

export async function createNotification(userIds: number[], data: Notification, eventCode?: string) {
	// Attach eventCode to the notification for SSE client-side filtering
	const annotated = eventCode ? { ...data, eventCode } : data;

	// Send notification to any active clients via SSE
	notificationEmitter.emit("send", {
		users: userIds,
		notification: annotated,
	});

	// Send push notifications
	sendWebPushNotification(userIds, data, eventCode);
}

export async function sendWebPushNotification(userIds: number[], data: Notification, eventCode?: string) {
	if (userIds.length === 0) return;

	// Filter to users whose active event matches (null = no preference, receives all)
	let filteredUserIds = userIds;
	if (eventCode) {
		const userRows = await db.query.users.findMany({
			where: inArray(users.id, userIds),
			columns: { id: true, active_event_code: true },
		});
		filteredUserIds = userRows
			.filter((u) => !u.active_event_code || u.active_event_code === eventCode)
			.map((u) => u.id);
		if (filteredUserIds.length === 0) return;
	}

	const subscriptions = await db.query.pushSubscriptions.findMany({
		where: inArray(pushSubscriptions.user_id, filteredUserIds),
	});

	const notifications: Promise<SendResult | void>[] = [];
	const subscriptionsToDelete: number[] = [];

	for (let subscription of subscriptions) {
		const parsedUrl = new URL(subscription.endpoint);
		const audience = `${parsedUrl.protocol}//${parsedUrl.hostname}`;
		const vapidHeaders = webpush.getVapidHeaders(
			audience,
			"mailto:me@filipkin.com",
			publicVapidKey,
			privateVapidKey,
			"aes128gcm",
		);

		notifications.push(
			webpush
				.sendNotification(
					{
						endpoint: subscription.endpoint,
						keys: subscription.keys as PushSubscription["keys"],
					},
					JSON.stringify(data),
					{
						topic: data.topic,
						headers: vapidHeaders,
					},
				)
				.then((res) => {
					return res;
				})
				.catch((err) => {
					if (err.statusCode === 410) {
						console.log("Subscription expired, deleting");
						subscriptionsToDelete.push(subscription.id);
					} else {
						console.error("Error sending notification", err);
					}
				}),
		);
	}

	await Promise.all(notifications);

	if (subscriptionsToDelete.length > 0) {
		await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, subscriptionsToDelete)).execute();
	}
}
