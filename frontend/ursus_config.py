"""
All About Nairobi - Ursus configuration.

Ursus turns `content/` (Markdown + YAML) plus `templates/` (Jinja2) into a
static site in `output/`. Constants come from content/constants.yaml and the
map data from content/geo/map-summary.yaml, which scripts/build_nairobi_map.py
generates.
"""

import logging
import os
import subprocess
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import yaml
from ursus.config import config

from extensions.context_processors.hero_map import build_hero_map
from extensions.functions import (
    build_wikilinks_url,
    get_public_holidays,
    glossary_groups,
    load_constants_from_file,
    or_list,
    patched_slugify,
    random_id,
    slugify_plain,
    to_compact,
    to_count,
    to_number,
    to_percent,
    to_shillings,
    to_usd,
)


def env_str(name: str, default: str = "") -> str:
    """An environment variable, treating an empty value as unset."""
    return (os.environ.get(name) or "").strip() or default


def load_yaml(relative: str, fallback):
    path = config.content_path / relative
    try:
        return yaml.safe_load(path.read_text(encoding="utf-8")) or fallback
    except FileNotFoundError:
        logging.warning("%s is missing; using an empty placeholder", relative)
        return fallback


config.content_path = Path(__file__).parent / "content"
config.templates_path = Path(__file__).parent / "templates"

ctx: dict = {}
ctx.update(load_constants_from_file(config.content_path / "constants.yaml"))

# PAYE as a list, for tables. Built from the constants so the bands are typed once.
ctx["PAYE_BANDS"] = [
    {"from": 0, "to": ctx["PAYE_BAND_1_LIMIT"], "rate": ctx["PAYE_RATE_1"]},
    {"from": ctx["PAYE_BAND_1_LIMIT"] + 1, "to": ctx["PAYE_BAND_2_LIMIT"], "rate": ctx["PAYE_RATE_2"]},
    {"from": ctx["PAYE_BAND_2_LIMIT"] + 1, "to": ctx["PAYE_BAND_3_LIMIT"], "rate": ctx["PAYE_RATE_3"]},
    {"from": ctx["PAYE_BAND_3_LIMIT"] + 1, "to": ctx["PAYE_BAND_4_LIMIT"], "rate": ctx["PAYE_RATE_4"]},
    {"from": ctx["PAYE_BAND_4_LIMIT"] + 1, "to": None, "rate": ctx["PAYE_TOP_RATE"]},
]

# The figures the calculators need, handed to the browser as JSON by the tool
# pages, so a calculator can never disagree with the guide that explains it.
ctx["TOOL_CONSTANTS"] = {
    name: float(ctx[name]) for name in (
        "PAYE_BAND_1_LIMIT", "PAYE_BAND_2_LIMIT", "PAYE_BAND_3_LIMIT", "PAYE_BAND_4_LIMIT",
        "PAYE_RATE_1", "PAYE_RATE_2", "PAYE_RATE_3", "PAYE_RATE_4", "PAYE_TOP_RATE",
        "PERSONAL_RELIEF_MONTHLY", "NSSF_RATE", "NSSF_LOWER_EARNINGS_LIMIT", "NSSF_UPPER_EARNINGS_LIMIT",
        "SHIF_RATE", "SHIF_MINIMUM", "HOUSING_LEVY_RATE", "VAT_RATE",
        "NAIROBI_MIN_WAGE_GENERAL_LABOURER", "HOUSING_ALLOWANCE_RATE",
        "STAMP_DUTY_URBAN", "STAMP_DUTY_RURAL", "MRI_RATE", "MRI_LOWER_LIMIT", "MRI_UPPER_LIMIT",
        "CAR_IMPORT_DUTY_RATE", "CAR_IDF_RATE", "CAR_RDL_RATE", "SEVERANCE_DAYS_PER_YEAR", "ANNUAL_LEAVE_DAYS",
        "NOTICE_DAYS_MONTHLY_PAID", "INTEREST_WHT_RATE", "NORMAL_WEEKLY_HOURS", "OVERTIME_RATE_NORMAL",
        "OVERTIME_RATE_REST_DAY",
    )
}

