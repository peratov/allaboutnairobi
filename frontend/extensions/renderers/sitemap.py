"""
Build sitemap.xml from the pages that were actually rendered.

The naive way to write a sitemap is to loop over `context["entries"]`. It is
also wrong here, for two reasons. Half the site is not an entry - the home
page, /guides, /glossary and /tools are standalone templates - and an entry
list cannot tell you whether a page asked not to be indexed. A sitemap built
that way drifts away from the site the moment either of those changes.

So this reads the rendered HTML instead and takes each page at its word:

  - the URL comes from that page's own `<link rel="canonical">`, so the
    sitemap and the canonical tags cannot disagree with each other
  - a page carrying `noindex` is left out, so /search and /404 exclude
    themselves without this file needing to know they exist
  - `lastmod` comes from `<meta name="page-updated">`

A page that is indexable but has no canonical is a bug in the template, not a
page to guess about, and the build stops.

The cost of reading them back is one full pass over the rendered HTML. On Linux
that is about a third of a second. On a Windows machine with Defender running
it is closer to fifteen, because every file was written moments earlier and
gets scanned on first read - which is a property of the machine, not of the
build, and does not happen on the deploy runner.
"""

import logging
import re
from datetime import date
from pathlib import Path
from xml.sax.saxutils import escape

from ursus.config import config
from ursus.context_processors import Context
from ursus.renderers import Renderer

logger = logging.getLogger(__name__)

OUTPUT_PATH = Path("sitemap.xml")

# The <head> is small and the tags are emitted by one template, so a regex is
# honest here in a way it would not be against arbitrary HTML.
CANONICAL_RE = re.compile(r'<link\s+rel="canonical"\s+href="([^"]+)"', re.IGNORECASE)
ROBOTS_RE = re.compile(r'<meta\s+name="robots"\s+content="([^"]*)"', re.IGNORECASE)
UPDATED_RE = re.compile(r'<meta\s+name="page-updated"\s+content="([^"]+)"', re.IGNORECASE)

# 50,000 URLs is the protocol's limit per file. At 181 pages this is a note for
# whoever crosses it, not a live concern.
MAX_URLS = 50_000

# Comfortably past <style>, which currently opens around 2.4KB in.
HEAD_BYTES = 16_384


class SitemapRenderer(Renderer):
    def render(self, context: Context, changed_files: set[Path] | None = None) -> set[Path]:
        origin = str(context.get("CANONICAL_ORIGIN", "")).rstrip("/")
        if not origin:
            raise ValueError(
                "CANONICAL_ORIGIN is empty. A sitemap may only contain absolute "
                "URLs, so there is nothing useful to write."
            )

        fallback_date = context.get("CONTENT_LAST_UPDATED") or date.today()
        rendered: set[Path] = context.get("rendered_pages") or set()

        urls: dict[str, str] = {}
        missing_canonical: list[str] = []

        for output_path in sorted(rendered):
            if output_path.suffix.lower() != ".html":
                continue

            absolute_path = config.output_path / output_path
            if not absolute_path.exists():
                continue

            # Only the top of the <head>. Every tag below is emitted before
            # the inlined stylesheet, which is the bulk of a page - reading
            # the whole file to find something in its first kilobyte cost
            # fifteen seconds a build. Cut at <style> so a guide's prose can
            # say "noindex" without excluding itself.
            with absolute_path.open(encoding="utf-8") as page:
                head = page.read(HEAD_BYTES)
            head = head.split("<style", 1)[0].split("</head>", 1)[0]

            robots = ROBOTS_RE.search(head)
            if robots and "noindex" in robots.group(1).lower():
                continue

            canonical = CANONICAL_RE.search(head)
            if not canonical:
                missing_canonical.append(output_path.as_posix())
                continue

            updated = UPDATED_RE.search(head)
            lastmod = updated.group(1) if updated else fallback_date.isoformat()

            # Two paths resolving to one canonical is not an error - it is the
            # canonical doing its job - but it must appear once.
            urls.setdefault(canonical.group(1), lastmod)

        if missing_canonical:
            raise ValueError(
                "These pages are indexable but declare no canonical URL, so they "
                "cannot go in the sitemap. Give the template a `canonical_path`, "
                "or mark the page noindex:\n  "
                + "\n  ".join(sorted(missing_canonical))
            )

        if not urls:
            raise ValueError("The sitemap came out empty. Nothing was rendered.")

        if len(urls) > MAX_URLS:
            raise ValueError(
                f"{len(urls)} URLs exceeds the {MAX_URLS} a single sitemap may "
                "hold. This now needs splitting behind a sitemap index."
            )

        lines = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ]
        # Shortest path first, so the home page leads and each section's index
        # precedes the pages under it. Crawlers do not care; people reading the
        # file to check something do.
        for url in sorted(urls, key=lambda u: (u.count("/"), u)):
            lines.append("\t<url>")
            lines.append(f"\t\t<loc>{escape(url)}</loc>")
            lines.append(f"\t\t<lastmod>{urls[url]}</lastmod>")
            lines.append("\t</url>")
        lines.append("</urlset>")

        absolute_output = config.output_path / OUTPUT_PATH
        absolute_output.parent.mkdir(parents=True, exist_ok=True)
        absolute_output.write_text("\n".join(lines) + "\n", encoding="utf-8")

        logger.info("Generating %s with %d URLs", OUTPUT_PATH, len(urls))

        return {OUTPUT_PATH}
