---
title: Ghana pension calculator
short_title: Pension calculator
description: "Work out your SSNIT pension right, what the three tiers take from your salary, and what a voluntary Tier 3 contribution costs after tax relief."
date_created: 2026-09-13
---

Two different questions, and most people ask the second while meaning the
first.

{% tool "pension-calculator" %}

## How SSNIT works out the pension

Not from your final salary. The formula is:

**Best {{ SSNIT_BEST_MONTHS }} months' average salary × your pension right.**

The pension right is a percentage you earn by contributing:

- **{{ SSNIT_PENSION_RIGHT_MIN|percent }}%** once you have
  {{ SSNIT_MIN_CONTRIBUTION_MONTHS }} months — {{ SSNIT_MIN_CONTRIBUTION_YEARS }}
  years — of contributions
- **plus {{ SSNIT_PENSION_RIGHT_PER_YEAR|percent }}%** for every further year
- **capped at {{ SSNIT_PENSION_RIGHT_MAX|percent }}%**, which arrives at
  {{ SSNIT_MAX_CONTRIBUTION_YEARS }} years

Below {{ SSNIT_MIN_CONTRIBUTION_YEARS }} years there is no monthly pension at
all. You get your own contributions back as a lump sum, which is worth much
less than the pension it replaces.

## Going early costs more than people expect

You can take it from {{ SSNIT_EARLY_PENSION_AGE }}, and the reduction is
permanent — it does not step back up when you turn
{{ SSNIT_PENSION_AGE }}.

<table>
<thead><tr><th>Age you take it</th><th>You are paid</th></tr></thead>
<tbody>
{% for row in SSNIT_EARLY_FACTORS %}<tr><th scope="row">{{ row.age }}</th><td>{{ row.factor|percent }}% of the full pension</td></tr>
{% endfor %}</tbody>
</table>

Retiring at {{ SSNIT_EARLY_PENSION_AGE }} rather than {{ SSNIT_PENSION_AGE }}
costs you {{ (100 - SSNIT_EARLY_FACTOR_55)|percent }}% of every monthly payment
for the rest of your life.

## What the calculator cannot know

It uses **today's basic salary** as the best-{{ SSNIT_BEST_MONTHS }}-months
average, because that is the only figure you can give it. SSNIT will use your
real record at retirement.

That makes the answer *in today's money*: useful for deciding whether the
pension will be enough, useless as a prediction of the cedi figure you will
actually receive. Given
[Ghana's inflation history ➞](/guides/inflation-and-the-cedi), the cedi amount
will be much larger and buy rather less.

For your real contribution record, use the SSNIT self-service portal or any
branch. That is the only authoritative number.

&mdash; [SSNIT and pensions, explained ➞](/guides/ssnit-and-pensions)
&mdash; [Tier 1, Tier 2 and Tier 3, compared ➞](/guides/ssnit-tiers-explained)
&mdash; [The tax relief on pension contributions ➞](/guides/pension-tax-relief-ghana)
&mdash; [Private and voluntary pensions ➞](/guides/private-pension-ghana)
&mdash; [Salary calculator ➞](/tools/salary-calculator)
