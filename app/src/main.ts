import "./app.pcss";
import App from "./App.svelte";
import { createTRPCClient, createWSClient, httpBatchLink, splitLink, wsLink } from '@trpc/client';
import type { AppRouter } from '../../src/index';
import { authStore } from "./stores/auth";
import { get } from "svelte/store";
import { settingsStore } from "./stores/settings";
import SuperJSON from "superjson";

let token = get(authStore).token;
let eventToken = get(authStore).eventToken;

export let server = (get(settingsStore).forceCloud) ? 'https://ftabuddy.com' : 'http://' + window.location.hostname;
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

authStore.subscribe((value) => {
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

const app = new App({
    target: document.getElementById("app"),
});

export default app;

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register("/serviceworker.js");
}
