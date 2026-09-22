"""
Work out when the site's content last changed.

Index pages - the home page, /guides, /glossary, /tools - have no date of
their own, but they are not static either: they change whenever a guide is
added or rewritten. Giving them the build timestamp would be easier and
wrong, because every deploy would move the `lastmod` of a page whose content
had not moved at all, and a `lastmod` that always changes is a `lastmod`
Google learns to ignore.

So they get the newest date across all content instead. It only advances when
something was actually written.
"""

from datetime import date, datetime
from pathlib import Path

from ursus.context_processors import Context, ContextProcessor


def entry_date(entry) -> date | None:
    """The date an entry last changed, preferring an explicit update."""
    for field in ("date_updated", "date_created"):
        value = entry.get(field) if hasattr(entry, "get") else None
        if isinstance(value, datetime):
            return value.date()
        if isinstance(value, date):
            return value
    return None


class SiteDatesProcessor(ContextProcessor):
    def process(self, context: Context, changed_files: set[Path] | None = None) -> None:
        dates = [d for d in (entry_date(e) for e in context["entries"].values()) if d]
        context["CONTENT_LAST_UPDATED"] = max(dates) if dates else date.today()
