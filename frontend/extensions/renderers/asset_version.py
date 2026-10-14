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

It also strips the modules' comments and indentation on the way past - see
extensions/jsstrip.py - unless STRIP_JS=0, for reading them in a browser.

Runs last, and returns no files: every path it touches is already owned by the
renderer that wrote it, so nothing here should affect stale-file collection.
"""

import logging
import os
import re
from pathlib import Path

from ursus.config import config
from ursus.context_processors import Context
from ursus.renderers import Renderer

from extensions.jsstrip import strip_js

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

        strip = os.environ.get("STRIP_JS", "1") != "0"
        patched = 0
        before = after = 0
        for pattern in ("**/*.html", "js/**/*.mjs"):
            for path in config.output_path.glob(pattern):
                text = original = path.read_text(encoding="utf-8")
                if strip and path.suffix == ".mjs":
                    text = stripped(text, path)
                    before += len(original.encode())
                    after += len(text.encode())
                text, count = VERSIONED.subn(replacement, text)
                patched += count
                if text != original:
                    path.write_text(text, encoding="utf-8")

        logger.info("Stamped %d asset URLs with v=%s", patched, version)
        if strip:
            logger.info("Stripped the modules from %d to %d bytes", before, after)
        return set()


def stripped(text: str, path: Path) -> str:
    """The module without comments or indentation, or as it was if the
    stripper cannot vouch for its own result - a file it cannot tokenise, or
    one a second pass would change again. A module shipped with its comments
    costs bytes; a module shipped wrong breaks a page."""
    try:
        result = strip_js(text)
        if strip_js(result) == result:
            return result
        logger.warning("Not stripping %s: a second pass changes it", path.name)
    except ValueError as error:
        logger.warning("Not stripping %s: %s", path.name, error)
    return text
