"""
Linters that keep content/constants.yaml honest.

Ghanaian figures rot fast. The minimum wage is renegotiated every year, PAYE
bands move with the budget, and PURC revises electricity tariffs quarterly. A
guide that quietly goes stale is worse than no guide, because the reader
trusts it.
"""

import logging
import re
from datetime import date
from pathlib import Path

import yaml

from ursus.config import config
from ursus.linters import Linter, LinterResult, RegexLinter

from extensions.functions import dashboard_constant_names, load_constants_metadata

CONSTANTS_FILE = "constants.yaml"


def _constants_path() -> Path:
    return config.content_path / CONSTANTS_FILE


class StaleConstantsLinter(Linter):
    """
    Report constants that are past their fail_on date, or have never been verified.

    Runs once, on constants.yaml itself, and points at the line where the
    offending constant is defined.
    """

    def lint(self, file_path: Path) -> LinterResult:
        if file_path.name != CONSTANTS_FILE:
            return

        metadata = load_constants_metadata(_constants_path())
        lines = _constants_path().read_text(encoding="utf-8").splitlines()
        today = date.today()

        for name, spec in metadata.items():
            line_no = next(
                (i for i, line in enumerate(lines) if line.strip().startswith(f"{name}:")),
                0,
            )
            position = (line_no, 0, len(name))

            fail_on = spec.get("fail_on")
            last_verified = spec.get("last_verified")

            if fail_on is None:
                yield position, f"{name} has no fail_on date. Every constant must expire.", logging.WARNING
            elif fail_on <= today:
                days = (today - fail_on).days
                yield (
                    position,
                    f"{name} expired {days} days ago (fail_on: {fail_on}). "
                    f"Re-check it against the source and update last_verified.",
                    logging.ERROR,
                )

            if last_verified is None:
                yield position, f"{name} has never been verified against a source.", logging.WARNING
            elif fail_on is not None and last_verified > fail_on:
                yield (
                    position,
                    f"{name} was verified after its fail_on date. Push fail_on forward.",
                    logging.WARNING,
                )


