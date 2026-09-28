---
title: Turnover tax calculator for small businesses in Kenya
short_title: Turnover tax calculator
description: Work out monthly turnover tax on a small Kenyan business's gross sales, and check whether your turnover falls inside the regime.
date_created: 2026-09-23
tool: turnover-tax-calculator
---

Turnover tax is a simple tax for small businesses: a percentage of gross
sales, with no accounts of expenses needed. KRA's published rate is
{{ TURNOVER_TAX_RATE|percent }}%.

{% tool "turnover-tax-calculator" %}

## Who it is for

- **Resident businesses** with a gross turnover of more than KES
  {{ TURNOVER_TAX_LOWER|shillings }} and not more than KES
  {{ TURNOVER_TAX_UPPER|shillings }} a year.
- It is filed and paid **monthly** on [[iTax]], by the 20th of the following
  month.
- A business can opt for ordinary income tax on its profit instead, which may
  be cheaper if its margins are thin.

Some businesses, such as professional services and companies, are excluded,
and the rate has changed several times, so check KRA's current rules. See
[Registering a business in Kenya](/guides/registering-a-business-in-kenya).
