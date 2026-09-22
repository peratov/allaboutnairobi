"""Check that every internal link points at something that exists."""

import logging
import re
from pathlib import Path

from ursus.config import config
from ursus.linters import MatchResult, RegexLinter

# Prefixes that map onto real content directories
CONTENT_PREFIXES = ("guides", "glossary", "tools", "docs", "collections")

# Pages that exist as templates rather than as Markdown entries
TEMPLATE_PAGES = {
    "",
    "about",
    "contact",
    "terms",
    "search",
    "map",
    "flights",
    "data",
    # Home Ride, served here by a rewrite to its own deployment rather than
    # built by Ursus - so it is a real URL that will never be in the sitemap.
    "drive",
    "events",
    # Live radio: a template page, with a CSP of its own in vercel.json.
    "radio",
    "offline",
    "newsletter",
    # Generated at the root by the feed renderer rather than by a template.
    "feed.xml",
    "sitemap.xml",
    "robots.txt",
    "guides",
    "glossary",
    "tools",
    "docs",
    "404",
}


class InternalLinksLinter(RegexLinter):
    """
    A dead internal link is a dead end for someone who is already lost.

    Checks Markdown links beginning with "/" against the content directory and
    the known template-rendered pages. Fragments (#anchors) are stripped before
    the check; verifying anchors would mean rendering the target, which the
    linter deliberately does not do.
    """

    file_suffixes = (".md",)
    regex = re.compile(r"\]\((?P<url>/[^)\s]*)(?:\s+\"[^\"]*\")?\)")

    def handle_match(self, file_path: Path, match) -> MatchResult:
        url = match.group("url")

        path = url.split("#", 1)[0].split("?", 1)[0].strip("/")

        if path in TEMPLATE_PAGES:
            return

        # Static assets are copied verbatim by the static renderer
        if path.startswith(("staticimages/", "fonts/", "js/", "api/", "out/")):
            return

        prefix = path.split("/", 1)[0]
        if prefix not in CONTENT_PREFIXES:
            yield (
                f"Link to /{path} does not match any content section "
                f"({', '.join(CONTENT_PREFIXES)}).",
                logging.WARNING,
            )
            return

        # /collections/housing is generated from collections.yaml, not a file
        if prefix == "collections":
            return

        candidate = Path(path)
        if (config.content_path / candidate.with_suffix(".md")).exists():
            return

        yield (
            f"Link to /{path} does not resolve to a file in content/. "
            f"Expected content/{candidate}.md",
            logging.ERROR,
        )
