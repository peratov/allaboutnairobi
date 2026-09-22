"""
Stamp a version onto every JavaScript URL.

Fixing the cache header was necessary and not sufficient. `immutable` is sticky:
a browser that already cached /js/components/accra-map.mjs under
`max-age=31536000, immutable` will keep serving it from disk for a year, and no
header sent later can reach it. Changing the header only helps clients that had
not cached it yet.

Changing the URL reaches everyone, because the HTML that names it is revalidated
on every visit. So each reference becomes:

    /js/components/accra-map.mjs?v=<commit>

which is a URL no browser has ever seen, and therefore has to fetch.

It has to rewrite the modules too, not only the HTML. `accra-map.mjs` imports
`/js/utils/format.mjs` by an absolute path of its own; version the entry point
alone and the dependencies keep coming from the poisoned cache.

Runs last, and returns no files: every path it touches is already owned by the
renderer that wrote it, so nothing here should affect stale-file collection.
"""

import logging
import re
from pathlib import Path

from ursus.config import config
from ursus.context_processors import Context
from ursus.renderers import Renderer

logger = logging.getLogger(__name__)

# Absolute paths to things the deploy changes and the filename does not:
# JavaScript modules, and the data files they fetch. Both were being served
# with a long cache under a stable name, so both need the URL to move.
#
# /geo/accra-map.json matters as much as the code - shipping a map layer means
# shipping new data, and versioning only the module leaves it reading a cached
# file that has never heard of it.
VERSIONED = re.compile(r"(/(?:js|geo|api)/[A-Za-z0-9._/-]+\.(?:mjs|json))(?!\?)")


class AssetVersionRenderer(Renderer):
    def render(self, context: Context, changed_files: set[Path] | None = None) -> set[Path]:
        version = str(context.get("commit_id") or "dev")[:12]
        replacement = r"\1?v=" + version

        patched = 0
        for pattern in ("**/*.html", "js/**/*.mjs"):
            for path in config.output_path.glob(pattern):
                text = path.read_text(encoding="utf-8")
                stamped, count = VERSIONED.subn(replacement, text)
                if count:
                    path.write_text(stamped, encoding="utf-8")
                    patched += count

        logger.info("Stamped %d asset URLs with v=%s", patched, version)
        return set()
