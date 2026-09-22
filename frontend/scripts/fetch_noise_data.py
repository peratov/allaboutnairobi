"""
Build the inputs for the map's noise layers.

Run by hand:

    mise noise-data

It writes content/geo/noise.yaml, which is committed.

READ THIS BEFORE TRUSTING THE COLOURS.

Nobody publishes measured ambient noise by district for Accra. The EPA
monitors noise and sets zone-based permissible limits, but there is no open
series of decibel readings per assembly, so this does not pretend to be one.
**There are no decibels anywhere in the output**, on purpose.

What it does instead is count the things that make cities loud, from data that
does exist:

  * major road length per square kilometre, from OpenStreetMap. Traffic is the
    dominant source of urban noise nearly everywhere, and Accra is not an
    exception.
  * noisy premises per square kilometre - markets, industrial land, places of
    worship with outdoor systems, bars and nightclubs. Also OpenStreetMap.
  * people per square kilometre, from the 2021 census.

Those three are published separately on the map so a reader can see what is
driving what. The combined layer averages their RANKS, equally weighted, which
is the one way to combine them that invents no coefficients. It is labelled
modelled, not measured, everywhere it appears.

Two approximations worth naming. A road is attributed to the district holding
its midpoint, so a road on a boundary lands on one side; at 29 districts and
3,000 roads that washes out. And lengths and areas use an equirectangular
approximation, which at Accra's latitude is within a fraction of a percent.
"""

import hashlib
import json
import math
import re
import tempfile
import time
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "content" / "geo" / "noise.yaml"
SUMMARY = ROOT / "content" / "geo" / "map-summary.yaml"

# The public instance times out on a geometry query this size, so the work is
# split into tiles and tried across mirrors. Neither on its own was enough.
OVERPASS_MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.osm.ch/api/interpreter",
]
TILES = 3  # per axis, so nine requests for the region
GEOBOUNDARIES = "https://www.geoboundaries.org/api/current/gbOpen/GHA/ADM2/"
USER_AGENT = "AllAboutAccra-map-builder/1.0 (https://www.allaboutaccra.com)"

# Greater Accra, generously.
BBOX = (5.35, -0.75, 6.15, 0.80)  # south, west, north, east

REGION_OF_INTEREST = "Greater Accra"

# Kilometres per degree at Accra's latitude.
KM_PER_DEG_LAT = 110.57
KM_PER_DEG_LON = 111.32 * math.cos(math.radians(5.75))

# Reuse the joins that build_map_data.py already proved correct.
import sys
sys.path.insert(0, str(ROOT))
from scripts.build_map_data import (  # noqa: E402
    CENSUS_ALIASES, centroid_of, display_name, match_district, point_in_rings,
    rings_of, slugify,
)


def fetch(url, data=None):
    request = urllib.request.Request(
        url,
        data=data.encode("utf-8") if data else None,
        headers={"User-Agent": USER_AGENT},
    )
    with urllib.request.urlopen(request, timeout=300) as response:
        return response.read()


CACHE = Path(tempfile.gettempdir()) / "allaboutaccra-overpass"


def overpass(query):
    """
    One query, tried across mirrors until one answers.

    Cached on disk by query hash. Nine tiled geometry queries take about ten
    minutes against public Overpass, and the first run of this script threw all
    of it away over one unmatched district name.
    """
    CACHE.mkdir(exist_ok=True)
    key = CACHE / (hashlib.sha256(query.encode("utf-8")).hexdigest()[:16] + ".json")
    if key.exists():
        return json.loads(key.read_text(encoding="utf-8"))

    last = None
    for attempt in range(2):
        for mirror in OVERPASS_MIRRORS:
            try:
                payload = fetch(mirror, "data=" + urllib.parse.quote(query))
                key.write_bytes(payload)
                return json.loads(payload)
            except Exception as exc:  # noqa: BLE001 - mirrors fail routinely
                last = f"{mirror.split('/')[2]}: {exc}"
                time.sleep(3)
    raise SystemExit(f"Every Overpass mirror refused the query. Last: {last}")


def tiles(bbox, n=TILES):
    """Split a bbox into n x n tiles, so no single query is too big to serve."""
    south, west, north, east = bbox
    dy = (north - south) / n
    dx = (east - west) / n
    for row in range(n):
        for col in range(n):
            yield (south + row * dy, west + col * dx,
                   south + (row + 1) * dy, west + (col + 1) * dx)


