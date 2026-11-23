---
title: Kenya pension calculator - NSSF, tax relief and your pot
short_title: Pension calculator
description: See what goes into NSSF and your pension each month, what adding more costs after tax relief, and roughly what it adds up to by retirement in today's money.
date_created: 2026-11-23
tool: pension-calculator
---

People usually ask two questions about pensions without separating them:

- **What goes in, and what does it cost me?** That part is set by law, and
  this calculator works it out exactly.
- **What will I end up with?** That depends on returns, pay rises and
  inflation that nobody knows. This calculator uses assumptions you can
  change, and shows the answer in today's shillings.

{% tool "pension-calculator" %}

## What goes in

- **NSSF.** You pay {{ NSSF_RATE|percent }}% of pensionable pay, and your
  employer pays the same again. Tier I is on pay up to KES
  {{ NSSF_LOWER_EARNINGS_LIMIT|shillings }}, and Tier II on pay from there up
  to KES {{ NSSF_UPPER_EARNINGS_LIMIT|shillings }}. That makes the most you pay
  KES {{ NSSF_MAX_EMPLOYEE|shillings }} a month.
- **An employer scheme or personal plan,** if you have one, on top of NSSF.

## Tax relief on paying in more

Pension contributions come off your taxable pay before PAYE, up to the lower
of **KES {{ PENSION_DEDUCTION_MONTHLY|shillings }} a month** or **30% of
pensionable pay**. NSSF counts towards that limit. So for someone paying tax
at 30%, putting KES 10,000 more into a registered scheme costs about
KES 7,000 in take-home pay.

The scheme must be registered with the Retirement Benefits Authority. Your
employer applies the relief through payroll. If you pay into a personal plan
yourself, claim it on your annual return.

## What comes out

NSSF's pension age is **{{ NSSF_PENSIONABLE_AGE }}**, and some benefits can
be taken from 50 after you stop working. Most schemes let you take part of
the benefit as a lump sum and the rest as a pension or income drawdown. See
[Pensions in Kenya](/guides/pensions-in-kenya) and
[Checking your NSSF statement](/guides/checking-your-nssf-statement).

## About the projection

- **Today's money.** The pot is shrunk by the Central Bank of Kenya's
  inflation target of {{ CBK_INFLATION_TARGET|percent }}% a year, so you can
  compare it with prices now. Inflation has often been higher.
- **Returns are an assumption.** Schemes declare different rates each year.
  Try a lower number to see a careful case.
- **Left out:** fees, tax on withdrawals, years without work, and future
  changes to NSSF's limits.

This is arithmetic to plan with, not financial advice.

## Next

- [Pensions in Kenya](/guides/pensions-in-kenya)
- [Salary calculator](/tools/salary-calculator)
- [Savings calculator](/tools/savings-calculator)
