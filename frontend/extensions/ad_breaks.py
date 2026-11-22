"""
Where an ad may go inside a page's body - `|ad_breaks(kind)` in a template.

Ads go only *between* sections: before a top-level <h2>, never inside a list,
a table, an admonition, a calculator or a document template. The rules, all
measured in characters of visible text so they hold for any page length:

- not before FIRST characters of reading, so the first screen is the page's
  own, and a reader from a search result sees the answer before an advert;
- at least GAP characters after the previous break;
- at least TAIL characters still to come, so a break never lands just above
  the page's last paragraph (the page ends with its own slot anyway);
- never next to an interactive block - a calculator, a planner, a document
  template - where a mistaken tap would land on the ad (AdSense forbids
  placements that invite accidental clicks);
- at most MAX[kind] breaks.

The filter returns the body cut into parts; the template joins them with the
ad slot between. With ads off the slot renders nothing, so the page is byte
for byte what it was. Anything the parser cannot follow - an unclosed tag in
raw HTML - returns the body whole: no break is better than one inside a table.
"""

from __future__ import annotations

from html.parser import HTMLParser

FIRST = 1200
GAP = 3000
TAIL = 700
MAX = {"guide": 3, "tool": 2, "doc": 1, "issue": 2}

VOID = {
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link",
    "meta", "param", "source", "track", "wbr",
}

# Top-level blocks a reader interacts with. A break is never put beside one.
WIDGET_ATTRS = {
    "data-paperwork", "data-bank-finder", "data-insurance-checker",
    "data-compare", "data-phrasebook", "data-quick-pay", "data-doc-template",
}


class _TopLevel(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.depth = 0
        self.items: list[dict] = []
        self.chars = 0
        self.hidden = 0  # inside <script> or <style>
        self.broken = False

    def _here(self) -> tuple[int, int]:
        return self.getpos()

    def handle_starttag(self, tag, attrs):
        if self.depth == 0:
            self.items.append({
                "tag": tag,
                "attrs": dict(attrs),
                "start": self._here(),
                "chars": self.chars,
            })
        if tag in ("script", "style"):
            self.hidden += 1
        if tag not in VOID:
            self.depth += 1

    def handle_startendtag(self, tag, attrs):
        if self.depth == 0:
            self.items.append({"tag": tag, "attrs": dict(attrs), "start": self._here(), "chars": self.chars})

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        if tag in ("script", "style") and self.hidden:
            self.hidden -= 1
        self.depth -= 1
        if self.depth < 0:
            self.broken = True
            self.depth = 0

    def handle_data(self, data):
        if not self.hidden:
            self.chars += len(" ".join(data.split()))


def _is_widget(item: dict) -> bool:
    tag, attrs = item["tag"], item["attrs"]
    if "-" in tag:  # a custom element: every calculator
        return True
    if tag == "pre" or tag == "form":
        return True
    classes = (attrs.get("class") or "").split()
    if "codehilite" in classes or "tool" in classes:
        return True
    return any(name in attrs for name in WIDGET_ATTRS)


def ad_breaks(html: str, kind: str = "guide") -> list[str]:
    html = str(html)
    limit = MAX.get(kind, 0)
    if not limit:
        return [html]

    parser = _TopLevel()
    try:
        parser.feed(html)
        parser.close()
    except Exception:
        return [html]
    if parser.broken or parser.depth != 0 or not parser.items:
        return [html]

    # (line, column) -> offset into the string.
    line_starts = [0]
    for i, ch in enumerate(html):
        if ch == "\n":
            line_starts.append(i + 1)

    def offset(pos: tuple[int, int]) -> int:
        line, col = pos
        return line_starts[line - 1] + col

    items = parser.items
    total = parser.chars
    widgets = [i for i, item in enumerate(items) if _is_widget(item)]

    cuts: list[int] = []
    last_chars = 0
    for i, item in enumerate(items):
        if len(cuts) >= limit:
            break
        if item["tag"] != "h2" or i == 0:
            continue
        before = item["chars"]
        if before < FIRST or total - before < TAIL:
            continue
        if cuts and before - last_chars < GAP:
            continue
        # Never beside an interactive block, and on a tool page never above
        # the tool: the calculator is what the reader came for.
        if (i - 1) in widgets or (i + 1) in widgets:
            continue
        if kind == "tool" and (not widgets or i < widgets[0]):
            continue
        cuts.append(offset(item["start"]))
        last_chars = before

    if not cuts:
        return [html]
    parts, prev = [], 0
    for cut in cuts:
        parts.append(html[prev:cut])
        prev = cut
    parts.append(html[prev:])
    return parts
