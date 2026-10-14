"""
Write every published newsletter issue as email, for the admin to send.

The admin's "Send an issue" takes one of these rather than asking the owner to
paste the issue in again: `api/newsletter-issues.json` carries each issue's
title, number, address and body - the body as the reader sees it on the site,
glossary links and figures included, because it is read out of the rendered
page rather than re-rendered from the Markdown.

Email is not a browser, so the body is cut down on the way out to the tags
every mail client draws - headings, paragraphs, lists, quotes, tables, links,
bold and italics - with no classes, ids or styles. `_news/mail.mjs` adds the
inline styles when it sends, so the look of an email lives in one place.
Everything else - a calculator's custom element, a script, a form, a picture
- is dropped with its contents, and a wrapper (an admonition's box, a table's
scroll wrapper, a currency tag) is unwrapped, keeping its text. Links are made
absolute on CANONICAL_ORIGIN; anything that is not http(s) or mailto loses its
link and keeps its words.

It runs after the Jinja renderer, which is what writes the pages it reads, and
before the asset stamp, which never touches it. It goes under `/api/` like the
other JSON the site serves.
"""

import json
import logging
from html import escape
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin

from ursus.config import config
from ursus.context_processors import Context
from ursus.renderers import Renderer

logger = logging.getLogger(__name__)

OUTPUT_PATH = Path("api/newsletter-issues.json")

KEEP = {"h2", "h3", "h4", "p", "ul", "ol", "li", "blockquote", "hr", "br", "strong", "b", "em", "i",
        "a", "table", "thead", "tbody", "tr", "th", "td", "code"}
# Headings below h3 read as h3 in an email.
RENAME = {"h4": "h3", "b": "strong", "i": "em"}
# Dropped with everything inside them.
DROP = {"script", "style", "noscript", "form", "button", "input", "select", "textarea", "svg", "img",
        "picture", "video", "audio", "iframe", "template", "dialog", "nav"}
VOID = {"br", "hr", "img", "input", "meta", "link", "source", "wbr"}


class ArticleBody(HTMLParser):
    """The inner HTML of `<div class="article-body">`, cut down for email."""

    def __init__(self, origin: str):
        super().__init__(convert_charrefs=False)
        self.origin = origin
        self.depth = 0  # inside the article body, how many open elements deep
        self.dropping = 0  # inside something dropped, how deep
        self.stack: list[str | None] = []  # what each open element wrote, if anything
        self.out: list[str] = []
        self.found = False

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if not self.depth:
            if tag == "div" and "article-body" in (attributes.get("class") or "").split():
                self.depth = 1
                self.found = True
            return
        if tag not in VOID:
            self.depth += 1
        if self.dropping:
            if tag not in VOID:
                self.dropping += 1
            return
        if tag in DROP or tag.endswith("-calculator") or "-" in tag:
            if tag not in VOID:
                self.dropping = 1
            return
        written = None
        if tag in KEEP:
            name = RENAME.get(tag, tag)
            if name == "a":
                href = (attributes.get("href") or "").strip()
                absolute = urljoin(self.origin + "/", href) if href.startswith("/") else href
                if absolute.startswith(("http://", "https://", "mailto:")):
                    self.out.append(f'<a href="{escape(absolute)}">')
                    written = "a"
            else:
                self.out.append(f"<{name}>")
                written = name if tag not in VOID else None
        if tag not in VOID:
            self.stack.append(written)

    def handle_startendtag(self, tag, attrs):
        if self.depth and not self.dropping and tag in ("br", "hr"):
            self.out.append(f"<{tag}>")

    def handle_endtag(self, tag):
        if not self.depth or tag in VOID:
            return
        self.depth -= 1
        if not self.depth:
            return
        if self.dropping:
            self.dropping -= 1
            return
        written = self.stack.pop() if self.stack else None
        if written:
            self.out.append(f"</{written}>")

    def handle_data(self, data):
        if self.depth and not self.dropping:
            self.out.append(escape(data, quote=False))

    def handle_entityref(self, name):
        if self.depth and not self.dropping:
            self.out.append(f"&{name};")

    def handle_charref(self, name):
        if self.depth and not self.dropping:
            self.out.append(f"&#{name};")

    def html(self) -> str:
        text = "".join(self.out)
        # Empty paragraphs left by what was dropped, and runs of blank lines.
        for empty in ("<p></p>", "<p> </p>", "<li></li>"):
            text = text.replace(empty, "")
        lines = [line.strip() for line in text.splitlines()]
        return "\n".join(line for line in lines if line)


class NewsletterIssuesRenderer(Renderer):
    def get_files_to_render(self, context: Context) -> set[Path]:
        return set()

    def render(self, context: Context, changed_files: set[Path] | None = None) -> set[Path]:
        origin = str(context.get("CANONICAL_ORIGIN", "")).rstrip("/")
        site_url = context.get("SITE_URL") or ""
        issues = []
        for entry_uri, entry in context["entries"].items():
            if not entry_uri.startswith("newsletter/") or entry_uri.count("/") != 1:
                continue
            url = entry.get("url")
            if not url or not entry.get("issue"):
                continue
            stem = Path(entry_uri).stem
            page = config.output_path / "newsletter" / f"{stem}.html"
            if not page.exists():
                logger.warning("No rendered page for %s; it is left out of %s", entry_uri, OUTPUT_PATH)
                continue
            parser = ArticleBody(origin)
            parser.feed(page.read_text(encoding="utf-8"))
            if not parser.found:
                raise ValueError(f"{page} has no article-body: the newsletter template changed, and {OUTPUT_PATH} with it")
            created = entry.get("date_created")
            issues.append({
                "slug": stem,
                "issue": int(entry["issue"]),
                "title": entry.get("title") or stem,
                "description": entry.get("description") or "",
                "date": created.strftime("%Y-%m-%d") if created else None,
                "url": origin + url[len(site_url):],
                "html": parser.html(),
            })

        issues.sort(key=lambda i: i["issue"], reverse=True)
        absolute_path = config.output_path / OUTPUT_PATH
        absolute_path.parent.mkdir(parents=True, exist_ok=True)
        absolute_path.write_text(json.dumps({"issues": issues}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        logger.info("Generating %s with %d issues", OUTPUT_PATH, len(issues))
        return {OUTPUT_PATH}
