# Auth & Push Reliability — Developer Notes

## Token persistence

| Store           | Backed by                      | Key          |
| --------------- | ------------------------------ | ------------ |
| `userStore`     | `localStorage`                 | `"user"`     |
| `settingsStore` | `localStorage` + `localforage` | `"settings"` |

`userStore` is hydrated synchronously from `localStorage` at module-load time (before Svelte mounts).  
`token` and `eventToken` are written back on every `userStore.set()` call.

The tRPC client is **rebuilt** every time `userStore` changes (see `main.ts`).  
Subscriptions embed the token in the SSE URL as a query-parameter (`?token=...`) because `EventSource` cannot send custom headers.

---

## When push subscriptions start

1. **Reactive `$effect` in `App.svelte`** — watches `$user.token` AND `settings.notifications`.
    - Starts `startNotificationSubscription()` only when **both** a non-empty token **and** `notifications: true` exist.
    - Stops the subscription (calls `stopNotificationSubscription()`) whenever either becomes falsy.
    - Uses `queueMicrotask()` so any in-flight store updates settle before the SSE connection opens.

2. **`startNotificationSubscription()` in `util/notifications.ts`** — always reads the token fresh from `get(userStore)` at call time (never uses a stale module-level snapshot).
    - Returns early if `token` is empty — no SSE call, no console errors.

---

## Environment / backend URL resolution

The backend `server` is resolved **once** at bundle evaluation time in `main.ts`:

```
dev.ftabuddy.com  →  https://dev.ftabuddy.com
anything else     →  https://ftabuddy.com
```

> **Tokens are database-specific.** A token from `ftabuddy.com` is invalid on `dev.ftabuddy.com` and vice-versa.  
> If you see "User not found" in `pushSubscription`, confirm `window.location.origin` in the `[AUTH]` console logs matches the origin where the account was created.

---

## Version-migration note

`updater.ts` runs synchronous migration scripts on first boot after an upgrade.  
The **v2.6.0 migration** intentionally clears `token` and `eventToken` to force re-login after the 2025 backend overhaul.  
All migration runs are logged with prefix `[AUTH] updater:`. After the migration the new version is persisted in settings, so it only runs once.

---

## How to debug

All diagnostic output uses a consistent structured prefix. Filter the browser console:

| Prefix     | What it covers                                                                                 |
| ---------- | ---------------------------------------------------------------------------------------------- |
| `[AUTH]`   | userStore hydration, `userStore.set`, login/logout, `checkAuth`, updater migrations            |
| `[TRPC]`   | Every tRPC request/response in dev mode; errors **always** printed with procedure + safe input |
| `[PUSH]`   | `startNotificationSubscription` calls, subscription teardown, `subscribeToPush` steps          |
| `[ROUTER]` | Programmatic `navigate()` calls from Login page                                                |

### Quick Edge vs Chrome checklist

1. Open DevTools → Console in both browsers and apply filter `[AUTH]`.
2. Reload the page.
    - Both should log `[AUTH] userStore hydrated — token length: N, origin: https://...`.
    - At mount, both should log `[AUTH] checkAuth on mount`.
3. On Edge, if `checkAuth` logs **"returned no user"**: your token was created on a different backend  
   (or wiped by a migration). Log in again.
4. If you see `[PUSH] Aborting subscription start: token is empty` → the subscription correctly did  
   not open. Confirm you are logged in (`token length > 0`).
5. If you see a `[TRPC] ↓ ERROR notes.pushSubscription` line, the SSE URL's `?token=` param is empty  
   — check the `[AUTH] trpc client rebuilt` log immediately before it.

---

## Manual repro steps (Edge + Chrome)

### Happy path

1. Open `ftabuddy.com` in **Chrome** and in **Edge** (private window to avoid cached creds).
2. Log in with the same account in both.
3. Grant notification permissions when prompted.
4. Console should show `[PUSH] App effect: starting subscription` in both.
5. Navigate to `/monitor` — no red tRPC errors in the console.

### Regression test: stale token

1. Log in, then manually set `localStorage["user"]` → change `token` to `"invalid"`.
2. Reload.
3. Console should show `[AUTH] checkAuth returned no user — clearing token`.
4. App should redirect to `/manage/login`.
5. SSE subscription should **not** start (`[PUSH] Aborting subscription start: token is empty`).

### Regression test: double-click login

1. Click "Log In" rapidly twice in a row.
2. Only one login mutation should fire (guarded by `isSubmitting`).
3. `loading` spinner should always disappear after success or failure.
