"""
Normalise entry URIs to forward slashes.

Ursus builds each entry's URI with `str(relative_path)`, which yields
"guides\\ghana-card.md" on Windows and "guides/ghana-card.md" everywhere else.
Content authors write forward slashes - in `related_guides`, in
collections.yaml, in every internal link - so on Windows nothing resolves:
related entries raise, and collections silently render empty, which is worse.

An entry URI is a URL path, not a filesystem path, so forward slashes are the
correct form on every platform. This processor runs first and rewrites the keys
before anything else looks at them.
"""

from pathlib import Path
from urllib.parse import quote, unquote

from ursus.config import config
from ursus.context_processors import Context, ContextProcessor


class PortableEntryUrisProcessor(ContextProcessor):
    def process(self, context: Context, changed_files: set[Path] | None = None) -> None:
        entries = context["entries"]

        for uri in list(entries.keys()):
            if "\\" not in uri:
                continue

            posix_uri = uri.replace("\\", "/")
            entry = entries.pop(uri)

            # `entry_uri` is also stored on the entry itself, and templates read it.
            if isinstance(entry, dict) and entry.get("entry_uri") == uri:
                entry["entry_uri"] = posix_uri

            entries[posix_uri] = entry


class PortableEntryUrlsProcessor(ContextProcessor):
    """
    The same problem one layer up, plus escaping.

    Ursus builds each entry's public URL with `str(Path(...))` too, so on
    Windows a glossary entry gets the URL "/glossary\TIN". That is not a
    broken path, it is a broken link in every rendered page, in the JSON-LD,
    and in the search index.

    The URLs also go out raw. Twenty-two glossary terms are two words - "Ghana
    Card", "chamber and hall" - and several are Twi, so their URLs contain
    spaces and non-ASCII characters. Markdown escapes them on the way into an
    href, but nothing escaped `entry.url`, which is what the canonical tag, the
    sitemap and the structured data are built from. A <loc> containing a
    literal space is not a valid sitemap entry, and a canonical containing one
    is not a valid URL.

    Runs after the Markdown processor has set them.
    """

    def process(self, context: Context, changed_files: set[Path] | None = None) -> None:
        origin = config.site_url or ""

        for entry in context["entries"].values():
            url = entry.get("url") if hasattr(entry, "get") else None
            if not isinstance(url, str):
                continue

            path = url[len(origin):].replace("\\", "/")

            # unquote first so a rebuild in watch mode, which sees URLs this
            # already escaped, does not turn %20 into %2520.
            escaped = quote(unquote(path), safe="/")

            if origin + escaped != url:
                entry["url"] = origin + escaped
