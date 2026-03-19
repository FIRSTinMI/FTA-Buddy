[Home](./)

# Alerts & Troubleshooting

## Audio Alerts

FTA Buddy can play a sound when a robot disconnects or reconnects during a match. This is useful so you don't have to keep your eyes on the screen the whole time.

To enable audio alerts:

1. Open **Settings** (gear icon).
2. Under **Audio Alerts**, turn on **Robot Connection**.
3. Optionally enable **Field Green** to also play a sound when the field goes green.

Audio alerts are off by default. See [Settings](../settings) for all audio options, including background music.

## Vibration Alerts

On mobile devices, FTA Buddy can vibrate when there's a robot connection change. This is on by default.

To toggle: **Settings → General → Vibrations**.

---

## Team Modal

Tapping any station on the Field Monitor opens the **Team Modal** - a popup that shows a live mini-monitor row for that team and context-aware troubleshooting steps based on the current fault.

### Troubleshooting Steps by State

**DS: No Link (red)**

> Ethernet not plugged in

1. Make sure the cable is plugged into the laptop.
2. Check for link lights on the port.
3. Try a USB-to-Ethernet dongle.
4. Try replacing the ethernet cable.

**DS: No FMS Comms (green + X)**

> Ethernet is plugged in but DS isn't talking to FMS

1. Make sure Driver Station is open, and only one instance is running.
2. Check for link lights on the port.
3. Make sure Wi-Fi is off on the DS laptop.
4. Check the DS Diagnostics tab - firewall should be green. Disable Windows Firewall if needed (`Win + R` → `wf.msc`).
5. Click the refresh button in DS to release and renew the DHCP address.
6. Try a USB-to-Ethernet dongle.
7. Try restarting the Driver Station software.
8. Open Network Adapters (`Win + R` → `ncpa.cpl`) and verify the ethernet adapter is enabled with automatic IP configuration.
9. If all else fails, swap to a spare DS laptop and schedule lunch-time diagnostics.

**DS: Move Station (yellow + M)**

> Team is plugged into the wrong station

- The DS software will display which station they should move to.
- During playoffs, verify with Head Referee and Scorekeeper before directing the team.

**DS: Waiting (yellow + W)**

> FMS is waiting for this station

**DS: Bypass (B)**

> Station has been bypassed - no action needed unless it was bypassed unintentionally.

**DS: E-Stop (E) / A-Stop (A)**

> Emergency or autonomous stop activated.

**Radio: No Link**

> Robot radio is not connecting to the field access point

1. Check the robot's radio is powered and has the correct team number programmed.
2. Verify the robot is oriented so the radio has line-of-sight to the field AP.
3. Check band selection (5 GHz only at most events).

**RIO: No Link**

> roboRIO not detected on the network

1. Confirm the robot is powered.
2. Check all ethernet cables between radio and roboRIO.
3. Try power cycling the robot.

**Code: Not Running (RIO green + X)**

> roboRIO is up but robot code hasn't started

1. Verify the team's code is deployed.
2. Power cycle the robot.
3. Check DS for any code crash messages.

---

## Prestart Attention Indicators

During prestart, the 👀 emoji appears on a team when a fault has persisted long enough to warrant attention:

- DS is red for more than **30 seconds**
- DS shows green + X for more than **30 seconds**
- Radio has been down for more than **3 minutes**
- RIO has been down for more than **45 seconds**
- Code hasn't started for more than **30 seconds**
