"""All About Nairobi - Config for Ursus static site generator."""

from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo
import os, logging, subprocess

import yaml
from ursus.config import config
from extensions.functions import (
    load_constants_from_file, to_shillings, to_usd, to_percent, to_number,
    to_count, to_compact, patched_slugify,
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
    # Tax constants
    "PAYE_BANDS_JSON": "{}",
    "PAYE_BANDS": [],
    "PAYE_TAX_FREE_ANNUAL": 0,
    "PAYE_TOP_RATE": 0,
    # SSNIT constants
    "SSNIT_EARLY_FACTORS_JSON": "{}",
    "SSNIT_EMPLOYEE_RATE": 0,
    "SSNIT_EMPLOYER_RATE": 0,
    "SSNIT_TOTAL_RATE": 0,
    "SSNIT_MIN_CONTRIBUTION_YEARS": 0,
    "SSNIT_MAX_CONTRIBUTION_YEARS": 0,
    "SSNIT_PENSION_AGE": 0,
    "SSNIT_EARLY_PENSION_AGE": 0,
    # Housing constants
    "ACCRA_ONE_BED_RENT_MID": 0,
    "MAX_LEGAL_RENT_ADVANCE_MONTHS": 0,
    "TYPICAL_RENT_ADVANCE_MONTHS": 0,
    "TYPICAL_ONE_BED_ADVANCE_TOTAL": 0,
    # Tax rates
    "VAT_RATE": 0,
    "VAT_EFFECTIVE_RATE": 0,
    "NHIL_RATE": 0,
    "GETFUND_RATE": 0,
    # Other constants
    "DAILY_MINIMUM_WAGE": 0,
    "MONTHLY_MINIMUM_WAGE_APPROX": 0,
    "PUBLIC_HOLIDAYS_JSON": "{}",
    # Vehicle duty
    "VEHICLE_DUTY_UNDER_1900CC": 0,
    "VEHICLE_DUTY_1900_TO_3000CC": 0,
    "VEHICLE_DUTY_OVER_3000CC": 0,
    "VEHICLE_OVERAGE_THRESHOLD_YEARS": 0,
    "VEHICLE_OVERAGE_PENALTY_10_TO_12": 0,
    "VEHICLE_OVERAGE_PENALTY_12_TO_15": 0,
    "VEHICLE_OVERAGE_PENALTY_OVER_15": 0,
    # Import duties
    "AU_IMPORT_LEVY_RATE": 0,
    "ECOWAS_LEVY_RATE": 0,
    "EXIM_LEVY_RATE": 0,
    "SPECIAL_IMPORT_LEVY_RATE": 0,
    "IMPORT_INSPECTION_FEE_RATE": 0,
    "IMPORT_NETWORK_CHARGE_RATE": 0,
    # Withholding tax
    "WHT_SERVICES_RESIDENT": 0,
    "WHT_GOODS": 0,
    "WHT_WORKS": 0,
    "WHT_RENT_RESIDENTIAL": 0,
    "WHT_RENT_COMMERCIAL": 0,
    "WHT_DIVIDENDS": 0,
    # Radio constants
    "RADIO_GB_PER_MONTH": 0,
    "RADIO_MB_PER_HOUR": 0,
    "RADIO_TYPICAL_KBPS": 0,
    # Education
    "WASSCE_CREDIT_GRADE": 0,
    "UNIVERSITY_GENERAL_CUTOFF_AGGREGATE": 0,
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
except FileNotFoundError:
    ctx["FLIGHTS"] = {"destinations": []}

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
config.minify_js = False
config.minify_css = False
config.output_path = Path(__file__).parent / "output"
config.html_url_extension = ""
config.logging = {
    "level": logging.INFO,
    "format": "%(levelname)s: %(message)s",
    "handlers": [logging.StreamHandler()],
}