# Site essentials
ctx["SITE_NAME"] = "All About Nairobi"
ctx["SITE_TAGLINE"] = "Free guides and tools for living in Nairobi"
ctx["SITE_DESCRIPTION"] = (
    "Practical, sourced guides to living in Nairobi: visas, housing, tax, "
    "M-Pesa, transport, health and schools, plus an interactive map of the city."
)
ctx["CANONICAL_DOMAIN"] = env_str("DOMAIN", "www.allaboutnairobi.com")
ctx["CANONICAL_ORIGIN"] = f"https://{ctx['CANONICAL_DOMAIN']}"
ctx["SITE_URL"] = env_str("SITE_URL", "")
ctx["CONTACT_EMAIL"] = env_str("CONTACT_EMAIL", "hello@allaboutnairobi.com")
ctx["X_HANDLE"] = env_str("X_HANDLE", "AllAboutNairobi")
ctx["X_URL"] = f"https://x.com/{ctx['X_HANDLE']}"
ctx["SUPPORT_URL"] = env_str("SUPPORT_URL", "https://buymeacoffee.com/allaboutnairobi")

# Analytics are off unless this site's own IDs are configured.
ctx["GA_MEASUREMENT_ID"] = env_str("GA_MEASUREMENT_ID", "G-G0SGZ244K0")
ctx["CLARITY_PROJECT_ID"] = env_str("CLARITY_PROJECT_ID", "ymtnkudhcj")
# Analytics load only on the production deployment, so local builds and
# Vercel preview deploys never record sessions.
ctx["IS_PRODUCTION"] = env_str("VERCEL_ENV") == "production" or env_str("FORCE_ANALYTICS") == "1"
ctx["GOOGLE_SITE_VERIFICATION"] = env_str("GOOGLE_SITE_VERIFICATION")
ctx["BING_SITE_VERIFICATION"] = env_str("BING_SITE_VERIFICATION")

ctx["NEWSLETTER_ACTION"] = env_str("NEWSLETTER_ACTION")
ctx["NEWSLETTER_FIELD"] = env_str("NEWSLETTER_FIELD", "email")
ctx["NEWSLETTER_PROVIDER"] = env_str("NEWSLETTER_PROVIDER", "the email service that runs the list")

# Time
ctx["now"] = datetime.now(ZoneInfo("Africa/Nairobi"))
ctx["current_year"] = date.today().year
ctx["CONTENT_LAST_UPDATED"] = date.today()

_today = date.today()
ctx["UPCOMING_HOLIDAYS"] = [
    (day, name) for day, name in get_public_holidays([_today.year, _today.year + 1]).items()
    if _today <= day < _today.replace(year=_today.year + 1)
]

# Data
ctx["MAP"] = load_yaml("geo/map-summary.yaml", {})
ctx["HERO_MAP"] = build_hero_map()
ctx["FLIGHTS"] = load_yaml("geo/flights-summary.yaml", {"destinations": [], "airlines": []})
ctx["RADIO"] = load_yaml("geo/radio.yaml", {"stations": [], "meta": {}})

ctx["glossary_groups"] = glossary_groups
ctx["random_id"] = random_id
ctx["or_list"] = or_list

commit_id = env_str("VERCEL_GIT_COMMIT_SHA") or env_str("GITHUB_SHA")
if not commit_id:
    try:
        commit_id = subprocess.check_output(["git", "rev-parse", "HEAD"], stderr=subprocess.DEVNULL).decode().strip()
    except Exception:
        commit_id = "development"
ctx["commit_id"] = commit_id


# ==============================================================================
# URSUS
# ==============================================================================

config.site_url = ctx["SITE_URL"]
# Absolute, because Ursus's static renderer rejects a relative output path.
config.output_path = Path(env_str("URSUS_OUTPUT_DIR") or (Path(__file__).parent / "output")).resolve()
config.html_url_extension = ""
config.minify_js = False
config.minify_css = True

config.context_globals = ctx
config.jinja_filters = {
    "shillings": to_shillings,
    "usd": to_usd,
    "percent": to_percent,
    "number": to_number,
    "count": to_count,
    "compact": to_compact,
    "slug": slugify_plain,
}

