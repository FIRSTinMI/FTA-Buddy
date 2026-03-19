[Home](./)

# Hosting an Event

One person per event needs to set up FTA Buddy as the host. This is typically done on the **FMS computer** (or a laptop plugged into the FMS network) at the start of the event. Once hosted, all other volunteers can join with the event password.

Go to **ftabuddy.com/manage/host** to start the setup wizard.

---

## Step 1: Extension Setup

FTA Buddy reads live field data through a Chrome browser extension that connects to FMS at `10.0.100.5`.

### Installing the Extension

1. Open **Google Chrome** on the FMS-connected computer.
2. Go to the [FTA Buddy extension on the Chrome Web Store](https://chromewebstore.google.com/detail/fta-buddy/kddnhihfpfnehnnhbkfajdldlgigohjc).
3. Click **Add to Chrome**.
4. Refresh the FTA Buddy page after installing.

The setup page shows two status indicators:

- **Extension Enabled** - green when the extension is installed and active. If yellow ("Not Enabled"), click the Enable link that appears.
- **FMS Detected** - green when the extension can reach FMS at `10.0.100.5`. If red, make sure the computer is connected to the FMS network.

You must have **FTA permission** before running this software on the FMS network.

### Notepad Only Mode

If you don't want the extension to connect to SignalR enable **Notepad Only Mode** on this step. In this mode:

- The SignalR field monitor connection is disabled.
- The Field Monitor and live station data won't be available.
- The extension and FMS connection are still required for notes sync and match log import.
- Match logs will still be pulled automatically, but it may take a minute or two after the match ends.

Once the extension is detected and FMS is connected, click **Next**.

---

## Step 2: Create Event

### Event Code

Enter the **event code** that matches the event's key on [The Blue Alliance (TBA)](https://www.thebluealliance.com). For example: `2026mitry`.

The app validates the code against TBA.

> The event code is auto-filled from FMS if the extension is connected - verify it before proceeding.

### Event Password

A password is auto-generated for you in a memorable two-word-plus-number format (e.g. `robot-field-42`). You can change it to any password you prefer. Share this password with all volunteers who need access to the event.

Once both fields are valid, click **Create Event**.

---

## Step 3: Event Settings

After creating the event, you'll land on the Event Settings page. You can return here any time at **ftabuddy.com/manage/event-settings**.

From here you can:

- View the event code and password
- Configure [integrations](./integrations) (FTA App sync, Slack, Nexus, WPA Kiosk)
- Set an event display label
- Set up meshed events (for multi-field events that share a combined dashboard)

---

## Meshed Events

If your event runs multiple fields simultaneously (e.g. a championship with multiple fields), you can link them as a **meshed event**. Each field creates its own event, then one is designated as the "mesh" that aggregates the others. Go to **ftabuddy.com/manage/meshed-event** to configure this.

---

## Sharing the Password

Once the event is created, share the password with:

- FTAAs, CSAs, and RIs at the event
- Anyone who needs access to Notepad or live field data

Volunteers enter the password on the Login page to join the event.
