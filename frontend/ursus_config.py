"""
All About Nairobi - Ursus configuration.

Ursus turns `content/` (Markdown + YAML) plus `templates/` (Jinja2) into a
static site in `output/`. Constants come from content/constants.yaml and the
map data from content/geo/map-summary.yaml, which scripts/build_nairobi_map.py
generates.
"""

import json
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
        "OVERTIME_RATE_REST_DAY", "TURNOVER_TAX_RATE", "TURNOVER_TAX_LOWER", "TURNOVER_TAX_UPPER",
        "WHT_PROFESSIONAL_RESIDENT", "WHT_PROFESSIONAL_THRESHOLD", "WHT_PROFESSIONAL_NONRESIDENT", "VAT_REGISTRATION_THRESHOLD",
        "ETA_FEE_USD", "NNP_FEE_NONRESIDENT_USD", "NNP_FEE_CITIZEN", "MARA_FEE_LOW_USD", "MARA_FEE_PEAK_USD",
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
# The same, for the home page's "Now in Nairobi" strip, which picks the next
# one against the reader's clock rather than the build's.
ctx["UPCOMING_HOLIDAYS_JSON"] = json.dumps(
    [{"date": day.isoformat(), "name": name} for day, name in ctx["UPCOMING_HOLIDAYS"]],
    separators=(",", ":"),
).replace("</", "<\\/")

# Data
ctx["MAP"] = load_yaml("geo/map-summary.yaml", {})
ctx["HERO_MAP"] = build_hero_map()
ctx["FLIGHTS"] = load_yaml("geo/flights-summary.yaml", {"destinations": [], "airlines": []})
ctx["RADIO"] = load_yaml("geo/radio.yaml", {"stations": [], "meta": {}})
# Templates run under StrictUndefined, so fill the optional station fields once
# here rather than guarding every use.
for _station in ctx["RADIO"]["stations"]:
    for _field in ("frequency", "owner", "language", "homepage", "bitrate", "stream"):
        _station.setdefault(_field, None)
ctx["AFCON"] = load_yaml("geo/afcon.yaml", {"meta": {}, "nairobi_venues": [], "key_dates": [], "stay_areas": []})
# The same data with dates as ISO strings, for pages that hand it to JavaScript.
ctx["AFCON_DATA"] = json.loads(json.dumps(ctx["AFCON"], default=str))

# What is in season in Nairobi, hand-kept with every source numbered. /seasons
# renders every item from it as HTML - the no-JavaScript page and what a
# crawler indexes - and the homepage's seasons card reads the same months.
#
# The photos' credits come from food-photos.yaml, which
# scripts/build_food_photos.py writes from the Wikimedia Commons API. Each is
# attached to its item here, and an item without one stops the build: most
# of these are CC BY-SA, and a photo shown without its author and licence is
# a photo used against its terms.
ctx["AGRICULTURE"] = yaml.safe_load(
    (config.content_path / "geo" / "agriculture.yaml").read_text(encoding="utf-8")
)
_food_photos = yaml.safe_load(
    (config.content_path / "geo" / "food-photos.yaml").read_text(encoding="utf-8")
)["photos"]
for _item in ctx["AGRICULTURE"]["items"]:
    if _item["id"] not in _food_photos:
        raise ValueError(f"agriculture.yaml: {_item['id']} has no photo in food-photos.yaml")
    _item["photo"] = _food_photos[_item["id"]]
    _unknown = [s for s in _item["sources"] if s not in ctx["AGRICULTURE"]["sources"]]
    if _unknown:
        raise ValueError(f"agriculture.yaml: {_item['id']} cites unknown sources {_unknown}")
for _area in ctx["AGRICULTURE"]["areas"]:
    _unknown = [s for s in _area["sources"] if s not in ctx["AGRICULTURE"]["sources"]]
    if _unknown:
        raise ValueError(f"agriculture.yaml: {_area['name']} cites unknown sources {_unknown}")

_MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July",
                "August", "September", "October", "November", "December"]


