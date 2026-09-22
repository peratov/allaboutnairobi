"""
Jinja extensions: {% tableOfContents %}, {% tool %} and {% glossary %}.
"""

import json
import xml.etree.ElementTree as ET

from jinja2_simple_tags import ContainerTag, InclusionTag, StandaloneTag
from markupsafe import Markup
from ursus.config import config
from ursus.renderers.jinja import ScssLoaderExtension


class TableOfContentsExtension(InclusionTag, StandaloneTag):
    """
    {% tableOfContents %} - render the current entry's headings.

    Ursus already collects `entry.table_of_contents` from the Markdown, so this
    is only a shortcut to a shared template.
    """

    tags = {"tableOfContents"}
    safe_output = True

    def get_template_names(self) -> str:
        return "_blocks/tableOfContents.html"


class GlossaryExtension(ContainerTag):
    """
    {% glossary %}Ghana Card{% endglossary %} - link a term from a template.

    Markdown uses [[Ghana Card]]; templates and tools cannot, so they use this.
    An unknown term renders as plain text rather than a dead link, because a
    missing glossary entry should not take down a build in the middle of the
    night.
    """

    tags = {"glossary"}
    safe_output = True

    def render(self, caller=None):
        term = (caller() if caller else "").strip()
        glossary_terms = self.context.get("glossary_terms", {})
        record = glossary_terms.get(term)

        if not record:
            return term

        description = record.get("description", "")
        element = ET.Element(
            "a",
            {
                "class": "glossary-link",
                "href": record["url"],
                "title": description or term,
            },
        )
        element.text = term
        return ET.tostring(element, encoding="unicode")


class ToolExtension(StandaloneTag):
    """
    {% tool "salary-calculator" %} - embed an interactive calculator.

    All About Berlin mounts Vue components here, compiled with esbuild. This
    site keeps the same authoring interface and the same accessibility
    contract, but the tools are plain ES modules that define a custom element.
    No build step, no framework, and the page still works with JavaScript off -
    which matters a great deal on a Ghanaian mobile data bundle.

    Each tool needs a sibling <tool-name>.metadata.json giving `label` and
    `description`. Those populate the ARIA attributes, the placeholder that
    crawlers see, and the <noscript> fallback.
    """

    tags = {"tool"}
    safe_output = True

    def render(self, component_name: str, **kwargs):
        js_path = f"js/tools/{component_name}.mjs"
        abs_js_path = config.templates_path / js_path
        assert abs_js_path.exists(), f"Tool <{component_name}> does not exist at {abs_js_path}"

        self.environment.js_fragments.add(f"import '/{js_path}';")

        metadata_path = abs_js_path.with_suffix(".metadata.json")
        metadata = json.loads(metadata_path.read_text(encoding="utf-8")) if metadata_path.exists() else {}
        label = metadata.get("label")
        description = metadata.get("description")

        # Microsoft Clarity records session replays, which means every keystroke
        # in a calculator is a candidate for capture. These tools take a salary,
        # a rent, a household budget - and terms.md promises, in as many words,
        # that what you type never leaves your device.
        #
        # Clarity masks input text by default, but that default lives in a
        # dashboard setting somebody can change without ever looking at this
        # repository. Marking the element explicitly keeps the promise a
        # property of the code rather than of a checkbox.
        attrs = {
            "class": "tool",
            "data-tool": component_name,
            "data-clarity-mask": "true",
        }
        if label:
            attrs["aria-label"] = label
        if description:
            attrs["aria-description"] = description

        for attr, value in kwargs.items():
            attr = attr.replace("_", "-")
            if value is True:
                attrs[attr] = attr
            elif value is False:
                continue
            else:
                attrs[attr] = str(value)

        element = ET.Element(component_name, attrs)

        # Everything inside the custom element is the pre-JS state: a heading,
        # a description and a noscript pointer. When the module upgrades the
        # element it replaces this content.
        placeholder = ET.SubElement(element, "div", {"class": "tool-placeholder"})
        if label:
            heading = ET.SubElement(placeholder, "h4")
            heading.text = label
        if description:
            paragraph = ET.SubElement(placeholder, "p")
            paragraph.text = description

        noscript = ET.SubElement(placeholder, "noscript")
        noscript_paragraph = ET.SubElement(noscript, "p")
        noscript_paragraph.text = (
            "This calculator needs JavaScript. The numbers it uses are all "
            "published on this page, so you can also work it out by hand."
        )

        return ET.tostring(element, encoding="unicode")


class PortableScssExtension(ScssLoaderExtension):
    """
    {% scss %} without the byte order mark.

    libsass prefixes its output with U+FEFF whenever the input contains any
    non-ASCII character - which ours does, because the stylesheet uses a real
    arrow glyph in a `content` property.

    Inside an inline <style>, that BOM becomes part of the first selector. The
    rule silently changes from `:root` to `﻿:root`, matches nothing, and
    every custom property in the design system goes undefined. The other 196
    rules still parse, so the page is not obviously broken - it just renders in
    Times New Roman on a transparent background, and the cause is invisible.

    One `lstrip` avoids all of that.
    """

    def render(self, caller):
        return Markup(str(super().render(caller)).lstrip("﻿"))
