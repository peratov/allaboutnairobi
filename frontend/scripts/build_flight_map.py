"""
Build the nonstop route map for Kotoka International Airport.

Run by hand, like build_map_data.py and build_icons.py, because it fetches from
two places and the deploy must never depend on either being up:

    mise flight-data

It writes two things, both committed:

  templates/geo/flights.json        geometry and routes, fetched by the browser
  content/geo/flights-summary.yaml  the same without geometry, loaded into the
                                    context so the page lists every route as
                                    HTML - the no-JavaScript fallback, and what
                                    a crawler indexes

Three sources, and each is used for the thing it is actually good at:

  * **Routes** are typed out below from the Wikipedia article's airlines and
    destinations table. Written out rather than scraped, because a parser
    against a wiki table is a parser that silently loses a route the week
    somebody reformats it - and a route map missing Johannesburg is worse than
    no route map. The date it was checked is in the output and on the page.

  * **Coordinates** come from OpenFlights. That dataset is old and it does not
    matter in the least: an airport does not move. It is used for nothing else.

  * **Coastlines** come from Natural Earth 110m, simplified hard. It exists so
    a reader can tell Europe from West Africa, not to be a map of the world.

**Schedules change constantly.** Airlines add and drop routes with a few weeks'
notice, and this file is a photograph. Everything downstream says so.
"""

import csv
import json
import math
import urllib.request
from datetime import date
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
GEOMETRY_OUT = ROOT / "templates" / "geo" / "flights.json"
SUMMARY_OUT = ROOT / "content" / "geo" / "flights-summary.yaml"

AIRPORTS_URL = "https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports.dat"
WORLD_URL = (
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/"
    "geojson/ne_110m_admin_0_countries.geojson"
)

ORIGIN = "ACC"
CHECKED = "2026-09-10"
SOURCE_ARTICLE = "https://en.wikipedia.org/wiki/Kotoka_International_Airport"

# The map is cropped to the network rather than drawn as the whole world.
# Accra flies west as far as Washington and east as far as Dubai, and nothing
# it serves is beyond these, so the rest of the planet is wasted space.
BOUNDS = {"west": -95.0, "east": 62.0, "south": -38.0, "north": 62.0}

# Nonstop destinations by airline, from the Wikipedia table. `note` marks
# anything that is not a plain year-round scheduled service.
ROUTES = {
    "Africa World Airlines": ["ABV", "CKY", "KMS", "LOS", "OUA", "TKD", "TML"],
    "Air Burkina": ["OUA"],
    "Air Côte d'Ivoire": ["ABJ"],
    "Air Peace": ["LOS", "ROB", "FNA"],
    "Air Tanzania": ["DAR"],
    "ASKY": ["LFW", "ROB", "FNA", "BJL"],
    "British Airways": ["LGW", "LHR"],
    "Brussels Airlines": ["BRU"],
    "Delta Air Lines": ["JFK", "ATL"],
    "EgyptAir": ["CAI"],
    "Emirates": ["ABJ", "DXB"],
    "Ethiopian Airlines": ["ADD"],
    "Etihad Airways": ["AUH"],
    "Gianair": ["OBU"],
    "Ibom Air": ["LOS", "ABV", "QUO"],
    "ITA Airways": ["FCO"],
    "Kenya Airways": ["FNA", "ROB", "NBO"],
    "KLM": ["AMS"],
    "Middle East Airlines": ["BEY"],
    "Passion Air": ["NYI", "KMS", "TML", "WZA", "TKD"],
    "Qatar Airways": ["DOH"],
    "Royal Air Maroc": ["CMN"],
    "RwandAir": ["KGL"],
    "South African Airways": ["ABJ", "JNB"],
    "TAP Air Portugal": ["LIS", "TMS"],
    "Turkish Airlines": ["IST"],
    "United Airlines": ["IAD"],
    "United Nigeria Airlines": ["ABV", "LOS"],
}

# Routes that are not simply "running now".
NOTES = {
    ("Delta Air Lines", "ATL"): "seasonal",
    ("Africa World Airlines", "CKY"): "from August 2026",
    ("Etihad Airways", "AUH"): "from March 2027",
}

# Which part of the network a destination belongs to. Used for the filters and
# for the fallback list, and assigned by hand because "Africa" covers both a
# 45-minute hop to Lomé and a six-hour flight to Johannesburg.
REGIONS = {
    "KMS": "Domestic", "TML": "Domestic", "TKD": "Domestic", "NYI": "Domestic",
    "WZA": "Domestic", "OBU": "Domestic",
    "ABJ": "West Africa", "LFW": "West Africa", "OUA": "West Africa", "LOS": "West Africa",
    "ABV": "West Africa", "QUO": "West Africa", "CKY": "West Africa", "FNA": "West Africa",
    "ROB": "West Africa", "BJL": "West Africa", "TMS": "West Africa",
    "ADD": "Rest of Africa", "NBO": "Rest of Africa", "KGL": "Rest of Africa",
    "DAR": "Rest of Africa", "JNB": "Rest of Africa", "CAI": "Rest of Africa",
    "CMN": "Rest of Africa",
    "LHR": "Europe", "LGW": "Europe", "AMS": "Europe", "BRU": "Europe", "FCO": "Europe",
    "LIS": "Europe", "IST": "Europe",
    "DXB": "Middle East", "DOH": "Middle East", "AUH": "Middle East", "BEY": "Middle East",
    "JFK": "North America", "ATL": "North America", "IAD": "North America",
}

