---
title: VH-109 radio powered by PoE and the barrel jack at the same time keeps rebooting
date: 2026-03-07
url: https://frc-radio.vivid-hosting.net/overview/wiring-your-radio
---

Radio dropped off the field every couple of minutes and the PWR LED was seen cycling. The team had the barrel jack wired to a regulated supply and had also left a PoE injector on the RIO port from a previous wiring pass. Either supply worked on its own. With both connected the radio rebooted whenever the robot hit a current spike. Pulling the PoE injector and running the barrel jack alone stopped the reboots. When a radio reboots under load, check that it has exactly one power source before looking at firmware or the field.
