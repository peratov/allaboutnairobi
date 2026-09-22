"""
Write the glossary out as a single JSON file for tooltips.

Guides are dense with terms - a paragraph about registering a business can
touch ORC, TIN, GRA and stamp duty in two sentences. Inlining a definition for
each one on every page would add several kilobytes to every request. One
cacheable file, fetched the first time a reader hovers a term, is cheaper on a
Ghanaian data bundle and stays warm for the rest of the visit.
"""

import json
import logging
from pathlib import Path

from ursus.config import config
from ursus.context_processors import Context
from ursus.renderers import Renderer

logger = logging.getLogger(__name__)

OUTPUT_PATH = Path("api/glossary.json")


class GlossaryJsonRenderer(Renderer):
    def render(self, context: Context, changed_files: set[Path] | None = None) -> set[Path]:
        # Keyed by slug, because the browser looks a term up from the href of
        # the link under the cursor and that is all it has.
        terms = context.get("glossary_by_slug", {})

        absolute_path = config.output_path / OUTPUT_PATH
        absolute_path.parent.mkdir(parents=True, exist_ok=True)

        logger.info("Generating glossary tooltips at %s", OUTPUT_PATH)
        absolute_path.write_text(
            json.dumps(terms, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )

        return {OUTPUT_PATH}
