import { writable } from 'svelte/store';
import { randomUUID } from 'crypto';
import { type NotificationData } from '../../../shared/push-notifications';


export interface Notification {
    id: string,
    timestamp: Date,
    title: string;
    body: string;
    icon?: string;
    tag?: string;
    data?: {
        page?: string;
    };
}

export const notificationsStore = writable([] as Notification[]);

export function addNotification(data: NotificationData) {
    notificationsStore.update((current) => [
        ...current,
        { ...data, id: randomUUID(), timestamp: new Date() } // Unique ID for tracking
    ]);
}

export function removeNotification(id: string) {
    notificationsStore.update((current) => current.filter((n) => n.id !== id));
}

export function clearNotifications() {
    notificationsStore.set([]);
}