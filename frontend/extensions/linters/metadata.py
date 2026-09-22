"""Front matter linters. Titles and descriptions are what people see in search results."""

import logging
from pathlib import Path

import yaml
from ursus.config import config
from ursus.linters import Linter, LinterResult

# Google truncates around here. Longer is not wrong, it is just invisible.
MAX_DESCRIPTION_LENGTH = 160
MIN_DESCRIPTION_LENGTH = 50
MAX_TITLE_LENGTH = 70


def _read_front_matter(file_path: Path) -> dict | None:
    text = (config.content_path / file_path).read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        return None
    end = text.find("\n---\n", 4)
    if end == -1:
        return None
    return yaml.safe_load(text[4:end]) or {}


class DescriptionLinter(Linter):
    def lint(self, file_path: Path) -> LinterResult:
        if file_path.suffix.lower() != ".md":
            return

        front_matter = _read_front_matter(file_path)
        if front_matter is None:
            yield None, "No YAML front matter. Every page needs a title and a description.", logging.ERROR
            return

        description = front_matter.get("description")

        if not description:
            yield None, "Missing `description`. It is the search result snippet.", logging.ERROR
        elif len(description) > MAX_DESCRIPTION_LENGTH:
            yield (
                None,
                f"`description` is {len(description)} characters. "
                f"Search engines cut it off around {MAX_DESCRIPTION_LENGTH}.",
                logging.WARNING,
            )
        elif len(description) < MIN_DESCRIPTION_LENGTH:
            yield (
                None,
                f"`description` is only {len(description)} characters. Say more.",
                logging.WARNING,
            )


class TitleLengthLinter(Linter):
    def lint(self, file_path: Path) -> LinterResult:
        if file_path.suffix.lower() != ".md":
            return

        front_matter = _read_front_matter(file_path)
        if front_matter is None:
            return

        title = front_matter.get("title")
        if not title:
            yield None, "Missing `title`.", logging.ERROR
            return

        if len(title) > MAX_TITLE_LENGTH and not front_matter.get("short_title"):
            yield (
                None,
                f"`title` is {len(title)} characters and there is no `short_title`. "
                f"Menus and breadcrumbs will look bad.",
                logging.WARNING,
            )
