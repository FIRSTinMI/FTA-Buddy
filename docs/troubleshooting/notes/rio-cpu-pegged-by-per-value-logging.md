---
title: roboRIO CPU at 100% from per-value logging starves NetworkTables
date: 2026-03-21
url: https://docs.wpilib.org/en/stable/docs/software/driverstation/driver-station-log-viewer.html
---

Dashboard values froze on the field, the DS showed lag spikes and loop overrun warnings filled the console, but the robot still drove. The DS Charts tab showed roboRIO CPU pinned at 100%. The robot code was logging every signal from every CAN device on every 20 ms loop and also publishing each one to NetworkTables. On a roboRIO 1 that leaves nothing for the NT server, so dashboards and anything else reading NT get starved. Cutting the logging down to a sampled rate and removing the per-value NT publishes from the hot loop brought CPU under 60% and the dashboards came back. When a team reports "NetworkTables is slow" or "Shuffleboard freezes", check CPU in the DS Charts tab before blaming the network.
