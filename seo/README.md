# SEO notes for All About Nairobi

## Why search traffic fell (2026-11-22)

Compared with All About Accra, which kept growing, Nairobi differed in four
ways. The technical SEO (robots.txt, the www redirect, canonicals, robots meta,
the sitemap and structured data) was the same on both and is not the cause.

- **Thin guides.** The median guide was 421 words, and 262 of 305 were under
  500. On Accra the median is 705, and 48 are under 500.
- **Batches.** 155 guides went live in November, 12 at a time, all at once.
  Accra releases guides a few a week, on dates.
- **Auto ads from `<head>` since 10 November.** Accra loads ads after the page
  and places them itself, only between sections.
- **Long titles.** 132 guide titles were over 60 characters, most in one
  "X - a, b and c" pattern.

`baseline-2026-09.md` is a copy of Accra's file and describes Ghana pages, so
do not use it for Nairobi. A real baseline needs a Search Console export.

## The rules from now on

1. **No more batches.** A new guide gets `publish_on: YYYY-MM-DD` in its front
   matter, about three a week, spread over the days.
   `frontend/extensions/release.py` keeps it out of the site until that date.
   The daily rebuild (`.github/workflows/daily-rebuild.yml`) puts it live. That
   needs the `VERCEL_DEPLOY_HOOK_URL` repository secret, made in Vercel under
   Settings -> Git -> Deploy Hooks. Until the secret exists, a scheduled guide
   waits for the next push.
2. **Depth over count.** Make a guide longer and better before adding a new
   one next to it. Merge guides that compete for the same search, and redirect
   the old address.
3. **Guide titles of 60 characters or less.** The linter now fails a longer
   one. Put the topic first, and do not end every title with a list.
4. **Ads.** The AdSense script loads after the page. The site's own ad slots
   go only between sections (`frontend/extensions/ad_breaks.py`). They are off
   until `ADSENSE_SLOT` is set in Vercel to a display ad unit's ID. Turn Auto
   ads off in the AdSense dashboard, or at least turn off in-page Auto ads and
   anchor and side-rail ads, once the slots are on.
