---
title: Debris in a roboRIO 2 microSD slot caused repeated unrecoverable errors
date: 2026-03-28
url: https://docs.wpilib.org/en/stable/docs/zero-to-robot/step-3/roborio2-imaging.html
---

A roboRIO 2 threw an unrecoverable error on boot, the status LED blinked and the imaging tool could not finish. Reimaging the microSD card in a PC worked, the card read fine there, and the RIO booted once, then failed again on the next power cycle. A flashlight into the microSD slot showed a metal shaving sitting on the contacts. Blowing out the slot and reseating the card fixed it for good. The pattern to remember: image works on the card, RIO boots intermittently, error comes back after a power cycle. Check the slot for chips before condemning the RIO or the card.
