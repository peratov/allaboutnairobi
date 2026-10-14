---
title: Terms and privacy
short_title: Terms
description: What this site collects (almost nothing), what it promises (not much), and the limits of the information on it.
date_created: 2026-01-10
---

## Privacy

This site is static HTML. There is no account to create, no newsletter that
requires your name, and no advertising.

{% if GA_MEASUREMENT_ID %}**This site uses Google Analytics.** It records which pages are read, roughly
where in the world readers are, and which links they follow. That is used for
one thing: working out which guides are worth writing and which are failing
people. Google receives this data and applies
[its own privacy policy](https://policies.google.com/privacy) to it.

{% endif %}**This site uses Microsoft Clarity.** It counts visits and records how people
move through a page &mdash; scrolling, clicking, where attention stalls &mdash;
and can replay an anonymised session. That is used to find guides where
readers visibly get stuck. Microsoft receives this data under
[its own privacy statement](https://privacy.microsoft.com/privacystatement).

**The calculators are masked from that recording.** Every calculator on this
site is marked so Clarity cannot capture what is typed into it. Your salary,
your rent and your household budget are not in any session replay.

You can opt out with any tracker blocker, or with
[Clarity's opt-out](https://privacy.microsoft.com/privacystatement). None of
the site's content or calculators depends on analytics, so blocking it costs
you nothing.

**The calculators never send your data anywhere.** Every calculator on
[/tools](/tools) runs entirely in your browser. What you type is not
transmitted, logged or stored on a server. The budget planner remembers your
figures in your own browser's storage, and nowhere else. You can confirm this
by opening your browser's network tools and watching &mdash; the only outbound
requests are the analytics ones described above, and they carry no figure you
typed.

**The live radio player connects you to the station, and only when you press
play.** On [/radio](/radio) each stream comes straight from that station's own
streaming server, not through this site, so the station or its streaming
provider sees your IP address and that you are listening - as it would on the
station's own website. Nothing is requested from any station until you press
play, and stopping a station closes the connection.

A few things are remembered *on your own device* using browser storage:

- which items you have ticked on a checklist, so you do not lose your place
  when you reload the page in a queue
- the exchange rate you set for currency conversions
- the radio station you last played, and its volume
- on [Nairobi Pulse](#pulse), the constituency your last location check
  found, and the answer you gave to each question; whether to ask you
  questions at all, how many you have been asked this visit, and whether you
  said not to ask again

You can clear all of them by clearing site data in your browser. None is ever
sent to us - with one exception, also on Nairobi Pulse: the random code your
browser keeps so that one phone has one vote, which goes with each vote and is
stored only in a scrambled form (see [below](#pulse)).

The search index is downloaded once and searched on your device, so what you
search for stays on your phone.

## The newsletter {: #newsletter }

**Nothing on this site requires an email address.** Every issue of the
newsletter is published here as a web page and carried in the feed, so you can
read all of it without subscribing to anything.

If you do subscribe, this is the whole of it:

<!-- {% if NEWSLETTER_LIVE %} -->

- **Where it is kept.** Your email address is kept in this site's own
  database - the same one lost and found uses, in London - with the date you
  joined and the page you signed up on. Resend, the service that delivers the
  emails, is given it to do that and nothing else, and keeps a record of each
  email it delivers under
  [its own privacy policy](https://resend.com/legal/privacy-policy).
- **Nothing until you confirm.** Anyone can type anyone's address, so the
  only email sent to a new one asks its owner to confirm it. An address nobody
  confirms is deleted after thirty days.
- **No tracking.** The emails carry no tracking pixel and no rewritten links:
  nothing reports back whether you opened one or what you clicked. We know an
  email was delivered, bounced or marked as spam, because Resend says so.
- **Leaving.** Every email has an unsubscribe link at its foot, and your mail
  app's own Unsubscribe button works too. Either takes you off at once. The
  address is then kept, marked as having left, only so that nobody but you can
  ever put it back on the list. [Write to us](/contact) and it is erased
  entirely. An address that bounces, or that marks an issue as spam, is taken
  off the same way.
- It is never sold, rented, published, or passed to anyone for their own use.
- We do not need and do not ask for your name, your phone number or anything
  else. An email address is enough to send an email.

<!-- {% else %} -->

- Your email address is held by {{ NEWSLETTER_PROVIDER }}, and is used to send
  you the monthly newsletter. Nothing else.
- It is never sold, rented, published, or passed to anyone for their own use.
- Every issue carries a way to unsubscribe, and unsubscribing removes you.
- We do not need and do not ask for your name, your phone number or anything
  else. An email address is enough to send an email.

<!-- {% endif %} -->

If you would rather read it without being on a list at all, that is what
[the archive](/newsletter) and [the feed](/feed.xml) are for.

## Lost and found {: #lost-and-found }

[Lost and found](/lost-and-found) is the one part of this site that stores
what you send it, so this is exactly what happens to it.

**What is public.** A listing's description - what the item is, roughly where
and when - is shown to everyone, because that is the point of it. Listings
that carry a long run of digits, an email address or a link are refused, so a
card, account or phone number cannot end up in public by mistake.

**What is private.** The name, phone number and email you leave are never
shown on a listing and are never returned by anything a visitor can request.
They are shown to one person: whoever you reply to, or whoever replies to you,
through the private link that comes with every listing. If an item is held by
a mall, a station or a business, your reply goes to that place's staff.

**Where it is kept.** In a database used only for this - Google Cloud
Firestore, in Google's London region - reached only by this site's own server
code, never directly from your browser. Google holds it on this site's
behalf. It is not sold,
shared, or used for anything but getting things back to their owners.

**How long.** A listing closes by itself after {{ LOSTFOUND.limits.itemDays }}
days ({{ LOSTFOUND.limits.placeItemDays }} for items held by a place), or
sooner if you close it. Thirty days after a listing ends, the contact details
on it are erased; replies lose theirs after ninety days. To have something
removed sooner, close it from your private link or
[ask us](/contact).

**Your private link is the key.** There are no accounts. Whoever holds the
link can read the replies to your listing and close it, so do not share it.

**Abuse.** To limit spam, the site keeps a scrambled code derived from your
connection - not your IP address, and changed every day - to count how many
listings and replies come from one place in an hour. Listings reported three
times are taken down until someone looks at them.

**Email.** If email is set up, a short notice is sent when someone replies to
your listing, through an email delivery service acting for this site. It
carries no contact details of the other person - those are only on your
private page.

This follows Kenya's Data Protection Act, 2019: the data is
collected for one purpose, kept no longer than that purpose needs, and you can
ask for it to be corrected or deleted.

## Events you send us {: #events }

Organisers can send an event for the [events calendar](/events) from
[the event form](/events/submit). This is what happens to it.

**What is public.** Nothing, until a person has checked it. Once approved, the
event's name, dates, time, venue, area, organiser, price, link and description
are published on the events page, because that is the point of sending it.

**What is private.** The name, email and phone you leave are for checking the
event and for telling you whether it was listed. They are never shown on the
site, and only the site's owner sees them.

**Where it is kept.** In the same database as lost and found, described above,
until the decision; an approved event then becomes part of the events
calendar, which is a file in this site's own code.

**How long.** Thirty days after your event is approved or turned down, your
name, email and phone on it are erased. To have them removed sooner, or the
event taken down, [ask us](/contact).

**Email.** If email is set up, you are sent a note that the event arrived, and
another when it is listed or cannot be, through the same email delivery
service as lost and found.

## Nairobi Pulse {: #pulse }

[Nairobi Pulse](/pulse) asks questions about the city and shows, on a map, how
each constituency answers. Only people in Nairobi can vote, and this is
exactly what voting involves.

**Being asked.** Readers whose connection looks like it is in Nairobi
are asked a question now and then on any page of the site - after a while of
reading, and as they leave - in a card at the bottom of the screen that one tap
closes, and "Don't ask me again" stops for sixty days. To decide whether to
ask, the site asks its host, Vercel, which country, region and town your
connection appears to be in. That answer is used for the decision and is not
stored; your browser keeps only the decision, for a few hours. It is a guess
about the connection, not your location, which is why a vote still needs the
check below.

**What is counted about the asking.** When a question card closes it reports
what opened it - a while of reading, leaving, the back button - and what came
of it: answered, and how many questions; closed; "not now"; never again; and
whether the location check below was asked and how it went. The "Was this
guide useful?" prompt under a guide reports the same way: shown, answered or
not, and the score. Each report is added to a count for the day and thrown
away. It carries nothing about you, your connection or the page you were on.
(A score also goes to Google Analytics with the guide it was for, which is how
each guide's score is worked out.)

**Your location, once.** Before your first vote your browser asks whether this
site may know where your phone is. If you allow it, the position - rounded to
about a hundred metres before it leaves the phone - is checked against the
outlines of Nairobi's 17 constituencies, and what comes back is the name of
your constituency. The position itself is not stored, not logged and not passed on.
Your browser keeps the answer, signed so it cannot be edited, for
{{ PULSE.passDays }} days; then it asks again.

**Your vote.** Stored with the question, the answer, the constituency, and when
you voted. Your browser keeps a random code so that a second vote from the
same phone is a change rather than a new vote; what is stored is a scrambled
form of that code, which cannot be turned back into it and is not linked to
you, your phone number or anything else. There are no accounts and no names.

**What is public.** Totals only: how many votes each answer has, across the
city and in each constituency. A constituency's answers are shown only once it has
{{ PULSE.minDistrictVotes }} votes, so a constituency where a handful of people voted
cannot be read as their answers. No single vote is ever shown, to the public
or to the site's owner.

**Where it is kept, and how long.** In the same database as lost and found,
described above. Individual votes are deleted {{ PULSE.keepVotesDays }} days
after a question closes; the totals stay, because they are the result.

**Abuse.** Location checks are limited per connection per hour, counted with the
same daily-scrambled code lost and found uses - not your IP address. A
connection that appears to come from outside Kenya is refused.

## Accuracy and liability

Everything here is provided in good faith and without warranty.

Kenyan fees, procedures and legal requirements change, sometimes without
announcement, and they vary between offices. The figures on this site carry
verification dates and expire on a schedule, which is the best a written guide
can do &mdash; but the counter is the authority, not this page.

**Nothing here is legal, tax, immigration or financial advice.** Statutes are
cited so you know what to look up and what to point at. Do not rely on this
site alone for a decision that matters. If the consequences are serious, pay a
professional.

We are not liable for losses arising from anything on this site, including
errors, omissions, or figures that were correct when written and are not
correct now.

## Independence

All About Nairobi is not affiliated with, endorsed by, or acting for the
Government of Kenya, Nairobi City County or any of their agencies &mdash;
including KRA, NSSF, the Social Health Authority, NTSA, the Directorate of
Immigration Services or the Business Registration Service.

Agency names and abbreviations are used descriptively, because those are the
names on the buildings.

## Copyright

Guides and glossary entries on this site may be quoted and shared with
attribution and a link. Statutes, official forms and government publications
referenced here remain the property of their publishers.