def overpass_tiled(build_query, bbox, label):
    """Run one query per tile and concatenate the elements."""
    elements = []
    seen = set()
    for i, tile in enumerate(tiles(bbox), start=1):
        box = "{0},{1},{2},{3}".format(*tile)
        result = overpass(build_query(box))
        added = 0
        for element in result.get("elements", []):
            key = (element.get("type"), element.get("id"))
            if key in seen:
                continue
            seen.add(key)
            elements.append(element)
            added += 1
        print(f"    tile {i}/{TILES * TILES}: +{added}")
        time.sleep(2)
    print(f"  {len(elements)} {label}")
    return elements


def planar_length_km(points):
    """Length of a polyline in km, equirectangular."""
    total = 0.0
    for i in range(len(points) - 1):
        dx = (points[i + 1]["lon"] - points[i]["lon"]) * KM_PER_DEG_LON
        dy = (points[i + 1]["lat"] - points[i]["lat"]) * KM_PER_DEG_LAT
        total += math.hypot(dx, dy)
    return total


def ring_area_km2(ring):
    """Shoelace on equirectangular coordinates."""
    total = 0.0
    for i in range(len(ring) - 1):
        x1 = ring[i][0] * KM_PER_DEG_LON
        y1 = ring[i][1] * KM_PER_DEG_LAT
        x2 = ring[i + 1][0] * KM_PER_DEG_LON
        y2 = ring[i + 1][1] * KM_PER_DEG_LAT
        total += x1 * y2 - x2 * y1
    return abs(total) / 2


