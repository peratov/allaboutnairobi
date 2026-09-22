"""
Helper functions available to templates and to ursus_config.py.
"""

from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Iterable
import re
import secrets
import string

import holidays
import yaml
from markdown.extensions.toc import slugify
from ordered_set import OrderedSet
from ursus.context_processors import Entry


# ==============================================================================
# FORMATTING
# ==============================================================================


def to_cedis(value) -> str:
    """
    Format a number as Ghana cedis, without the symbol.

    Ghanaians write large amounts with thousands separators and drop the
    pesewas when they are zero: 2,500 rather than 2,500.00, but 19.97 stays
    19.97 because that is the minimum wage and the pesewas matter.
    """
    if value is None or value == "":
        return ""
    try:
        formatted = "{:0,.2f}".format(Decimal(str(value)))
    except (InvalidOperation, ValueError, TypeError):
        raise ValueError(f"{value!r} cannot be formatted as cedis")
    return formatted.removesuffix(".00")


def to_shillings(value) -> str:
    """
    Format a number as Kenyan shillings, without the symbol.

    Kenyans write large amounts with thousands separators and drop the cents
    when they are zero: 2,500 rather than 2,500.00, but 19.97 stays
    19.97 when the cents matter.
    """
    if value is None or value == "":
        return ""
    try:
        formatted = "{:0,.2f}".format(Decimal(str(value)))
    except (InvalidOperation, ValueError, TypeError):
        raise ValueError(f"{value!r} cannot be formatted as shillings")
    return formatted.removesuffix(".00")


def to_usd(value) -> str:
    """
    Format a number as US dollars.

    Accra runs on two currencies. Rent in Cantonments, GIPC capital
    requirements and immigration penalties are quoted in dollars even though
    you hand over cedis, so the site needs both.
    """
    if value is None or value == "":
        return ""
    try:
        formatted = "{:0,.2f}".format(Decimal(str(value)))
    except (InvalidOperation, ValueError, TypeError):
        raise ValueError(f"{value!r} cannot be formatted as dollars")
    return formatted.removesuffix(".00")


def to_percent(value, max_decimals: int = 2) -> str:
    """Format a rate, trimming trailing zeros. 17.50 becomes 17.5, 25.00 becomes 25."""
    if value is None:
        return ""
    text = f"{float(value):.{max_decimals}f}"
    return text.rstrip("0").rstrip(".") if "." in text else text


def to_count(value) -> str:
    """
    Format a whole count with thousands separators: 5455692 becomes 5,455,692.

    `number` deliberately has no separators, because most figures it formats
    are rates and "17.5" wants none. Population counts want them, and a census
    total printed as 5455692 is a number nobody can read at a glance.
    """
    if value is None or value == "":
        return ""
    return "{:,.0f}".format(float(value))


def to_compact(value, max_decimals: int = 1) -> str:
    """
    Format a large figure in words: 114209905278 becomes "114.2 billion".

    Ghana's GDP and its remittance inflow are eleven and ten digits, and a
    guide that prints them in full is unreadable prose. Written out rather than
    abbreviated to "bn", because these appear mid-sentence.
    """
    if value is None or value == "":
        return ""
    value = float(value)
    for threshold, word in ((1e12, "trillion"), (1e9, "billion"), (1e6, "million")):
        if abs(value) >= threshold:
            return f"{to_number(value / threshold, max_decimals)} {word}"
    return to_count(value)


def to_number(value, max_decimals: int = 1) -> str:
    """Format a plain number, trimming trailing zeros. 25.0 becomes 25."""
    if value is None:
        return ""
    text = f"{float(value):.{max_decimals}f}"
    return text.rstrip("0").rstrip(".") if "." in text else text


def or_list(items: list[str]) -> str:
    """Join a list into readable prose: "a, b or c"."""
    unique = list(OrderedSet(items))
    if not unique:
        return ""
    if len(unique) == 1:
        return unique[0]
    return ", ".join(unique[:-1]) + " or " + unique[-1]


def random_id() -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(5))


# ==============================================================================
# LINKS AND SLUGS
# ==============================================================================


