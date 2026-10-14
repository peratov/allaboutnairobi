"""
The search page's data: every guide, tool, glossary term and newsletter issue,
with just the fields a result needs.

Ursus's LunrIndexRenderer writes the same documents and, beside them, a
serialised Lunr index - 388KB of the file's 431KB. search.mjs has never read
it: it deliberately does not load Lunr, and scores a substring match over the
documents instead (see the comment at the top of that module). So every reader
who opened /search downloaded nine times the data the page used, and every
build spent time building an index nobody queried.

This keeps the same file, the same `documents` and the same choice of entries
- config.lunr_indexes still says which - and leaves the index out.
"""

import json
import logging
from pathlib import Path

from ursus.config import config
from ursus.context_processors import Context
from ursus.renderers.lunr import LunrIndexRenderer

logger = logging.getLogger(__name__)


class SearchDocumentsRenderer(LunrIndexRenderer):
    def render(self, context: Context, changed_files: set[Path] | None = None) -> set[Path]:
        output_path = config.output_path / config.lunr_index_output_path
        if config.fast_rebuilds and output_path.exists():
            return {config.lunr_index_output_path}

        documents = {}
        for index_config in config.lunr_indexes.get("indexes", []):
            for entry_uri, entry in context["entries"].items():
                for _, document in self.get_index_for_entry(index_config, entry_uri, entry):
                    documents[len(documents)] = document

        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(
            json.dumps({"documents": documents}, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
        logger.info("Wrote %d search documents to %s", len(documents), config.lunr_index_output_path)
        return {config.lunr_index_output_path}