def element_point(element):
    """One representative coordinate for any OSM element."""
    if "lat" in element and "lon" in element:
        return element["lon"], element["lat"]
    if "center" in element:
        return element["center"]["lon"], element["center"]["lat"]
    geometry = element.get("geometry") or []
    if geometry:
        middle = geometry[len(geometry) // 2]
        return middle["lon"], middle["lat"]
    return None


def main():
    south, west, north, east = BBOX
    box = f"{south},{west},{north},{east}"

    # Full resolution here, not the simplified geometry the map draws with.
    #
    # Every figure in this file is per square kilometre, so an area that is
    # wrong makes all three wrong together, and the simplified boundaries put
    # some districts through as few as seven vertices. In practice it moved the
    # numbers very little - Ayawaso Central went from 1.7 km² to 1.6 - so this
    # is about measuring on the right basis rather than about a bug it fixed.
    #
    # It did settle one question. Ayawaso Central really does contain no
    # motorway, trunk, primary or secondary road by OpenStreetMap's
    # classification; that zero is the source data, not a casualty of
    # simplification. Adabraka's streets are tagged below secondary. The page
    # says so, and the combined score leans on the other two ingredients there.
    print("Fetching district boundaries at full resolution...")
    meta = json.loads(fetch(GEOBOUNDARIES))
    adm2 = json.loads(fetch(meta["gjDownloadURL"]))

    # Only the districts that sit inside the bbox; the region assignment is
    # already settled in build_map_data, so match on the census names here.
    # The map summary is the authority on which districts exist and what their
    # ids are. Matching geoBoundaries names against those official names is the
    # same join build_map_data already makes and proves - "Accra Metropolis"
    # against "Accra Metropolitan" - rather than a second guess at it here.
    summary = yaml.safe_load(SUMMARY.read_text(encoding="utf-8"))
    wanted = {d["id"]: d for d in summary["districts"]}

    districts = []
    for feature in adm2["features"]:
        rings = rings_of(feature["geometry"])
        if not rings:
            continue
        name = feature["properties"]["shapeName"].strip()
        centroid = centroid_of(rings)
        if not (west <= centroid[0] <= east and south <= centroid[1] <= north):
            continue
        districts.append({
            "geo_name": name,
            "rings": rings,
            "centroid": centroid,
            "area_km2": sum(ring_area_km2(r) for r in rings),
            "road_km": 0.0,
            "premises": 0,
        })
    print(f"  {len(districts)} districts inside the bounding box")

    print("Fetching major roads from OpenStreetMap...")
    road_elements = overpass_tiled(
        lambda b: (
            '[out:json][timeout:180];'
            f'(way["highway"~"^(motorway|trunk|primary|secondary)$"]({b}););'
            "out geom;"
        ),
        BBOX,
        "road ways",
    )

    print("Fetching noisy premises...")
    premises_elements = overpass_tiled(
        lambda b: (
            '[out:json][timeout:180];'
            f'(nwr["amenity"="marketplace"]({b});'
            f' nwr["landuse"="industrial"]({b});'
            f' nwr["amenity"~"^(place_of_worship|nightclub|bar)$"]({b}););'
            "out center;"
        ),
        BBOX,
        "premises",
    )

    # A bounding box per district, so a point is tested against the two or
    # three districts it could possibly be in rather than all twenty-nine.
    # Without it, per-segment attribution is too slow to run.
    for district in districts:
        xs = [p[0] for ring in district["rings"] for p in ring]
        ys = [p[1] for ring in district["rings"] for p in ring]
        district["bbox"] = (min(xs), min(ys), max(xs), max(ys))

    def district_at(lon, lat):
        for district in districts:
            x1, y1, x2, y2 = district["bbox"]
            if not (x1 <= lon <= x2 and y1 <= lat <= y2):
                continue
            if point_in_rings((lon, lat), district["rings"]):
                return district
        return None

    print("Assigning to districts...")

    # Per SEGMENT, not per way.
    #
    # Attributing a whole road to the district containing its midpoint gave
    # Ayawaso Central - 1.7 km² of Adabraka and Kokomlemle - zero major roads,
    # which is not quiet, it is a measurement artefact: roads cross a district
    # that small without their midpoints landing in it. Each segment now counts
    # against the district it actually runs through, so a road crossing four
    # districts contributes to all four in proportion.
    for way in road_elements:
        geometry = way.get("geometry") or []
        for i in range(len(geometry) - 1):
            a, b = geometry[i], geometry[i + 1]
            district = district_at((a["lon"] + b["lon"]) / 2, (a["lat"] + b["lat"]) / 2)
            if district:
                district["road_km"] += planar_length_km([a, b])

    for element in premises_elements:
        point = element_point(element)
        if not point:
            continue
        district = district_at(*point)
        if district:
            district["premises"] += 1

    # --- join to the census districts ---------------------------------------
    rows = []
    lookup = {d["geo_name"]: d for d in districts}
    unmatched = []

    for district_id, district in wanted.items():
        key = match_district(district["name"], lookup)
        target = lookup.get(key) if key else None
        if target is None:
            unmatched.append(f"{district['name']} ({district_id})")
            continue

        area = target["area_km2"] or 1
        rows.append({
            "id": district_id,
            "name": district["name"],
            "osm_name": target["geo_name"],
            "area_km2": round(area, 1),
            "road_km": round(target["road_km"], 1),
            "road_km_per_km2": round(target["road_km"] / area, 3),
            "premises": target["premises"],
            "premises_per_km2": round(target["premises"] / area, 3),
            "people_per_km2": round(district["population"] / area),
        })

    if unmatched:
        raise SystemExit(f"Could not place: {unmatched}")

    rows.sort(key=lambda r: r["id"])

    payload = {
        "meta": {
            "generated": date.today().isoformat(),
            "what": (
                "Inputs for the map's modelled noise layers. Not measured noise "
                "and not decibels - nobody publishes ambient noise by district "
                "for Accra."
            ),
            "sources": [
                "Roads and premises: OpenStreetMap contributors, ODbL",
                "Population: Ghana Statistical Service, 2021 Population and Housing Census",
                "District boundaries and areas: geoBoundaries (gbOpen), CC BY 4.0",
            ],
            "method": (
                "Road length and premises counted within each district and "
                "divided by its area. Roads are attributed to the district "
                "containing their midpoint. The combined layer averages the "
                "three quintile ranks with equal weight, which introduces no "
                "coefficients."
            ),
        },
        "districts": rows,
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        yaml.safe_dump(payload, allow_unicode=True, sort_keys=False, width=100),
        encoding="utf-8",
    )
    print(f"\nWrote {OUTPUT.relative_to(ROOT)} - {len(rows)} districts")
    loudest = sorted(rows, key=lambda r: -r["road_km_per_km2"])[:3]
    print("  densest road networks:", [(r["id"], r["road_km_per_km2"]) for r in loudest])


if __name__ == "__main__":
    main()
