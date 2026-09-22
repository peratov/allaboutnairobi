"""
Check scheduled publishing, for every date at once.

A build only proves the site is consistent on the day it is built for. The
crawl check will catch a link to an unreleased page, but only on the one date
that build represents - a hub linking to a page due in three weeks passes today
and breaks the day the hub goes live.

So this reads the schedule directly. A link is allowed to point at a page only
if it cannot appear before that page does: the linking page's own `publish_on`,
or the date of any `<!-- release: ... -->` block around the link, has to be on
or after the target's `publish_on`. It also checks the markers themselves -
balanced, and naming a real date or a real page.
"""

import logging
import re
from datetime import date
from pathlib import Path

from ursus.config import config
from ursus.linters import Linter, LinterResult

from extensions.release import (
    CLOSE_RE, OPEN_RE, as_date, front_matter, page_uri, publish_dates, release_date_of,
)

LINK_RE = re.compile(r"\]\((/(?:guides|tools|docs|glossary)/[^)\s#?]+)")


class ReleaseScheduleLinter(Linter):
    def lint(self, file_path: Path) -> LinterResult:
        if file_path.suffix != ".md":
            return

        absolute = config.content_path / file_path
        lines = absolute.read_text(encoding="utf-8").splitlines()
        meta = front_matter(absolute)

        own = as_date(meta.get("publish_on")) or date.min
        if "publish_on" in meta and own is date.min:
            yield ((0, 0, 1), f"publish_on is {meta['publish_on']!r}, which is not a date.", logging.ERROR)

        # Each open block contributes the earliest date its text can appear:
        # a release block its own date, an until block nothing (its text is
        # visible from the start, and hidden later).
        stack: list[date] = []
        for number, line in enumerate(lines):
            opened = OPEN_RE.match(line)
            if opened:
                kind, target = opened.groups()
                try:
                    when = release_date_of(target)
                    stack.append(when if kind == "release" else date.min)
                except ValueError as error:
                    yield ((number, 0, len(line)), str(error), logging.ERROR)
                    stack.append(date.min)
                continue
            if CLOSE_RE.match(line):
                if not stack:
                    yield ((number, 0, len(line)), "This closing marker closes nothing.", logging.ERROR)
                else:
                    stack.pop()
                continue

            visible_from = max([own, *stack])
            for match in LINK_RE.finditer(line):
                target = publish_dates().get(page_uri(match.group(1)))
                if target and target > visible_from:
                    shown = "today" if visible_from == date.min else visible_from.isoformat()
                    yield (
                        (number, match.start(), match.end()),
                        f"Links to {match.group(1)}, which publishes on {target}, from text "
                        f"that is visible from {shown}. Wrap it in "
                        f"<!-- release: {page_uri(match.group(1))} --> ... <!-- /release -->.",
                        logging.ERROR,
                    )

        if stack:
            yield ((len(lines) - 1, 0, 1), "A <!-- release: ... --> block is never closed.", logging.ERROR)
