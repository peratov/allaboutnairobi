"""
The little map of Nairobi on the home page.

The real map at /map is a module that fetches a JSON file and renders an
instrument: layers, a legend, search, zoom, a detail panel. That is the right
thing on its own page and the wrong thing in a hero, where it would be the
largest cost on the most visited page and arrive after the text beside it.

So the hero gets the geometry without the machinery. The 17 constituency shapes
are pulled out of the same nairobi-map.json at build time and inlined as one
SVG. Each is a link into the real map with that constituency selected.
"""

import json
import logging
import re
from pathlib import Path

logger = logging.getLogger(__name__)

COORD = re.compile(r"-?\d+")
PADDING = 60

# The hero draws all of Nairobi - about 5,000 map units across - into a few
# hundred pixels, so roughly ten units is one pixel. Simplifying again at that
# threshold drops detail nobody can see.
SIMPLIFY_TOLERANCE = 10


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


def build_hero_map() -> dict | None:
    source = Path(__file__).resolve().parents[2] / "templates" / "geo" / "nairobi-map.json"
    try:
        constituencies = json.loads(source.read_text(encoding="utf-8"))["constituencies"]
    except (OSError, KeyError, json.JSONDecodeError) as error:
        # A missing decoration is not worth stopping a deploy for.
        logger.warning("Hero map unavailable (%s); the home page will omit it", error)
        return None

    xs: list[int] = []
    ys: list[int] = []
    for c in constituencies:
        numbers = [int(n) for n in COORD.findall(c["path"])]
        xs.extend(numbers[0::2])
        ys.extend(numbers[1::2])
    if not xs:
        return None

    min_x, min_y = min(xs) - PADDING, min(ys) - PADDING
    return {
        "view_box": f"{min_x} {min_y} {max(xs) + PADDING - min_x} {max(ys) + PADDING - min_y}",
        "districts": [
            {"id": c["id"], "name": c["name"], "d": _redraw(c["path"], SIMPLIFY_TOLERANCE)}
            for c in constituencies
        ],
    }
