import { createTRPCClient, createWSClient, httpBatchLink, splitLink, wsLink } from '@trpc/client';
import SuperJSON from "superjson";
import { get } from "svelte/store";
import type { AppRouter } from '../../src/index';
import "./app.pcss";
import App from "./App.svelte";
import { settingsStore } from "./stores/settings";
import { userStore } from "./stores/user";

let token = get(userStore).token;
let eventToken = get(userStore).eventToken;

export let server = (get(settingsStore).forceCloud) ? 'https://ftabuddy.com' : window.location.protocol + '//' + window.location.hostname;
let localServer = server !== 'https://ftabuddy.com';

const wsClient = createWSClient({
    url: server.replace('http', 'ws') + (localServer ? ":3003" : "") + '/ws',
});

export let trpc = createTRPCClient<AppRouter>({
    links: [
        splitLink({
            condition(op) {
                return op.type === "subscription";
            },
            true: wsLink({
                client: wsClient,
                transformer: SuperJSON
            }),
            false: httpBatchLink({
                url: server + (localServer ? ":3001" : "") + '/trpc',
                transformer: SuperJSON,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Event-Token': eventToken
                }
            }),
        })
    ]
});

userStore.subscribe((value) => {
    token = value.token;
    eventToken = value.eventToken;
    trpc = createTRPCClient<AppRouter>({
        links: [
            splitLink({
                condition(op) {
                    return op.type === "subscription";
                },
                true: wsLink({
                    client: wsClient,
                    transformer: SuperJSON
                }),
                false: httpBatchLink({
                    url: server + (localServer ? ":3001" : "") + '/trpc',
                    transformer: SuperJSON,
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Event-Token': eventToken
                    }
                }),
            })
        ]
    });
});

const target = document.getElementById("app");
if (!target) {
    throw new Error("App target element not found");
}

const app = new App({
    target: target,
});

export default app;

(async () => {
    if ('serviceWorker' in navigator) {
        try {
            await navigator.serviceWorker.register("/serviceworker.js");
        } catch (e) {
            try {
                await navigator.serviceWorker.register("/app/serviceworker.js");
            } catch (e) {
                console.log("Service worker registration failed");
            }
        }
    }
});
