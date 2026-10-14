"""
Attach each guide's reader rating, from the committed aggregate.

`content/ratings.yaml` is written by `mise ratings-data`, which pulls the
`guide_rating` events out of GA4 on somebody's machine and commits the result.
The browser never fetches it: the figure is inlined at build time, like the
hero map and the events list, so a rating costs no request and works with
scripting off.

The threshold is the whole point of this file. A mean is not a finding until
enough people have answered, and this site has three hundred guides that will
each collect a handful of votes before any of them collects a hundred.
Publishing "5.0" off two clicks would be the same class of mistake as the
`confidence: 0.98` that got stripped out of the nightlife data: precision
invented by arithmetic rather than earned by evidence. Below MIN_RATINGS a
guide has no `rating` at all and the block renders nothing.
"""

import logging
from datetime import date, datetime
from pathlib import Path

import yaml
from ursus.config import config
from ursus.context_processors import Context, ContextProcessor

logger = logging.getLogger(__name__)

# Below this many votes, a guide shows no score. Chosen because it is the point
# at which one enthusiast or one annoyed reader stops moving the first decimal
# place on their own.
MIN_RATINGS = 10

RATINGS_FILE = "ratings.yaml"


def _as_date(value) -> date | None:
    """YAML gives a date for `as_of: 2026-09-30`; a generated file may give a string."""
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        try:
            return date.fromisoformat(value.strip())
        except ValueError:
            return None
    return None


class RatingsProcessor(ContextProcessor):
    def process(self, context: Context, changed_files: set[Path] | None = None) -> None:
        path = config.content_path / RATINGS_FILE

        raw = {}
        as_of = None
        if path.exists():
            loaded = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
            raw = loaded.get("guides") or {}
            as_of = _as_date((loaded.get("meta") or {}).get("as_of"))

        published = 0
        for uri, entry in context["entries"].items():
            uri = str(uri).replace("\\", "/")
            if not uri.endswith(".md"):
                continue

            # Keyed by the whole URI minus the suffix - "guides/rent-advance",
            # "docs/tenancy-agreement-template" - rather than by bare stem.
            #
            # Two reasons. Slugs cannot collide across directories, and
            # docs/entry.html.jinja *extends* guides/entry.html.jinja, so the
            # document templates inherit the rating block whether or not anyone
            # remembered that. Setting this on every entry means any template
            # that includes the block works, instead of failing under
            # StrictUndefined the way the first version of this did.
            slug = uri[:-len(".md")]

            # The prompt needs a stable key whether or not there is a score to
            # show, so this is set regardless of what the aggregate holds.
            entry["rating_slug"] = slug

            record = raw.get(slug)
            if not isinstance(record, dict):
                continue

            count = record.get("count")
            total = record.get("total")
            if not isinstance(count, int) or not isinstance(total, (int, float)):
                logger.warning("ratings.yaml: %s has no usable count/total", slug)
                continue
            if count < MIN_RATINGS:
                continue

            record_as_of = _as_date(record.get("as_of")) or as_of
            if record_as_of is None:
                logger.warning("ratings.yaml: %s has no as_of date, and neither does meta", slug)
                continue

            entry["rating"] = {
                "mean": round(total / count, 1),
                "count": count,
                "as_of": record_as_of,
            }
            published += 1

        if raw:
            logger.info(
                "Reader ratings: %s guides rated, %s above the %s-vote threshold",
                len(raw), published, MIN_RATINGS,
            )
