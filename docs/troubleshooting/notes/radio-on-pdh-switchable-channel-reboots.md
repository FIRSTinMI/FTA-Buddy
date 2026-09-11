---
title: VH-109 radio keeps rebooting when powered from the PDH switchable channel
date: 2026-09-10
url: https://docs.wpilib.org/en/stable/docs/software/can-devices/power-distribution-module.html
---

A radio that reboots on its own, off and on through a match, is often wired to the switchable channel on the REV Power Distribution Hub instead of a constant channel. The PDH has one channel that can be switched on and off from code (setSwitchableChannel). When anything toggles that channel, or it browns out differently from the constant channels, the radio loses power and reboots. The fix is to move the radio's power lead to any constant PDH channel. Check the wiring before chasing firmware or the field. The switchable channel is meant for custom circuits, never for the radio or the roboRIO.
