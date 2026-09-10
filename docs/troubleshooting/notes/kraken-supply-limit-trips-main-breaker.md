---
title: Kraken default 70 A supply current limits trip the main breaker
date: 2026-03-14
url: https://v6.docs.ctr-electronics.com/en/stable/docs/hardware-reference/talonfx/improving-performance-with-current-limits.html
---

Robot went completely dead mid-match: RSL off, radio and roboRIO rebooting, comms lost, then everything came back after a few seconds. The DS log showed battery voltage collapsing to nothing right before the drop, not a slow brownout. The cause was the Phoenix 6 default supply current limit of 70 A on every Talon FX. Four swerve drive motors pushing against a wall or another robot can each pull the full 70 A, and the combined draw sits above the main breaker trip curve long enough to open it. Lowering the supply current limit on the drive motors to 40 to 60 A fixed it and the robot still drove fine. Check for mechanical binding too, a dragging module makes this much easier to trigger. If the team says "it only happens when we push", this is the first thing to look at.
