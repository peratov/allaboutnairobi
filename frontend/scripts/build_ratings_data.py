"""
Pull reader ratings out of GA4 and write content/ratings.yaml.

Run by hand, like build_map_data.py and build_radio_data.py, and its output is
committed. The deploy never talks to Google: the figures are inlined at build
time, so a rating costs the reader no request and survives Google being down.

    mise ratings-data

What it needs
-------------
`google-analytics-data` (in requirements-dev.txt, never in requirements.txt -
the deploy must not download an analytics client it does not use), plus two
environment variables:

    GA4_PROPERTY_ID          the numeric property id, not the G- measurement id
    GOOGLE_APPLICATION_CREDENTIALS   path to a service account JSON key with
                                     Viewer on that property

The key stays on your machine. Nothing here belongs in the repository, in
Vercel, or in the browser bundle.

Why it refuses rather than writing zeros
----------------------------------------
A generator that quietly emits an empty file on a failed fetch is worse than
one that stops, because the committed result looks like a finding: "no guide
has enough ratings" is indistinguishable from "the credentials were wrong".
Every failure path here exits non-zero with the reason, and leaves the existing
file alone. The same rule as build_map_data.py refusing to publish when the
districts do not sum to the published regional total.
"""

import os
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path

CONTENT = Path(__file__).resolve().parent.parent / "content"
OUT = CONTENT / "ratings.yaml"

# GA4 keeps event-scoped custom dimensions for a limited window and the prompt
# is new, so there is no point asking for more history than the property has.
START = "2026-09-01"

# Kept in step with extensions/context_processors/ratings.py, which is what
# actually decides whether a score is published. Written here too so the file
# says what the threshold was when it was generated.
MIN_RATINGS = 10


def fail(message: str) -> None:
    print(f"ratings: {message}", file=sys.stderr)
    raise SystemExit(1)


def fetch_rows(property_id: str):
    """Every (guide, score, count) triple GA4 holds for the guide_rating event."""
    try:
        from google.analytics.data_v1beta import BetaAnalyticsDataClient
        from google.analytics.data_v1beta.types import (
            DateRange,
            Dimension,
            FilterExpression,
            Filter,
            Metric,
            RunReportRequest,
        )
    except ImportError:
        fail(
            "google-analytics-data is not installed. It lives in "
            "requirements-dev.txt: run `mise setup`, or "
            "`.venv/Scripts/python.exe -m pip install -r frontend/requirements-dev.txt`"
        )

    if not os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
        fail(
            "GOOGLE_APPLICATION_CREDENTIALS is not set. It must point at a "
            "service account JSON key with Viewer access to the property."
        )

    client = BetaAnalyticsDataClient()
    request = RunReportRequest(
        property=f"properties/{property_id}",
        date_ranges=[DateRange(start_date=START, end_date="today")],
        dimensions=[
            Dimension(name="customEvent:guide"),
            Dimension(name="customEvent:score"),
        ],
        metrics=[Metric(name="eventCount")],
        dimension_filter=FilterExpression(
            filter=Filter(
                field_name="eventName",
                string_filter=Filter.StringFilter(value="guide_rating"),
            )
        ),
        limit=100000,
    )

    response = client.run_report(request)
    for row in response.rows:
        guide = row.dimension_values[0].value
        score = row.dimension_values[1].value
        count = row.metric_values[0].value
        yield guide, score, count


def main() -> None:
    property_id = os.environ.get("GA4_PROPERTY_ID", "").strip()
    if not property_id:
        fail(
            "GA4_PROPERTY_ID is not set. Find the numeric property id in GA4 "
            "under Admin -> Property details; it is not the G- measurement id."
        )
    if not property_id.isdigit():
        fail(f"GA4_PROPERTY_ID should be numeric, got {property_id!r}")

    counts: dict[str, int] = defaultdict(int)
    totals: dict[str, int] = defaultdict(int)
    skipped = 0

    for guide, score, count in fetch_rows(property_id):
        # GA4 reports "(not set)" for events that arrived without a parameter,
        # which is what an ad blocker mangling the payload looks like.
        if not guide or guide == "(not set)":
            skipped += 1
            continue
        try:
            score_value = int(score)
            event_count = int(count)
        except (TypeError, ValueError):
            skipped += 1
            continue
        if not 1 <= score_value <= 5:
            skipped += 1
            continue

        counts[guide] += event_count
        totals[guide] += score_value * event_count

    if not counts:
        fail(
            "GA4 returned no guide_rating events. Either nothing has been "
            "collected yet, or the custom dimensions `guide` and `score` have "
            "not been registered in GA4 (Admin -> Custom definitions). Without "
            "them GA4 accepts the event and discards the parameters. "
            f"{OUT.name} has been left untouched."
        )

    # Slugs are URIs minus the suffix, matching the context processor, so a
    # guide and a document template can never collide on a bare stem.
    known = {
        f"{directory}/{path.stem}"
        for directory in ("guides", "docs")
        for path in (CONTENT / directory).glob("*.md")
    }
    unknown = sorted(set(counts) - known)

    today = date.today()
    # Three months, not a year. Ratings are only interesting while they reflect
    # the guide as it currently stands, and a guide rewritten in between has
    # inherited a score for text nobody rated.
    month = today.month + 3
    year = today.year + (month - 1) // 12
    fail_on = date(year, (month - 1) % 12 + 1, 1)

    lines = [
        "# Reader ratings, aggregated from GA4 `guide_rating` events.",
        "#",
        "# GENERATED by scripts/build_ratings_data.py. Run `mise ratings-data`",
        "# rather than editing this by hand.",
        "#",
        "# count and total are stored rather than the mean, so the mean is computed",
        "# once in the context processor instead of being a figure typed into a file.",
        f"# Guides below {MIN_RATINGS} votes are published without a score.",
        "",
        "meta:",
        f"    as_of: {today.isoformat()}",
        "    source: >-",
        "        Google Analytics 4 `guide_rating` events, collected by",
        "        templates/js/components/guide-rating.mjs and aggregated by",
        "        scripts/build_ratings_data.py.",
        "    sampling: >-",
        "        Readers are asked only after reaching the end of a guide, only a random",
        "        fraction of them, and at most once in thirty days each. These are",
        "        therefore self-selected volunteers, not a representative sample of",
        "        readers, and the mean should be read as such.",
        f"    last_verified: {today.isoformat()}",
        f"    fail_on: {fail_on.isoformat()}",
        "",
        "guides:",
    ]

    for guide in sorted(counts):
        lines.append(f"    {guide}:")
        lines.append(f"        count: {counts[guide]}")
        lines.append(f"        total: {totals[guide]}")

    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")

    rated = sum(1 for g in counts if counts[g] >= MIN_RATINGS)
    print(f"ratings: wrote {OUT.relative_to(CONTENT.parent)}")
    print(f"  {len(counts)} guides with votes, {rated} at or above {MIN_RATINGS}")
    print(f"  {sum(counts.values())} votes in total")
    if skipped:
        print(f"  {skipped} rows skipped as unusable")
    if unknown:
        print(f"  {len(unknown)} slugs no longer match a guide: {', '.join(unknown[:5])}")
        print("  (a renamed or deleted guide - harmless, but its votes are now orphaned)")


if __name__ == "__main__":
    main()
