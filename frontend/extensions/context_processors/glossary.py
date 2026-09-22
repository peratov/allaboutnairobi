"""
Build a lookup of every glossary term, for tooltips and for the {% glossary %} tag.

The glossary is the single most useful thing on a site like this. Someone who
has just landed does not know what SSNIT is, what a chamber and hall is, or
why everyone keeps saying "chale". Every guide can link a term with [[Ghana
Card]] and get a definition on hover without the writer thinking about URLs.
"""

from pathlib import Path

from ursus.context_processors import Context, ContextProcessor
from ursus.context_processors.get_entries import get_entries

from extensions.functions import glossary_slug


class GlossaryProcessor(ContextProcessor):
    def process(self, context: Context, changed_files: set[Path] | None = None) -> None:
        terms: dict[str, dict] = {}
        by_slug: dict[str, dict] = {}

        for entry in get_entries(context["entries"], "glossary"):
            local_term = entry.get("local_term")
            if not local_term:
                continue

            slug = glossary_slug(local_term)
            record = {
                "url": entry.get("url", ""),
                "slug": slug,
                "local_term": local_term,
                "english_term": entry.get("english_term", ""),
                "description": entry.get("description", ""),
                "language": entry.get("language", ""),
            }

            terms[local_term] = record
            by_slug[slug] = record

            # Aliases let a guide write [[MoMo]] or [[mobile money]] and land on
            # the same entry, which matters when a thing has an official name
            # nobody uses and a street name everybody does.
            for alias in entry.get("aliases", []) or []:
                terms.setdefault(alias, record)

        # Two indexes over the same records. The {% glossary %} tag is given a
        # term as written, so it looks up by term. The tooltips have only the
        # href of the link the reader is hovering, so they look up by slug.
        context["glossary_terms"] = terms
        context["glossary_by_slug"] = by_slug
