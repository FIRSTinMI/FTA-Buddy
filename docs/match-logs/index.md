[Home](../)

# Match Logs

After each match, FTA Buddy automatically imports the DS connection logs for all six stations. These logs let you review exactly what happened with a robot's connection during a match.

Navigate to **ftabuddy.com/logs** or tap **Logs** in the menu.

---

## How Logs Are Collected

The browser extension running on the FMS computer fetches DS logs from FMS via its REST API after each match ends. Logs are imported within a few seconds of the match completing. The extension also polls every 5 minutes to backfill any matches that were missed.

> Logs are only available if the extension is connected and not running in Notepad Only mode.

---

## Match Log List

The log list shows all matches with available logs, organized by tournament level:

- **Test** - test matches
- **Practice** - practice rounds
- **Qualification** - qualification matches (Qual 1, Qual 2, …)
- **Playoff** - elimination bracket matches

Use the level tabs or filters to narrow down the list. Each entry shows the match number and the time it was played.

---

## Match Overview

Tapping a match opens the **match overview**, which shows all six stations side by side. For each station you can see:

- A summary graph of key metrics over the match timeline
- Which team was in that station
- Any notable events (disconnects, brownouts, etc.)

Tap a station to drill into the [Station Log](./station-logs) for a detailed view of that robot's data.

---

## Related Pages

- [Station Logs](./station-logs) - detailed per-robot metrics, graphs, export, and sharing
