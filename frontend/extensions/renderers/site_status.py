"""
Write what the admin's Site page shows about the build: every constant and
generated data file with the date it was last checked and the date it expires.

The linters already fail the build on an expired figure; what nobody could see
was what expires *next*. This is that list, with the command that refreshes
each data file, so the owner can re-check a figure before the build stops.

It is a static file at /api/site-status.json rather than an admin route, because
the function cannot read content/ at runtime - nothing there is imported, so
nothing there is in its bundle. Everything in it is public already: the same
names and dates are in the repository.
"""

import json
import logging
from datetime import date
from pathlib import Path

import yaml

from ursus.config import config
from ursus.context_processors import Context
from ursus.renderers import Renderer

from extensions.linters.constants import StaleDataFilesLinter

logger = logging.getLogger(__name__)

OUTPUT_PATH = Path("api/site-status.json")


def _iso(value) -> str | None:
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, str) and value:
        return value[:10]
    return None


class SiteStatusRenderer(Renderer):
    def render(self, context: Context, changed_files: set[Path] | None = None) -> set[Path]:
        content = config.content_path

        constants = []
        raw = yaml.safe_load((content / "constants.yaml").read_text(encoding="utf-8"))
        for name, spec in (raw.get("constants") or {}).items():
            if isinstance(spec, dict):
                constants.append({
                    "name": name,
                    "last_verified": _iso(spec.get("last_verified")),
                    "fail_on": _iso(spec.get("fail_on")),
                })

        files = []
        candidates = sorted((content / "geo").glob("*.yaml")) + [content / f for f in sorted(StaleDataFilesLinter.ROOT_FILES)]
        for path in candidates:
            if not path.exists():
                continue
            data = yaml.safe_load(path.read_text(encoding="utf-8"))
            meta = data.get("meta") if isinstance(data, dict) else None
            if not isinstance(meta, dict) or not meta.get("fail_on"):
                continue
            files.append({
                "file": path.name,
                "last_verified": _iso(meta.get("last_verified")),
                "fail_on": _iso(meta.get("fail_on")),
                "refresh": StaleDataFilesLinter.REFETCH.get(path.name, ""),
            })

        payload = {
            "commit": context.get("commit_id") or "",
            "pages": {
                section: sum(1 for uri in (context.get("entries") or {}) if str(uri).startswith(f"{section}/") and str(uri).endswith(".md"))
                for section in ("guides", "glossary", "tools", "docs", "newsletter")
            },
            "constants": sorted(constants, key=lambda c: c["fail_on"] or "9999"),
            "files": sorted(files, key=lambda f: f["fail_on"] or "9999"),
        }

        absolute_path = config.output_path / OUTPUT_PATH
        absolute_path.parent.mkdir(parents=True, exist_ok=True)
        absolute_path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        logger.info("Generating %s: %d constants, %d data files", OUTPUT_PATH, len(constants), len(files))
        return {OUTPUT_PATH}
