---
title: PAYE, NSSF, SHIF and the Housing Levy
short_title: PAYE and taxes
description: How Kenyan payroll deductions work in 2026 - PAYE bands, personal relief, NSSF, SHIF and the Housing Levy - with a worked example and filing your return.
date_created: 2026-09-22
---

Four things come off a Kenyan salary before it reaches you: pension, health
insurance, the housing levy and income tax. This is how each is worked out,
with the rates in force in 2026.

## The four deductions

<div class="table-wrapper"><table>
<thead><tr><th scope="col">Deduction</th><th scope="col">Rate</th><th scope="col">Notes</th></tr></thead>
<tbody>
<tr><th scope="row">NSSF</th><td>{{ NSSF_RATE|percent }}%</td><td>On pay up to KES {{ NSSF_UPPER_EARNINGS_LIMIT|shillings }}; your employer pays the same again</td></tr>
<tr><th scope="row">SHIF</th><td>{{ SHIF_RATE|percent }}%</td><td>Of gross pay, minimum KES {{ SHIF_MINIMUM|shillings }}</td></tr>
<tr><th scope="row">Housing Levy</th><td>{{ HOUSING_LEVY_RATE|percent }}%</td><td>Of gross pay; your employer pays the same again</td></tr>
<tr><th scope="row">PAYE</th><td>10% to 35%</td><td>On what is left, in bands, less personal relief</td></tr>
</tbody></table></div>

NSSF, SHIF and the Housing Levy all come off **before** PAYE is worked out, so
they lower your tax.

## PAYE bands

Monthly, for residents:

<div class="table-wrapper"><table>
<thead><tr><th scope="col">Monthly taxable pay (KES)</th><th scope="col">Rate</th></tr></thead>
<tbody>
{% for band in PAYE_BANDS %}<tr><td>{{ band.from|shillings }}{% if band.to %} to {{ band.to|shillings }}{% else %} and above{% endif %}</td><td>{{ band.rate|percent }}%</td></tr>
{% endfor %}</tbody></table></div>

Every resident then gets **personal relief of KES
{{ PERSONAL_RELIEF_MONTHLY|shillings }} a month**, taken off the tax. If your
tax comes to less than that, you pay no PAYE.

## A worked example

Someone earning **KES 100,000 a month** gross:

<div class="table-wrapper"><table>
<thead><tr><th scope="col">Step</th><th scope="col" class="numeric">KES</th></tr></thead>
<tbody>
<tr><td>Gross pay</td><td class="numeric">100,000.00</td></tr>
<tr><td>NSSF: {{ NSSF_RATE|percent }}% of 100,000</td><td class="numeric">6,000.00</td></tr>
<tr><td>SHIF: {{ SHIF_RATE|percent }}% of 100,000</td><td class="numeric">2,750.00</td></tr>
<tr><td>Housing Levy: {{ HOUSING_LEVY_RATE|percent }}% of 100,000</td><td class="numeric">1,500.00</td></tr>
<tr><th scope="row">Taxable pay</th><th class="numeric">89,750.00</th></tr>
<tr><td>10% on the first 24,000</td><td class="numeric">2,400.00</td></tr>
<tr><td>25% on the next 8,333</td><td class="numeric">2,083.25</td></tr>
<tr><td>30% on the remaining 57,417</td><td class="numeric">17,225.10</td></tr>
<tr><td>Tax before relief</td><td class="numeric">21,708.35</td></tr>
<tr><td>Less personal relief</td><td class="numeric">2,400.00</td></tr>
<tr><th scope="row">PAYE</th><th class="numeric">19,308.35</th></tr>
<tr><th scope="row">Take-home pay</th><th class="numeric">70,441.65</th></tr>
</tbody></table></div>

Payroll software rounds slightly differently, so expect your payslip to be
within a few shillings of this, not identical.

## NSSF in more detail

The [[NSSF]] rate is {{ NSSF_RATE|percent }}% from you and
{{ NSSF_RATE|percent }}% from your employer, in two tiers:

- **Tier I** on pay up to KES {{ NSSF_LOWER_EARNINGS_LIMIT|shillings }}.
- **Tier II** on pay from there up to KES {{ NSSF_UPPER_EARNINGS_LIMIT|shillings }}.

So the most you pay is KES {{ NSSF_MAX_EMPLOYEE|shillings }} a month. These
limits rose on 1 February 2026 and are scheduled to keep rising, so an older
payslip will show smaller NSSF figures.

## SHIF

[[SHIF]] replaced NHIF in October 2024. It is
{{ SHIF_RATE|percent }}% of gross pay, with no upper cap, which is why it
matters more than NHIF did at higher salaries. See
[Healthcare in Nairobi](/guides/healthcare-in-nairobi) for what it covers.

## Filing your return

Everyone with a [[KRA PIN]] must file a return on [[iTax]] by
**{{ TAX_RETURN_DEADLINE }}** for the previous calendar year, even if PAYE has
already paid all the tax.

1. Ask your employer for your **P9 form**, which shows your pay and the tax
   deducted for the year.
2. On iTax, choose the income tax return for residents, enter the P9 figures,
   and add any other income such as rent or freelance work.
3. If you had no income at all, file a **nil return**.

A late return carries a penalty even when no tax is owed.

## Things that reduce your tax

- **Insurance relief** on life, education and health insurance premiums you
  pay yourself.
- **Contributions to a registered pension scheme**, up to a limit.
- **Mortgage interest** on your own home, up to a limit.

The limits change with Finance Acts, so check KRA's current figures before
relying on them.

## Other taxes you will meet

- **VAT** at {{ VAT_RATE|percent }}% on most goods and services, already in
  the shelf price.
- **Excise duty** on mobile money and bank transfer fees, airtime and data,
  already in what you pay.
- **Rental income tax** if you let out property.

## Non-residents

You count as tax resident if you have a permanent home in Kenya, or spend 183
days or more here in a year. Non-residents are taxed only on Kenyan income and
get no personal relief.

## Next

- [Working in Kenya](/guides/working-in-kenya)
- [Opening a bank account](/guides/opening-a-bank-account)
- [Cost of living in Nairobi](/guides/cost-of-living-in-nairobi)
