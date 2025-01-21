import { writable } from 'svelte/store';
import type { Notification } from '../../../shared/types';
import { get } from 'svelte/store';

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

notificationsStore.subscribe((notifications: Notification[]) => {
    localStorage.setItem('notifications', JSON.stringify(notifications));
});