# Airports OpenFlights carries without an IATA code, or not at all.
#
# Wa is in the dataset under ICAO DGLW with its IATA field empty, so the join
# on IATA misses it; these are its own coordinates from that file.
#
# Obuasi has neither an IATA nor an ICAO code - it is a private airfield built
# by AngloGold Ashanti for the mine and flown by Gianair - so its position
# comes from its Wikipedia article. An earlier draft of this file guessed at
# it and was eleven kilometres out, which is the argument for looking things
# up rather than placing them from memory.
EXTRA_AIRPORTS = {
    "WZA": {"name": "Wa Airport", "city": "Wa", "country": "Ghana",
            "lat": 10.0827, "lon": -2.50767},
    "OBU": {"name": "Obuasi Airport", "city": "Obuasi", "country": "Ghana",
            "lat": 6.29056, "lon": -1.70139},
}


def fetch(url: str) -> bytes:
    print(f"  fetching {url.rsplit('/', 1)[-1]}")
    request = urllib.request.Request(url, headers={"User-Agent": "allaboutaccra-build/1.0"})
    with urllib.request.urlopen(request, timeout=120) as response:
        return response.read()


def load_airports() -> dict[str, dict]:
    text = fetch(AIRPORTS_URL).decode("utf-8")
    airports = dict(EXTRA_AIRPORTS)

    for row in csv.reader(text.splitlines()):
        if len(row) < 8:
            continue
        iata = row[4]
        if not iata or iata == "\\N":
            continue
        try:
            airports.setdefault(iata, {
                "name": row[1], "city": row[2], "country": row[3],
                "lat": float(row[6]), "lon": float(row[7]),
            })
        except ValueError:
            continue

    return airports


