---
title: Ghana vehicle import duty calculator
short_title: Vehicle import duty
description: "What a car actually costs to land in Tema: duty by engine capacity, the overage penalty on older vehicles, the levies and VAT."
date_created: 2026-09-08
---

Vehicles are charged differently from other goods in two ways that matter:
duty follows **engine capacity**, and anything over
{{ VEHICLE_OVERAGE_THRESHOLD_YEARS }} years old carries an
[[overage penalty]] that steps up sharply with age.

{% tool "vehicle-import-duty-calculator" %}

## Duty by engine capacity

| Engine capacity | Import duty |
| --- | --- |
| Up to 1900cc | {{ VEHICLE_DUTY_UNDER_1900CC|percent }}% |
| 1900cc to 3000cc | {{ VEHICLE_DUTY_1900_TO_3000CC|percent }}% |
| Over 3000cc | {{ VEHICLE_DUTY_OVER_3000CC|percent }}% |

Buses, goods vehicles and commercial vehicles are classified separately.

## The overage penalty

Counted from the **year of manufacture**, on the [[CIF]] value:

| Age | Penalty |
| --- | --- |
| Over 10, up to 12 years | {{ VEHICLE_OVERAGE_PENALTY_10_TO_12|percent }}% |
| Over 12, up to 15 years | {{ VEHICLE_OVERAGE_PENALTY_12_TO_15|percent }}% |
| Over 15 years | {{ VEHICLE_OVERAGE_PENALTY_OVER_15|percent }}% |

!!! tip "Try a newer car in the calculator"
    The penalty is the reason a cheap old car abroad is not a cheap car here.
    Put a newer, more expensive vehicle into the same fields and compare the
    landed cost. People are regularly surprised.

## What is not in the number

Port charges and [[demurrage]], your clearing agent, transport from Tema, and
then [[DVLA]] registration, inspection and plates before you may drive it.

**[Importing a car ➞](/guides/importing-a-car)**
**[Registering a vehicle ➞](/guides/vehicle-registration)**
