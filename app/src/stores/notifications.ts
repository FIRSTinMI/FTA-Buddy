import { writable } from 'svelte/store';
import { v4 as uuidv4 } from 'uuid';
import { type NotificationOptions } from '../util/push-notifications';


export interface Notification {
    id: string,
    timestamp: Date,
    title: string;
    body?: string;
    icon?: string;
    tag?: string;
    data: {
        path: string;
    };
}

export const notificationsStore = writable([] as Notification[]);

export function addNotification(data: NotificationOptions) {
    notificationsStore.update((current) => [
        ...current,
        { ...data, id: uuidv4() as string, timestamp: new Date() } // Unique ID for tracking
    ]);
}

export function removeNotification(id: string) {
    notificationsStore.update((current) => current.filter((n) => n.id !== id));
}

export function clearNotifications() {
    notificationsStore.set([]);
}