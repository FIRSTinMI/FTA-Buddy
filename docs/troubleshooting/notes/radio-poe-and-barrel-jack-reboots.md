---
title: VH-109 radio powered by PoE and the DC input at the same time keeps rebooting
date: 2026-03-07
url: https://frc-radio.vivid-hosting.net/overview/wiring-your-radio
---

Radio dropped off the field every couple of minutes and the PWR LED was seen cycling. The team had the Weidmuller DC input wired to a regulated supply and had also left a PoE injector on the RIO port from a previous wiring pass. Either supply worked on its own. With both connected the radio rebooted whenever the robot hit a current spike. Pulling the PoE injector and running the DC input alone stopped the reboots. Two sources is normally fine and redundant; the problem here was that the two sat at different voltages. When a radio reboots under load, check whether its two supplies are at the same voltage before looking at firmware or the field.
