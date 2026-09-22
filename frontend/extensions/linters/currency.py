"""
Flag money written directly into a guide.

The whole point of constants.yaml is that when the National Tripartite
Committee raises the minimum wage, one file changes and every page follows. A
figure typed into prose escapes that, and eighteen months later the site is
confidently quoting last year's cedi.

Two kinds of amount are legitimately hardcoded and are not flagged:

  * Small ones. "GHS 5 for a sachet of pure water" is scene-setting, not a
    figure anyone will act on.
  * Worked examples and fixed illustrations - a sample invoice, a banknote
    denomination, a filled-in receipt template. Those opt out per file with
    `lint_ignore: [currency]` in the front matter, which is explicit and
    reviewable rather than silent.
"""

import logging
import re
from pathlib import Path

import yaml
from ursus.config import config
from ursus.linters import MatchResult, RegexLinter

# Below this, an amount is scene-setting rather than a claim.
SIGNIFICANT_AMOUNT = 100


def _lint_ignores(file_path: Path) -> set[str]:
    """Read the `lint_ignore` list from a file's front matter."""
    text = (config.content_path / file_path).read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        return set()
    end = text.find("\n---\n", 4)
    if end == -1:
        return set()
    try:
        front_matter = yaml.safe_load(text[4:end]) or {}
    except yaml.YAMLError:
        return set()
    return set(front_matter.get("lint_ignore") or [])


class CurrencyLinter(RegexLinter):
    file_suffixes = (".md",)

    regex = re.compile(r"(?:GHS|GH¢|₵|US\$|USD|\$)\s?(?P<amount>\d[\d,]*(?:\.\d+)?)")

    def __init__(self):
        self._ignore_cache: dict[Path, set[str]] = {}

    def handle_match(self, file_path: Path, match) -> MatchResult:
        if file_path not in self._ignore_cache:
            self._ignore_cache[file_path] = _lint_ignores(file_path)
        if "currency" in self._ignore_cache[file_path]:
            return

        raw = match.group("amount").replace(",", "")
        try:
            amount = float(raw)
        except ValueError:
            return

        if amount < SIGNIFICANT_AMOUNT:
            return

        yield (
            f"Hardcoded amount {match.group(0)}. Move it to constants.yaml and "
            f"interpolate it, or add `lint_ignore: [currency]` to the front "
            f"matter if it is a worked example.",
            logging.WARNING,
        )