def patched_slugify(value: str, separator: str, keep_unicode: bool = False) -> str:
    """
    Slugify a heading, dropping any leading numbers.

    "1. Get your Ghana Card" should anchor to #get-your-ghana-card, not to
    #1-get-your-ghana-card, so that renumbering a step does not break every
    inbound link to it.
    """
    return slugify(value.lstrip(" 0123456789."), separator, keep_unicode)


# ==============================================================================
# GLOSSARY
#
# The glossary mixes three alphabets' worth of things: bureaucratic acronyms
# (SSNIT, GRA, DVLA), Twi and Ga words (chale, medaase, akwaaba) and housing
# vocabulary you will not find in a dictionary (chamber and hall, boys
# quarters). They are all sorted together, accents folded, so that "Ɛ" in a
# Twi term does not get its own lonely heading at the bottom of the page.
# ==============================================================================

_ACCENT_SUBSTITUTIONS = (
    (r"[àáâãäåɑ]", "a"),
    (r"[èéêëɛ]", "e"),
    (r"[ìíîï]", "i"),
    (r"[òóôõöɔ]", "o"),
    (r"[ùúûü]", "u"),
    (r"[ŋ]", "n"),
    (r"[ɖ]", "d"),
)


_glossary_slug_map: dict[str, str] | None = None


def fold_accents(text: str) -> str:
    for pattern, replacement in _ACCENT_SUBSTITUTIONS:
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
    return text.upper()


def slugify_plain(value) -> str:
    """
    Lowercase, non-alphanumerics to hyphens.

    Deliberately the same rule as `slug()` in accra-map.mjs: the map's table
    writes #constituency=... links that the component has to resolve, and two
    slug functions that disagree is a link that silently does nothing.
    """
    return re.sub(r"[^a-z0-9]+", "-", str(value).lower()).strip("-")


def glossary_slug(term: str) -> str:
    """
    The URL a glossary term lives at.

    "Ghana Card" -> ghana-card, "E-Levy" -> e-levy, "ɛte sɛn" -> ete-sen.

    Accents are folded rather than percent-encoded, so a Twi term gets a URL
    someone can read out over the phone. Every file in content/glossary is
    named for its own slug, so this is also how a term finds its file.
    """
    return re.sub(r"[^a-z0-9]+", "-", fold_accents(term).lower()).strip("-")


def glossary_slug_map() -> dict[str, str]:
    """
    Every label that may appear in [[double brackets]], mapped to its slug.

    A term's own name resolves through glossary_slug alone. This exists for
    the aliases: the glossary lists "trotros", "okadas" and "charley" so that
    a guide can write the plural or the other spelling and still land on the
    entry. Without the map, [[trotros]] would quietly link to a page that does
    not exist.

    Cached, and the cache is not invalidated. Adding an *alias* while
    `mise site` is watching needs a restart; adding a term does not, because
    its own name goes through glossary_slug.
    """
    global _glossary_slug_map
    if _glossary_slug_map is not None:
        return _glossary_slug_map

    from ursus.config import config

    mapping: dict[str, str] = {}
    for path in sorted((config.content_path / "glossary").glob("*.md")):
        slug = path.stem
        front_matter = path.read_text(encoding="utf-8").split("---")
        meta = yaml.safe_load(front_matter[1]) if len(front_matter) > 2 else None
        meta = meta if isinstance(meta, dict) else {}

        labels = [slug, meta.get("local_term"), *(meta.get("aliases") or [])]
        for label in labels:
            if isinstance(label, str) and label.strip():
                mapping.setdefault(label.strip().casefold(), slug)

    _glossary_slug_map = mapping
    return mapping


def build_wikilinks_url(label: str, base: str, end: str) -> str:
    """[[Ghana Card]] becomes /glossary/ghana-card, [[trotros]] /glossary/trotro."""
    slug = glossary_slug_map().get(label.strip().casefold()) or glossary_slug(label)
    return "{}{}{}".format(base, slug, end)


def glossary_sorter(entry: Entry) -> str:
    return fold_accents(entry["local_term"])


