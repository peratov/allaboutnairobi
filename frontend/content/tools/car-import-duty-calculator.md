---
title: Used car import duty calculator for Kenya
short_title: Car import duty calculator
description: Estimate import duty, excise duty, VAT, the Import Declaration Fee and Railway Development Levy on a used car brought into Kenya.
date_created: 2026-09-23
tool: car-import-duty-calculator
---

Most cars on Kenyan roads are imported used, and the taxes on them often come
to more than the car itself. This gives a working estimate.

{% tool "car-import-duty-calculator" %}

## How the taxes stack

1. **Customs value.** KRA takes the car's Current Retail Selling Price (CRSP)
   from its published list and depreciates it by age, or uses the invoice
   price if that is higher.
2. **Import duty** at {{ CAR_IMPORT_DUTY_RATE|percent }}% of the customs value.
3. **Excise duty** on the customs value plus import duty, at a rate that rises
   with engine size, and lower for hybrids and electric cars.
4. **VAT** at {{ VAT_RATE|percent }}% on all of the above.
5. **Import Declaration Fee** at {{ CAR_IDF_RATE|percent }}% and the **Railway
   Development Levy** at {{ CAR_RDL_RATE|percent }}%, both on the customs value.

!!! warning "It is an estimate"
    KRA assesses the duty itself, and published calculators differ in the
    details. Ask your clearing agent for a quote before you pay for a car.

The rest of the process - age limits, inspection, shipping and registration -
is in [Importing a car to Kenya](/guides/importing-a-car-to-kenya).
