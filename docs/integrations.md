[Home](./)

# Integrations

Integrations are configured from the **Event Settings** page (`ftabuddy.com/manage/event-settings`), accessible to the event host.

---

## FTA App Sync

FTA Buddy can sync notes bi-directionally with the **official FMS FTA App** in real time. When enabled:

- Notes created in FTA Buddy appear in the FTA App.
- Notes created in the FTA App appear in FTA Buddy.
- Edits and resolutions sync both ways.

### Setup

1. In Event Settings, open the **FMS / FTA App** integration section.
2. Enter the **FMS event password** (provided by FIRST for the event).
3. The integration status indicator shows whether the connection is active.

The browser extension handles the connection to the FTA App via the `ftaAppHub` SignalR hub on FMS.

---

## Slack

FTA Buddy has a Slack bot integration that posts team issue notes to a designated CSA Slack channel. This allows CSAs to track incoming issues without having the app open.

### Event Setup (Host)

1. In Event Settings, open the **Slack** integration section.
2. Configure the Slack channel and bot token.

### Personal Linking (All Users)

To receive direct Slack mentions and notifications:

1. Open [Settings](./settings#slack-account).
2. Enter your Slack member ID and tap **Link Slack**.

Once linked, you'll receive Slack DMs for notes assigned to you or that mention you.

---

## Nexus

[FRC Nexus](https://frc.nexus) is a scouting and field operations tool used at some events. FTA Buddy can import connection test results from Nexus automatically.

### What it does

- When a team completes a connection check via Nexus, their **Connection Tested** status in the [Checklist](./checklist) is updated automatically.

### Setup

1. In Event Settings, open the **Nexus** integration section.
2. Enter the Nexus event key.

---

## WPA Kiosk

The WPA (Wireless Programming Area) Kiosk integration connects FTA Buddy to the radio programming station.

### What it does

- Tracks which teams have had their radios programmed at the WPA kiosk.
- Updates the **Radio Programmed** status in the Checklist automatically when a team is processed.

### Setup

Configure in Event Settings under the **WPA Kiosk** section.

---

## Radio Kiosk Mode

**ftabuddy.com/manage/kiosk**

A simplified full-screen UI designed for the volunteer running the radio programming station. It shows a checklist-style queue of teams and their radio programming status.

This page is intended to be kept open on a dedicated tablet or laptop at the WPA station.