def glossary_groups(entries: list[Entry]) -> dict[str, list[Entry]]:
    """Group glossary entries under a single starting letter, for the A-Z index."""
    groups: dict[str, list[Entry]] = {}
    for entry in entries:
        first = fold_accents(entry["local_term"])[0]
        group_name = first if first.isalpha() else "#"
        groups.setdefault(group_name, []).append(entry)

    for group_name in groups:
        groups[group_name].sort(key=glossary_sorter)

    return dict(sorted(groups.items()))


# ==============================================================================
# PUBLIC HOLIDAYS
# ==============================================================================


def get_public_holidays(years: Iterable[int]) -> dict[date, str]:
    """
    Kenya's public holidays under the Public Holidays Act, with one correction.

    The `holidays` package still calls 26 December "Boxing Day". Since the
    2024 amendments it is Utamaduni Day. Idd-ul-Fitr is kept with the
    package's "(estimated)" mark, because the date depends on the moon and is
    confirmed by gazette notice shortly before. Idd-ul-Azha is not listed:
    it is a holiday only in years the Interior Cabinet Secretary gazettes it.
    """
    years = list(years)
    upstream = holidays.country_holidays("KE", years=years)

    corrected: dict[date, str] = {}
    for holiday_date, name in upstream.items():
        corrected[holiday_date] = name.replace("Boxing Day", "Utamaduni Day")

    return dict(sorted(corrected.items()))


def is_public_holiday(day: date) -> bool:
    return day in get_public_holidays([day.year])


# ==============================================================================
# CONSTANTS
# ==============================================================================


def load_constants_from_file(path: Path) -> dict:
    """
    Read content/constants.yaml into a flat dict of typed values.

    Money becomes Decimal, not float. Ghanaian amounts get large - a two-year
    advance on a Cantonments house runs into six figures - and float rounding
    on money is how you end up publishing a number that is off by a pesewa and
    losing an argument with a landlord.
    """
    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    constants: dict = {}

    for name, spec in raw["constants"].items():
        unit = spec.get("unit")
        value = spec["value"]

        if unit in ("cedis", "usd"):
            constants[name] = Decimal(str(value)).quantize(Decimal("0.01"))
        elif unit in ("percent", "decimal"):
            constants[name] = Decimal(str(value))
        elif unit == "integer":
            constants[name] = int(value)
        else:
            constants[name] = value

    return constants


def load_constants_metadata(path: Path) -> dict:
    """The full spec for each constant, including last_verified and fail_on. Used by the linters."""
    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    return raw["constants"]


# ==============================================================================
# THE DASHBOARD FIGURES
#
# /data holds thirty series, and the guides about them have to quote the same
# numbers the charts draw. The site's one hard rule is that no number is ever
# typed into a guide, so each series is exposed to content as a handful of
# named values instead.
#
# The map below is the single source of truth for those names. ursus_config.py
# builds the values from it and UndefinedConstantsLinter builds the allowlist
# from it, so a guide can never interpolate a figure that does not exist and
# the allowlist can never drift from what is defined.
#
# World Bank indicator codes make unreadable prose - {{ DATA_SP_DYN_TFRT_IN_LAST }}
# tells a writer nothing - so each series gets a spoken-language stem. The
# GHANA_ prefix is not decoration either: 27 of these 30 series are national,
# and a guide that quotes one has to say so.
# ==============================================================================

