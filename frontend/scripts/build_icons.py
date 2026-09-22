#!/usr/bin/env python
"""
Turn Adinkra symbols into the site's icon set.

Adinkra are Akan ideograms, and each one carries a proverb. That makes them a
far better fit for this site than the generic line icons they replace: a symbol
can be chosen because of what it *means*, not because of what it looks like.
Fihankra is a walled compound - security and completeness - so it marks the
housing section. Hwe mu dua is a measuring rod - examination and scrutiny - so
it marks search. Denkyem, the crocodile that lives in water yet breathes air,
marks getting around Accra.

The meanings are not decoration. They are rendered into each icon's <title>,
so a reader who hovers a symbol learns what it says. On a site explaining Ghana
to people who are new to it, that is worth doing properly.

Source: https://github.com/JacobTheEvans/adinkra (Apache 2.0)

The upstream files are traced bitmaps: an XML declaration, a DOCTYPE, hardcoded
black fill, point-based width/height, and viewBoxes whose aspect ratios run
from 0.46 to 2.11. None of that survives contact with an icon grid, so each one
is re-centred into a square viewBox and made to inherit currentColor.

Usage:
    python scripts/build_icons.py --source /path/to/adinkra/svgs
"""

import argparse
import re
import sys
from pathlib import Path

import yaml

TEMPLATES = Path(__file__).resolve().parent.parent / "templates"
ICON_DIR = TEMPLATES / "_icons"

# The square the glyph is fitted into, and the breathing room around it.
CANVAS = 100.0
PADDING = 6.0

# ---------------------------------------------------------------------------
# The mapping. `slug` is what templates reference; `symbol` is the upstream
# filename; `meaning` is what the symbol says, and why it was chosen here.
# ---------------------------------------------------------------------------

ICONS = [
    # Identity
    ("brand", "Adinkrahene", "Adinkrahene", "Chief of the adinkra symbols. Greatness, charisma and leadership."),

    # One per collection, so every section of the site has its own symbol.
    ("moving", "Sankofa", "Sankofa", "Go back and fetch it. Return for what you left behind - the symbol of the Ghanaian diaspora."),
    ("housing", "Fihankra", "Fihankra", "A walled compound house. Security, safety and completeness."),
    ("utilities", "Mframadan", "Mframadan", "A well-ventilated house. Preparedness and fortitude against the elements."),
    ("money", "Bese-Saka", "Bese Saka", "A sack of cola nuts. Affluence, abundance and the trade that built Ghanaian markets."),
    ("rights", "Epa", "Epa", "Handcuffs. Law, justice and the obligations that bind both parties."),
    ("health", "Nyame-dua", "Nyame Dua", "God's altar. Presence and protection."),
    ("transport", "Denkyem", "Denkyem", "The crocodile lives in water yet breathes air. Adaptability - which every Accra journey demands."),
    ("culture", "Akoma-ntoso", "Akoma Ntoso", "Linked hearts. Understanding and agreement between people."),
    ("tools", "Nyansapo", "Nyansapo", "The wisdom knot. Ingenuity and cleverness - only the wise can untie it."),
    ("accuracy", "Nkyimu", "Nkyimu", "The divisions stamped onto adinkra cloth. Precision and skilfulness."),
    ("education", "Dame-dame", "Dame Dame", "The draughts board. Intelligence, strategy and ingenuity."),
    ("shopping", "Nsaa", "Nsaa", "A hand-woven blanket. Authenticity - he who does not know the genuine will buy the fake."),
    ("exploring", "Nkyinkyim", "Nkyinkyim", "Twisting. Initiative, dynamism and the winding road that takes you somewhere new."),
    ("services", "Ese-Ne-Tekrema", "Ese Ne Tekrema", "The teeth and the tongue. Interdependence - they need each other, and they do not bite."),

    # Interface furniture
    ("search", "Hwe-mu-dua", "Hwe Mu Dua", "The measuring rod. Examination, scrutiny and quality control."),
    ("guides", "Mate-masie", "Mate Masie", "What I hear, I keep. Wisdom, knowledge and prudence."),
    ("glossary", "Nea-onnim-no-sua-a_-oh", "Nea Onnim No Sua A, Ohu", "He who does not know can know from learning. Knowledge and lifelong education."),
    ("identity", "Nkonsonkonson", "Nkonsonkonson", "Chain links. Unity and human relations - we are linked in both life and death."),
    ("related", "Ananse-Ntontan", "Ananse Ntontan", "Anansi's web. Wisdom, creativity and the complexities of life."),
    ("help", "Boa-Me-Na-Me-Mmoa-Wo", "Boa Me Na Me Mmoa Wo", "Help me and let me help you. Cooperation and interdependence."),
]


