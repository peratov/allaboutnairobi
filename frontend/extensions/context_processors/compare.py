"""
The neighbourhood comparer (/tools/neighbourhood-comparer).

Everything it shows is already on /map, from templates/geo/nairobi-map.json.
What this adds, once, at build time, is the join a reader would otherwise do
by hand:

- each neighbourhood's own rent band and map position;
- the constituency it sits in, for the WorldPop crowding estimate and Meta's
  relative wealth index (17 of them);
- the 2019 census sub-county it falls in, found by putting its point inside
  the sub-county shapes, for homes, water, cooking, internet and age (11);
- straight-line distances from the neighbourhood's own point - not a
  district centre - to the CBD, JKIA and Westlands.

Ranks are computed here, from both ends, so "3rd most crowded of 17" needs no
arithmetic in the browser.
"""

import json
import re
from math import hypot
from pathlib import Path

# Not homes: the comparer is for choosing where to live.
SKIP = {"CBD", "Industrial Area"}

# Where everyone measures from, by landmark id on the map.
ANCHORS = {
    "cbd": ("kicc", "the CBD"),
    "jkia": ("jomo-kenyatta-international-airport", "JKIA"),
    "westlands": ("sarit-centre", "Westlands"),
}

# Neighbourhood name -> the guide that covers it.
GUIDES = {
    "Kilimani": "guides/living-in-kilimani.md",
    "Hurlingham": "guides/living-in-kilimani.md",
    "Westlands": "guides/living-in-westlands.md",
    "Parklands": "guides/living-in-westlands.md",
    "Lavington": "guides/living-in-lavington-and-kileleshwa.md",
    "Kileleshwa": "guides/living-in-lavington-and-kileleshwa.md",
    "Karen": "guides/living-in-karen-and-langata.md",
    "Lang'ata": "guides/living-in-karen-and-langata.md",
    "Runda": "guides/living-in-runda-gigiri-and-muthaiga.md",
    "Gigiri": "guides/living-in-runda-gigiri-and-muthaiga.md",
    "Muthaiga": "guides/living-in-runda-gigiri-and-muthaiga.md",
    "South B": "guides/living-in-south-b-and-south-c.md",
    "South C": "guides/living-in-south-b-and-south-c.md",
}

CENSUS_FIELDS = (
    "density", "householdSize", "rentingPct", "pipedPct", "sewerPct",
    "cleanCookingPct", "electricityPct", "internetPct",
    "under15Pct", "age20to34Pct", "over64Pct",
)


def slug(text: str) -> str:
    """The map's own slug() - apostrophes dropped, so Lang'ata is langata."""
    return re.sub(r"[^a-z0-9]+", "-", str(text).lower().replace("'", "")).strip("-")


def _rings(path: str):
    rings = []
    for part in re.split(r"M", path):
        points = re.findall(r"(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)", part)
        if points:
            rings.append([(float(x), float(y)) for x, y in points])
    return rings


def _inside(x: float, y: float, rings) -> bool:
    # Even-odd over every ring, so a hole is a hole.
    hit = False
    for ring in rings:
        j = len(ring) - 1
        for i, (xi, yi) in enumerate(ring):
            xj, yj = ring[j]
            if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
                hit = not hit
            j = i
    return hit


def _rank(items, field):
    values = [i[field] for i in items if i.get(field) is not None]
    falling = sorted(values, reverse=True)
    rising = sorted(values)
    for i in items:
        v = i.get(field)
        i.setdefault("rank", {})[field] = [falling.index(v) + 1, rising.index(v) + 1] if v is not None else None


def build_compare(templates_path: Path, content_path: Path, is_released) -> dict:
    geo = json.loads((templates_path / "geo" / "nairobi-map.json").read_text(encoding="utf-8"))
    metres = geo["meta"]["metresPerUnit"]
    marks = {l["id"]: l for l in geo["landmarks"]}
    for lm, _ in ANCHORS.values():
        assert lm in marks, f"comparer: no landmark {lm}"

    constituencies = [
        {"id": c["id"], "name": c["name"], "density": c.get("density"), "rwi": c.get("rwi"),
         "population": c.get("population"), "areaKm2": c.get("areaKm2")}
        for c in geo["constituencies"]
    ]
    by_constituency = {c["id"]: c for c in constituencies}
    _rank(constituencies, "density")
    _rank(constituencies, "rwi")

    subcounties = []
    shapes = []
    for s in geo["subcounties"]:
        sub = {"id": s["id"], "name": s["name"], "areaKm2": s.get("areaKm2"), "population": s.get("population")}
        sub.update({f: s.get(f) for f in CENSUS_FIELDS})
        subcounties.append(sub)
        shapes.append((sub, _rings(s["path"])))
    for field in CENSUS_FIELDS:
        _rank(subcounties, field)

    def km(x, y, lm):
        m = marks[lm]
        return round(hypot(m["x"] - x, m["y"] - y) * metres / 1000, 1)

    places = []
    for n in geo["neighbourhoods"]:
        if n["name"] in SKIP:
            continue
        x, y = n["x"], n["y"]
        sub = next((s for s, rings in shapes if _inside(x, y, rings)), None)
        if sub is None:
            # On a boundary line: the nearest sub-county label.
            sub = min(geo["subcounties"], key=lambda s: hypot(s["label"][0] - x, s["label"][1] - y))
            sub = next(s for s in subcounties if s["id"] == sub["id"])
        assert n["constituency"] in by_constituency, f"comparer: {n['name']} has no constituency"
        guide = GUIDES.get(n["name"])
        if guide:
            assert (content_path / guide).exists(), f"comparer: no {guide}"
        places.append({
            "key": slug(n["name"]),
            "name": n["name"],
            "rent": n.get("rent"),
            "constituency": n["constituency"],
            "subcounty": sub["id"],
            "km": {key: km(x, y, lm) for key, (lm, _) in ANCHORS.items()},
            "guide": "/" + guide[: -len(".md")] if guide and is_released(guide) else None,
            "map": f"#rent/{slug(n['name'])}" if n.get("rent") else f"#constituency/{n['constituency']}",
        })
    places.sort(key=lambda p: p["name"])
    keys = [p["key"] for p in places]
    assert len(keys) == len(set(keys)), "comparer: two neighbourhoods share a key"
    for name in GUIDES:
        assert name in {p["name"] for p in places}, f"comparer: no neighbourhood {name}"
    for key in ("cbd", "jkia"):
        values = sorted(p["km"][key] for p in places)
        for p in places:
            p.setdefault("rank", {})[key] = [len(values) - values[::-1].index(p["km"][key]), values.index(p["km"][key]) + 1]

    bands = {int(k): v for k, v in geo["rentBands"].items()}
    return {
        "places": places,
        "constituencies": constituencies,
        "subcounties": subcounties,
        "bands": bands,
        "anchors": {key: name for key, (_, name) in ANCHORS.items()},
    }
