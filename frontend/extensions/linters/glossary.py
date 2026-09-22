"""
Check that every [[double-bracketed]] term resolves to a glossary entry.

Python-Markdown's wikilinks extension does not verify anything: it takes the
label, hands it to build_wikilinks_url and emits an <a> regardless. A typo, a
renamed entry or a plural nobody registered as an alias all render as a
perfectly ordinary-looking link to a page that does not exist.

Nothing else catches these. InternalLinksLinter reads Markdown link syntax,
and [[Ghana Card]] is not Markdown link syntax.
"""

import logging
import re
from pathlib import Path

from ursus.config import config
from ursus.linters import MatchResult, RegexLinter

from extensions.functions import glossary_slug, glossary_slug_map


class GlossaryLinksLinter(RegexLinter):
    file_suffixes = (".md",)
    regex = re.compile(r"\[\[(?P<label>[^\[\]|\n]+)\]\]")

    def handle_match(self, file_path: Path, match) -> MatchResult:
        label = match.group("label").strip()
        slug = glossary_slug_map().get(label.casefold()) or glossary_slug(label)

        if (config.content_path / "glossary" / f"{slug}.md").exists():
            return

        yield (
            f"[[{label}]] does not resolve to a glossary entry. "
            f"Expected content/glossary/{slug}.md. Either add the entry, fix "
            f"the spelling, or add '{label}' to the aliases of the entry it "
            f"means.",
            logging.ERROR,
        )
