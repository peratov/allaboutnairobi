"""All About Nairobi - Config for Ursus static site generator."""

from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo
import os, logging, subprocess

import yaml
from ursus.config import config
from extensions.functions import (
    load_constants_from_file, to_shillings, to_usd, to_percent, to_number,
    to_count, to_compact, patched_slugify, glossary_groups, random_id,
)
from extensions.renderers.jinja import (
    TableOfContentsExtension, GlossaryExtension, ToolExtension, PortableScssExtension
)

def env_str(name, default=""):
    return (os.environ.get(name) or "").strip() or default

# Paths
config.content_path = Path(__file__).parent / "content"
config.templates_path = Path(__file__).parent / "templates"

# Load constants from YAML
ctx = {}
ctx.update(load_constants_from_file(config.content_path / "constants.yaml"))

# Fill in placeholder values for all constants referenced in templates but not in constants.yaml
# These will be populated with real Kenya data in Phase 2
placeholders = {
    # Hero map
    "HERO_MAP": None,
    # Events
    "EVENTS": {
        "categories": [],
        "months": [],
        "annual": [],
        "upcoming": []
    },
    # Tax constants
    "PAYE_BANDS_JSON": "{}",
    "PAYE_BANDS": [],
    "PAYE_TAX_FREE_ANNUAL": 0,
    "PAYE_TOP_RATE": 0,
    # NSSF constants
    "NSSF_EARLY_FACTORS_JSON": "{}",
    "NSSF_EMPLOYEE_CONTRIBUTION": 0,
    "NSSF_EMPLOYER_CONTRIBUTION": 0,
    "NSSF_TOTAL_RATE": 0,
    "NSSF_MIN_CONTRIBUTION_YEARS": 0,
    "NSSF_MIN_CONTRIBUTION_MONTHS": 0,
    "NSSF_MAX_CONTRIBUTION_YEARS": 0,
    "NSSF_PENSION_AGE": 0,
    "NSSF_EARLY_PENSION_AGE": 0,
    "NSSF_BEST_MONTHS": 0,
    "NSSF_PENSION_RIGHT_MIN": 0,
    "NSSF_PENSION_RIGHT_MAX": 0,
    "NSSF_PENSION_RIGHT_PER_YEAR": 0,
    "TIER_1_RATE": 0,
    "TIER_2_RATE": 0,
    "TIER_3_MAX_RELIEF_RATE": 0,
    # Housing constants
    "NAIROBI_ONE_BED_RENT_MID": 0,
    "NAIROBI_SINGLE_ROOM_RENT_MIN": 0,
    "NAIROBI_TWO_BED_EXPAT_RENT_USD": 0,
    "MAX_LEGAL_RENT_ADVANCE_MONTHS": 0,
    "TYPICAL_RENT_ADVANCE_MONTHS": 0,
    "TYPICAL_ONE_BED_ADVANCE_TOTAL": 0,
    # Tax rates
    "VAT_RATE": 0,
    "VAT_EFFECTIVE_RATE": 0,
    # Other constants
    "DAILY_MINIMUM_WAGE": 0,
    "MONTHLY_MINIMUM_WAGE_APPROX": 0,
    "ANNUAL_LEAVE_DAYS": 0,
    "CORPORATE_TAX_RATE": 0,
    "ANNUAL_RETURN_DEADLINE_MONTHS": 0,
    "PUBLIC_HOLIDAYS_JSON": "{}",
    # Radio constants
    "RADIO_GB_PER_MONTH": 0,
    "RADIO_MB_PER_HOUR": 0,
    "RADIO_TYPICAL_KBPS": 0,
    # Employment & labor constants
    "MAX_WEEKLY_HOURS": 0,
    "NOTICE_PERIOD_MONTHS_PERMANENT": 0,
    "PROBATION_MAX_MONTHS": 0,
    "MATERNITY_LEAVE_WEEKS": 0,
    "MATERNITY_LEAVE_WEEKS_EXTENDED": 0,
    "SSNIT_EMPLOYEE_RATE": 0,
    "SSNIT_EMPLOYER_RATE": 0,
    # Accra/Ghana constants (legacy tool content)
    "ACCRA_ONE_BED_RENT_MID": 0,
    "WAAKYE_PRICE": 0,
    "TROTRO_SHORT_FARE_MIN": 0,
    "TROTRO_CROSSTOWN_FARE_MAX": 0,
    "RIDE_HAILING_SHORT_TRIP": 0,
    "LPG_CYLINDER_REFILL_14KG": 0,
    "GHANA_MEDIAN_MONTHLY_EARNINGS": 0,
}

for key, value in placeholders.items():
    if key not in ctx:
        ctx[key] = value

# Load data files from geo/ directory (with fallback for missing files)
try:
    ctx["INDICATORS"] = yaml.safe_load((config.content_path / "geo" / "indicators-summary.yaml").read_text(encoding="utf-8"))
