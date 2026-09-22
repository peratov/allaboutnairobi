# SEO baseline, September 2026

Week 1 of the 90-day calendar (17 September to 15 December 2026). Week 13
compares Search Console against this file, so it records the numbers as they
stood rather than as anybody remembers them.

**Read the date ranges.** Search Console lags about two days, and every sheet
except the per-day chart is a running total over its window. See "Check the
export's date range" in `CLAUDE.md` before comparing anything with this.

## Search performance

From the performance export pulled 2026-09-18, data to 2026-09-15.

| Window | Days | Impressions | Per day | Clicks | Avg position |
| --- | --- | --- | --- | --- | --- |
| 2026-09-09 to 09-12 | 4 | 1,042 | 260 | 9 | 17.1 |
| 2026-09-13 to 09-15 | 3 | 3,402 | 1,134 | 3 | 10.8 |

Per day, from the coverage export: 86, 171, 365, 420, 437, then **1,377 on
2026-09-14**. The site first appeared in Search Console on 2026-09-09.

- **Queries** with impressions: 330. **Pages**: 171.
- **Ghana**: 3,979 impressions, 2 clicks. The first non-brand clicks came in
  this window, on long-tail pages ranking 6 to 9.
- **"icums"** was 65% of the second window's query impressions, at position
  7.2 with zero clicks. It is a navigational query for GRA's portal and is not
  winnable. Exclude it before judging growth: everything else ran about 173
  impressions a day, up from 73.
- **Devices** in the second window: mobile position 9.6, desktop 13.6, tablet
  6.1.

### The 20 pages with the most impressions

| Page | Impressions | Clicks | Position |
| --- | --- | --- | --- |
| `/glossary/icums` | 1983 | 0 | 7.2 |
| `/guides/where-to-shop-in-accra` | 730 | 0 | 5.9 |
| `/guides/birth-certificate` | 164 | 0 | 10.1 |
| `/guides/open-a-bank-account` | 145 | 0 | 77.3 |
| `/guides/books-and-bookshops-in-accra` | 64 | 1 | 8.9 |
| `/guides/start-a-chemical-shop-in-accra` | 41 | 1 | 6.3 |
| `/glossary/births-and-deaths-registry` | 35 | 0 | 14.2 |
| `/glossary/chop-money` | 34 | 0 | 6.3 |
| `/guides/death-certificate` | 32 | 0 | 8.4 |
| `/guides/change-of-name` | 31 | 0 | 5.6 |
| `/guides/accra-markets` | 31 | 0 | 10.3 |
| `/glossary/medaase` | 28 | 0 | 12.3 |
| `/guides/ssnit-and-pensions` | 28 | 0 | 50.5 |
| `/guides/learn-twi-and-ga` | 27 | 0 | 8.3 |
| `/guides/waste-collection` | 26 | 0 | 8.2 |
| `/glossary/banku` | 26 | 0 | 30.3 |
| `/guides/creche-and-daycare` | 25 | 0 | 7.3 |
| `/guides/hospitals-in-accra` | 25 | 0 | 26.8 |
| `/glossary/boys-quarters` | 23 | 1 | 8.5 |
| `/guides/emergency-numbers` | 23 | 0 | 12.4 |

**48 pages sit at positions 6 to 15 with at least 8 impressions.** That is the
list week 13 re-optimises. None of the housing or neighbourhood pages the
calendar targets is on it yet: weeks 2 to 5 are going after queries the site
does not currently rank for at all.

## Indexing

Coverage export, as of 2026-09-14: **226 indexed, 78 not**.

- 76 "Discovered - currently not indexed", never crawled, including `/guides`,
  `/tools`, `/data` and `paye-and-taxes`.
- 2 "Page with redirect", both expected.

The 76 were traced to a real fault, fixed on 2026-09-18 (`d992597`,
`b7d8f4b`): the apex served a second full copy of the site, and every `www`
page declared the apex canonical. Both hosts answered 200. The apex now 308s
to `www` and `mise check-deploy` fails if that ever stops being true. Week 13
should find that queue drained; if it has not, that is the first thing to look
at.

## Figures that block the calendar

70 of 218 constants had expired on 2026-09-22, and the money weeks lean on
them: every PAYE band, VAT and the levies, the minimum wage, the ECG tariff,
trotro fares, school fees and the four Accra rent figures. A guide scheduled
for a week whose figures are unverified does not quote them.

## The release schedule

Scheduled with `publish_on` and `<!-- release: -->` blocks
(`frontend/extensions/release.py`). **Nothing goes live on its date unless the
daily rebuild works**, and on 2026-09-22 it had failed every day since
2026-09-10 with a 415 from Vercel: the `VERCEL_DEPLOY_HOOK_URL` secret needs
the full hook URL.

To see the site as it will stand on any date: `RELEASE_DATE=2026-12-15 mise build`.

| Week | Goes live | What |
| --- | --- | --- |
| 1 | 2026-09-22 | This baseline; the two-host fix (`d992597`, `b7d8f4b`) |
| — | 2026-09-22 | VAT under Act 1151, PAYE, SSNIT, minimum wage and ECG figures re-verified. Corrections go live immediately, not on a calendar date |
| 2 | 2026-09-24 | `rent-in-accra` (new); housing hub retitled, housing path, link map |
| 3 | 2026-10-01 | `east-legon-accra`, `cantonments-accra` |
| 4 | 2026-10-08 | `osu-accra`, `airport-residential-accra` |
| 5 | 2026-10-15 | `labone-accra`, `spintex-accra` |
| 6 | 2026-10-22 | Cost of living rewritten and retitled for 2026: food, electricity, water, internet, transport, calculators |
| 7 | 2026-10-29 | Salary calculator as a landing page: worked examples at four salaries, band-by-band breakdown |
| 8 | 2026-11-05 | Official sources and last-checked dates on PAYE and SSNIT (VAT got them early) |
| 9 | 2026-11-12 | Moving to Accra retitled "the complete 2026 guide", with the whole move mapped |
| 10 | 2026-11-19 | Ghana Card, SIM, mobile money and bank guides linked as one sequence; first-week follow-ups; calculators from the moving hub |
| 11 | 2026-11-26 | Hospitals by neighbourhood, schools and housing, the trotro stations |
| 12 | 2026-12-03 | Things to do and the beaches: practical details, links from visiting-accra |
| 13 | 2026-12-10 | The review below |

Neighbourhood guides deliberately repeat one structure: rent, getting around,
schools and healthcare, power and water, daily life, who it suits, what to
check. The rent band on each is read from `content/geo/rent-bands.yaml`, so no
page can contradict the map.

## Week 13: the review

1. **Export Search Console on or after 2026-12-17**, so the data window
   includes a full week after the last release. Read the Filters sheet first.
2. **Compare the per-day chart with the series above.** Not the running totals.
3. **Judge each new page from its second export after release**, not its first.
   A page that has had impressions for two weeks and none for its target query
   has a title or intent problem; one with no impressions at all has an
   indexing problem - check the coverage report before rewriting anything.
4. **Take every page at positions 6 to 15** with real impressions, drop the
   navigational and "near me" queries (see `CLAUDE.md`), and give the rest a
   title-and-description pass.
5. **Pick the next 20 pages from real queries**, the way the bank-account and
   affidavit guides were found: a cluster of specific queries landing on a page
   that does not answer them.
6. **Check the indexing queue.** The 76 pages were traced to the two-host bug;
   if they have not drained by December, look there first.
