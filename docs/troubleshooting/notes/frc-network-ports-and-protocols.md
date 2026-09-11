---
title: FRC network ports and protocols between Driver Station, roboRIO, and dashboards
date: 2026-09-10
url: https://fms-manual.readthedocs.io/en/latest/fms-whitepaper/fms-whitepaper.html
---

The FMS Whitepaper allocates these ports for communication between the Driver Station, the roboRIO, and dashboards. Use them when a firewall or a port block is dropping one kind of traffic.

- UDP 1130: Dashboard to robot control data, one direction.
- UDP 1140: Robot to dashboard status data, one direction.
- UDP and TCP 1180 to 1190: Camera data from the roboRIO to dashboard software over USB.
- TCP 1735: SmartDashboard.
- HTTP 80 and 443: Camera web interface.
- UDP and TCP 554: RTSP for h.264 camera streaming.
- UDP and TCP 1250: CTRE Diagnostics Server.
- UDP and TCP 5800 to 5810: Team use, arbitrary data.

The Driver Station Communications indicator is split into a TCP half and a UDP half. A half lit indicator means one of these two protocols is getting through and the other is blocked, most often by a firewall or by bandwidth limits.
