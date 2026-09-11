---
title: Driver Station Communications indicator half lit means one of TCP or UDP is blocked
date: 2026-09-10
url: https://fms-manual.readthedocs.io/en/latest/fms-whitepaper/fms-whitepaper.html
---

The Driver Station Communications indicator is split into two halves, one for TCP and one for UDP. Half green and half red means one protocol is reaching the roboRIO and the other is blocked or dropping. Usually the UDP control packets pass, so the robot still responds, while the TCP user and dashboard traffic is blocked. The common causes are a firewall on the Driver Station laptop (Windows Defender in particular) blocking one protocol, or bandwidth limits dropping packets. If the Robot Code indicator is green, joysticks work, and the roboRIO has the right IP (10.TE.AM.2 over a VH-109 radio), check the DS Diagnostics tab for enabled firewalls (Dom, Pub, Prv shown in orange) and turn them off before touching the cable or the code. A fully red Communications indicator, no communication at all, is also often a firewall or a wrong team number on the Driver Station.