DASHBOARD_SERIES = {
    # Greater Accra itself, and the two honest divisions of it
    "accra-population": "ACCRA_POPULATION",
    "accra-density": "ACCRA_DENSITY",
    "accra-share-of-ghana": "ACCRA_SHARE_OF_GHANA",
    # Ghana: people
    "sp-pop-totl": "GHANA_POPULATION",
    "sp-pop-grow": "GHANA_POPULATION_GROWTH",
    "sp-urb-totl": "GHANA_URBAN_POPULATION",
    "sp-urb-totl-in-zs": "GHANA_URBAN_SHARE",
    "sp-urb-grow": "GHANA_URBAN_GROWTH",
    "sp-dyn-le00-in": "GHANA_LIFE_EXPECTANCY",
    "sp-dyn-tfrt-in": "GHANA_BIRTHS_PER_WOMAN",
    "sp-pop-0014-to-zs": "GHANA_UNDER_15_SHARE",
    # Ghana: the economy
    "ny-gdp-mktp-cd": "GHANA_GDP",
    "ny-gdp-pcap-cd": "GHANA_GDP_PER_PERSON",
    "ny-gdp-mktp-kd-zg": "GHANA_GDP_GROWTH",
    "fp-cpi-totl-zg": "GHANA_INFLATION",
    "pa-nus-fcrf": "GHANA_CEDIS_PER_DOLLAR",
    "bx-trf-pwkr-cd-dt": "GHANA_REMITTANCES",
    "ne-exp-gnfs-zs": "GHANA_EXPORTS_SHARE",
    "sl-uem-totl-zs": "GHANA_UNEMPLOYMENT",
    # Ghana: education
    "se-prm-cmpt-zs": "GHANA_PRIMARY_COMPLETION",
    "se-sec-nenr": "GHANA_SECONDARY_ENROLMENT",
    "se-ter-enrr": "GHANA_TERTIARY_ENROLMENT",
    "se-xpd-totl-gd-zs": "GHANA_EDUCATION_SPENDING",
    "se-adt-litr-zs": "GHANA_ADULT_LITERACY",
    # Ghana: daily life
    "eg-elc-accs-zs": "GHANA_ELECTRICITY_ACCESS",
    "sh-h2o-basw-zs": "GHANA_BASIC_WATER",
    "sh-sta-bass-zs": "GHANA_BASIC_SANITATION",
    "it-net-user-zs": "GHANA_INTERNET_USERS",
    "it-cel-sets-p2": "GHANA_MOBILE_SUBSCRIPTIONS",
    "sh-xpd-chex-gd-zs": "GHANA_HEALTH_SPENDING",
}

# Per series. FIRST and LAST are the earliest and latest observations, not a
# range: where a series is sparse the gap is real and the guides say so.
_SERIES_SUFFIXES = (
    "FIRST", "FIRST_YEAR", "LAST", "LAST_YEAR",
    # The extremes, because several of these series are only interesting there:
    # Ghana's inflation and its GDP growth say far more at their peak and their
    # worst year than at either endpoint.
    "MIN", "MIN_YEAR", "MAX", "MAX_YEAR",
    "MULTIPLE", "POINTS",
    # The whole series, for the short ones. None for everything else, so the
    # set of names stays the same whatever the data does.
    "VALUES",
)

# Arithmetic across two series, computed once here rather than in a guide.
_DASHBOARD_CROSS = (
    "DATA_ACCRA_POPULATION_ADDED",
    "DATA_ACCRA_POPULATION_SPAN_YEARS",
    "DATA_ACCRA_POPULATION_PER_YEAR",
    "DATA_ACCRA_VS_GHANA_GROWTH_RATIO",
    "DATA_GHANA_REMITTANCES_SHARE_OF_GDP",
)

# From meta. The GDP share is a range over a period rather than a series,
# because that is what the UNECA study reports.
_DASHBOARD_META = {
    "DATA_GENERATED": ("generated",),
    "DATA_ACCRA_AREA_KM2": ("accra_area_km2",),
    "DATA_ACCRA_GDP_SHARE_FROM": ("accra_gdp_share", "from_year"),
    "DATA_ACCRA_GDP_SHARE_TO": ("accra_gdp_share", "to_year"),
    "DATA_ACCRA_GDP_SHARE_LOW": ("accra_gdp_share", "low_pct"),
    "DATA_ACCRA_GDP_SHARE_HIGH": ("accra_gdp_share", "high_pct"),
    "DATA_ACCRA_GDP_PER_CAPITA_MULTIPLE": ("accra_gdp_share", "per_capita_multiple"),
    "DATA_ACCRA_SERVICES_SHARE": ("accra_gdp_share", "services_share_pct"),
    "DATA_ACCRA_MANUFACTURING_SHARE": ("accra_gdp_share", "manufacturing_share_pct"),
    "DATA_ACCRA_GDP_SHARE_SOURCE": ("accra_gdp_share", "source"),
    "DATA_ACCRA_GDP_SHARE_URL": ("accra_gdp_share", "url"),
}