def great_circle_km(a: dict, b: dict) -> int:
    """Distance over the sphere, which is the distance an aircraft actually flies."""
    radius = 6371.0088
    lat1, lon1, lat2, lon2 = map(math.radians, (a["lat"], a["lon"], b["lat"], b["lon"]))
    d_lat, d_lon = lat2 - lat1, lon2 - lon1
    h = math.sin(d_lat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(d_lon / 2) ** 2
    return round(2 * radius * math.asin(math.sqrt(h)))


def project(lon: float, lat: float) -> tuple[float, float]:
    """
    Equirectangular, cropped to the network.

    Chosen over anything cleverer because every destination sits between 26
    south and 53 north, where the distortion is mild, and because a reader can
    read a rectangular world at a glance. The arcs are computed on the sphere
    and projected point by point, so they still curve correctly.
    """
    x = (lon - BOUNDS["west"]) / (BOUNDS["east"] - BOUNDS["west"]) * 1000
    y = (BOUNDS["north"] - lat) / (BOUNDS["north"] - BOUNDS["south"]) * 1000 * (
        (BOUNDS["north"] - BOUNDS["south"]) / (BOUNDS["east"] - BOUNDS["west"])
    )
    return round(x, 1), round(y, 1)


def great_circle_path(a: dict, b: dict, steps: int = 48) -> str:
    """An SVG path following the great circle, projected point by point."""
    lat1, lon1, lat2, lon2 = map(math.radians, (a["lat"], a["lon"], b["lat"], b["lon"]))
    d = 2 * math.asin(math.sqrt(
        math.sin((lat2 - lat1) / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    ))
    if d == 0:
        return ""

    points = []
    for i in range(steps + 1):
        f = i / steps
        A = math.sin((1 - f) * d) / math.sin(d)
        B = math.sin(f * d) / math.sin(d)
        x = A * math.cos(lat1) * math.cos(lon1) + B * math.cos(lat2) * math.cos(lon2)
        y = A * math.cos(lat1) * math.sin(lon1) + B * math.cos(lat2) * math.sin(lon2)
        z = A * math.sin(lat1) + B * math.sin(lat2)
        points.append(project(
            math.degrees(math.atan2(y, x)),
            math.degrees(math.atan2(z, math.sqrt(x * x + y * y))),
        ))

    return "M" + "L".join(f"{x} {y}" for x, y in points)


def simplify(points: list[tuple[float, float]], tolerance: float) -> list[tuple[float, float]]:
    """Ramer-Douglas-Peucker, same as the hero map uses."""
    if len(points) < 3:
        return points
    (ax, ay), (bx, by) = points[0], points[-1]
    dx, dy = bx - ax, by - ay
    chord = math.hypot(dx, dy)

    worst, index = 0.0, 0
    for i in range(1, len(points) - 1):
        px, py = points[i]
        distance = (abs(dx * (ay - py) - (ax - px) * dy) / chord) if chord else math.hypot(px - ax, py - ay)
        if distance > worst:
            worst, index = distance, i

    if worst <= tolerance:
        return [points[0], points[-1]]
    return simplify(points[:index + 1], tolerance)[:-1] + simplify(points[index:], tolerance)


def build_world() -> list[str]:
    """Coastlines, clipped to the crop and simplified hard."""
    world = json.loads(fetch(WORLD_URL))
    paths: list[str] = []

    for feature in world["features"]:
        geometry = feature["geometry"]
        polygons = geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]

        for polygon in polygons:
            ring = polygon[0]
            # Skip anything wholly outside the crop rather than drawing it and
            # letting the viewBox hide it.
            lons = [p[0] for p in ring]
            lats = [p[1] for p in ring]
            if max(lons) < BOUNDS["west"] or min(lons) > BOUNDS["east"]:
                continue
            if max(lats) < BOUNDS["south"] or min(lats) > BOUNDS["north"]:
                continue

            projected = [project(lon, lat) for lon, lat in ring]
            reduced = simplify(projected, 1.4)
            if len(reduced) < 3:
                continue
            paths.append("M" + "L".join(f"{x} {y}" for x, y in reduced) + "Z")

    return paths


def main() -> None:
    print("Building the Kotoka route map")
    airports = load_airports()

    origin = airports[ORIGIN]
    served: dict[str, dict] = {}
    unknown: set[str] = set()

    for airline, destinations in ROUTES.items():
        for code in destinations:
            airport = airports.get(code)
            if not airport:
                unknown.add(code)
                continue

            entry = served.setdefault(code, {
                "iata": code,
                "name": airport["name"],
                "city": airport["city"],
                "country": airport["country"],
                "lat": airport["lat"],
                "lon": airport["lon"],
                "region": REGIONS.get(code, "Other"),
                "km": great_circle_km(origin, airport),
                "airlines": [],
            })
            entry["airlines"].append({
                "name": airline,
                **({"note": NOTES[(airline, code)]} if (airline, code) in NOTES else {}),
            })

    # A destination that cannot be placed must stop the build. Drawing 37 of 38
    # routes and saying nothing would be exactly the quiet wrongness this
    # repository keeps trying to avoid.
    assert not unknown, f"No coordinates for: {sorted(unknown)}. Add them to EXTRA_AIRPORTS."

    destinations = sorted(served.values(), key=lambda d: (-d["km"], d["city"]))
    for destination in destinations:
        destination["airlines"].sort(key=lambda a: a["name"])
        destination["path"] = great_circle_path(origin, destination)
        destination["x"], destination["y"] = project(destination["lon"], destination["lat"])

    ox, oy = project(origin["lon"], origin["lat"])
    width, height = project(BOUNDS["east"], BOUNDS["south"])

    payload = {
        "meta": {
            "generated": CHECKED,
            "origin": {"iata": ORIGIN, "name": origin["name"], "city": origin["city"],
                       "lat": origin["lat"], "lon": origin["lon"], "x": ox, "y": oy},
            "viewBox": f"0 0 {width} {height}",
            "sources": [
                {"what": "Airlines and nonstop destinations", "who": "Wikipedia",
                 "url": SOURCE_ARTICLE, "licence": "CC BY-SA 4.0"},
                {"what": "Airport coordinates", "who": "OpenFlights",
                 "url": "https://openflights.org/data.html", "licence": "ODbL"},
                {"what": "Coastlines", "who": "Natural Earth",
                 "url": "https://www.naturalearthdata.com", "licence": "Public domain"},
            ],
            "caveat": (
                "A photograph of the schedule on the date generated. Airlines add and "
                "drop routes with a few weeks' notice. Always check with the airline."
            ),
        },
        "world": build_world(),
        "destinations": destinations,
    }

    GEOMETRY_OUT.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )

    # The same thing without geometry, for the page to render as HTML.
    summary = {
        "meta": {k: v for k, v in payload["meta"].items() if k != "origin"},
        "origin": payload["meta"]["origin"],
        "destinations": [
            {k: v for k, v in d.items() if k not in ("path", "x", "y")}
            for d in destinations
        ],
    }
    SUMMARY_OUT.write_text(
        yaml.safe_dump(summary, sort_keys=False, allow_unicode=True), encoding="utf-8"
    )

    airlines = sorted({a["name"] for d in destinations for a in d["airlines"]})
    regions: dict[str, int] = {}
    for d in destinations:
        regions[d["region"]] = regions.get(d["region"], 0) + 1

    print(f"\n  {len(destinations)} nonstop destinations, {len(airlines)} airlines")
    for region, count in sorted(regions.items(), key=lambda kv: -kv[1]):
        print(f"    {region:<16} {count}")
    print(f"  furthest: {destinations[0]['city']} at {destinations[0]['km']:,}km")
    print(f"  world outline: {len(payload['world'])} paths")
    print(f"\n  {GEOMETRY_OUT.relative_to(ROOT)}  {GEOMETRY_OUT.stat().st_size / 1024:.1f}KB")
    print(f"  {SUMMARY_OUT.relative_to(ROOT)}  {SUMMARY_OUT.stat().st_size / 1024:.1f}KB")


if __name__ == "__main__":
    main()