def month_span(months: list[int]) -> str:
    """[4, 5, 6, 11, 12, 1] -> "April to June and November to January".

    Runs wrap round the new year, so December, January and February are one
    run rather than two. Used for the words a screen reader hears in place of
    each item's twelve-month strip.
    """
    have = sorted(set(months))
    if not have:
        return ""
    if len(have) == 12:
        return "all year"
    runs: list[list[int]] = []
    for m in have:
        if runs and m == runs[-1][-1] + 1:
            runs[-1].append(m)
        else:
            runs.append([m])
    # Join a run ending in December to one starting in January, and say it
    # last: maize is "July and August and January and February".
    if len(runs) > 1 and runs[-1][-1] == 12 and runs[0][0] == 1:
        runs.append(runs.pop() + runs.pop(0))

    def say(r: list[int]) -> str:
        if len(r) == 1:
            return _MONTH_NAMES[r[0] - 1]
        # "May and June" alone; inside a list, "to" keeps the runs apart.
        joiner = " and " if len(r) == 2 and len(runs) == 1 else " to "
        return _MONTH_NAMES[r[0] - 1] + joiner + _MONTH_NAMES[r[-1] - 1]

    words = [say(r) for r in runs]
    return words[0] if len(words) == 1 else ", ".join(words[:-1]) + " and " + words[-1]


for _item in ctx["AGRICULTURE"]["items"]:
    _best = f", best {month_span(_item['peak'])}" if _item["peak"] else ""
    if _item["basis"] == "unknown":
        _item["when"] = "Season not confirmed"
    elif _item["year"]:
        _item["when"] = "All year" + _best
    else:
        _span = month_span(_item["supply"])
        _item["when"] = _span[:1].upper() + _span[1:] + _best
ctx["month_span"] = month_span
_agri_checked = date.fromisoformat(str(ctx["AGRICULTURE"]["meta"]["compiled"]))
ctx["AGRICULTURE_COMPILED_ON"] = f"{_agri_checked.day} {_agri_checked:%B %Y}"
# What /seasons' script needs to decide "in season" against the reader's own
# clock - months, never words; the words are already in the HTML. Escaped for
# a <script> element: a "</" in the data would end it.
ctx["AGRICULTURE_SEASONS_JSON"] = json.dumps({
    "items": [
        {k: i[k] for k in ("id", "group", "kind", "name", "supply", "peak", "year", "basis")}
        for i in ctx["AGRICULTURE"]["items"]
    ],
    "rains": ctx["AGRICULTURE"]["rains"],
    "calendar": ctx["AGRICULTURE"]["calendar"],
}, separators=(",", ":")).replace("</", "<\\/")
ctx["AGRICULTURE_ITEM"] = {i["id"]: i for i in ctx["AGRICULTURE"]["items"]}

# The home page's seasons card: for each month, up to four foods to show as
# photos - at their best, then in season, then coming within two months, then
# year-round staples to fill the row. The page is built on one day and read on
# another, so all twelve months go to the card and home-seasons.mjs picks the
# reader's; the build month is rendered for a reader without JavaScript.
_HOME_STAPLES = ["kale", "tilapia", "managu", "milk", "banana"]


def _home_tiles(m: int) -> list[dict]:
    known = [i for i in ctx["AGRICULTURE"]["items"] if i["basis"] != "unknown"]
    ahead = [((m - 1 + k) % 12) + 1 for k in (1, 2)]
    tiles: list[dict] = []

    def add(item: dict, status: str, label: str) -> None:
        if len(tiles) < 4 and all(t["id"] != item["id"] for t in tiles):
            thumb = item["photo"]["thumb"]
            tiles.append({"id": item["id"], "name": item["name"], "status": status, "label": label,
                          "w": thumb["width"], "h": thumb["height"], "alt": item["alt"]})

    # Fruit first in each group: it is what a reader looks out for.
    known.sort(key=lambda i: i["kind"] != "Fruit")
    for i in known:
        if m in i["peak"]:
            add(i, "best", "Best now")
    for i in known:
        if not i["year"] and m in i["supply"]:
            add(i, "in", "In season")
    coming = []
    for i in known:
        months = i["peak"] if i["year"] else i["supply"]
        if m not in months:
            nxt = next((n for n in ahead if n in months), None)
            if nxt:
                coming.append((ahead.index(nxt), i, nxt))
    for _, i, nxt in sorted(coming, key=lambda c: c[0]):
        add(i, "soon", ("Best from " if i["year"] else "From ") + _MONTH_NAMES[nxt - 1])
    for sid in _HOME_STAPLES:
        add(ctx["AGRICULTURE_ITEM"][sid], "year", "All year")
    return tiles


