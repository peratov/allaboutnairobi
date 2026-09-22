"""Make sure collections.yaml and the guides on disk agree with each other."""

import logging
from pathlib import Path

import yaml
from ursus.config import config
from ursus.linters import Linter, LinterResult

from extensions.context_processors.collections import entries_in_collection

COLLECTIONS_FILE = "collections.yaml"

# Pages that deliberately sit outside the reading order
UNCOLLECTED_ALLOWLIST = {
    "about.md",
    "contact.md",
    "terms.md",
}


class CollectionCoverageLinter(Linter):
    """
    Two failure modes, both reported against collections.yaml:

      * a collection points at a guide that does not exist (dead menu entry)
      * a guide exists but no collection mentions it (orphan page, reachable
        only through search)
    """

    def lint(self, file_path: Path) -> LinterResult:
        if file_path.name != COLLECTIONS_FILE:
            return

        collections_path = config.content_path / COLLECTIONS_FILE
        raw = yaml.safe_load(collections_path.read_text(encoding="utf-8"))
        lines = collections_path.read_text(encoding="utf-8").splitlines()

        referenced: set[str] = set()
        for collection in raw:
            for uri in entries_in_collection(collection):
                referenced.add(str(uri))

                if not (config.content_path / uri).exists():
                    line_no = next(
                        (i for i, line in enumerate(lines) if uri in line),
                        0,
                    )
                    yield (
                        (line_no, 0, len(lines[line_no]) if line_no < len(lines) else 1),
                        f"Collection '{collection['id']}' points at {uri}, which does not exist.",
                        logging.ERROR,
                    )

        for section in ("guides", "tools", "docs"):
            section_path = config.content_path / section
            if not section_path.is_dir():
                continue
            for markdown_file in sorted(section_path.rglob("*.md")):
                uri = str(markdown_file.relative_to(config.content_path)).replace("\\", "/")
                if uri in referenced or Path(uri).name in UNCOLLECTED_ALLOWLIST:
                    continue
                yield (
                    None,
                    f"{uri} is not in any collection. Nobody will find it except through search.",
                    logging.WARNING,
                )
