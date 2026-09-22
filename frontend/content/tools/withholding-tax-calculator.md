---
title: Ghana withholding tax calculator
short_title: Withholding tax
description: See what really reaches your account after a client withholds tax, how VAT and WHT interact, and why the certificate matters.
date_created: 2026-09-08
---

A client pays you less than you invoiced. That is withholding tax, and it is
not a deduction &mdash; it is tax paid on your behalf, credited against your own
bill when you file.

{% tool "withholding-tax-calculator" %}

## The rates

| Payment | Rate |
| --- | --- |
| Services, resident supplier | {{ WHT_SERVICES_RESIDENT|percent }}% |
| Supply of goods | {{ WHT_GOODS|percent }}% |
| Works and contracts | {{ WHT_WORKS|percent }}% |
| Rent, residential | {{ WHT_RENT_RESIDENTIAL|percent }}% |
| Rent, commercial | {{ WHT_RENT_COMMERCIAL|percent }}% |
| Dividends | {{ WHT_DIVIDENDS|percent }}% |

## The two things people get wrong

**VAT goes on, WHT comes off &mdash; and off the amount before VAT.** If you
are registered, you add [[VAT]] and the levies to your fee. The client then
withholds tax calculated on the fee alone, not on the invoice total.

**The certificate is the whole point.** Without the withholding tax
certificate, you cannot claim the credit, and you have simply been paid less.
Ask for it when you are paid, not in March.

!!! warning "The VAT you charged was never your money"
    You collected it for the [[GRA]] and you owe it. Businesses that treat VAT
    receipts as income discover the problem at the worst possible moment.

**[Income tax and PAYE ➞](/guides/paye-and-taxes)**
**[Freelancing in Ghana ➞](/guides/freelancing-in-ghana)**
**[VAT and the levies ➞](/guides/vat-in-ghana)**
