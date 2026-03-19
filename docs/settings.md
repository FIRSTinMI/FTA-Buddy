[Home](./)

# Settings

Open Settings by tapping the **gear icon** (top right on most pages).

---

## General

### Vibrations

Vibrate on robot connection changes. On by default.

### FiM Specific Field Manuals

Show FiM (FIRST in Michigan) specific documentation links in the [References](./references) section. On by default. Turn this off if you're at a non-FIM event and don't want the extra link.

### Enable Notifications

Receive push notifications for note and robot events. See [Notifications](#notifications) below. Off by default.

### Do Not Ask About Notifications

Suppress the browser prompt to enable notifications. Use this if you've already decided you don't want them.

---

## Notifications

When **Enable Notifications** is on, you can choose which types of events trigger a notification:

| Category                    | When you get notified                 |
| --------------------------- | ------------------------------------- |
| **New Tickets**             | A new note is created at the event    |
| **Followed Ticket Updates** | A note you've followed is updated     |
| **Assigned Ticket Updates** | A note assigned to you is updated     |
| **Robot Status Updates**    | A robot connection change is detected |

All four are on by default. You can turn off any category you don't need.

---

## Change My Role

Use the dropdown to switch between **FTA**, **FTAA**, **CSA**, and **RI**. This updates your role on the server and changes the bottom navigation bar. See [Getting Started](./getting-started#roles) for what each role can access.

---

## Audio Alerts

### Robot Connection

Play a sound when a robot connects or disconnects during a match. Off by default.

### Field Green

Play a sound when the field goes green (match is ready to start). Off by default.

---

## Music

FTA Buddy can play background music during the event. Options:

| Option               | Description                 |
| -------------------- | --------------------------- |
| **None**             | No music (default)          |
| **Jazz**             | Chill jazz background music |
| **Lofi**             | Lo-fi hip hop               |
| **C418 - Minecraft** | Minecraft soundtrack        |
| **Pokemon**          | Pokémon game music          |

Use the **Volume** slider to set the level (0–100%). Tap **Test Music** to preview for 10 seconds. Music only plays while the app is open.

---

## Appearance

### Dark Theme

Toggle between dark and light mode. Dark mode is on by default.

### Round Green Indicators

Display the DS, Radio, and RIO status cells as circles instead of squares when green. On by default.

### Missing Inspection Icon on Field Monitor

Show the 🔍 icon on the Field Monitor for teams that haven't passed inspection. On by default. Requires checklist data to be populated.

---

## Slack Account

Link your personal Slack account so that Slack notifications and mentions are routed to you directly.

1. Find your Slack member ID: click your name in Slack → **View full profile** → **···** → **Copy member ID** (format: `U012AB3CD`).
2. Paste it into the **Slack Member ID** field.
3. Tap **Link Slack**.

To unlink: tap **Unlink Slack**.

This only appears if you're logged in with an FTA Buddy account.

---

## Install

If FTA Buddy is not yet installed as a PWA on your device, an **Install** button appears here. Tapping it triggers the browser's native install prompt.

---

## Clear All Data

Removes all locally stored data (event token, settings, cached notes) and reloads the app. Use this if you need to start fresh or switch to a different event.

---

## About

The Settings footer shows the app version, author (Filip Kin), and a link to the GitHub repository.
