"""
Scheduled publishing, for a static site that cannot publish anything by itself.

The content calendar releases guides week by week, and a guide written early
must not be live early. Three mechanisms, all decided at build time against
one date:

  * **A whole page** carries `publish_on: 2026-10-01` in its front matter.
    Until then `ReleaseProcessor` removes it from the context before anything
    else sees it, so there is no page, no sitemap entry, no search result, no
    feed item, no collection link and no line in llms.txt. It simply does not
    exist yet.

  * **Part of a page** sits between two comments:

        <!-- release: 2026-10-22 -->
        ## A new section
        ...
        <!-- /release -->

    `ReleaseBlockPreprocessor` strips the block, or just the markers, before
    Markdown parses a line. It has to be that early: the table of contents is
    built during parsing and Jinja runs after it, so an `{% if %}` would hide a
    section while its heading stayed in the sidebar, linking to nothing.

    The marker can name a page instead of a date - `<!-- release:
    guides/east-legon-accra.md -->` - and the block then appears on the day
    that page does. That is how a hub links forward to a page that is not out
    yet without the link ever being dead.

    `<!-- until: 2026-10-22 -->` ... `<!-- /until -->` is the other half: text
    shown only *before* that date. An upgrade that rewrites a section puts the
    old version in an `until` block and the new one in a `release` block with
    the same date, and the page changes over on the day with nothing
    duplicated and nothing missing.

  * **Front matter** can be scheduled too, for a retitled page:

        scheduled:
          - on: 2026-11-12
            title: "Moving to Accra: the complete 2026 guide"
            description: ...

    Each override whose date has arrived is applied in order, and sets
    `date_updated` to that date unless it says otherwise, so the page's
    lastmod moves on the day it actually changed.

The date is today, or `RELEASE_DATE=2026-12-15` to build the site as it will
stand on that day. Nothing happens on the release date unless something
rebuilds the site: that is the daily deploy hook in
.github/workflows/refresh-events.yml.
"""

import logging
import os
import re
from datetime import date, datetime, time
from functools import cache
from pathlib import Path

import yaml
from markdown import Extension
from markdown.preprocessors import Preprocessor
from ursus.config import config
from ursus.context_processors import Context, ContextProcessor

logger = logging.getLogger(__name__)

OPEN_RE = re.compile(r"^\s*<!--\s*(release|until):\s*(\S+)\s*-->\s*$")
CLOSE_RE = re.compile(r"^\s*<!--\s*/(release|until)\s*-->\s*$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
FRONT_MATTER_RE = re.compile(r"\A---\s*\n(.*?)\n---\s*\n", re.DOTALL)


def build_date() -> date:
    """The day the site is being built for."""
    override = os.environ.get("RELEASE_DATE", "").strip()
    if override:
        return date.fromisoformat(override)
    return date.today()


def as_date(value) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str) and DATE_RE.match(value.strip()):
        return date.fromisoformat(value.strip())
    return None


def front_matter(path: Path) -> dict:
    match = FRONT_MATTER_RE.match(path.read_text(encoding="utf-8"))
    return (yaml.safe_load(match.group(1)) or {}) if match else {}


@cache
def publish_dates() -> dict[str, date]:
    """Every page that declares `publish_on`, by entry URI. Read once per build."""
    dates = {}
    for path in config.content_path.rglob("*.md"):
        when = as_date(front_matter(path).get("publish_on"))
        if when:
            dates[path.relative_to(config.content_path).as_posix()] = when
    return dates


def page_uri(target: str) -> str:
    """`guides/x.md`, `/guides/x` and `guides/x` all name the same entry."""
    uri = target.strip().lstrip("/")
    return uri if uri.endswith(".md") else f"{uri}.md"


def release_date_of(target: str) -> date | None:
    """The date a marker target goes live. A page with no publish_on is live."""
    when = as_date(target)
    if when:
        return when
    uri = page_uri(target)
    if not (config.content_path / uri).exists():
        raise ValueError(f"A release marker names {target}, which is neither a date nor a page.")
    return publish_dates().get(uri, date.min)