ctx["AGRICULTURE_HOME"] = {m: _home_tiles(m) for m in range(1, 13)}
ctx["AGRICULTURE_HOME_JSON"] = json.dumps(
    {"months": ctx["AGRICULTURE_HOME"], "rains": {r["month"]: r["label"] for r in ctx["AGRICULTURE"]["rains"]}},
    separators=(",", ":"),
).replace("</", "<\\/")

# Lost and found's vocabulary - categories, kinds of place, limits. One file,
# api/_lostfound/vocab.mjs, read by both the pages (here) and the serverless
# function that enforces it, so a category the form offers is always one the
# server accepts. Its "districts" are Nairobi's 17 constituencies, from MAP.
# Until LOSTFOUND_LIVE=1 the pages exist but are noindex and linked from
# nowhere, and the API answers "not set up yet" until the database is connected.
def _vocab(relative: str) -> dict:
    text = (Path(__file__).parent / "api" / relative).read_text(encoding="utf-8")
    # The code's own line, not the words in the comment above it.
    return json.loads(text.split("\nexport default ", 1)[1].strip().rstrip(";"))


_constituencies = ctx["MAP"].get("constituencies", [])
ctx["LOSTFOUND_LIVE"] = env_str("LOSTFOUND_LIVE") == "1"
ctx["LOSTFOUND"] = {
    **_vocab("_lostfound/vocab.mjs"),
    "districts": sorted(({"id": c["id"], "name": c["name"]} for c in _constituencies), key=lambda d: d["name"]),
}

# Nairobi Pulse. Topics, presets and the threshold below which a
# constituency's answers stay unpublished come from api/_pulse/vocab.mjs, so the
# page explains exactly the rule the function enforces. Until PULSE_LIVE=1,
# /pulse works but is noindex and linked from nowhere.
ctx["PULSE_LIVE"] = env_str("PULSE_LIVE") == "1"
ctx["PULSE"] = _vocab("_pulse/vocab.mjs")
ctx["PULSE_DISTRICTS"] = {
    c["id"]: {"name": c["name"], "short": c["name"], "population": c.get("population") or 0}
    for c in _constituencies
}

# The site's own newsletter list (api/news.mjs, sending through Resend, managed
# in the admin). A build-time switch like LOSTFOUND_LIVE; while it is off, the
# NEWSLETTER_ACTION / mailto: sign-up is used instead.
ctx["NEWSLETTER_LIVE"] = env_str("NEWSLETTER_LIVE") == "1"
ctx["API_URL"] = env_str("API_URL", "/api")

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
# The site's copy of static files, without the ones only the build reads. See
# extensions/renderers/static_assets.py.
config.renderers[config.renderers.index("ursus.renderers.static.StaticAssetRenderer")] = (
    "extensions.renderers.static_assets.PublicAssetRenderer"
)
# search-index.json without the Lunr index the search page never loads. See
# extensions/renderers/search_index.py.
config.renderers[config.renderers.index("ursus.renderers.lunr.LunrIndexRenderer")] = (
    "extensions.renderers.search_index.SearchDocumentsRenderer"
)
config.renderers.append("extensions.renderers.glossary_json.GlossaryJsonRenderer")
config.renderers.append("extensions.renderers.feed.AtomFeedRenderer")
# Each published newsletter issue as email, for the admin to send.
config.renderers.append("extensions.renderers.newsletter_issues.NewsletterIssuesRenderer")
# Constants and data files by expiry date, for the admin's Site page.
config.renderers.append("extensions.renderers.site_status.SiteStatusRenderer")
# Last but one: it reads the HTML the Jinja renderer just wrote.
config.renderers.append("extensions.renderers.sitemap.SitemapRenderer")
# Dead last: it rewrites files the other renderers have already written,
# stamping a version on every JavaScript URL (vercel.json serves /js/ as
# immutable, so without this a deploy would never reach a returning browser)
# and stripping the modules' comments. See extensions/renderers/asset_version.py.
config.renderers.append("extensions.renderers.asset_version.AssetVersionRenderer")

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
    "extensions.context_processors.ratings.RatingsProcessor",
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
