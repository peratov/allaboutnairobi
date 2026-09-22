"""
All About Nairobi - Minimal Ursus configuration.

Loads constants and sets up the basic site infrastructure.
Derived calculations will be added as Kenya constants are populated.
"""

from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo
import json
import logging
import os

import yaml
from ursus.config import config

from extensions.functions import (
    load_constants_from_file,
    to_shillings,
    to_compact,
    to_count,
    to_number,
    to_percent,
    to_usd,
    get_public_holidays,
    patched_slugify,
)


def env_str(name: str, default: str = "") -> str:
    """Read an environment variable, treating an empty value as unset."""
    return (os.environ.get(name) or "").strip() or default


def env_flag(name: str, default: bool) -> bool:
    """Read a boolean environment variable."""
    raw = env_str(name)
    if not raw:
        return default
    truthy = {"1", "true", "yes", "on"}
    falsy = {"0", "false", "no", "off"}
    if raw.lower() in truthy:
        return True
    if raw.lower() in falsy:
        return False
    raise ValueError(
        f"{name}={raw!r} is not a boolean. Use 1/0, true/false, yes/no or on/off."
    )


# Ursus paths
config.content_path = Path(__file__).parent / "content"
config.templates_path = Path(__file__).parent / "templates"

# Load constants
ctx = {}
ctx.update(load_constants_from_file(config.content_path / "constants.yaml"))

# Site identity
ctx["SITE_NAME"] = "All About Nairobi"
ctx["SITE_TAGLINE"] = "Free guides and tools for living in Nairobi"
ctx["SITE_DESCRIPTION"] = (
    "All About Nairobi offers free, independent guides and calculators for "
    "living and working in Nairobi."
)

# Domain
ctx["CANONICAL_DOMAIN"] = env_str("DOMAIN", "www.allaboutnairobi.com")
ctx["CANONICAL_ORIGIN"] = f"https://{ctx['CANONICAL_DOMAIN']}"
ctx["SITE_URL"] = env_str("SITE_URL", "")

# Contact and social
ctx["CONTACT_EMAIL"] = env_str("CONTACT_EMAIL", "hello@allaboutnairobi.com")
ctx["X_HANDLE"] = env_str("X_HANDLE", "AllAboutNairobi")
ctx["X_URL"] = "https://twitter.com/AllAboutNairobi"

# Analytics
ctx["GA_MEASUREMENT_ID"] = env_str("GA_MEASUREMENT_ID", "")
ctx["CLARITY_PROJECT_ID"] = env_str("CLARITY_PROJECT_ID", "")
ctx["GOOGLE_SITE_VERIFICATION"] = env_str("GOOGLE_SITE_VERIFICATION", "")
ctx["BING_SITE_VERIFICATION"] = env_str("BING_SITE_VERIFICATION", "")

# Newsletter
ctx["NEWSLETTER_ACTION"] = env_str("NEWSLETTER_ACTION", "")
ctx["NEWSLETTER_FIELD"] = env_str("NEWSLETTER_FIELD", "email")
ctx["NEWSLETTER_PROVIDER"] = env_str("NEWSLETTER_PROVIDER", "")

# Support
ctx["SUPPORT_URL"] = env_str("SUPPORT_URL", "https://buymeacoffee.com/allaboutnairobi")

# Timezone
ctx["now"] = datetime.now(ZoneInfo("Africa/Nairobi"))
ctx["current_year"] = date.today().year
ctx["get_public_holidays"] = get_public_holidays
ctx["CONTENT_LAST_UPDATED"] = date.today()

# Data files (loaded empty for now - will be generated in Phase 4)
ctx["MAP"] = {"districts": [], "regions": [], "landmarks": []}
ctx["FLIGHTS"] = {"destinations": []}
ctx["INDICATORS"] = {"series": []}
ctx["NIGHTLIFE"] = {"venues": [], "meta": {"basis": "estimated", "last_verified": "2026-09-22"}}
ctx["RADIO"] = {"stations": [], "meta": {"last_verified": "2026-09-22"}}
ctx["RADIO_CHECKED_ON"] = "22 September 2026"
ctx["RADIO_TYPICAL_KBPS"] = None

# Tax-related defaults (will be populated with Kenya data in Phase 2)
ctx["PAYE_BANDS"] = []
ctx["PAYE_BANDS_JSON"] = "[]"
ctx["PAYE_TOP_BAND_MIN_ANNUAL"] = 0
ctx["PAYE_TAX_FREE_ANNUAL"] = 0
ctx["VAT_EFFECTIVE_RATE"] = ctx.get("VAT_RATE", 0.16)
ctx["TYPICAL_RENT_ADVANCE_TOTAL"] = 0
ctx["MONTHLY_MINIMUM_WAGE"] = ctx.get("DAILY_MINIMUM_WAGE", 0) * 26

# Git commit hash (for asset versioning and cache busting)
try:
    import subprocess
    ctx["commit_id"] = subprocess.check_output(["git", "rev-parse", "--short", "HEAD"]).decode().strip()
except:
    ctx["commit_id"] = "dev"  # Fallback for non-git environments

# Ursus configuration
config.site_url = ctx["SITE_URL"]
config.context_globals = ctx
config.jinja_filters = {
    "shillings": to_shillings,
    "usd": to_usd,
    "percent": to_percent,
    "number": to_number,
    "count": to_count,
    "compact": to_compact,
    "slug": patched_slugify,
}

config.minify_js = env_flag("MINIFY_JS", False)
config.minify_css = env_flag("MINIFY_CSS", False)
config.output_path = Path(__file__).parent / "output"
config.html_url_extension = ""

config.logging = {
    "level": logging.INFO,
    "format": "%(levelname)s: %(message)s",
    "handlers": [logging.StreamHandler()],
}
