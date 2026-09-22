"""
A Windows-safe JinjaRenderer.

Ursus 1.6.0 passes template paths to Jinja as `str(Path(...))`. On Linux that
produces "guides/entry.html.jinja"; on Windows it produces
"guides\\entry.html.jinja", and Jinja's FileSystemLoader rejects any name
containing a backslash, so every template in a subdirectory raises
TemplateNotFound.

Template names in Jinja are always "/" separated regardless of platform, so the
fix is one call to Path.as_posix(). Everything else is inherited.
"""

import logging
from pathlib import Path
from typing import Generator

from ursus.config import config
from ursus.context_processors import Context
from ursus.renderers.jinja import JinjaRenderer

logger = logging.getLogger(__name__)


class PortableJinjaRenderer(JinjaRenderer):
    def render_template(
        self, template_path: Path, context: Context, output_path: Path
    ) -> Generator[Path, None, None]:
        logger.info("Rendering %s", str(output_path))

        abs_output_path = config.output_path / output_path
        abs_output_path.parent.mkdir(parents=True, exist_ok=True)

        template = self.template_environment.get_template(Path(template_path).as_posix())
        template.stream(**context).dump(str(abs_output_path), encoding="utf-8")

        yield output_path

    def render(self, context: Context, changed_files: set[Path] | None = None) -> set[Path]:
        """
        Record what was rendered, so the sitemap can be built from it.

        The set returned here is every page this renderer owns - in a fast
        rebuild too, where most of them were not re-rendered. Stale files from
        an earlier build are not in it, which is exactly why the sitemap reads
        this rather than scanning the output directory: at the point renderers
        run, the stale ones are still on disk.
        """
        rendered = super().render(context, changed_files)
        context["rendered_pages"] = rendered
        return rendered
