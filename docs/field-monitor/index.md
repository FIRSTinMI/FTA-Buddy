[Home](../)

# Field Monitor

The Field Monitor is the main screen for FTAs and FTAAs. It shows live connection status for all six robot stations, updated in real time via the browser extension on the FMS computer.

Navigate to it at **ftabuddy.com/monitor** or tap **Monitor** in the bottom nav.

---

## Station Grid

The monitor displays six stations arranged in two rows:

```
Blue 1 | Blue 2 | Blue 3
Red 1  | Red 2  | Red 3
```

Each station shows a row of indicators. See [Indicators](./indicators) for a full explanation of what each one means.

### Team Number & Warning Icons

The leftmost cell in each row shows the team number. Small emoji icons appear below it to flag issues:

| Icon | Meaning                                                                               |
| ---- | ------------------------------------------------------------------------------------- |
| 👀   | Robot needs attention during prestart (connection has been down longer than expected) |
| 🔍   | Team has not passed inspection (requires "Inspection Alerts" enabled in Settings)     |
| 🛜   | Radio has not been flashed/programmed                                                 |
| 🕑   | Robot is connecting slower than usual based on history                                |
| 📝   | Team has an open or recent support note                                               |
| ⚙️   | Team had an event logged in the previous match                                        |

Tapping the team number cell opens the [Team Modal](./alerts#team-modal) with troubleshooting steps.

---

## Match State

The top of the Monitor page shows the current field state:

| State          | What it means                               |
| -------------- | ------------------------------------------- |
| **Prestart**   | Field is being set up, teams are connecting |
| **Auto**       | Autonomous period running                   |
| **Teleop**     | Teleoperated period running                 |
| **Match Over** | Match has ended, scores are being processed |

---

## Cycle Time

Below the match state, FTA Buddy tracks how long each match cycle takes (from the start of prestart to the end of the match):

- **Last** - cycle time of the most recent match
- **Best** - fastest cycle time recorded at this event
- **Average** - rolling average across all matches

If the event is behind or ahead of schedule, an indicator shows how many minutes off pace the event is.

---

## Interacting with Stations

- **Tap the team number** - opens the Team Modal with a live mini-monitor and troubleshooting steps based on the current fault.
- **Tap any other indicator cell** - opens the Team Modal to the detail view for that station.
- **Tap the team number in the Team Modal** - navigates to the team's note history in the Notepad.

---

## Related Pages

- [Indicators](./indicators) - what DS, Radio, RIO, Code, Battery, Ping, Signal, and BW mean
- [Alerts & Troubleshooting](./alerts) - audio alerts and the Team Modal
