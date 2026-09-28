---
title: Kenya VAT calculator
short_title: VAT calculator
description: Add 16% VAT to a price, or work out how much of a price is VAT, for standard-rated goods and services in Kenya.
date_created: 2026-09-23
tool: vat-calculator
---

Kenya's standard VAT rate is {{ VAT_RATE|percent }}%. Shelf prices already
include it; quotes between businesses often do not.

{% tool "vat-calculator" %}

## Do you need to register?

A business must register for VAT once its turnover passes KES
{{ VAT_REGISTRATION_THRESHOLD|shillings }} in twelve months. Separately, small businesses
with a turnover between KES {{ TURNOVER_TAX_LOWER|shillings }} and KES
{{ TURNOVER_TAX_UPPER|shillings }} a year can pay turnover tax at
{{ TURNOVER_TAX_RATE|percent }}% of gross sales instead of income tax. See
[Registering a business in Kenya](/guides/registering-a-business-in-kenya).
