---
title: Driver Station Communications indicator only half lit is usually a firewall
date: 2026-09-10
url: https://docs.wpilib.org/en/stable/docs/software/driverstation/driver-station.html
---

The Driver Station Communications indicator is split into two halves, one for TCP and one for UDP. The left half is TCP and the right half is UDP. When one half is green and the other is red, one protocol is reaching the roboRIO and the other is blocked. If the Robot Code indicator is green, the joysticks work, and the roboRIO has the right IP (10.TE.AM.2 over a VH-109 radio), a half lit Communications indicator is almost always a firewall on the Driver Station laptop blocking one protocol. Open the DS Diagnostics tab and look at Firewall: Dom, Pub, or Prv shown in orange means that firewall is on. Turn off the enabled firewalls and the blocked half turns green. Reseat the Ethernet cable at both ends and restart the robot code only after ruling out the firewall.