def is_released(target: str) -> bool:
    return release_date_of(target) <= build_date()


class ReleaseBlockPreprocessor(Preprocessor):
    def run(self, lines: list[str]) -> list[str]:
        out: list[str] = []
        hiding_depth = 0   # >0 while inside a block that is not out yet
        stack: list[bool] = []

        for line in lines:
            opened = OPEN_RE.match(line)
            if opened:
                kind, target = opened.groups()
                # A release block shows once its date has come; an until
                # block shows only while it has not.
                visible = is_released(target) if kind == "release" else not is_released(target)
                stack.append((kind, visible))
                if hiding_depth or not visible:
                    hiding_depth += 1
                continue
            closed = CLOSE_RE.match(line)
            if closed:
                if not stack:
                    raise ValueError(f"A <!-- /{closed.group(1)} --> has no matching opening marker.")
                kind, visible = stack.pop()
                if kind != closed.group(1):
                    raise ValueError(f"A <!-- {kind}: ... --> block is closed with <!-- /{closed.group(1)} -->.")
                if hiding_depth:
                    hiding_depth -= 1
                continue
            if not hiding_depth:
                out.append(line)

        if stack:
            raise ValueError(f"A <!-- {stack[-1][0]}: ... --> block is never closed.")
        return out


class ReleaseBlockExtension(Extension):
    def extendMarkdown(self, md):
        # Above html_block (20), which would otherwise stash the comments
        # before this ever saw them.
        md.preprocessors.register(ReleaseBlockPreprocessor(md), "release-blocks", 40)


def override_date(override: dict) -> date | None:
    """
    The `on:` of a scheduled override.

    YAML 1.1, which PyYAML speaks, reads a bare `on` as the boolean True, so
    `on: 2026-11-12` arrives keyed by True rather than by "on". The first
    retitle scheduled with this failed silently for exactly that reason, so
    both spellings are read and a missing date is an error, not a skip.
    """
    return as_date(override.get("on", override.get(True)))


class ReleaseProcessor(ContextProcessor):
    """
    Drops pages that are not out yet and applies scheduled front matter.

    Runs straight after Markdown, before GetEntries and RelatedEntries: a
    `related_guides` list naming an unreleased page would otherwise raise when
    Ursus resolves it, so references to dropped pages are removed as well.
    """

    def process(self, context: Context, changed_files: set[Path] | None = None) -> None:
        today = build_date()
        entries = context["entries"]

        held = sorted(
            uri for uri, entry in entries.items()
            if (when := as_date(entry.get("publish_on"))) and when > today
        )
        for uri in held:
            del entries[uri]
        if held:
            logger.info("Holding %d scheduled pages back until their dates (building for %s)", len(held), today)

        dropped = set(held)
        for uri, entry in entries.items():
            for key in [k for k in entry if k.startswith("related_")]:
                value = entry[key]
                if isinstance(value, list):
                    entry[key] = [v for v in value if v not in dropped]
                elif value in dropped:
                    del entry[key]

            schedule = entry.pop("scheduled", None) if hasattr(entry, "pop") else None
            for override in sorted(schedule or [], key=lambda o: override_date(o) or date.max):
                when = override_date(override)
                if not when:
                    raise ValueError(f"{uri}: a scheduled override has no valid `on:` date: {override!r}")
                if when > today:
                    continue
                fields = {k: v for k, v in override.items() if k not in ("on", True)}
                fields.setdefault("date_updated", when)
                # The same shape Ursus gives front matter dates, or comparing
                # one of these with an unscheduled page's date raises.
                for key, value in fields.items():
                    if key.startswith("date_") and (d := as_date(value)):
                        fields[key] = datetime.combine(d, time.min).astimezone()
                entry.update(fields)
