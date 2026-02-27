import { createTRPCClient, httpBatchLink, httpLink, httpSubscriptionLink, splitLink } from "@trpc/client";
import SuperJSON from "superjson";
import { mount } from "svelte";
import { get } from "svelte/store";
import type { AppRouter } from "../../src/index";
import "./app.css";
import App from "./App.svelte";
import { settingsStore } from "./stores/settings";
import { userStore } from "./stores/user";

let token = get(userStore).token;
let eventToken = get(userStore).eventToken;

/** Resolve the cloud host: dev.ftabuddy.com when on the dev domain, otherwise prod. */
const CLOUD_HOST =
	window.location.hostname === "dev.ftabuddy.com" ? "https://dev.ftabuddy.com" : "https://ftabuddy.com";

export let server = get(settingsStore).forceCloud
	? CLOUD_HOST
	: window.location.protocol + "//" + window.location.hostname;
let localServer = !server.endsWith("ftabuddy.com");

/**
 * Routes with large payloads that must bypass batching to avoid
 * URL-length / encoding edge-cases. These are all mutations (POST body).
 */
const BIG_MUTATION_PATHS = new Set(["field.post", "match.putMatchLogs", "match.putCompressedMatchLogs"]);

function buildLinks(token: string, eventToken: string) {
	const trpcUrl = server + (localServer ? ":3001" : "") + "/trpc";
	const headers = {
		Authorization: `Bearer ${token}`,
		"Event-Token": eventToken,
	};

	// SSE (EventSource) cannot send custom headers, so pass auth via query params
	const sseUrl = `${trpcUrl}?token=${encodeURIComponent(token)}&eventToken=${encodeURIComponent(eventToken)}`;

	return [
		// 1st split: subscriptions → SSE (requires HTTP/2 in production for multi-tab)
		splitLink({
			condition: (op) => op.type === "subscription",
			true: httpSubscriptionLink({ url: sseUrl, transformer: SuperJSON }),
			false: splitLink({
				// 2nd split: big mutations → non-batched httpLink (POST body, no batching quirks)
				condition: (op) => BIG_MUTATION_PATHS.has(op.path),
				true: httpLink({ url: trpcUrl, transformer: SuperJSON, headers }),
				// Everything else → batched for performance
				false: httpBatchLink({ url: trpcUrl, transformer: SuperJSON, headers }),
			}),
		}),
	];
}

export let trpc = createTRPCClient<AppRouter>({ links: buildLinks(token, eventToken) });

userStore.subscribe((value) => {
	token = value.token;
	eventToken = value.eventToken;
	trpc = createTRPCClient<AppRouter>({ links: buildLinks(token, eventToken) });
});

const target = document.getElementById("app");
if (!target) {
	throw new Error("App target element not found");
}

const app = mount(App, {
	target: target,
});

export default app;

(async () => {
	if ("serviceWorker" in navigator) {
		try {
			await navigator.serviceWorker.register("/serviceworker.js");
		} catch (e) {
			try {
				await navigator.serviceWorker.register("/serviceworker.js");
			} catch (e) {
				console.log("Service worker registration failed");
			}
		}
	}
})();
