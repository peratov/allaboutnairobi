---
title: Accra night out planner
short_title: Night out planner
description: "Give it a budget, a group and an evening. It builds a night from real Accra bars, restaurants and clubs, with times, fares and an estimated total."
date_created: 2026-09-14
---

Everybody has the same argument on a Friday: where, how much, and who is
driving. This settles the first two.

{% tool "night-out-planner" %}

## How it decides

It picks two to four venues that are **open when you want them**, suit the
mood you asked for, are close enough to move between, and together come in
under the budget you gave it. Then it costs the fares between them and totals
the lot.

Three things it does that are worth knowing about:

**It reserves the fare home before it spends anything.** Being stranded in
Airport City at 3am is a worse outcome than one fewer stop, so that comes off
the top.

**It counts the travel.** In Accra the journey is a real part of the evening
and a real part of the bill — Osu to East Legon is the better part of an hour
and a fare to match — so a plan that hides it is lying about the night. Walking
is capped at a distance you would actually walk at night, which is why asking
to go on foot keeps you inside one area.

**It will refuse.** If the budget does not stretch to two stops it says so,
and tells you roughly what the same night would cost — which is more useful
than a plan you cannot afford.

## Every figure here is an estimate

This matters more than the tool does.

!!! warning "Nobody has checked these prices at the door"
    {{ NIGHTLIFE.meta.basis }}

    The venues are real and the figures are the right order of magnitude for
    Accra. They are not a price list, they are not quoted by the venues, and a
    Saturday with a DJ will not cost what a Tuesday does. Use them to decide
    whether an evening is affordable, not to predict the bill.

    Last checked {{ NIGHTLIFE.meta.last_verified }}.

**Ring ahead for anything that matters** — a cover charge, a dress code, a
table minimum, or whether the live band is actually on. Accra nightlife
changes its mind frequently.

## Somebody has to drive

If you pick **Driving myself** and ask for a night built around drinks, the
planner says something about it, and it is worth repeating here: Ghana
enforces drink-driving, the police run checkpoints at exactly the hours this
tool plans for, and the cost of getting it wrong is not a line on any
breakdown.

A ride home is cheaper than the alternative every single time.

&mdash; [Ride-hailing and delivery apps ➞](/guides/ride-hailing-and-delivery-apps)

## The venues it plans from

{{ NIGHTLIFE.venues|length }} places across
{{ NIGHTLIFE.meta.areas|length }} areas. This is the whole list, which is also
what you get if the planner cannot load.

<table>
<thead><tr><th>Venue</th><th>Area</th><th>What it is</th><th>Hours</th><th>Drink</th><th>In</th></tr></thead>
<tbody>
{% for v in NIGHTLIFE.venues %}<tr><th scope="row">{{ v.name }}</th><td>{{ v.area }}</td><td>{{ v.categories|join(', ')|replace('_', ' ') }}</td><td>{{ v.opens }}&ndash;{{ v.closes }}</td><td>&#8373;{{ v.avgDrink|cedis }}</td><td>{% if v.entry > 0 %}&#8373;{{ v.entry|cedis }}{% else %}Free{% endif %}</td></tr>
{% endfor %}</tbody>
</table>

Anything not on that list is not missing on purpose — the list is short
because it is hand-kept, and a planner built on a hundred half-known venues
would be worse than one built on eighteen.

## Where it came from

This started life as a separate React application that called a language
model to write the itinerary. The itinerary logic underneath it was already
deterministic, so the rebuild kept that and dropped the rest: no model, no
server, no API key, and nothing leaves your browser.

&mdash; [Accra nightlife ➞](/guides/accra-nightlife)
&mdash; [Where to shop in Accra ➞](/guides/where-to-shop-in-accra)
&mdash; [Cost of living in Accra ➞](/guides/cost-of-living-accra)
&mdash; [Getting around Accra ➞](/guides/getting-around-accra)
