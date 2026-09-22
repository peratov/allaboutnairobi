---
title: Overtime calculator for Kenya
short_title: Overtime calculator
description: Work out overtime pay in Kenya - one and a half times the hourly rate on working days, double on rest days and public holidays.
date_created: 2026-09-23
tool: overtime-calculator
---

Kenya's general wage regulations set a normal week of
{{ NORMAL_WEEKLY_HOURS }} hours and minimum overtime rates on top of it.

{% tool "overtime-calculator" %}

## The rates

- **{{ OVERTIME_RATE_NORMAL|number }} times** the normal hourly rate for
  overtime on ordinary working days.
- **{{ OVERTIME_RATE_REST_DAY|number }} times** for work on rest days and
  public holidays.

A contract or collective agreement can pay more, and many office contracts set
shorter normal hours. See [Working in Kenya](/guides/working-in-kenya#hours-and-overtime).
