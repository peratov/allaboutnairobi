"""
The little map of Greater Accra on the home page.

The real map at /map is a 44KB module that fetches a 112KB JSON file and
renders an instrument: layers, a legend, search, zoom, a detail panel. That is
the right thing on its own page and the wrong thing in a hero, where it would
be the largest cost on the site's most visited page and would arrive after the
text it sits beside.

So the hero gets the geometry without the machinery. The 29 Greater Accra
district shapes are pulled out of the same accra-map.json at build time and
inlined as one SVG - about 18KB of path data, which compresses to a few KB and
costs no request at all. Each district is a link into the real map with that
district already selected, which /map's applyHash() understands.

The result paints with the page, works with JavaScript off, and stays in step
with the map automatically: this reads the same file the browser does, so
`mise map-data` updates both.
"""

import json
import logging
import re
from pathlib import Path

from ursus.context_processors import Context, ContextProcessor

logger = logging.getLogger(__name__)

# The generated paths use only M, L and Z with integer coordinates, so pulling
# every number out in order and pairing them is enough to find the extent.
COORD = re.compile(r"-?\d+")

# Breathing room around the shapes, in map units, so the coastline does not sit
# flush against the edge of the viewBox.
PADDING = 60

# How far a point may sit from the line it is dropped from, in map units.
#
# accra-map.json is already simplified for /map, where the reader can zoom into
# a single assembly. The hero draws all of Greater Accra - about 3,700 map units
# across - into a few hundred pixels, so roughly eight units is one pixel and
# detail below that cannot be seen. Simplifying again at that threshold halves
# the path data with nothing visible lost. The file itself is untouched: this
# only affects the copy inlined into the home page.
SIMPLIFY_TOLERANCE = 8


def _simplify(points: list[tuple[int, int]], tolerance: float) -> list[tuple[int, int]]:
    """Ramer-Douglas-Peucker: drop points that sit on the line they span."""
    if len(points) < 3:
        return points

    (ax, ay), (bx, by) = points[0], points[-1]
    dx, dy = bx - ax, by - ay
    chord = (dx * dx + dy * dy) ** 0.5

    worst, index = 0.0, 0
    for i in range(1, len(points) - 1):
        px, py = points[i]
        if chord:
            distance = abs(dx * (ay - py) - (ax - px) * dy) / chord
        else:
            # A closed ring hands us the same point at both ends, so there is no
            # chord to measure against; fall back to distance from that point.
            distance = ((px - ax) ** 2 + (py - ay) ** 2) ** 0.5
        if distance > worst:
            worst, index = distance, i

    if worst <= tolerance:
        return [points[0], points[-1]]

    left = _simplify(points[: index + 1], tolerance)
    right = _simplify(points[index:], tolerance)
    return left[:-1] + right


def _redraw(path: str, tolerance: float) -> str:
    """Rebuild an M/L/Z path with each of its rings simplified."""
    rings = []
    for ring in path.split("M"):
        if not ring.strip():
            continue
        numbers = [int(n) for n in COORD.findall(ring)]
        points = _simplify(list(zip(numbers[0::2], numbers[1::2])), tolerance)
        rings.append("M" + "L".join(f"{x} {y}" for x, y in points) + "Z")
    return "".join(rings)


class HeroMapProcessor(ContextProcessor):
    def process(self, context: Context, changed_files: set[Path] | None = None) -> None:
        source = Path(__file__).resolve().parents[2] / "templates" / "geo" / "accra-map.json"

        try:
            districts = json.loads(source.read_text(encoding="utf-8"))["districts"]
        except (OSError, KeyError, json.JSONDecodeError) as error:
            # The home page falls back to no map rather than failing the build:
            # a missing decoration is not worth stopping a deploy for.
            logger.warning("Hero map unavailable (%s); the home page will omit it", error)
            context["HERO_MAP"] = None
            return

        xs: list[int] = []
        ys: list[int] = []
        for district in districts:
            numbers = [int(n) for n in COORD.findall(district["d"])]
            xs.extend(numbers[0::2])
            ys.extend(numbers[1::2])

        if not xs or not ys:
            context["HERO_MAP"] = None
            return

        min_x, min_y = min(xs) - PADDING, min(ys) - PADDING
        width = (max(xs) + PADDING) - min_x
        height = (max(ys) + PADDING) - min_y

        shapes = [
            {
                "id": d["id"],
                "name": d["name"],
                "d": _redraw(d["d"], SIMPLIFY_TOLERANCE),
            }
            for d in districts
        ]

        logger.info(
            "Hero map: %d districts, %d bytes of path data (from %d)",
            len(shapes),
            sum(len(s["d"]) for s in shapes),
            sum(len(d["d"]) for d in districts),
        )

        context["HERO_MAP"] = {
            "view_box": f"{min_x} {min_y} {width} {height}",
            "districts": shapes,
        }
