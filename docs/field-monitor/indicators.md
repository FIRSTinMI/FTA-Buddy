[Home](./)

# Field Monitor Indicators

Each station row displays up to eight indicator cells. On smaller screens some columns are hidden - the full set is visible on tablets and desktops.

---

## DS (Driver Station)

Shows the connection state between FMS and the team's Driver Station laptop.

| Color / Label    | State            | What it means                                                               |
| ---------------- | ---------------- | --------------------------------------------------------------------------- |
| Red              | **No link**      | Ethernet cable is not connected or no link light                            |
| Green            | **Connected**    | FMS has a good DS link                                                      |
| Green + **X**    | **No FMS comms** | Ethernet is plugged in, but DS isn't communicating with FMS                 |
| Yellow + **M**   | **Move Station** | Team is plugged into the wrong station; their DS will tell them where to go |
| Yellow + **W**   | **Waiting**      | FMS is waiting for the team                                                 |
| Dark red + **B** | **Bypass**       | Station has been bypassed by the scorekeeper                                |
| Dark red + **E** | **E-Stop**       | Emergency stop has been activated                                           |
| Dark red + **A** | **A-Stop**       | Autonomous stop has been activated                                          |

---

## Radio

Shows whether the robot's radio (OpenMesh OM5P-AN or similar) is communicating with the field access point.

| Color         | State                                                                  |
| ------------- | ---------------------------------------------------------------------- |
| Green         | Radio link established                                                 |
| Red           | No radio link                                                          |
| Green + **X** | Field can see the radio MAC address but the robot hasn't connected yet |

---

## RIO (roboRIO)

Shows whether the roboRIO is communicating over the robot network.

| Color         | State                                   |
| ------------- | --------------------------------------- |
| Green         | RIO is communicating                    |
| Red           | RIO not detected                        |
| Green + **X** | RIO is up but robot code is not running |

---

## Code

Indicated by the RIO cell. If the RIO cell is green with no **X**, robot code is running. A green **X** means the RIO is online but code has not started.

---

## Battery

Displays the current battery voltage as a number (e.g. `12.4v`) overlaid on a small rolling graph showing the last 20 readings.

- Background turns **red** when voltage drops below ~11V.
- A small secondary voltage in gray/red below the main number shows the **2nd-percentile voltage** since the match started - a low value here indicates the battery is sagging under load.
- Red secondary text appears when the 2nd-percentile is below **7.8V**.

---

## Ping

Shows the round-trip time in milliseconds between FMS and the robot.

- Background is **clear** for low ping (normal).
- Background becomes **increasingly red** as ping climbs above 20ms.
- Displayed as a rolling graph.

---

## BW (Bandwidth Utilization)

Shows the current bandwidth usage in Mbps as a plain number. High values can indicate streaming, excessive logging, or network issues.

---

## Signal

Shows the radio signal strength in dBm with a visual signal bar icon:

| Icon            | Level     | dBm            |
| --------------- | --------- | -------------- |
| 3 bars (green)  | Excellent | > -60 dBm      |
| 2 bars (yellow) | Fair      | -60 to -70 dBm |
| 1 bar (red)     | Poor      | -70 to -80 dBm |
| No bars         | No signal | ≤ -80 dBm      |

The raw dBm value is shown as a small number above the icon.

---

## Last Change

On larger screens, a small timestamp shows how long ago the last state change occurred for this station. Useful for knowing when a robot disconnected or reconnected.

---

## Compact View (Mobile)

On smaller screens, Ping, BW, and Signal are collapsed into a single **Net** cell that shows all three values stacked vertically (e.g. `12 ms / 0.50 / -65 dBm`).