# CSS is inlined through {% scss %} in _layout.html, so the standalone Sass
# renderer has nothing to do.
config.renderers.remove("ursus.renderers.sass.SassRenderer")

# Ursus hands Jinja backslash-separated template names on Windows, which its
# loader rejects. See extensions/renderers/portable_jinja.py.
config.renderers[config.renderers.index("ursus.renderers.jinja.JinjaRenderer")] = (
    "extensions.renderers.portable_jinja.PortableJinjaRenderer"
)
config.renderers.append("extensions.renderers.glossary_json.GlossaryJsonRenderer")
config.renderers.append("extensions.renderers.feed.AtomFeedRenderer")
# Last: it reads the HTML the Jinja renderer just wrote.
config.renderers.append("extensions.renderers.sitemap.SitemapRenderer")

# libsass emits a BOM that silently kills the first CSS rule. See the class.
config.jinja_extensions[
    config.jinja_extensions.index("ursus.renderers.jinja.ScssLoaderExtension")
] = "extensions.renderers.jinja.PortableScssExtension"
config.jinja_extensions.extend([
    "extensions.renderers.jinja.TableOfContentsExtension",
    "extensions.renderers.jinja.GlossaryExtension",
    "extensions.renderers.jinja.ToolExtension",
])

# Must run before anything reads an entry URI. See the module docstring.
config.context_processors.insert(0, "extensions.context_processors.portable_uris.PortableEntryUrisProcessor")
config.context_processors.extend([
    "extensions.context_processors.portable_uris.PortableEntryUrlsProcessor",
    "extensions.context_processors.collections.CollectionsProcessor",
    "extensions.context_processors.glossary.GlossaryProcessor",
    "extensions.context_processors.site_dates.SiteDatesProcessor",
    "extensions.context_processors.events.EventsProcessor",
])

# Markdown links stay root-relative, so local previews work.
del config.markdown_extensions["base_url"]
config.markdown_extensions["toc"]["slugify"] = patched_slugify
config.markdown_extensions["wikilinks"]["base_url"] = f"{config.site_url}/glossary/"
config.markdown_extensions["wikilinks"]["build_url"] = build_wikilinks_url
config.markdown_extensions["wikilinks"]["html_class"] = "glossary-link"
config.markdown_extensions["tasklist"]["list_item_class"] = "checkbox"
config.add_markdown_extension("markdown.extensions.attr_list")
config.add_markdown_extension("markdown.extensions.def_list")
config.add_markdown_extension("markdown.extensions.abbr")
config.add_markdown_extension("extensions.markdown:WrappedTableExtension", {"wrapper_class": "table-wrapper"})
config.add_markdown_extension("extensions.markdown:ArrowLinkIconExtension")
config.add_markdown_extension("markdown.extensions.admonition")
config.add_markdown_extension("extensions.markdown:ExternalLinkExtension")
config.add_markdown_extension("extensions.markdown:ChecklistExtension")

config.linters = [
    "extensions.linters.internal_links.InternalLinksLinter",
    "extensions.linters.glossary.GlossaryLinksLinter",
    "extensions.linters.metadata.DescriptionLinter",
    "extensions.linters.metadata.TitleLengthLinter",
    "ursus.linters.markdown.MarkdownLinkTextsLinter",
]

config.lunr_indexes = {
    "indexed_fields": ("title", "short_title", "description", "local_term", "english_term", "language"),
    "indexes": [
        {"uri_pattern": "guides/*.md", "returned_fields": ("title", "short_title", "url"), "boost": 2},
        {"uri_pattern": "tools/*.md", "returned_fields": ("title", "short_title", "url"), "boost": 2},
        {"uri_pattern": "glossary/*.md", "returned_fields": ("title", "local_term", "english_term", "url"), "boost": 1},
        {"uri_pattern": "newsletter/*.md", "returned_fields": ("title", "short_title", "url"), "boost": 1},
        {"uri_pattern": "docs/*.md", "returned_fields": ("title", "short_title", "url"), "boost": 1},
    ],
}

config.logging = {
    "level": getattr(logging, env_str("LOG_LEVEL", "INFO").upper(), logging.INFO),
    "format": "%(levelname)s: %(message)s",
    "handlers": [logging.StreamHandler()],
}
