---
title: About All About Accra
short_title: About
description: Why this site exists, who it is for, and the machinery that stops its numbers from quietly going out of date.
date_created: 2026-01-10
---

All About Accra is a free, independent guide to living in Accra. It explains
the things that are obvious to everyone who already knows them and impossible
to find out if you do not: how the rent advance works, what SSNIT takes off
your payslip, which queue at the NIA is the right queue, and why nobody uses
street names.

It is modelled on [All About Berlin](https://allaboutberlin.com), which has
spent years proving that a city deserves one honest, well-maintained manual
rather than a hundred blog posts written once and abandoned.

## Who this is for

- **People moving to Accra** from anywhere, including Ghanaians returning after
  years away, who find that half of what they remember has changed and the
  other half now needs a Ghana Card.
- **People who already live here** and have hit a specific wall: a landlord
  demanding two years up front, a payslip that does not add up, a work permit
  renewal nobody can explain.
- **People helping someone else** move here, who need to be able to send a link
  instead of writing the same message again.

It is not a tourism site, and it is not a relocation agency. Nothing here is
sponsored.

## How this site stays accurate

The hard part of a site like this is not writing it. It is stopping it from
rotting.

Ghanaian figures move constantly. The National Tripartite Committee revises the
minimum wage most years. PAYE bands change with the budget. The PURC adjusts
electricity tariffs quarterly. A guide written in good faith in March can be
confidently wrong by August, and a reader has no way to tell.

So no number is ever typed into a guide. Every figure on this site lives in a
single file, `content/constants.yaml`, and each one carries three things:

- **where it came from** &mdash; usually the Act, the regulation or the agency
  that publishes it
- **when a human last checked it** against that source
- **the date it expires**

When a constant passes its expiry date, the build fails. Not a warning in a log
nobody reads &mdash; the site refuses to publish until someone opens the source
and either confirms the number or changes it. A missing figure is obvious. A
stale one is not, and that is exactly what makes it dangerous.

The guides then pull those values in. The minimum wage appears in four
different guides and a calculator; all five read the same variable. They cannot
disagree with each other, because there is only one of it.

The calculators work the same way. The salary calculator does not have its own
copy of the PAYE bands &mdash; it reads the ones the taxes guide prints in its
table. If the table is right, the calculator is right.

## What this site cannot do for you

Be honest with yourself about the limits:

- **Fees at the counter are the real fees.** Published schedules and what you
  are actually asked to pay are not always the same number. Confirm before you
  hand anything over.
- **This is not legal advice.** The Rent Act, the Labour Act and the Immigration
  Act are quoted here because knowing what they say is useful leverage. Knowing
  what they say is not the same as having a lawyer.
- **Offices change their minds.** Requirements, opening hours and which
  documents count as proof of address vary between branches, and sometimes
  between officers. Bring more paperwork than you think you need.

## Corrections

If something here is wrong, out of date, or missing the one detail that would
have saved you a wasted trip, [say so](/contact). Corrections from people who
just went through the process are the most valuable thing this site receives.
