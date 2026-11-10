---
title: How money market fund interest works in Kenya
short_title: How MMF interest works
description: How Kenyan money market funds calculate interest - units, daily accrual, effective annual yield, compounding, fees and withholding tax - with a worked example.
date_created: 2026-11-10
---

Your money market fund app shows a balance that creeps up every day, a
"daily yield" and an "annual yield", and some tax. This is how those fit
together, so you can check your statement and compare funds properly.

## Units and the KES 1 price

When you deposit, you buy **units** in the fund. Most shilling money market
funds keep the price of a unit at **KES 1**, so KES 50,000 buys 50,000 units,
and the interest is paid as **more units**. Your balance in shillings and
your number of units are the same figure.

A few funds, and most dollar funds, use a price that rises instead: the
number of units stays the same and each one is worth a little more every
day. Either way, the return is the same idea.

## Interest every day

The fund earns interest on what it holds - Treasury bills, bank deposits and
short-term paper - every day, weekends and holidays included. Each day it:

1. adds up the income earned
2. takes off its **management fee** for the day
3. shares the rest among investors in proportion to their balances

That daily share is **accrued** to your account. Most funds then add the
month's accrued interest to your balance - **compounding** it - at the end of
each month, so next month you earn interest on it too.

## Daily yield and effective annual yield

- The **daily yield** is that day's return, stated as a yearly rate.
- The **effective annual yield** is what a year would pay at that rate,
  with the monthly compounding included. It is the figure funds advertise
  and the one to compare.

Both are **after the fee** and **before tax**. The fee you see in a
factsheet - most charge about 2% a year - has already been taken off; it is
not deducted again.

## The tax

The fund deducts **{{ INTEREST_WHT_RATE|percent }}% withholding tax** from
the interest before it is credited, and pays it to KRA. For a resident
individual it is a **final tax**: you do not declare MMF interest again or
pay more. So your real return is the yield times
{{ 100 - INTEREST_WHT_RATE }}%.

## A worked example

KES 100,000 in a fund yielding {{ MMF_AVERAGE_YIELD }}% a year before tax -
the shilling average in {{ MMF.period }}:

- **A year's interest before tax:** about
  KES {{ (100000 * MMF_AVERAGE_YIELD / 100)|round|int|shillings }}
- **Withholding tax:** about
  KES {{ (100000 * MMF_AVERAGE_YIELD * INTEREST_WHT_RATE / 10000)|round|int|shillings }}
- **What you keep:** about
  KES {{ (100000 * MMF_AVERAGE_YIELD * (100 - INTEREST_WHT_RATE) / 10000)|round|int|shillings }},
  or roughly
  KES {{ (100000 * MMF_AVERAGE_YIELD * (100 - INTEREST_WHT_RATE) / 10000 / 365)|round|int|shillings }}
  a day

Try your own figures, with top-ups, in the
[MMF calculator](/tools/mmf-calculator).

## Why the yield changes

An MMF's yield follows the rates on what it buys:

- When the **Central Bank** cuts its rate, Treasury bill and deposit rates
  fall, and MMF yields follow a few weeks or months later, as old holdings
  mature and are replaced.
- When rates rise, yields climb the same way.
- A fund's yield also shifts with how much money comes in or leaves, and
  what the manager chooses to hold.

So a yield is a snapshot, not a promise. The fund that paid most last month
may not this month - see the [MMF comparer](/tools/mmf-comparer).

## Reading your statement

Check that:

- **interest appears daily** or is credited monthly as the fund says
- **tax is shown** separately from interest
- **deposits match** your M-Pesa or bank records, with your account number
- **withdrawal fees**, if any, are what the fund publishes

If something does not add up, ask the fund in writing. Complaints the fund
does not resolve can go to the **Capital Markets Authority**.

## Next

- [Money market funds in Kenya](/guides/money-market-funds-in-kenya)
- [MMF comparer](/tools/mmf-comparer)
- [Dollar money market funds](/guides/dollar-money-market-funds-in-kenya)
