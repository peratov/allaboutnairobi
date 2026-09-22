"""
Turn content/collections.yaml into first-class entries.

A collection is a curated, nested reading order over the guides - "Housing in
Accra", "Money in Ghana". Each one becomes a real entry at /collections/<id>,
and every guide it mentions gets a back-reference, which is what renders the
"Related guides" block at the bottom of a page.
"""

from pathlib import Path
from typing import Any

import yaml
from ursus.config import config
from ursus.context_processors import (
    Context,
    Entry,
    EntryContextProcessor,
    EntryURI,
)
from ursus.context_processors.get_entries import get_entries

from extensions.context_processors.site_dates import entry_date


def parse_collections(entry_uri: str) -> dict[EntryURI, Entry]:
    raw = yaml.safe_load((config.content_path / entry_uri).read_text(encoding="utf-8"))

    collections: dict[EntryURI, Entry] = {}
    for collection in raw:
        uri = EntryURI((Path(entry_uri).parent / "collections" / collection["id"]).as_posix())
        collection["url"] = f"{config.site_url}/{uri}"
        collections[uri] = Entry(collection)

    return collections


def entries_in_collection(collection: Entry) -> list[EntryURI]:
    """Every entry URI a collection references, at any depth, in reading order."""
    uris: list[EntryURI] = []

    def traverse(items: list[dict[str, Any]]) -> None:
        for item in items:
            if "uri" in item:
                uris.append(EntryURI(item["uri"]))
            if "entries" in item:
                traverse(item["entries"])

    traverse(collection.get("entries", []))
    return uris


class CollectionsProcessor(EntryContextProcessor):
    def process(self, context: Context, changed_files: set[Path] | None = None) -> None:
        super().process(context, changed_files)

        for entry in context["entries"].values():
            entry.pop("collections", None)

        for collection in get_entries(context["entries"], "collections"):
            for entry_uri in entries_in_collection(collection):
                entry = context["entries"].get(entry_uri)
                if entry is None:
                    # A collection pointing at a guide that does not exist is a
                    # content bug, not a crash. The CollectionCoverageLinter
                    # reports it with a file and line number.
                    continue
                entry.setdefault("collections", []).append(collection)

        # A collection has no date of its own - it is a list. Its date is the
        # newest thing on the list. Using the build time instead, which is what
        # this did before, put a fresh `lastmod` on fourteen sitemap entries
        # every deploy, which is how a site teaches Google to stop believing
        # its own dates.
        for collection in get_entries(context["entries"], "collections"):
            dates = [
                d
                for d in (
                    entry_date(context["entries"][uri])
                    for uri in entries_in_collection(collection)
                    if uri in context["entries"]
                )
                if d
            ]
            if dates:
                collection["date_updated"] = max(dates)

            # How many guides are actually in it. Counted here because doing it
            # in Jinja means a recursive macro, and the index wants the number
            # beside every heading so a reader can see the shape of the site
            # before scrolling into it.
            collection["entry_count"] = len(entries_in_collection(collection))

    def process_entry(self, context: Context, entry_uri: EntryURI) -> None:
        if Path(entry_uri).name == "collections.yaml":
            context["entries"].update(parse_collections(entry_uri))
