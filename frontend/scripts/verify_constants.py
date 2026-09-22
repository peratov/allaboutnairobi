#!/usr/bin/env python
"""
Print a verification worklist for content/constants.yaml.

`ursus lint` tells you a constant has expired. This tells you what to do about
it: what the number currently says, where it came from, when a human last
checked it, and how overdue it is - sorted by urgency, so you can work down the
list with the GRA website open in another tab.

Usage:
    python scripts/verify_constants.py            # everything expired or due soon
    python scripts/verify_constants.py --all      # every constant
    python scripts/verify_constants.py --days 90  # expiring within 90 days
"""

import argparse
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from extensions.functions import load_constants_metadata  # noqa: E402

CONSTANTS_PATH = Path(__file__).resolve().parent.parent / "content" / "constants.yaml"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--all", action="store_true", help="Show every constant, not just the stale ones.")
    parser.add_argument("--days", type=int, default=30, help="Also show constants expiring within this many days.")
    args = parser.parse_args()

    metadata = load_constants_metadata(CONSTANTS_PATH)
    today = date.today()

    rows = []
    for name, spec in metadata.items():
        fail_on = spec.get("fail_on")
        days_left = (fail_on - today).days if fail_on else None

        if not args.all:
            if days_left is None or days_left > args.days:
                continue

        rows.append((days_left if days_left is not None else 10**6, name, spec, days_left))

    rows.sort()

    if not rows:
        print(f"All {len(metadata)} constants are verified and none expire within {args.days} days.")
        return 0

    expired = [r for r in rows if r[3] is not None and r[3] <= 0]

    print(f"{len(metadata)} constants defined. {len(expired)} expired, {len(rows) - len(expired)} due soon.\n")

    for _, name, spec, days_left in rows:
        if days_left is None:
            status = "NO EXPIRY SET"
        elif days_left <= 0:
            status = f"EXPIRED {-days_left} days ago"
        else:
            status = f"due in {days_left} days"

        value = spec.get("value")
        unit = spec.get("unit", "")
        print(f"  {name}")
        print(f"      value:         {value} {unit}".rstrip())
        print(f"      status:        {status}")
        print(f"      last verified: {spec.get('last_verified', 'never')}")

        description = " ".join(str(spec.get("description", "")).split())
        if description:
            print(f"      source:        {description}")
        print()

    print("Update the value if it changed, then set last_verified to today and push")
    print("fail_on to the next time it is likely to be revised.")

    return 1 if expired else 0


if __name__ == "__main__":
    raise SystemExit(main())
