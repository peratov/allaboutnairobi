"""
Custom Python-Markdown extensions for All About Accra.
"""

import re
from xml.etree.ElementTree import Element

from markdown.extensions import Extension
from markdown.treeprocessors import Treeprocessor


# ==============================================================================
# TABLES
# ==============================================================================


class WrappedTableProcessor(Treeprocessor):
    """
    Wrap every table in a scrollable div.

    Ghanaian tax and fee tables are wide, and most people reading this site are
    on a phone. Without a scroll container the table either overflows the
    viewport or gets squeezed into unreadable columns.
    """

    def __init__(self, md, wrapper_class: str):
        super().__init__(md)
        self.wrapper_class = wrapper_class

    def run(self, root):
        # Snapshot the tree first. root.iter() is lazy, so wrapping a table in
        # a new <div> and inserting it makes the iterator walk straight into
        # that div, find the same table, and wrap it again - forever.
        for parent in list(root.iter()):
            if parent.get("class") == self.wrapper_class:
                continue
            for index, child in enumerate(list(parent)):
                if child.tag == "table":
                    wrapper = Element("div", {"class": self.wrapper_class})
                    parent.remove(child)
                    wrapper.append(child)
                    parent.insert(index, wrapper)


class WrappedTableExtension(Extension):
    def __init__(self, **kwargs):
        self.config = {"wrapper_class": ["table-wrapper", "CSS class of the wrapper div"]}
        super().__init__(**kwargs)

    def extendMarkdown(self, md):
        md.treeprocessors.register(
            WrappedTableProcessor(md, self.getConfig("wrapper_class")), "wrapped-tables", 5
        )


# ==============================================================================
# CURRENCY
# ==============================================================================

# Accra is a two-currency city. Salaries, trotro fares and market prices are in
# cedis; rent in Cantonments, GIPC capital thresholds and immigration penalties
# are quoted in dollars. Readers constantly convert in their heads, so every
# amount is tagged and the front end offers the other currency on hover.

CEDI_PATTERN = re.compile(
    r"(?:GHS|GH¢|₵)\s?(\d[\d,]*(?:\.\d+)?)|(\d[\d,]*(?:\.\d+)?)\s?cedis\b",
    re.IGNORECASE,
)
USD_PATTERN = re.compile(r"(?:US\$|USD\s?|\$)(\d[\d,]*(?:\.\d+)?)")


class CurrencyProcessor(Treeprocessor):
    """Tag currency amounts so the front end can offer a conversion."""

    SKIP_TAGS = {"code", "pre", "script", "style"}

    def run(self, root):
        # Snapshot the tree before touching it. Iterating root.iter() lazily
        # while inserting <span> children means the iterator walks into the
        # spans we just created, matches the amount inside them again, and
        # wraps it forever.
        for parent in list(root.iter()):
            if parent.tag in self.SKIP_TAGS:
                continue
            if "currency" in (parent.get("class") or "").split():
                continue
            self._tag_text(parent)

    def _tag_text(self, parent):
        # Only the element's own text is rewritten. Rebuilding tails would mean
        # rebuilding the whole subtree, and the gain is not worth the bugs.
        if not parent.text:
            return

        matches = list(CEDI_PATTERN.finditer(parent.text)) + list(
            USD_PATTERN.finditer(parent.text)
        )
        if not matches:
            return

        matches.sort(key=lambda m: m.start())

        cursor = 0
        new_text = parent.text
        rebuilt: list = []
        for match in matches:
            if match.start() < cursor:
                continue
            currency = "USD" if match.re is USD_PATTERN else "GHS"
            amount = next(g for g in match.groups() if g is not None)
            rebuilt.append((new_text[cursor : match.start()], match.group(0), currency, amount))
            cursor = match.end()
        trailing = new_text[cursor:]

        if not rebuilt:
            return

        parent.text = rebuilt[0][0]
        insert_at = 0
        for index, (_, literal, currency, amount) in enumerate(rebuilt):
            span = Element(
                "span",
                {
                    "class": "currency",
                    "data-currency": currency,
                    "data-amount": amount.replace(",", ""),
                },
            )
            span.text = literal
            span.tail = rebuilt[index + 1][0] if index + 1 < len(rebuilt) else trailing
            parent.insert(insert_at, span)
            insert_at += 1