def clean(svg: str, slug: str, name: str, meaning: str) -> str:
    """Re-centre an upstream symbol into a square viewBox that inherits colour."""
    view_box = re.search(r'viewBox="([^"]+)"', svg)
    if not view_box:
        raise ValueError("no viewBox")

    _, _, width, height = (float(v) for v in view_box.group(1).split())

    # Fit the longest edge, then centre the other one.
    scale = (CANVAS - 2 * PADDING) / max(width, height)
    offset_x = (CANVAS - width * scale) / 2
    offset_y = (CANVAS - height * scale) / 2

    # Keep only the drawing itself: everything between the outer <svg> tags,
    # minus the XML declaration and DOCTYPE the tracer emitted.
    body = svg[svg.index(">", svg.index("<svg")) + 1 : svg.rindex("</svg>")]
    body = re.sub(r'fill="#000000"', 'fill="currentColor"', body)
    body = body.strip()

    return (
        f'<svg class="icon adinkra" viewBox="0 0 {CANVAS:.0f} {CANVAS:.0f}" '
        f'fill="currentColor" aria-hidden="true" focusable="false" '
        f'data-symbol="{name}" data-meaning="{meaning}">'
        f"<title>{name} &mdash; {meaning}</title>"
        f'<g transform="translate({offset_x:.2f},{offset_y:.2f}) scale({scale:.5f})">'
        f"{body}"
        f"</g></svg>\n"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, help="Path to the adinkra repo's svgs/ directory")
    args = parser.parse_args()

    source = Path(args.source)
    if not source.is_dir():
        print(f"ERROR: {source} is not a directory", file=sys.stderr)
        return 1

    ICON_DIR.mkdir(parents=True, exist_ok=True)

    written = 0
    total_bytes = 0
    for slug, symbol, name, meaning in ICONS:
        src = source / f"{symbol}.svg"
        if not src.exists():
            print(f"ERROR: {src.name} not found in {source}", file=sys.stderr)
            return 1

        out = clean(src.read_text(encoding="utf-8", errors="replace"), slug, name, meaning)
        (ICON_DIR / f"{slug}.svg").write_text(out, encoding="utf-8")

        written += 1
        total_bytes += len(out.encode("utf-8"))
        print(f"  {slug:12s} <- {name:26s} {len(out):5d} b")

    # One source of truth: the About page renders its symbol legend from this,
    # so what the page says a symbol means can never drift from what the SVG
    # says in its <title>.
    registry = {
        slug: {"symbol": name, "meaning": meaning} for slug, _, name, meaning in ICONS
    }
    registry_path = Path(__file__).resolve().parent.parent / "content" / "adinkra.yaml"
    registry_path.write_text(
        "# Generated by scripts/build_icons.py. Do not edit by hand.\n"
        + yaml.safe_dump(registry, allow_unicode=True, sort_keys=False),
        encoding="utf-8",
    )
    print(f"  {'registry':12s} -> content/adinkra.yaml ({len(registry)} symbols)")

    print(f"\n{written} icons, {total_bytes / 1024:.1f} KB total, "
          f"{total_bytes / written / 1024:.1f} KB average")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
