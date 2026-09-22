"""
What is on in Accra, and how it stops being wrong.

There is no public events API worth building on for Accra. Eventbrite withdrew
public event search in 2020 and never replaced it; the global ticketing APIs
have effectively no Ghanaian inventory; the Ghanaian ticketing platforms
publish no documented API. Anything claiming to self-populate from one of
those would render an empty page for ever and look like it was working.

So this splits the problem in two, and only promises what it can keep.

**Computed.** Ghana's public holidays come from the same corrected list the
rest of the site uses, generated forward every build. They roll over on their
own, for ever, and cannot go stale. Farmers' Day really is the first Friday in
December every year, so a function is the honest way to say so.

**Curated.** Everything else lives in content/events.yaml with a source and a
`last_verified`, exactly like a constant. An annual festival whose dates have
not been announced carries a `when` note and no date at all, and the page files
it separately rather than inventing a Saturday for it.

Expiry happens three times over, because a static site is only as fresh as its
last deploy:

  1. here, at build time, which is what a crawler and a reader with no
     JavaScript see;
  2. again in the browser, in events-filter.mjs, so a deploy that went quiet
     for a fortnight still never shows a date that has passed;
  3. and the scheduled rebuild in .github/workflows/refresh-events.yml, which
     redeploys daily so (1) stays true without anyone doing anything.
"""

import logging
from datetime import date, timedelta
from pathlib import Path

import yaml
from ursus.config import config
from ursus.context_processors import Context, ContextProcessor

from extensions.functions import get_public_holidays

logger = logging.getLogger(__name__)

# How far ahead to generate the computed civic calendar.
#
# One year exactly, because the civic calendar repeats annually: a shorter
# window drops Independence Day off the page for most of the year, and a longer
# one lists every holiday twice and pads the page with 2028 dates nobody can
# act on. Twelve months shows each one once.
HORIZON_DAYS = 365

CATEGORIES = {
    "culture": "Culture",
    "music": "Music",
    "tech": "Tech",
    "business": "Business",
    "sport": "Sport",
    "food": "Food",
    "family": "Family",
    "civic": "Public holiday",
}

# Public holidays that are worth a sentence, because "the offices are shut" is
# not the only thing a reader wants to know about them.
HOLIDAY_NOTES = {
    "Independence Day": "Parades, and almost everything closed.",
    "Farmers' Day": "The first Friday in December, honouring farmers and fishers.",
    "Kwame Nkrumah Memorial Day": "Marking the birthday of Ghana's first president.",
    "Founders' Day": "Marking the founding of the nation.",
    "Republic Day": "Commemorative since 2019, and no longer a day off.",
    "African Union Day": "Marked across the continent.",
    "May Day": "Workers' day, with a rally at Black Star Square.",
}


def _as_date(value) -> date | None:
    """YAML gives us a date for `2026-08-17`; anything else is not a date."""
    return value if isinstance(value, date) else None


class EventsProcessor(ContextProcessor):
    def process(self, context: Context, changed_files: set[Path] | None = None) -> None:
        today = date.today()
        horizon = today + timedelta(days=HORIZON_DAYS)

        curated, meta = self._read_curated()
        dated, annual = self._split(curated, today)
        dated.extend(self._public_holidays(today, horizon))
        dated.sort(key=lambda e: (e["starts"], e["title"]))

        context["EVENTS"] = {
            "dated": dated,
            "annual": annual,
            "months": self._by_month(dated),
            "categories": self._categories_present(dated + annual),
            "meta": meta,
            "generated_for": today,
        }

        logger.info(
            "Events: %d upcoming dated, %d annual fixtures without a date",
            len(dated),
            len(annual),
        )

    # -- sources ------------------------------------------------------------

    def _read_curated(self) -> tuple[list[dict], dict]:
        # Deliberately not "events.yaml": a content file whose stem matches a
        # template stem gets rendered BY that template, so content/events.yaml
        # and templates/events.html.jinja would collide and fail the build.
        # The map dodges the same trap by calling its data map-summary.yaml.
        path = config.content_path / "events-calendar.yaml"
        try:
            loaded = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        except (OSError, yaml.YAMLError) as error:
            # An unreadable events file must not take the site down with it.
            logger.warning("events-calendar.yaml unreadable (%s); listing holidays only", error)
            return [], {}
        return list(loaded.get("events") or []), dict(loaded.get("meta") or {})

    def _split(self, curated: list[dict], today: date) -> tuple[list[dict], list[dict]]:
        """Dated events that have not finished, and undated annual fixtures."""
        dated: list[dict] = []
        annual: list[dict] = []

        for raw in curated:
            event = dict(raw)
            event.setdefault("category", "culture")
            event["category_label"] = CATEGORIES.get(event["category"], "Event")

            starts = _as_date(event.get("starts"))
            if starts is None:
                # No date at all. Only legitimate for an annual fixture; an
                # undated one-off is a mistake worth seeing in the build log.
                if event.get("annual"):
                    annual.append(event)
                else:
                    logger.warning("Event %r has no date and is not annual; skipped",
                                   event.get("title"))
                continue

            ends = _as_date(event.get("ends")) or starts
            if ends < today:
                continue  # over, and gone from the page by itself

            event["starts"], event["ends"] = starts, ends
            event["is_multi_day"] = ends != starts
            event["computed"] = False
            dated.append(event)

        return dated, annual

    def _public_holidays(self, today: date, horizon: date) -> list[dict]:
        """The civic calendar, generated rather than typed."""
        years = range(today.year, horizon.year + 1)
        events = []

        for holiday_date, name in sorted(get_public_holidays(years).items()):
            if not today <= holiday_date <= horizon:
                continue
            events.append({
                "title": name,
                "starts": holiday_date,
                "ends": holiday_date,
                "is_multi_day": False,
                "category": "civic",
                "category_label": CATEGORIES["civic"],
                "area": "Nationwide",
                "description": HOLIDAY_NOTES.get(name, "A statutory public holiday."),
                "computed": True,
            })

        return events

    # -- shaping ------------------------------------------------------------

    def _by_month(self, dated: list[dict]) -> list[dict]:
        """Group in date order, so the page can print one heading per month."""
        months: list[dict] = []
        for event in dated:
            key = (event["starts"].year, event["starts"].month)
            if not months or months[-1]["key"] != key:
                months.append({
                    "key": key,
                    "label": event["starts"].strftime("%B %Y"),
                    "events": [],
                })
            months[-1]["events"].append(event)
        return months

    def _categories_present(self, events: list[dict]) -> list[dict]:
        """Only offer a filter for a category that actually has something in it."""
        present = {e.get("category") for e in events}
        return [
            {"slug": slug, "label": label}
            for slug, label in CATEGORIES.items()
            if slug in present
        ]
