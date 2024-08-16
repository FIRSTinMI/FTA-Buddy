import { get } from "svelte/store";
import { trpc } from "../main";
import { authStore } from "../stores/auth";
import type { MonitorEvent } from "./monitorFrameHandler";
import { settingsStore } from "../stores/settings";

export interface NotificationOptions {
    title: string;
    body?: string;
    icon?: string;
}

export function createNotification(options?: NotificationOptions) {
    if (!("Notification" in window)) {
        throw new Error("This browser does not support desktop notifications");
    }
    if (Notification.permission !== "granted") {
        throw new Error("You need to grant permission to show notifications");
    }

    options = options ?? { title: "Default title" };

    const notification = new Notification(options.title, options);

    notification.onclick = () => {
        console.log('Notification clicked');
    };
}

export function robotNotification(type: string, event: MonitorEvent["detail"]) {
    const robot = event.frame[event.robot];
    createNotification({
        title: `${robot.number} Lost ${type.toLocaleUpperCase()}`,
        body: `${event.robot} lost ${type} at ${event.frame.time} in ${event.frame.match}.`,
    });
}

let backgroundSubscription: ReturnType<typeof trpc.messages.backgroundSubscription.subscribe>;

export function startBackgroundSubscription() {
    if (backgroundSubscription) backgroundSubscription.unsubscribe();

    backgroundSubscription = trpc.messages.backgroundSubscription.subscribe({
        eventToken: get(authStore).eventToken
    }, {
        onData: (data) => {
            if (get(settingsStore).notifications === false) return;

            if (data.type === "create" && data.data.is_ticket) {
                createNotification({
                    title: `New Ticket: ${data.data.team} ${data.data.summary}`,
                    body: `${data.data.message}`,
                });
            } else if (data.type === "ticketReply") {
                createNotification({
                    title: `${data.data.user?.username}: ${data.data.team}`,
                    body: `${data.data.message}`,
                });
            }
        }
    });
}

export function stopBackgroundSubscription() {
    backgroundSubscription?.unsubscribe();
}