except FileNotFoundError:
    ctx["INDICATORS"] = {"series": [], "meta": {}}

# Site essentials
ctx["SITE_NAME"] = "All About Nairobi"
ctx["SITE_TAGLINE"] = "Free guides and tools for living in Nairobi"
ctx["SITE_DESCRIPTION"] = "All About Nairobi: practical guides for living in Kenya."
ctx["CANONICAL_DOMAIN"] = env_str("DOMAIN", "www.allaboutnairobi.com")
ctx["CANONICAL_ORIGIN"] = f"https://{ctx['CANONICAL_DOMAIN']}"
ctx["SITE_URL"] = env_str("SITE_URL", "")
ctx["CONTACT_EMAIL"] = env_str("CONTACT_EMAIL", "hello@allaboutnairobi.com")
ctx["X_HANDLE"] = "AllAboutNairobi"
ctx["X_URL"] = "https://twitter.com/AllAboutNairobi"
ctx["GA_MEASUREMENT_ID"] = env_str("GA_MEASUREMENT_ID", "")
ctx["CLARITY_PROJECT_ID"] = env_str("CLARITY_PROJECT_ID", "")
ctx["GOOGLE_SITE_VERIFICATION"] = env_str("GOOGLE_SITE_VERIFICATION", "")
ctx["BING_SITE_VERIFICATION"] = env_str("BING_SITE_VERIFICATION", "")
ctx["NEWSLETTER_ACTION"] = env_str("NEWSLETTER_ACTION", "")
ctx["NEWSLETTER_FIELD"] = env_str("NEWSLETTER_FIELD", "email")
ctx["NEWSLETTER_PROVIDER"] = env_str("NEWSLETTER_PROVIDER", "")
ctx["SUPPORT_URL"] = env_str("SUPPORT_URL", "https://buymeacoffee.com/allaboutnairobi")

# Time and data
ctx["now"] = datetime.now(ZoneInfo("Africa/Nairobi"))
ctx["current_year"] = date.today().year
ctx["CONTENT_LAST_UPDATED"] = date.today()

try:
    ctx["MAP"] = yaml.safe_load((config.content_path / "geo" / "map-summary.yaml").read_text(encoding="utf-8"))
except FileNotFoundError:
    ctx["MAP"] = {"districts": [], "regions": [], "landmarks": []}

try:
    ctx["FLIGHTS"] = yaml.safe_load((config.content_path / "geo" / "flights-summary.yaml").read_text(encoding="utf-8"))
except (FileNotFoundError, TypeError):
    ctx["FLIGHTS"] = {"destinations": [], "airlines": []}
except:
    ctx["FLIGHTS"] = {"destinations": [], "airlines": []}

try:
    ctx["NIGHTLIFE"] = yaml.safe_load((config.content_path / "geo" / "nightlife.yaml").read_text(encoding="utf-8"))
except FileNotFoundError:
    ctx["NIGHTLIFE"] = {"venues": [], "meta": {"basis": "estimated"}}

try:
    ctx["RADIO"] = yaml.safe_load((config.content_path / "geo" / "radio.yaml").read_text(encoding="utf-8"))
except FileNotFoundError:
    ctx["RADIO"] = {"stations": [], "meta": {"last_verified": "2026-09-22"}}

ctx["RADIO_CHECKED_ON"] = "22 September 2026"
ctx["RADIO_TYPICAL_KBPS"] = None

# Adinkra symbols (from the content/adinkra.yaml file)
try:
    ctx["ADINKRA"] = yaml.safe_load((config.content_path / "adinkra.yaml").read_text(encoding="utf-8"))
except FileNotFoundError:
    ctx["ADINKRA"] = {}

try:
    ctx["commit_id"] = subprocess.check_output(["git", "rev-parse", "--short", "HEAD"]).decode().strip()
except:
    ctx["commit_id"] = "dev"

# Add Jinja2 global functions
ctx["glossary_groups"] = glossary_groups
ctx["random_id"] = random_id

# Ursus configuration
config.site_url = ctx["SITE_URL"]
config.context_globals = ctx
config.jinja_filters = {
    "shillings": to_shillings,
    "cedis": to_shillings,  # Kenya uses shillings, not cedis
    "usd": to_usd,
    "percent": to_percent,
    "number": to_number,
    "count": to_count,
    "compact": to_compact,
    "slug": patched_slugify,
}
config.jinja_extensions = [
    GlossaryExtension,
    PortableScssExtension,
]
config.minify_js = False
config.minify_css = False
config.output_path = Path(__file__).parent / "output"
config.html_url_extension = ""
config.logging = {
    "level": logging.INFO,
    "format": "%(levelname)s: %(message)s",
    "handlers": [logging.StreamHandler()],
}
