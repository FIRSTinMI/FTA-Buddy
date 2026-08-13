import { createTRPCClient, httpBatchLink, httpLink, httpSubscriptionLink, loggerLink, splitLink } from "@trpc/client";
import { onIdTokenChanged, signOut } from "firebase/auth";
import SuperJSON from "superjson";
import { mount } from "svelte";
import { get } from "svelte/store";
import type { AppRouter } from "../../src/index";
import "./app.css";
import App from "./App.svelte";
import { settingsStore } from "./stores/settings";
import { userStore } from "./stores/user";
import { auth, currentIdToken } from "./util/firebase";

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
	// Auth is the Firebase ID token. Resolved per-request (async) so HTTP calls
	// always get a fresh, auto-refreshed token from the SDK.
	const headers = async () => ({
		Authorization: `Bearer ${await currentIdToken()}`,
		"Event-Token": eventToken,
	});

	// SSE (EventSource) cannot send custom headers, so pass auth via query params.
	// The connection is rebuilt by onIdTokenChanged when the token refreshes.
	const sseUrl = `${trpcUrl}?token=${encodeURIComponent(token)}&eventToken=${encodeURIComponent(eventToken)}`;

	// Dev-only tRPC logger: prints procedure + direction; masks the password field
	const devLogLink = loggerLink({
		enabled: (opts) => import.meta.env.DEV || (opts.direction === "down" && opts.result instanceof Error),
		colorMode: "ansi",
		logger: (opts) => {
			if (opts.direction === "down" && opts.result instanceof Error) {
				const input = opts.input as Record<string, unknown> | undefined;
				const safeInput = input ? { ...input, password: input.password ? "[redacted]" : undefined } : undefined;
				console.info(
					`[TRPC] ↓ ERROR ${opts.path} | input: ${JSON.stringify(safeInput)} | ${opts.result.message}`,
				);
			} else if (import.meta.env.DEV) {
				console.info(`[TRPC] ${opts.direction === "up" ? "↑" : "↓"} ${opts.type} ${opts.path}`);
			}
		},
	});

	return [
		devLogLink,
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

/** Create a one-off tRPC client that uses a different event token (e.g. a sub-event token in combined meshed view). */
export function trpcWithEventToken(subEventToken: string) {
	return createTRPCClient<AppRouter>({ links: buildLinks(token, subEventToken) });
}

userStore.subscribe((value) => {
	token = value.token;
	eventToken = value.eventToken;
	trpc = createTRPCClient<AppRouter>({ links: buildLinks(token, eventToken) });
});

// Rebuild the client whenever Firebase signs in/out or refreshes the ID token
// (~hourly). Keeps the SSE URL and the persisted "logged in" token current.
//
// On the FIRST fire only (boot), guard against an account mismatch: if Firebase's
// persisted user isn't the one the app was last signed in as (email in userStore),
// force sign-out. Silent switching would let the app rebuild the profile from
// whichever user Firebase happens to have persisted, hiding accidental account
// changes (cross-tab sign-in, stray Google popup, etc.). Subsequent fires are
// left alone so intentional sign-ins during a session work normally.
let firstAuthFire = true;
onIdTokenChanged(auth, async (fbUser) => {
	const isFirstFire = firstAuthFire;
	firstAuthFire = false;

	token = fbUser ? await fbUser.getIdToken() : "";
	const cur = get(userStore);

	if (isFirstFire && cur.email && (!fbUser || (fbUser.email && cur.email !== fbUser.email))) {
		console.warn(
			`[AUTH] Firebase session (${fbUser?.email ?? "signed out"}) does not match stored profile (${cur.email}). Signing out to force re-authentication.`,
		);
		try {
			await signOut(auth);
		} catch (e) {
			console.error("[AUTH] signOut on mismatch failed", e);
		}
		userStore.set({
			email: "",
			username: "",
			id: -1,
			token: "",
			eventToken: cur.eventToken,
			role: "FTA",
			admin: false,
		});
		window.location.reload();
		return;
	}

	if (cur.token !== token) {
		userStore.set({ ...cur, token });
	} else {
		trpc = createTRPCClient<AppRouter>({ links: buildLinks(token, eventToken) });
	}
	console.info(`[AUTH] trpc client rebuilt - token length: ${token.length}, origin: ${window.location.origin}`);
});

const target = document.getElementById("app");
if (!target) {
	throw new Error("App target element not found");
}

const app = mount(App, {
	target: target,
});

// App loaded successfully - clear the one-shot chunk-reload guard so it rearms
// for the next deployment rather than permanently suppressing recovery.
sessionStorage.removeItem("chunk-reload");

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
