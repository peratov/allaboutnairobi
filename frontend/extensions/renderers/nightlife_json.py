"""
Write the venue data the night-out planner needs.

Same arrangement as the district stats: `content/geo/nightlife.yaml` is the one
source of truth, the tools page renders it as HTML for a reader with no
JavaScript, and this emits the same rows as JSON for the planner to score
against.

It goes under `/api/` rather than `/geo/` for the reason indicators.json does:
`VERSIONED` in asset_version.py stamps `?v=<commit>` onto `/js`, `/geo` and
`/api` only, so a file anywhere else could never be cache-busted, and a reader
would keep last month's prices until the filename changed - which it never
does.
"""

import json
import logging
from pathlib import Path

from ursus.config import config
from ursus.context_processors import Context
from ursus.renderers import Renderer

logger = logging.getLogger(__name__)

OUTPUT_PATH = Path("api/nightlife.json")

# What the planner actually scores on. `description`, `address` and `signature`
# are for the page, not the algorithm, and shipping them would put a reader's
# data bundle behind text the tool never reads.
FIELDS = (
    "id",
    "name",
    "area",
    "lat",
    "lng",
    "categories",
    "priceLevel",
    "vibes",
    "opens",
    "closes",
    "days",
    "typicalStayMin",
    "entry",
    "avgDrink",
    "avgFood",
    "minimumSpend",
)


class NightlifeJsonRenderer(Renderer):
    def get_files_to_render(self, context: Context) -> set[Path]:
        return set()

    def render(self, context: Context, changed_files: set[Path] | None = None) -> set[Path]:
        nightlife = context.get("NIGHTLIFE")
        if not nightlife:
            logger.warning("No NIGHTLIFE context; skipping %s", OUTPUT_PATH)
            return set()

        venues = [
            {field: venue[field] for field in FIELDS if field in venue}
            for venue in nightlife.get("venues", [])
        ]

        payload = {
            "meta": {
                "lastVerified": str(nightlife["meta"]["last_verified"]),
                # Carried into the JSON so the tool can say it on screen. A
                # caveat that lives only in the YAML is a caveat nobody reads.
                "basis": nightlife["meta"]["basis"],
            },
            "hotspots": nightlife.get("hotspots", []),
            "venues": venues,
        }

        absolute_path = config.output_path / OUTPUT_PATH
        absolute_path.parent.mkdir(parents=True, exist_ok=True)
        absolute_path.write_text(
            json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )

        logger.info(
            "Generating %s with %d venues (%.1fKB)",
            OUTPUT_PATH,
            len(venues),
            absolute_path.stat().st_size / 1024,
        )

        return {OUTPUT_PATH}