class CediExtension(Extension):
    def extendMarkdown(self, md):
        md.treeprocessors.register(CurrencyProcessor(md), "currency", 4)


# ==============================================================================
# LINKS
# ==============================================================================


class ArrowLinkIconProcessor(Treeprocessor):
    """
    Style links that end in an arrow as call-to-action links.

    All About Berlin writes "How to register your address ➞" at the end of a
    section to push the reader onward. The convention carries over; the arrow
    in the source becomes a styled icon rather than a literal character.
    """

    def run(self, root):
        for link in root.iter("a"):
            text = (link.text or "").strip()
            if text.endswith("➞"):
                classes = set(link.get("class", "").split())
                classes.add("next-link")
                link.set("class", " ".join(sorted(classes)))
                link.text = (link.text or "").replace("➞", "").rstrip()


class ArrowLinkIconExtension(Extension):
    def extendMarkdown(self, md):
        md.treeprocessors.register(ArrowLinkIconProcessor(md), "arrow-links", 3)


# ==============================================================================
# CHECKLISTS
# ==============================================================================


class ChecklistLabelProcessor(Treeprocessor):
    """
    Wrap the text of a `- [ ]` item in a <label>, so the text is a click target.

    The tasklist extension emits a bare input followed by loose inline content:

        <li class="checkbox"><input type="checkbox">The <strong>form</strong>...

    Two things are wrong with that. The checkbox is the *only* thing you can
    click, and it renders about 15px square - far below a usable touch target
    on the phone these lists are actually read on. And because the content sits
    loose in the <li>, any attempt to lay the item out with flex or grid treats
    every text run and every <strong> as a separate box; the stylesheet did
    exactly that, and every item containing bold text or a link was shredded
    across a two-column grid.

    Wrapping everything after the input in one <label> fixes both: the label
    makes the whole line clickable with no `id` plumbing needed, and it gives
    the item a single element to lay out instead of a variable number of inline
    fragments.
    """

    def run(self, root):
        # Snapshot, like the table and currency processors - this inserts
        # elements while walking, and root.iter() is lazy.
        for item in list(root.iter("li")):
            if "checkbox" not in (item.get("class") or "").split():
                continue

            children = list(item)
            if not children or children[0].tag != "input":
                continue  # already processed, or not a task item

            box = children[0]
            label = Element("label")

            # The checkbox goes INSIDE the label. That is what associates the
            # two - a sibling label would need an `id` on every checkbox on
            # every page, and ids that have to be unique across a generated
            # site are a collision waiting to happen. It also gives the
            # absolutely positioned checkbox a positioned ancestor to sit in.
            item.remove(box)
            label.append(box)

            # Text that sat immediately after the checkbox stays immediately
            # after it, now as the checkbox's tail inside the label.
            for child in children[1:]:
                item.remove(child)
                label.append(child)

            label.text = item.text
            item.text = None
            item.append(label)


class ChecklistExtension(Extension):
    def extendMarkdown(self, md):
        # After tasklist has created the items, and late enough that the
        # currency and link processors have already tagged their content -
        # moving it into a label does not disturb them.
        md.treeprocessors.register(ChecklistLabelProcessor(md), "checklist-labels", 1)


# ==============================================================================
# EXTERNAL LINKS
# ==============================================================================


class ExternalLinkProcessor(Treeprocessor):
    """
    Mark off-site links.

    Half the sources this site cites are government portals that go down, move
    or serve an expired certificate. Flagging them lets the stylesheet warn the
    reader they are leaving, and lets a link checker find them later.
    """

    def run(self, root):
        for link in root.iter("a"):
            href = link.get("href", "")
            if href.startswith(("http://", "https://")):
                classes = set(link.get("class", "").split())
                classes.add("external-link")
                link.set("class", " ".join(sorted(classes)))
                link.set("rel", "noopener")


class ExternalLinkExtension(Extension):
    def extendMarkdown(self, md):
        md.treeprocessors.register(ExternalLinkProcessor(md), "external-links", 2)
