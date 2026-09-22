"""
Write the district figures the business viability tool needs.

/geo/accra-map.json already carries all of this, and it also carries every
polygon - 112KB of geometry the tool has no use for. So this emits the numbers
alone, about a tenth of the size, for a page that needs to rank districts
rather than draw them.

Derived from the same `MAP` context the map page renders its no-JavaScript
fallback from, which means it cannot drift from the census: `mise census-data`
updates one file and both the map and this follow.
"""

import json
import logging
from pathlib import Path

from ursus.config import config
from ursus.context_processors import Context
from ursus.renderers import Renderer

logger = logging.getLogger(__name__)

OUTPUT_PATH = Path("geo/district-stats.json")

# Only what the scoring actually reads. Adding a field here without using it
# would put weight on a reader's data bundle for nothing.
FIELDS = (
    "id",
    "name",
    "type",
    "capital",
    "population",
    "peoplePerKm2",
    "premisesPerKm2",
    "roadPerKm2",
    "areaKm2",
    "femalePct",
    "under15Pct",
    "over64Pct",
    "unemploymentPct",
    "participationPct",
    "informalPct",
    "rent",
)


class DistrictStatsRenderer(Renderer):
    def render(self, context: Context, changed_files: set[Path] | None = None) -> set[Path]:
        districts = (context.get("MAP") or {}).get("districts") or []

        rows = []
        for district in districts:
            row = {field: district.get(field) for field in FIELDS}
            # A district missing its population cannot be scored, and quietly
            # ranking it last would be worse than leaving it out.
            if row.get("population"):
                rows.append(row)

        missing = len(districts) - len(rows)
        if missing:
            logger.warning("District stats: %d district(s) had no population and were dropped", missing)

        payload = {
            "meta": {
                "source": "Ghana Statistical Service, 2021 Population and Housing Census",
                "note": (
                    "Counts as published, plus rent as a five-way ordinal band from "
                    "listing observation. No figure here is a forecast."
                ),
            },
            "districts": rows,
        }

        absolute_path = config.output_path / OUTPUT_PATH
        absolute_path.parent.mkdir(parents=True, exist_ok=True)
        absolute_path.write_text(
            json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )

        logger.info(
            "Generating %s with %d districts (%.1fKB)",
            OUTPUT_PATH,
            len(rows),
            absolute_path.stat().st_size / 1024,
        )

        return {OUTPUT_PATH}
