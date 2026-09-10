---
title: ESD through an unshielded USB extension dropped both roboRIO USB ports
date: 2026-04-11
url: https://docs.wpilib.org/en/stable/docs/hardware/hardware-basics/wiring-best-practices.html
---

Both roboRIO USB ports stopped working at the same time in the middle of a match: the USB camera disappeared and the DS could no longer tether over the USB-B port, while Ethernet and CAN kept working. The camera was on a long unshielded USB extension zip tied along the frame. A static discharge into that cable reached the USB controller on the RIO. Power cycling did not bring the ports back, so the RIO was swapped. Both USB ports failing together points at the RIO USB controller, not at the device on the cable. Shielded cables, short runs and a ground strap from the frame help keep this from happening.
