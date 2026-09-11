---
title: USB Ethernet adapter in the roboRIO USB port when the onboard Ethernet port is dead
date: 2026-04-04
url: https://docs.wpilib.org/en/stable/docs/networking/networking-introduction/roborio-network-troubleshooting.html
---

The roboRIO Ethernet port had no link light with a known good cable and a known good radio port, and swapping cables and radio ports changed nothing. A USB to Ethernet adapter plugged into the RIO USB-A host port came up as a second network interface on the roboRIO image. With the radio cable moved to the adapter, the RIO got its address from the field and the DS connected normally. This is a get-through-the-next-match measure rather than a repair. It is unlikely to pass inspection, so replace the roboRIO after that match rather than playing the rest of the event on it. Keep a USB Ethernet adapter in the CSA kit for this; the RIO image already has drivers for the common chipsets.
