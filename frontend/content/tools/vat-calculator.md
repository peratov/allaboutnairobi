---
title: Ghana VAT calculator - VAT, NHIL and GETFund since 2026
short_title: VAT calculator
description: "Add or remove Ghanaian VAT and its two levies at the rates in force since 1 January 2026, and see why the rate you pay is above the headline 15%."
date_created: 2026-01-12
date_updated: 2026-09-22
---

Ghana's headline VAT rate is {{ VAT_RATE|percent }}%. The rate you actually pay
is {{ VAT_EFFECTIVE_RATE|percent }}%.

{% tool "vat-calculator" %}

## Why the two numbers differ

Two levies are charged alongside VAT, and since the **Value Added Tax Act
2025 (Act 1151)** came into force on 1 January 2026, all three are charged on
the same base:

| Charge | Rate | Charged on |
| --- | --- | --- |
| [[VAT]] | {{ VAT_RATE|percent }}% | The price before tax |
| [[NHIL]] | {{ NHIL_RATE|percent }}% | The price before tax |
| GETFund levy | {{ GETFUND_RATE|percent }}% | The price before tax |

Nothing compounds, so the effective rate is their sum,
{{ VAT_EFFECTIVE_RATE|percent }}%. Before 2026 the levies were charged first,
with a COVID levy since abolished, and VAT on top of them.

&mdash; [GRA's summary of the reforms](https://gra.gov.gh/domestic-tax/tax-types/vat/)

## Registration

For a business dealing in goods, VAT registration is compulsory once annual
turnover exceeds &#8373;{{ VAT_REGISTRATION_THRESHOLD|cedis }}. GRA states that
figure for goods; a service business should confirm its position with GRA. The
VAT Flat Rate Scheme was abolished from 2026.

**[VAT and the levies, explained ➞](/guides/vat-in-ghana)**
**[Freelancing in Ghana ➞](/guides/freelancing-in-ghana)**
