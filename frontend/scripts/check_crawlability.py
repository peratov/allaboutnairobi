"""
Check the built site the way a crawler would see it.

Run after `mise build`:

    python scripts/check_crawlability.py

The sitemap renderer already refuses to build a page with no canonical, so
that class of mistake never reaches here. What this catches is the class that
does not break anything and quietly costs you traffic:

  - a page in the sitemap that no other page links to. Google finds it in the
    sitemap, notices nothing on the site points at it, and treats it as less
    important than the pages that are linked. Orphans are the usual reason a
    guide sits at "Discovered - currently not indexed" for months.
  - an internal link to a URL that is not in the sitemap
  - a sitemap that is malformed, empty, or missing from robots.txt
  - a feed entry pointing at a page the sitemap does not list, which means
    the feed is advertising something the site does not consider indexable
"""

import re
import sys
import xml.etree.ElementTree as ElementTree
from pathlib import Path
from urllib.parse import urlparse

OUTPUT = Path(__file__).resolve().parent.parent / "output"
SITEMAP_NS = "{http://www.sitemaps.org/schemas/sitemap/0.9}"
ATOM_NS = "{http://www.w3.org/2005/Atom}"

# Real pages that are deliberately not in the sitemap, so a link to one is not
# a broken link.
NOINDEX_PATHS = {
    "/search",
    "/404",
    # Home Ride, served by a rewrite to its own deployment. Ursus does not
    # render it, so the sitemap - which is built from what the pages declare -
    # cannot see it, and a hardcoded entry would undermine that. The guide
    # about it is the indexable surface; the game itself is an application, and
    # a WebGL page was never going to rank on its text.
    "/drive",
}


def sitemap_paths() -> tuple[set[str], str]:
    root = ElementTree.parse(OUTPUT / "sitemap.xml").getroot()
    locs = [el.text or "" for el in root.iter(f"{SITEMAP_NS}loc")]
    if not locs:
        raise SystemExit("sitemap.xml has no <loc> elements")

    origin = "{0.scheme}://{0.netloc}".format(urlparse(locs[0]))
    paths = set()
    for loc in locs:
        parsed = urlparse(loc)
        if not parsed.scheme or not parsed.netloc:
            raise SystemExit(f"sitemap.xml contains a relative URL: {loc}")
        paths.add(parsed.path or "/")
    return paths, origin


def internal_links(origin: str) -> set[str]:
    """Every path linked from the body of some page. The <head> does not count -
    a canonical or a rel=index is not a link a reader can follow."""
    linked: set[str] = set()
    for page in OUTPUT.rglob("*.html"):
        body = page.read_text(encoding="utf-8").split("</head>", 1)[-1]
        for href in re.findall(r'<a\s[^>]*href="([^"#?]+)', body):
            if href.startswith(("http://", "https://")) and not href.startswith(origin):
                continue
            path = urlparse(href).path or "/"
            if not path.startswith("/"):
                continue
            linked.add(path.removesuffix("/") or "/")
    return linked


def feed_paths() -> set[str]:
    """Every page the Atom feed links to."""
    root = ElementTree.parse(OUTPUT / "feed.xml").getroot()
    return {
        urlparse(link.get("href") or "").path
        for entry in root.iter(f"{ATOM_NS}entry")
        for link in entry.findall(f"{ATOM_NS}link")
        if link.get("rel") == "alternate"
    }


def main() -> int:
    if not (OUTPUT / "sitemap.xml").exists():
        raise SystemExit("No output/sitemap.xml. Run `mise build` first.")

    paths, origin = sitemap_paths()
    linked = internal_links(origin)
    problems = 0

    robots = (OUTPUT / "robots.txt").read_text(encoding="utf-8")
    if "sitemap.xml" not in robots.lower():
        print("robots.txt does not point at the sitemap")
        problems += 1

    if not (OUTPUT / "feed.xml").exists():
        print("No output/feed.xml")
        problems += 1
    else:
        stray = sorted(feed_paths() - paths)
        if stray:
            print(f"{len(stray)} feed entries that are not in the sitemap:")
            for path in stray:
                print(f"  {path}")
            problems += len(stray)

    orphans = sorted(p for p in paths if (p.removesuffix("/") or "/") not in linked)
    if orphans:
        print(f"{len(orphans)} indexable pages that nothing links to:")
        for path in orphans:
            print(f"  {path}")
        problems += len(orphans)

    known = {p.removesuffix("/") or "/" for p in paths} | NOINDEX_PATHS
    unlisted = sorted(
        p for p in linked
        if p not in known
        and not Path(p).suffix          # /js/..., /api/..., assets
        and not p.startswith(("/js/", "/api/", "/staticimages/", "/fonts/"))
    )
    if unlisted:
        print(f"{len(unlisted)} internally linked paths that are not in the sitemap:")
        for path in unlisted:
            print(f"  {path}")
        problems += len(unlisted)

    print(
        f"\n{len(paths)} URLs in the sitemap on {origin}, "
        f"{len(paths) - len(orphans)} of them internally linked. "
        f"{len(feed_paths())} in the feed."
    )
    if problems:
        print(f"{problems} problems.")
        return 1
    print("No crawl problems.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
