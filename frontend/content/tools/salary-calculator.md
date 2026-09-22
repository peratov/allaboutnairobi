---
title: Kenyan salary calculator - take-home pay after PAYE, NSSF, SHIF and Housing Levy
short_title: Salary calculator
description: Work out your take-home pay in Kenya from your gross salary, or the gross you need for a take-home figure, with 2026 PAYE, NSSF, SHIF and Housing Levy.
date_created: 2026-09-23
tool: salary-calculator
---

Enter a monthly salary to see every deduction on a Kenyan payslip, or switch
to "The take-home I want" to find the gross salary to ask for.

{% tool "salary-calculator" %}

## What it uses

- **NSSF** at {{ NSSF_RATE|percent }}% of pay up to KES
  {{ NSSF_UPPER_EARNINGS_LIMIT|shillings }}, in two tiers.
- **SHIF** at {{ SHIF_RATE|percent }}% of gross pay, at least KES
  {{ SHIF_MINIMUM|shillings }}.
- **The Housing Levy** at {{ HOUSING_LEVY_RATE|percent }}% of gross pay.
- **PAYE** in five bands from {{ PAYE_RATE_1|percent }}% to
  {{ PAYE_TOP_RATE|percent }}%, worked out after the three deductions above,
  less personal relief of KES {{ PERSONAL_RELIEF_MONTHLY|shillings }} a month.

Every step is explained, with a worked example, in
[PAYE, NSSF, SHIF and the Housing Levy](/guides/paye-and-taxes).

## When your payslip differs

- **Only part of your pay is pensionable.** Some employers work NSSF out on
  basic pay only, which lowers it.
- **You have other reliefs**, such as insurance relief or a pension scheme,
  which your employer may apply through payroll.
- **You are paid a bonus or arrears** this month, which is taxed in the month
  it is paid.

Nothing you type here leaves your device.
