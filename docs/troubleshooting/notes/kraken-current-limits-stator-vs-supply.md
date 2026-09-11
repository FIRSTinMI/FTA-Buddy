---
title: Stator or supply current limit, and which one fixes what
date: 2026-09-11
url: https://v6.docs.ctr-electronics.com/en/stable/docs/hardware-reference/talonfx/improving-performance-with-current-limits.html
---

Teams ask which current limit to set on a Kraken or Falcon and usually get told a number.
The number is not the useful part. The two limits do different jobs.

Stator current is the current in the motor windings. It is proportional to torque. A stator limit
caps how hard the motor can push and how hot it gets.

Supply current is the current drawn from the battery. A supply limit protects the battery, the
breakers and the voltage the whole robot sees.

The part that confuses people: a stator limit also limits supply current. Supply current is stator
current times duty cycle, so it can never exceed the stator limit and is usually well below it. A
motor at 50 percent output with 80 A of stator current is drawing 40 A from the battery. This is why
CTRE says you often do not need both limits.

## Set the stator limit first

Find it by testing, not by guessing.

1. Put the robot on carpet against a wall.
2. Plot velocity and stator current in Tuner X.
3. Raise the output slowly until the wheels break loose. Velocity goes non-zero and stator current
   drops at that moment.
4. Set the stator limit a little below the current you saw when they slipped.

Anything above the slip point is current you cannot use, it just spins the wheels. Setting it too
low costs acceleration, so do not go far below.

## Add a supply limit only if you still have a problem

If the robot still browns out or still trips the main breaker after a sensible stator limit, then
add a supply limit. Check the electrical first, because brownouts are more often a tired battery or
a bad crimp than a current limit:

- Battery tested on a Battery Beak or a real discharge test
- Battery leads tight at the battery, connector crimped properly
- Every PDH or PDP lead landed on copper, not on insulation

Then lower the supply limit on one mechanism at a time until performance suffers, and back off
slightly. A drivetrain needs far more headroom than an intake.

## What the numbers actually look like

CTRE's own worked example for a swerve robot:

| Mechanism | Stator | Supply |
|---|---|---|
| 4 drive motors | 120 A | 70 A |
| 4 steer motors | 60 A | none needed |
| Elevator | 80 A | 30 A |
| Intake | 20 A | none needed |

That is a theoretical peak near 570 A, which never happens, because the stator limits stop every
motor from peaking at once. Four drive motors accelerating together is about 280 A for well under a
second.

## Breakers trip on heat, not on a number

A 40 A breaker carries more than 40 A for a while before it opens. That is why a robot can pull 70 A
per drive motor in short bursts and be fine, then trip the main breaker the first time it gets into
a pushing match and holds. Check the trip curve in the breaker datasheet rather than assuming the
rating is a hard ceiling. A binding swerve module makes this much easier to hit, so spin each module
by hand before blaming the software.

## Brownout thresholds

The roboRIO disables all actuators to avoid a full reboot. roboRIO 1 trips at 6.3 V. roboRIO 2 trips
at 6.75 V by default. Stator limits are the most effective fix, because supply current peaks hardest
at the start of acceleration and that is exactly where a stator limit bites.
