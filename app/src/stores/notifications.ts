import { writable } from 'svelte/store';
import type { Notification } from '../../../shared/types';
import { get } from 'svelte/store';
import { createInstance } from "localforage";

export const localforage = createInstance({
    name: "ftabuddy-notifications"
});

const initialNotifications = localStorage.getItem('notifications');

export const notificationsStore = writable<Notification[]>(initialNotifications ? JSON.parse(initialNotifications) : []);

export function checkIfNotificationExists(id: string) {
    return get(notificationsStore).some((n) => n.id === id);
}

export function addNotification(data: Notification) {
    notificationsStore.update((current) => [
        ...current,
        data
    ]);
}

export function removeNotification(id: string) {
    notificationsStore.update((current) => current.filter((n) => n.id !== id));
}

export function clearNotifications() {
    notificationsStore.set([]);
}

notificationsStore.subscribe(async (notifications: Notification[]) => {
    localStorage.setItem('notifications', JSON.stringify(notifications));
    await localforage.setItem('notifications', JSON.stringify(notifications));
});

localforage.getItem('notifications').then((value) => {
    if (value) {
        notificationsStore.set(JSON.parse(value as string));
    }
});