def dashboard_constant_names() -> set[str]:
    """Every name a guide may interpolate from the dashboard data."""
    names = set(_DASHBOARD_META) | set(_DASHBOARD_CROSS)
    for stem in DASHBOARD_SERIES.values():
        names.update(f"DATA_{stem}_{suffix}" for suffix in _SERIES_SUFFIXES)
    return names


def dashboard_constants(summary: dict) -> dict:
    """
    Flatten indicators-summary.yaml into the names above.

    Raises if the summary and DASHBOARD_SERIES disagree in either direction. A
    series that quietly stopped resolving would leave every guide quoting it
    with a Jinja error at build time and no clue why; a series present in the
    data but absent from the map is one nothing can be written about.
    """
    by_id = {entry["id"]: entry for entry in summary["series"]}

    missing = set(DASHBOARD_SERIES) - set(by_id)
    if missing:
        raise ValueError(
            f"indicators-summary.yaml has no series {sorted(missing)}. "
            f"Re-run scripts/build_dashboard_data.py, or drop them from DASHBOARD_SERIES."
        )
    unmapped = set(by_id) - set(DASHBOARD_SERIES)
    if unmapped:
        raise ValueError(
            f"{sorted(unmapped)} are in indicators-summary.yaml but not in "
            f"DASHBOARD_SERIES, so no guide can quote them. Add a stem for each."
        )

    values: dict = {}
    for series_id, stem in DASHBOARD_SERIES.items():
        entry = by_id[series_id]
        values[f"DATA_{stem}_FIRST"] = entry["first_value"]
        values[f"DATA_{stem}_FIRST_YEAR"] = entry["first_year"]
        values[f"DATA_{stem}_LAST"] = entry["last_value"]
        values[f"DATA_{stem}_LAST_YEAR"] = entry["last_year"]
        values[f"DATA_{stem}_MIN"] = entry["min_value"]
        values[f"DATA_{stem}_MIN_YEAR"] = entry["min_year"]
        values[f"DATA_{stem}_MAX"] = entry["max_value"]
        values[f"DATA_{stem}_MAX_YEAR"] = entry["max_year"]
        values[f"DATA_{stem}_POINTS"] = entry["points"]
        values[f"DATA_{stem}_VALUES"] = entry.get("values")
        # Absent where the first observation is zero, which is true of internet
        # use and mobile phones. Dividing by it would print "infinity".
        values[f"DATA_{stem}_MULTIPLE"] = entry.get("multiple")

    # How many people Greater Accra actually added, and how fast it grew
    # against the country. Both are honest subtraction and division of sourced
    # figures; neither is a projection, and the region's boundaries moved over
    # the period, which no arithmetic here can account for.
    accra, ghana = by_id["accra-population"], by_id["sp-pop-totl"]
    added = accra["last_value"] - accra["first_value"]
    span = accra["last_year"] - accra["first_year"]
    values["DATA_ACCRA_POPULATION_ADDED"] = added
    values["DATA_ACCRA_POPULATION_SPAN_YEARS"] = span
    values["DATA_ACCRA_POPULATION_PER_YEAR"] = round(added / span)
    values["DATA_ACCRA_VS_GHANA_GROWTH_RATIO"] = round(
        accra["multiple"] / ghana["multiple"], 1
    )

    # What the diaspora sends home, against the whole economy. Both series are
    # in current US dollars and both end in the same year, which is what makes
    # the division legitimate - check that still holds after a refetch.
    remittances, gdp = by_id["bx-trf-pwkr-cd-dt"], by_id["ny-gdp-mktp-cd"]
    if remittances["last_year"] != gdp["last_year"]:
        raise ValueError(
            f"remittances end in {remittances['last_year']} and GDP in "
            f"{gdp['last_year']}; one over the other is no longer a share of GDP."
        )
    values["DATA_GHANA_REMITTANCES_SHARE_OF_GDP"] = round(
        remittances["last_value"] / gdp["last_value"] * 100, 1
    )

    meta = summary["meta"]
    for name, path in _DASHBOARD_META.items():
        node = meta
        for key in path:
            node = node[key]
        values[name] = node

    return values