class StaleDataFilesLinter(Linter):
    """
    Report generated data files whose own fail_on has passed.

    `content/geo/*.yaml` carries figures that guides quote and that the map and
    the dashboard draw, and those files are not in constants.yaml - so nothing
    was enforcing the `last_verified` and `fail_on` they already declared.
    That is the gap this closes: rent-bands.yaml has carried both dates since
    it shipped, and an expired ranking would have gone on being published.

    Refetching is a hand-run task per file, which is why the message names it.
    """

    REFETCH = {
        "indicators-summary.yaml": "mise dashboard-data",
        "rent-bands.yaml": "mise map-data",
        "map-summary.yaml": "mise map-data",
        "census.yaml": "mise census-data",
        "noise.yaml": "mise noise-data",
        "flights-summary.yaml": "mise flight-data",
    }

    def lint(self, file_path: Path) -> LinterResult:
        if file_path.suffix not in (".yaml", ".yml") or file_path.parent.name != "geo":
            return

        # Ursus hands linters a path RELATIVE to content_path, which is why
        # RegexLinter opens `config.content_path / file_path`. Reading
        # file_path directly raises FileNotFoundError, and because one linter
        # raising aborts the whole run, that silently stopped `mise lint`
        # before it reached any guide - a clean report that had linted almost
        # nothing. Do not drop the join.
        path = config.content_path / file_path
        raw = yaml.safe_load(path.read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            return
        meta = raw.get("meta")
        if not isinstance(meta, dict):
            return

        fail_on = meta.get("fail_on")
        if fail_on is None:
            return

        # YAML gives a date for `fail_on: 2027-09-10` and a string for the
        # quoted form. indicators-summary.yaml is generated from JSON, which
        # has no date type at all, so it is always a string there - and a
        # linter that only accepted `date` would skip the one file that most
        # needs checking, silently, for ever.
        if isinstance(fail_on, str):
            try:
                fail_on = date.fromisoformat(fail_on)
            except ValueError:
                yield (
                    (0, 0, len(file_path.name)),
                    f"{file_path.name} has fail_on: {fail_on!r}, which is not a date.",
                    logging.WARNING,
                )
                return
        elif not isinstance(fail_on, date):
            yield (
                (0, 0, len(file_path.name)),
                f"{file_path.name} has a fail_on that is not a date: {fail_on!r}.",
                logging.WARNING,
            )
            return

        today = date.today()
        if fail_on <= today:
            days = (today - fail_on).days
            how = self.REFETCH.get(file_path.name, "the script that generates it")
            yield (
                (0, 0, len(file_path.name)),
                f"{file_path.name} expired {days} days ago (fail_on: {fail_on}). "
                f"Re-run `{how}` and update the dates.",
                logging.ERROR,
            )


class UndefinedConstantsLinter(RegexLinter):
    """
    Catch {{ SOMETHING }} in content that no constant defines.

    Ursus renders templates with StrictUndefined, so an undefined constant is a
    build failure rather than a blank. This linter surfaces it with a file and a
    line number instead of a Jinja traceback.
    """

    file_suffixes = (".md",)

    # Only screaming snake case - that is the naming convention for constants,
    # and it keeps this away from `entry.title` and other legitimate context.
    regex = re.compile(r"\{\{\s*([A-Z][A-Z0-9_]{2,})\s*(?:\|[^}]*)?\}\}")

    def __init__(self):
        self._known: set[str] | None = None

    @property
    def known_constants(self) -> set[str]:
        if self._known is None:
            metadata = load_constants_metadata(_constants_path())
            names = set(metadata.keys())

            # Values derived in ursus_config.py are legitimate too. Rather than
            # duplicating that list here, allow anything that looks derived
            # from a known constant, plus the handful of site-wide globals.
            derived = set()
            for name in list(names):
                derived.update({f"{name}_ANNUAL", f"{name}_MAX", f"{name}_JSON"})
            names |= derived
            names |= {
                "SITE_URL",
                "SITE_NAME",
                "SITE_TAGLINE",
                "SITE_DESCRIPTION",
                "CONTACT_EMAIL",
                "X_HANDLE",
                "NEWSLETTER_PROVIDER",
                "X_URL",
                "API_URL",
                "RECOMMENDED",
                "PAYE_BANDS",
                "PAYE_BANDS_JSON",
                "PAYE_TOP_BAND_MIN",
                "PAYE_TOP_BAND_MIN_ANNUAL",
                "PAYE_TAX_FREE_ANNUAL",
                "VAT_LEVIES_TOTAL",
                "VAT_EFFECTIVE_RATE",
                "VAT_MULTIPLIER",
                "SSNIT_MIN_CONTRIBUTION_YEARS",
                "SSNIT_EMPLOYEE_ON_MINIMUM_WAGE",
                "MONTHLY_MINIMUM_WAGE_APPROX",
                "PAYE_WORKED_EXAMPLES",
                "PAYE_EXAMPLE",
                "RADIO_CHECKED_ON",
                "RADIO_TYPICAL_KBPS",
                "RADIO_MB_PER_HOUR",
                "RADIO_GB_PER_MONTH",
                "TYPICAL_ONE_BED_ADVANCE_TOTAL",
                "LEGAL_ONE_BED_ADVANCE_TOTAL",
                "RENT_ADVANCE_EXCESS_MONTHS",
                "ADVANCE_IN_MEDIAN_SALARIES",
                "NHIS_ACTIVATION_WAIT_MONTHS",
                "PUBLIC_HOLIDAYS",
                "PUBLIC_HOLIDAYS_JSON",
                "AVERAGE_DISTRICT_INFORMAL_PCT",
                "HIGHEST_DISTRICT_INFORMAL_PCT",
                "POULTRY_FEED_TO_LAY_500",
                "SSNIT_MAX_CONTRIBUTION_YEARS",
                "SSNIT_EARLY_FACTORS",
                "SSNIT_EARLY_FACTORS_JSON",
            }
            # The /data figures, built from the same map ursus_config.py uses,
            # so this allowlist cannot drift from what is actually defined.
            names |= dashboard_constant_names()
            for i in range(1, 7):
                names.add(f"PAYE_BAND_{i}_MAX")
                names.add(f"PAYE_BAND_{i}_MAX_ANNUAL")

            self._known = names
        return self._known

    def handle_match(self, file_path: Path, match):
        name = match.group(1)
        if name not in self.known_constants:
            yield (
                f"{{{{ {name} }}}} is not defined in constants.yaml or ursus_config.py. "
                f"This will fail the build.",
                logging.ERROR,
            )
