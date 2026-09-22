"""
Write the Atom feed at /feed.xml.

Atom rather than RSS 2.0. Every reader has spoken both for twenty years, so
the choice is not about support: Atom requires a stable per-entry `<id>` and
uses RFC 3339 dates, where RSS leaves the identifier optional and dates in
RFC 822, which is the pair of things feeds usually get wrong.

What is in it, and what is not:

  - newsletter issues first, since a feed reader subscribing to a site with a
    monthly newsletter is subscribing to the newsletter.
  - guides, calculators and document templates. These are the things a
    subscriber wants to hear about.
  - not the glossary. Seventy-seven one-paragraph definitions would bury the
    guides they exist to support.
  - not collections. They are navigation over content that is already here,
    so a new one is not new writing.

Summaries, not full text. The guides embed calculators as custom elements and
lean on glossary tooltips, neither of which survives a feed reader - a
full-content feed would ship empty boxes where the salary calculator should
be. The summary is the same sentence the search results and the cards use.

Like the sitemap, the dates come from the content and never from the clock:
see extensions/context_processors/site_dates.py for why.
"""

import logging
from datetime import date, datetime
from pathlib import Path
from xml.sax.saxutils import escape

from ursus.config import config
from ursus.context_processors import Context
from ursus.renderers import Renderer

from extensions.context_processors.site_dates import entry_date

logger = logging.getLogger(__name__)

OUTPUT_PATH = Path("feed.xml")

# Everything else is either reference material or navigation.
SECTIONS = ("newsletter", "guides", "tools", "docs")

# No cap. Eighty-one summaries is about 40KB, and every guide currently shares
# one of two dates, so any cap would cut the list alphabetically rather than by
# recency - which is not what a cap is for. Add one here once the dates spread
# out and the archive is long enough to be worth trimming.
MAX_ENTRIES = None


def timestamp(value: date) -> str:
    """RFC 3339. Content is dated to the day, so the feed says midnight UTC."""
    if isinstance(value, datetime):
        return value.astimezone().isoformat()
    return f"{value.isoformat()}T00:00:00Z"


class AtomFeedRenderer(Renderer):
    def render(self, context: Context, changed_files: set[Path] | None = None) -> set[Path]:
        origin = str(context.get("CANONICAL_ORIGIN", "")).rstrip("/")
        if not origin:
            raise ValueError(
                "CANONICAL_ORIGIN is empty. Atom entry ids must be absolute "
                "IRIs, so there is nothing useful to write."
            )

        site_url = context.get("SITE_URL") or ""

        items = []
        for entry_uri, entry in context["entries"].items():
            section = entry_uri.split("/")[0]
            if section not in SECTIONS or "/" not in entry_uri:
                continue

            url = entry.get("url")
            published = entry_date(entry)
            if not url or not published:
                continue

            # A newsletter issue's number lives in its front matter rather than
            # its title, because the archive and the issue page both show it
            # separately. A feed reader has neither, so it goes back on here -
            # "What this is" on its own tells a subscriber nothing.
            title = entry.get("title") or entry_uri
            if section == "newsletter" and entry.get("issue"):
                title = f"Issue {int(entry['issue']):02d}: {title}"

            items.append({
                "url": origin + url[len(site_url):],
                "title": title,
                "summary": entry.get("description") or "",
                "date": published,
                "section": section,
                "collections": [
                    c.get("title") for c in entry.get("collections", []) if c.get("title")
                ],
            })

        if not items:
            raise ValueError("The feed came out empty. Nothing was rendered.")

        # Newest first, then by title so that entries sharing a date - which,
        # right now, is all of them - come out in a stable order between builds.
        items.sort(key=lambda i: (i["date"], i["title"]), reverse=True)
        if MAX_ENTRIES:
            items = items[:MAX_ENTRIES]

        # The feed is as fresh as its freshest entry, and no fresher.
        updated = max(item["date"] for item in items)

        name = context["SITE_NAME"]
        lines = [
            '<?xml version="1.0" encoding="utf-8"?>',
            '<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="en-GH">',
            f"\t<title>{escape(name)}</title>",
            f'\t<subtitle>{escape(context["SITE_TAGLINE"])}</subtitle>',
            f"\t<id>{escape(origin)}/</id>",
            f'\t<link rel="alternate" type="text/html" href="{escape(origin)}/"/>',
            f'\t<link rel="self" type="application/atom+xml" href="{escape(origin)}/{OUTPUT_PATH.as_posix()}"/>',
            f"\t<updated>{timestamp(updated)}</updated>",
            f"\t<icon>{escape(origin)}/staticimages/favicon.svg</icon>",
            f"\t<logo>{escape(origin)}/staticimages/og-image.png</logo>",
            "\t<author>",
            f"\t\t<name>{escape(name)}</name>",
            f'\t\t<email>{escape(context["CONTACT_EMAIL"])}</email>',
            f"\t\t<uri>{escape(origin)}/about</uri>",
            "\t</author>",
        ]

        for item in items:
            lines.append("\t<entry>")
            lines.append(f'\t\t<title>{escape(item["title"])}</title>')
            lines.append(f'\t\t<id>{escape(item["url"])}</id>')
            lines.append(f'\t\t<link rel="alternate" type="text/html" href="{escape(item["url"])}"/>')
            lines.append(f'\t\t<published>{timestamp(item["date"])}</published>')
            lines.append(f'\t\t<updated>{timestamp(item["date"])}</updated>')
            for term in [item["section"], *item["collections"]]:
                lines.append(f'\t\t<category term="{escape(term, {chr(34): "&quot;"})}"/>')
            lines.append(f'\t\t<summary type="text">{escape(item["summary"])}</summary>')
            lines.append("\t</entry>")

        lines.append("</feed>")

        absolute_output = config.output_path / OUTPUT_PATH
        absolute_output.parent.mkdir(parents=True, exist_ok=True)
        absolute_output.write_text("\n".join(lines) + "\n", encoding="utf-8")

        logger.info("Generating %s with %d entries", OUTPUT_PATH, len(items))

        return {OUTPUT_PATH}
