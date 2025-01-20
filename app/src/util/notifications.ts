import { get } from "svelte/store";
import { trpc } from "../main";
import {userStore } from "../stores/user";
import type { MonitorEvent } from "./monitorFrameHandler";
import { settingsStore } from "../stores/settings";
import { toast } from "../../../shared/toast";

let user = get(userStore);

export interface NotificationOptions {
    title: string,
    body?: string,
    icon?: string,
    data: {
        path: string,
    }
}

export function createNotification(options: NotificationOptions) {
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
    let path: string;

    if (user.role === 'FTA' || user.role === "FTAA") {
        path = "/app/"
    } else {
        path = "/app/monitor/"
    }
    
    createNotification({
        title: `${robot.number} Lost ${type.toLocaleUpperCase()}`,
        body: `${event.robot} lost ${type} at ${event.frame.time} in ${event.frame.match}.`,
        icon: "app/public/icon192_rounded.png",
        data: {
            path: path
        }
    });
}

let backgroundTicketSubscription: ReturnType<typeof trpc.tickets.pushSubscription.subscribe>;

export function startBackgroundTicketSubscription(ticket_id: number) {
    if (backgroundTicketSubscription && typeof backgroundTicketSubscription.unsubscribe === "function") backgroundTicketSubscription.unsubscribe();
    backgroundTicketSubscription = trpc.tickets.pushSubscription.subscribe(
        {
            eventToken: user.eventToken,
            userToken: user.token,
            ticket_id: ticket_id,
            eventOptions: {
                assign: true,
                status: true,
                add_message: true,
            }
        },
        {
            onData: (data) => {
                if (data.ticket_id === ticket_id) {
                    switch (data.kind) {
                        case "assign":
                            if (data.assigned_to) {
                                createNotification({
                                    title: `Ticket #${ticket_id} has been assigned to ${data.assigned_to?.username}`,
                                    icon: "app/public/icon192_rounded.png",
                                    data: {
                                        path: `/app/ticket/${data.ticket_id}`
                                    }
                                });
                            } else {
                                createNotification({
                                    title: `Ticket #${ticket_id} is no longer assigned to a user`,
                                    icon: "app/public/icon192_rounded.png",
                                    data: {
                                        path: `/app/ticket/${data.ticket_id}`
                                    }
                                }); 
                            }
                            break;
                        case "status":
                            if (!data.is_open) {
                                createNotification({
                                    title: `Ticket #${ticket_id} has been closed by ${data.user.username}`,
                                    icon: "app/public/icon192_rounded.png",
                                    data: {
                                        path: `/app/ticket/${data.ticket_id}`
                                    }
                                });
                            } else {
                                createNotification({
                                    title: `Ticket #${ticket_id} has been reopened by ${data.user.username}`,
                                    icon: "app/public/icon192_rounded.png",
                                    data: {
                                        path: `/app/ticket/${data.ticket_id}`
                                    }
                                });
                            }
                            break;
                        case "add_message":
                            createNotification({
                                title: `A new message by ${data.message.author.username} has been added to Ticket #${ticket_id}`,
                                icon: "app/public/icon192_rounded.png",
                                data: {
                                    path: `/app/ticket/${data.ticket_id}`
                                }
                            });
                            break;
                        default:
                            console.warn(`Unhandled event kind: ${data.kind}`);
                            break;
                    }
                }
            },
        }
    );
}

export function stopBackgroundTicketSubscription() {
    backgroundTicketSubscription?.unsubscribe();
}

let backgroundCreateTicketSubscription: ReturnType<typeof trpc.tickets.pushSubscription.subscribe>;

export function startBackgroundCreateTicketSubscription() {
    console.log("Made it to startBackgroundCreateTicketSubscription");
    if (backgroundCreateTicketSubscription && typeof backgroundCreateTicketSubscription.unsubscribe === "function") backgroundCreateTicketSubscription.unsubscribe();
    console.log("Checked if subscription object exists");
    try {
        backgroundCreateTicketSubscription = trpc.tickets.pushSubscription.subscribe(
            {
                eventToken: user.eventToken,
                userToken: user.token,
                eventOptions: {
                    create: true,
                }
            },
            {
                // onData: (data) => console.log("Received data:", data),
                // onError: (err) => console.error("Subscription error:", err),
                onData: (data) => {
                    console.log(Notification.permission);
                    console.log("in data reciever 1");
                    switch (data.kind) {
                        case "create":
                            console.log("in data reciever 2");
                            if (get(settingsStore).ticketCreateAlerts) {
                                console.log("Made it to Sending Create Notification");
                                createNotification({
                                    title: `New Ticket #${data.ticket_id} has been created by ${data.ticket.author}`,
                                    icon: "app/public/icon192_rounded.png",
                                    data: {
                                        path: `/app/ticket/${data.ticket_id}`
                                    }
                                });
                            }
                            break;
                        default:
                            console.warn(`Unhandled event kind: ${data.kind}`);
                            break;
                    }
                }
            },
        );
    } catch (err: any) {
        console.error("Subscription setup error:", err);
    }
    //console.log(`Listeners ${event.ticketPushEmitter.listenerCount()}`);
}

export function stopBackgroundCreateTicketSubscription() {
    if (!backgroundCreateTicketSubscription) return;

    backgroundCreateTicketSubscription?.unsubscribe();
}

const publicVapidKey = 'BFTN7PqbkHaSPpmQBbMANVP7NSJg2qGkSEisDlTborp3FMIlZAwvMVcEbCOS11JqPgDQLuk42DY5AU_mHQdyibs';

// Copied from the web-push documentation
const urlBase64ToUint8Array = (base64String: string) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
};

export async function subscribeToPush() {
    try {
        if (!('serviceWorker' in navigator)) throw new Error('Service workers are not supported');

        console.log('Registering service worker');
        const registration = await navigator.serviceWorker.ready;

        console.log(registration);

        // Subscribe to push notifications
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicVapidKey),
        });

        const keys = subscription.toJSON().keys ?? {};

        // Send push subscription to server
        await trpc.tickets.registerPush.query({
            endpoint: subscription.endpoint,
            expirationTime: new Date(subscription.expirationTime ?? 0),
            keys: {
                p256dh: keys.p256dh,
                auth: keys.auth,
            },
        });
    } catch (e: any) {
        console.error(e);
        toast('Failed to subscribe to push notifications', e.message);
    }
}