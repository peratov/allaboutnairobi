---
title: Money market fund calculator for Kenya
short_title: MMF calculator
description: See what a Kenyan money market fund pays a day, a month and a year on your balance, and how savings grow with monthly top-ups - after the 15% withholding tax.
date_created: 2026-11-10
tool: mmf-calculator
---

How much does KES 100,000 earn in a money market fund? Put in your balance,
any monthly top-up and the fund's yield, and see the interest a day, a month
and a year, after tax. The yield starts at the average for shilling funds in
{{ MMF.period }}, {{ MMF_AVERAGE_YIELD }}%.

{% tool "mmf-calculator" %}

## How the interest is worked out

Funds publish an **effective annual yield** - what a year's interest would be
with compounding, after their fee. Interest **accrues every day** and is
added to your balance, usually monthly. The calculator turns the annual
yield into the equivalent monthly rate, takes the
{{ INTEREST_WHT_RATE|percent }}% **withholding tax** off each month's
interest, and adds your top-up at the end of each month.

The tax is **final**: the fund deducts it and pays KRA, and you do not
declare MMF interest again in your return.

## Finding a fund's yield

The [MMF comparer](/tools/mmf-comparer) lists every fund's latest monthly
yield before and after tax. Funds also publish a daily yield in their apps.

## A rough rule

At about {{ MMF_AVERAGE_YIELD }}% before tax, each KES 100,000 in a shilling
fund earns roughly KES {{ (100000 * MMF_AVERAGE_YIELD * (100 - INTEREST_WHT_RATE) / 10000)|round|int|shillings }}
a year after tax, or about KES {{ (100000 * MMF_AVERAGE_YIELD * (100 - INTEREST_WHT_RATE) / 10000 / 12)|round|int|shillings }}
a month.

**[How money market fund interest works ➞](/guides/how-money-market-fund-interest-works)**
**[Money market funds in Kenya ➞](/guides/money-market-funds-in-kenya)**
