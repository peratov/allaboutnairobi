---
title: Ghana salary calculator - PAYE and SSNIT
short_title: Salary calculator
description: Work out your monthly take-home pay in Ghana after PAYE income tax and SSNIT pension contributions, with a band-by-band breakdown of the tax.
date_created: 2026-01-12
scheduled:
    - on: 2026-10-29
      title: "Ghana salary calculator: take-home pay after PAYE and SSNIT"
      short_title: Salary calculator
      description: "Work out take-home pay in Ghana after PAYE and SSNIT, with worked examples at four salaries and the tax broken down band by band."
---

Enter your basic salary and allowances to see what actually reaches your bank
account, and where the rest went.

{% tool "salary-calculator" %}

## How the calculation works

The order matters, and payroll departments get it wrong surprisingly often:

1. **[[SSNIT]] comes off first** &mdash; {{ SSNIT_EMPLOYEE_RATE|percent }}% of
   your **basic salary only**, not of your total pay.
2. **Tier 3 contributions** come off next, deductible up to
   {{ TIER_3_MAX_RELIEF_RATE|percent }}% of basic salary.
3. **[[PAYE]] is charged on what remains**, plus your allowances.

Tax is not charged on your SSNIT contribution. If your employer computes PAYE
on gross pay before deducting SSNIT, you are paying too much.

<!-- release: 2026-10-29 -->
## Worked examples

Four basic salaries with no allowances, at the rates in force now. The
calculator above gives the same answers for the same inputs, because both read
the same figures.

<table>
<thead><tr><th scope="col">Basic salary</th><th scope="col">SSNIT, you</th><th scope="col">PAYE</th><th scope="col">Take-home</th><th scope="col">PAYE as share of basic</th></tr></thead>
<tbody>
{% for e in PAYE_WORKED_EXAMPLES %}<tr><th scope="row">&#8373;{{ e.basic|cedis }}</th><td>&#8373;{{ e.ssnit|cedis }}</td><td>&#8373;{{ e.paye|cedis }}</td><td>&#8373;{{ e.net|cedis }}</td><td>{{ e.effective|percent }}%</td></tr>
{% endfor %}</tbody>
</table>

Notice how the share taken by PAYE climbs as pay rises. That is what graduated
bands do: nobody's first cedi is taxed at the top rate, and a raise never
leaves you with less than before.

## One salary, line by line

Take a basic salary of **&#8373;{{ PAYE_EXAMPLE.basic|cedis }}** a month.

1. **SSNIT comes off first.** {{ SSNIT_EMPLOYEE_RATE|percent }}% of basic is
   &#8373;{{ PAYE_EXAMPLE.ssnit|cedis }}.
2. **What is left is taxable**: &#8373;{{ PAYE_EXAMPLE.taxable|cedis }}.
3. **PAYE is charged on that, band by band:**

<table>
<thead><tr><th scope="col">Slice of taxable income</th><th scope="col">Rate</th><th scope="col">Tax on it</th></tr></thead>
<tbody>
{% for b in PAYE_EXAMPLE.breakdown %}<tr><td>&#8373;{{ b.amount|cedis }}</td><td>{{ b.rate|percent }}%</td><td>&#8373;{{ b.tax|cedis }}</td></tr>
{% endfor %}<tr><th scope="row" colspan="2">PAYE</th><td>&#8373;{{ PAYE_EXAMPLE.paye|cedis }}</td></tr>
</tbody>
</table>

**Take-home** is &#8373;{{ PAYE_EXAMPLE.basic|cedis }} less
&#8373;{{ PAYE_EXAMPLE.ssnit|cedis }} SSNIT and
&#8373;{{ PAYE_EXAMPLE.paye|cedis }} PAYE: **&#8373;{{ PAYE_EXAMPLE.net|cedis }}**.

If your payslip shows PAYE computed on the full basic, before SSNIT came off,
your employer is overcharging you. It is one of the commonest payroll errors in
Ghana.

## What your employer pays on top

Your employer contributes a further {{ SSNIT_EMPLOYER_RATE|percent }}% of your
basic salary to SSNIT - &#8373;{{ PAYE_EXAMPLE.employer_ssnit|cedis }} on the
example above. It never appears in your pay, but it is part of what you cost to
employ, and it is building your pension.

&mdash; [The three pension tiers ➞](/guides/ssnit-tiers-explained)
&mdash; [Pension calculator ➞](/tools/pension-calculator)

## Allowances and your basic salary

**Allowances are taxed but carry no SSNIT.** Housing, transport and other
allowances are added to taxable income, but SSNIT is only ever a percentage of
basic.

That makes the split between basic and allowances matter. A package weighted
towards allowances puts more in your hand today and less into your pension,
because every future pension figure is built on basic salary. Read the split
before you sign.

&mdash; [Employment contract checklist ➞](/docs/employment-contract-checklist)
&mdash; [Your rights as an employee ➞](/guides/employee-rights-ghana)

<!-- /release -->

## The bands

| Monthly income | Rate |
| --- | --- |
| First &#8373;{{ PAYE_BAND_1_WIDTH|cedis }} | {{ PAYE_BAND_1_RATE|percent }}% |
| Next &#8373;{{ PAYE_BAND_2_WIDTH|cedis }} | {{ PAYE_BAND_2_RATE|percent }}% |
| Next &#8373;{{ PAYE_BAND_3_WIDTH|cedis }} | {{ PAYE_BAND_3_RATE|percent }}% |
| Next &#8373;{{ PAYE_BAND_4_WIDTH|cedis }} | {{ PAYE_BAND_4_RATE|percent }}% |
| Next &#8373;{{ PAYE_BAND_5_WIDTH|cedis }} | {{ PAYE_BAND_5_RATE|percent }}% |
| Next &#8373;{{ PAYE_BAND_6_WIDTH|cedis }} | {{ PAYE_BAND_6_RATE|percent }}% |
| Above &#8373;{{ PAYE_TOP_BAND_MIN|cedis }} | {{ PAYE_TOP_RATE|percent }}% |

The calculator reads these same figures, so the table and the tool cannot
disagree.

## What it does not include

- **Personal reliefs** from the GRA &mdash; marriage, child education, old age,
  disability and others. Claiming them reduces your tax further.
- **Overtime and bonus tax**, which are computed under separate rules.
- **Non-cash benefits in kind**, such as a company car or accommodation.
- **Church tax equivalents** &mdash; there is no such thing in Ghana.

## Everything you type stays on your device

The calculation runs entirely in your browser. Your salary is not sent
anywhere, logged or stored. You can verify this by watching your browser's
network tab.

**[Income tax and PAYE, explained ➞](/guides/paye-and-taxes)**
**[SSNIT and pensions ➞](/guides/ssnit-and-pensions)**
<!-- release: 2026-10-29 -->
**[Pension tax relief ➞](/guides/pension-tax-relief-ghana)**
**[Finding a job in Accra ➞](/guides/find-a-job-in-accra)**
**[Freelancing, and the tax on it ➞](/guides/freelancing-in-ghana)**
**[Withholding tax calculator ➞](/tools/withholding-tax-calculator)**
**[What a month in Accra costs ➞](/guides/cost-of-living-accra)**
<!-- /release -->
