# FTA-Buddy

A companion app for FIRST Robotics Competition (FRC) event volunteers — FTAs, FTAAs, CSAs, and RIs. It streams live field data from FMS to phones/tablets via a Chrome extension, without overloading the FMS network.

## Architecture

Three components in a Bun workspace:

| Component     | Location     | Purpose                                                   |
| ------------- | ------------ | --------------------------------------------------------- |
| **Server**    | `src/`       | Bun + Express + tRPC backend, PostgreSQL via Drizzle ORM  |
| **App**       | `app/`       | Svelte 5 + TypeScript + Vite frontend (PWA)               |
| **Extension** | `extension/` | Chrome MV3 extension that connects to FMS and relays data |

Shared types live in `shared/` and are imported by both the server and app.

## Commands

```bash
# Run everything (server + app hot-reload)
bun run dev

# Server only
bun run server

# App only
bun run app

# Build app for production
bun run build

# Generate a new DB migration (after schema changes)
bun run generate-migration

# Run migrations
bun run migrate

# Format code
bun run format
```

## Environment

Copy `.env.example` to `.env` and fill in values. Required keys:

- `DB_*` — PostgreSQL connection
- `TBA_API_KEY` — The Blue Alliance API key (for event code validation)
- `GOOGLE_CLIENT_ID` + `GOOGLE_KEY*` — Google OAuth
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` — Web Push notifications
- `OPENAI_KEY` / `OPENAI_MODEL` — Event report generation
- `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` — Slack bot integration
- `TOA_KEY` / `FTC_KEY` — FTC event data

## Tech Stack

**Server:** Bun, Express 5, tRPC v11, Drizzle ORM, PostgreSQL, Zod, Firebase Auth, OpenAI, web-push

**App:** Svelte 5 (Runes syntax), TypeScript, Vite, Tailwind CSS v4, Flowbite-Svelte, tRPC client, ECharts, localforage, sv-router

**Extension:** Chrome Manifest v3, SignalR client, injected scripts for FMS FieldMonitor page / Nexus / VIVID

## Key Patterns

### Svelte 5 Runes

The app uses Svelte 5 Runes (`$state`, `$derived`, `$effect`, `$props`). Do not use legacy Svelte 4 reactivity (`$:`, `export let`).

### tRPC

All client-server communication goes through tRPC. The router is at `src/router/` with an `event.ts`, `user.ts`, `cycles.ts`, etc. The client is initialized in `app/src/main.ts` as `trpc`.

### Shared Types

Types shared between server and app are in `shared/types.ts` and `shared/fmsApiTypes.ts`. Always use these instead of re-defining types.

### State Management

Svelte stores in `app/src/stores/`:

- `user.ts` — authenticated user (persisted to localStorage)
- `event.ts` — current event data (persisted to localStorage)
- `settings.ts` — all user settings (persisted to localStorage + localforage)
- `notifications.ts`, `flashcards.ts`, `savedEvents.ts`, etc.

### Database

Drizzle ORM with PostgreSQL. Schema is in `src/db/schema.ts`. After changing the schema, run `bun run generate-migration` then `bun run migrate`.

## Project Structure

```
├── src/               # Server
│   ├── router/        # tRPC procedures (event.ts, user.ts, cycles.ts, ...)
│   ├── db/            # Drizzle schema + migrations
│   └── index.ts       # Entry point
├── app/src/           # Frontend
│   ├── pages/         # Route components
│   │   ├── management/  # Login, Host setup, RadioKiosk, MeshedEvent
│   │   ├── match-logs/  # MatchLog, StationLog
│   │   ├── tickets-notes/ # ViewNote, TeamHistory
│   │   └── references/  # StatusLights, SoftwareDocs, etc.
│   ├── components/    # Shared UI components
│   │   ├── host/      # Host setup wizard steps + integrations
│   │   ├── notes/     # Note-related components
│   │   └── support/   # SupportFeedView, SupportFieldView
│   ├── stores/        # Svelte stores
│   ├── util/          # Utilities (eventPassword, notifications, audioAlerts, ...)
│   ├── field-monitor/ # MonitorFrameHandler and audio queuer
│   └── router.ts      # sv-router routes + auth guards
├── extension/src/     # Chrome extension
│   ├── background.ts  # Service worker (SignalR + polling)
│   ├── signalR.ts     # SignalR connection manager
│   └── fmsapi.ts      # FMS REST API calls
├── shared/            # Types shared between server and app
└── docs/              # End-user documentation
```

## FMS / Extension Notes

- FMS is always at `10.0.100.5` on the event network
- The extension connects to three SignalR hubs: `fieldMonitorHub`, `infrastructureHub`, `ftaAppHub`
- The extension polls FMS REST API every 5 minutes for team lists and missed match logs
- FMS event password (distinct from the event access password) is required for FTA App note sync
