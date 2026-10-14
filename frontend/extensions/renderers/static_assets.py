"""
Copy the templates directory's static files to the site, minus the ones only
the build reads.

Ursus copies every file under templates/ that is not a Jinja template. Two
kinds were being published that no browser ever asks for:

- css/style.scss, the stylesheet's source. The {% scss %} tag in _layout.html
  compiles it into each page; the file itself was served at /css/style.scss.
- js/tools/*.metadata.json, the label and description of each calculator,
  which the {% tool %} tag reads at build time for the ARIA attributes and the
  <noscript> fallback.
"""

from pathlib import Path

from ursus.renderers.static import StaticAssetRenderer


class PublicAssetRenderer(StaticAssetRenderer):
    ignored_suffixes = (".jinja", ".scss")

    def get_files_to_copy(self, changed_files: set[Path] | None = None) -> list[tuple[Path, Path]]:
        return [
            (source, target)
            for source, target in super().get_files_to_copy(changed_files)
            if not target.name.endswith(".metadata.json")
        ]
