"""
Build the data behind /map: templates/geo/nairobi-map.json and
content/geo/map-summary.yaml.

Run from frontend/:

    python scripts/build_nairobi_map.py

Inputs, downloaded once into scripts/.cache/ and reused after that:

  - Constituency boundaries: geoBoundaries gbOpen KEN ADM2 (IEBC, via OCHA),
    CC BY 3.0 IGO. Nairobi's 17 constituencies.
  - County outline: geoBoundaries gbOpen KEN ADM1, public domain.
  - Population: 2019 Kenya Population and Housing Census, Volume III, via the
    OCHA subnational population statistics on HDX, CC BY-IGO.
  - Population distribution: WorldPop 2020, 1 km, UN-adjusted, CC BY 4.0.

The census publishes Nairobi by its 11 administrative sub-counties, whose
boundaries do not follow the 17 constituencies - even the ones that share a
name differ by 15-20% in area. So the census figures are kept at the level they
were published (the table under the map), and each constituency gets an
*estimate*: the census county total, shared out in proportion to WorldPop's
modelled population inside the constituency. The map labels it as such.

geoBoundaries names two shapes by old division names: its "Kilimani" is
Dagoretti North (it contains Kawangware, Kileleshwa and Kilimani wards) and its
"Dagoretti" is Dagoretti South (Riruta, Waithaka, Uthiru). They are renamed.

Landmarks and neighbourhood labels come from content/geo/landmarks.yaml.

Coordinates are projected to a flat plane around Nairobi, one unit per ten
metres, with north up. At 1.3 degrees south the distortion of a plain
equirectangular projection over 40 km is far below what a screen can show.
"""

from __future__ import annotations

import json
import math
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from datetime import date
from pathlib import Path

import yaml
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
CACHE = Path(__file__).resolve().parent / ".cache"
OUT_JSON = ROOT / "templates" / "geo" / "nairobi-map.json"
OUT_SUMMARY = ROOT / "content" / "geo" / "map-summary.yaml"
LANDMARKS = ROOT / "content" / "geo" / "landmarks.yaml"

ADM2_URL = ("https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/KEN/ADM2/"
            "geoBoundaries-KEN-ADM2.geojson")
ADM1_API = "https://www.geoboundaries.org/api/current/gbOpen/KEN/ADM1/"
POP_URL = ("https://data.humdata.org/dataset/26801642-7088-4149-9605-6ae282897937/"
           "resource/e57fb9a8-96dc-4a21-849b-1ddbc4ed7803/download/ken_admpop_2019.xlsx")
WORLDPOP_URL = ("https://data.worldpop.org/GIS/Population/Global_2000_2020_1km_UNadj/2020/KEN/"
                "ken_ppp_2020_1km_Aggregated_UNadj.tif")
USER_AGENT = "allaboutnairobi-map-build/1.0"

LON0, LAT0 = 36.82, -1.29
M_PER_DEG_LAT = 110_574.0
M_PER_DEG_LON = 111_320.0 * math.cos(math.radians(LAT0))
METRES_PER_UNIT = 10.0
SIMPLIFY_METRES = 25.0
PAD_UNITS = 150
SAMPLE_DEG = 0.002

RENAMES = {"Kilimani": "Dagoretti North", "Dagoretti": "Dagoretti South", "Langata": "Lang'ata"}
EXPECTED = sorted(["Westlands", "Dagoretti North", "Dagoretti South", "Lang'ata", "Kibra", "Roysambu",
                   "Kasarani", "Ruaraka", "Embakasi South", "Embakasi North", "Embakasi Central",
                   "Embakasi East", "Embakasi West", "Makadara", "Kamukunji", "Starehe", "Mathare"])


def fetch(url: str, name: str) -> Path:
    CACHE.mkdir(exist_ok=True)
    path = CACHE / name
    if not path.exists():
        print(f"  downloading {name}")
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(request, timeout=300) as response:
            path.write_bytes(response.read())
    return path


def fetch_adm1() -> Path:
    path = CACHE / "ken-adm1.geojson"
    if path.exists():
        return path
    request = urllib.request.Request(ADM1_API, headers={"User-Agent": USER_AGENT})
    meta = json.loads(urllib.request.urlopen(request, timeout=60).read())
    return fetch(meta["gjDownloadURL"], "ken-adm1.geojson")


def slug(name: str) -> str:
    out = "".join(c if c.isalnum() else "-" for c in name.lower().replace("'", ""))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-")


def project(lon: float, lat: float) -> tuple[float, float]:
    return ((lon - LON0) * M_PER_DEG_LON / METRES_PER_UNIT,
            -(lat - LAT0) * M_PER_DEG_LAT / METRES_PER_UNIT)


def polygons(geometry: dict) -> list[list[list[list[float]]]]:
    """Every polygon as [outer, *holes]."""
    return [geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"]


def point_in_ring(x: float, y: float, ring) -> bool:
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def in_geometry(lon: float, lat: float, geometry: dict) -> bool:
    for polygon in polygons(geometry):
        if point_in_ring(lon, lat, polygon[0]) and not any(point_in_ring(lon, lat, h) for h in polygon[1:]):
            return True
    return False


def signed_area(ring) -> float:
    return sum(ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1] for i in range(len(ring) - 1)) / 2


def centroid(ring) -> tuple[float, float]:
    a = signed_area(ring)
    cx = cy = 0.0
    for i in range(len(ring) - 1):
        f = ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
        cx += (ring[i][0] + ring[i + 1][0]) * f
        cy += (ring[i][1] + ring[i + 1][1]) * f
    return cx / (6 * a), cy / (6 * a)


def label_point(ring) -> tuple[float, float]:
    """The centroid, unless the shape is bent enough that its centroid falls outside it.

    Then the widest horizontal run through the middle band of the shape, which
    is a cheap stand-in for a pole of inaccessibility and good enough for a label.
    """
    cx, cy = centroid(ring)
    if point_in_ring(cx, cy, ring):
        return cx, cy
    ys = [p[1] for p in ring]
    best = (0.0, cx, cy)
    for step in range(1, 20):
        y = min(ys) + (max(ys) - min(ys)) * step / 20
        crossings = sorted(
            ring[i][0] + (y - ring[i][1]) * (ring[i + 1][0] - ring[i][0]) / (ring[i + 1][1] - ring[i][1])
            for i in range(len(ring) - 1) if (ring[i][1] > y) != (ring[i + 1][1] > y))
        for a, b in zip(crossings[::2], crossings[1::2]):
            if b - a > best[0]:
                best = (b - a, (a + b) / 2, y)
    return best[1], best[2]


def simplify(points, tolerance: float):
    """Douglas-Peucker, iterative so a long ring cannot blow the stack.

    A closed ring starts and ends on the same point, which would make every
    distance zero, so it is split at its farthest point and each half done alone.
    """
    if len(points) < 4:
        return points
    if points[0] == points[-1]:
        x0, y0 = points[0]
        far = max(range(len(points)), key=lambda i: (points[i][0] - x0) ** 2 + (points[i][1] - y0) ** 2)
        return _simplify_open(points[:far + 1], tolerance) + _simplify_open(points[far:], tolerance)[1:]
    return _simplify_open(points, tolerance)


def _simplify_open(points, tolerance: float):
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        start, end = stack.pop()
        ax, ay = points[start]
        bx, by = points[end]
        dx, dy = bx - ax, by - ay
        length = math.hypot(dx, dy) or 1e-9
        worst, index = 0.0, -1
        for i in range(start + 1, end):
            px, py = points[i]
            distance = abs(dy * px - dx * py + bx * ay - by * ax) / length
            if distance > worst:
                worst, index = distance, i
        if worst > tolerance and index > 0:
            keep[index] = True
            stack.append((start, index))
            stack.append((index, end))
    return [p for p, k in zip(points, keep) if k]


def shape_of(geometry: dict) -> dict:
    """SVG path data, area in km², and a label point on the largest polygon."""
    parts, area, largest = [], 0.0, None
    for polygon in polygons(geometry):
        for index, ring in enumerate(polygon):
            projected = [project(lon, lat) for lon, lat in ring]
            ring_area = abs(signed_area(projected))
            area += ring_area if index == 0 else -ring_area
            if index == 0 and (largest is None or ring_area > largest[0]):
                largest = (ring_area, projected)
            simplified = simplify(projected, SIMPLIFY_METRES / METRES_PER_UNIT)
            if len(simplified) >= 4:
                parts.append("M" + " ".join(f"{round(x)},{round(y)}" for x, y in simplified[:-1]) + "Z")
    lx, ly = label_point(largest[1])
    return {"path": "".join(parts), "areaKm2": area * METRES_PER_UNIT ** 2 / 1e6,
            "label": [round(lx), round(ly)]}


def read_census() -> dict[str, dict]:
    book = zipfile.ZipFile(fetch(POP_URL, "ken_admpop_2019.xlsx"))
    ns = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
    strings = ["".join(t.text or "" for t in si.iter(ns + "t"))
               for si in ET.fromstring(book.read("xl/sharedStrings.xml"))]
    rows = []
    for row in ET.fromstring(book.read("xl/worksheets/sheet3.xml")).iter(ns + "row"):
        values = []
        for cell in row.findall(ns + "c"):
            v = cell.find(ns + "v")
            text = v.text if v is not None else ""
            values.append(strings[int(text)] if cell.get("t") == "s" else text)
        rows.append(values)

    header = rows[0]
    older = [k for k in header if k.startswith("T_") and k[2:4].isdigit() and int(k[2:4]) >= 65] + ["T_100Plus"]
    out = {}
    for values in rows[1:]:
        record = dict(zip(header, values))
        if record.get("ADM1_NAME") != "Nairobi":
            continue

        def n(key: str) -> int:
            return int(float(record[key] or 0))

        total = n("T_TL")
        out[record["ADM2_NAME"]] = {
            "name": record["ADM2_NAME"],
            "population": total,
            "femalePct": round(100 * n("F_TL") / total, 1),
            "under15Pct": round(100 * sum(n(f"T_{b}") for b in ("00_04", "05_09", "10_14")) / total, 1),
            "over64Pct": round(100 * sum(n(k) for k in set(older)) / total, 1),
            "age20to34Pct": round(100 * sum(n(f"T_{b}") for b in ("20_24", "25_29", "30_34")) / total, 1),
        }
    return out


RWI_URL = ("https://data.humdata.org/dataset/76f2a2ea-ba50-40f5-b79c-db95d668b843/resource/"
           "15d09fc4-8d0e-46f4-8a6b-c7580f9387b8/download/ken_relative_wealth_index.csv")


# The census's 11 administrative sub-counties, as OpenStreetMap relations. Their
# areas match KNBS's published sub-county areas to within a few per cent, which
# is how they were checked.
SUBCOUNTY_RELATIONS = {
    "Dagoretti": 16362605, "Embakasi": 16248854, "Kamukunji": 16248850, "Kasarani": 16247557,
    "Kibra": 16246699, "Lang'ata": 16246698, "Makadara": 16248853, "Mathare": 16248851,
    "Njiru": 16248849, "Starehe": 16248852, "Westlands": 16246696,
}


def fetch_subcounties() -> dict[str, dict]:
    path = CACHE / "osm-subcounty-boundaries.json"
    if not path.exists():
        ids = ",".join(f"R{i}" for i in SUBCOUNTY_RELATIONS.values())
        url = "https://nominatim.openstreetmap.org/lookup?" + urllib.parse.urlencode(
            {"osm_ids": ids, "format": "json", "polygon_geojson": 1})
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        path.write_text(urllib.request.urlopen(request, timeout=120).read().decode("utf-8"), encoding="utf-8")
    by_id = {row["osm_id"]: row["geojson"] for row in json.loads(path.read_text(encoding="utf-8"))}
    return {name: by_id[osm_id] for name, osm_id in SUBCOUNTY_RELATIONS.items()}


def membership_tests(features: list[dict]) -> list[tuple[str, list]]:
    """Cheap point-in-constituency tests on simplified rings in degrees, with a bbox reject."""
    tests = []
    for feature in features:
        rings = []
        for polygon in polygons(feature["geometry"]):
            outer = simplify([tuple(p) for p in polygon[0]], 0.0002)
            xs, ys = [p[0] for p in outer], [p[1] for p in outer]
            rings.append((min(xs), max(xs), min(ys), max(ys), outer))
        tests.append((feature["name"], rings))
    return tests


def which(tests, lon: float, lat: float) -> str | None:
    for name, rings in tests:
        if any(x0 <= lon <= x1 and y0 <= lat <= y1 and point_in_ring(lon, lat, ring)
               for x0, x1, y0, y1, ring in rings):
            return name
    return None


class Grid:
    """One WorldPop GeoTIFF, read with Pillow, looked up by longitude and latitude."""

    def __init__(self, path: Path):
        image = Image.open(path)
        self.sx, self.sy, _ = image.tag_v2[33550]
        self.lon0, self.lat0 = image.tag_v2[33922][3], image.tag_v2[33922][4]
        self.w, self.h = image.size
        self.pixels = image.load()

    def cell(self, lon: float, lat: float) -> tuple[int, int]:
        return int((lon - self.lon0) / self.sx), int((self.lat0 - lat) / self.sy)

    def at(self, lon: float, lat: float) -> float:
        col, row = self.cell(lon, lat)
        if 0 <= col < self.w and 0 <= row < self.h:
            value = self.pixels[col, row]
            return value if value > 0 else 0.0
        return 0.0


def sample_points(features: list[dict], county: dict) -> list[tuple[str, float, float]]:
    """A regular grid of points over the county, each tagged with its constituency."""
    tests = membership_tests(features)
    lons = [p[0] for polygon in polygons(county["geometry"]) for p in polygon[0]]
    lats = [p[1] for polygon in polygons(county["geometry"]) for p in polygon[0]]
    points = []
    lat = min(lats) + SAMPLE_DEG / 2
    while lat < max(lats):
        lon = min(lons) + SAMPLE_DEG / 2
        while lon < max(lons):
            name = which(tests, lon, lat)
            if name:
                points.append((name, lon, lat))
            lon += SAMPLE_DEG
        lat += SAMPLE_DEG
    return points


def sum_grid(grid: Grid, points) -> dict[str, float]:
    """The grid's people inside each constituency. Each sample stands for its share of a cell."""
    weight = (SAMPLE_DEG / grid.sx) * (SAMPLE_DEG / grid.sy)
    totals: dict[str, float] = {}
    for name, lon, lat in points:
        totals[name] = totals.get(name, 0.0) + grid.at(lon, lat) * weight
    return totals


def relative_wealth(features: list[dict], people: Grid, shapes_by_name: dict) -> dict[str, dict]:
    """
    Meta's Relative Wealth Index, averaged over each constituency and weighted
    by where people live, so an empty forest tile does not count as much as a
    crowded estate. Tiles are about 2.4 km across, so a very small constituency
    may contain none; it then takes the tile nearest its label point.
    """
    tests = membership_tests(features)
    tiles = []
    with open(fetch(RWI_URL, "ken_rwi.csv"), encoding="utf-8") as handle:
        next(handle)
        for line in handle:
            lat, lon, rwi, _ = line.strip().split(",")
            lat, lon = float(lat), float(lon)
            if 36.5 < lon < 37.2 and -1.5 < lat < -1.1:
                tiles.append((lon, lat, float(rwi)))

    sums: dict[str, list[float]] = {}
    for lon, lat, rwi in tiles:
        name = which(tests, lon, lat)
        if name:
            weight = max(people.at(lon, lat), 1.0)
            acc = sums.setdefault(name, [0.0, 0.0, 0])
            acc[0] += rwi * weight
            acc[1] += weight
            acc[2] += 1

    out = {}
    for feature in features:
        name = feature["name"]
        if name in sums:
            total, weight, count = sums[name]
            out[name] = {"rwi": round(total / weight, 2), "rwiTiles": count}
        else:
            lx, ly = shapes_by_name[name]["label"]
            lon = LON0 + lx * METRES_PER_UNIT / M_PER_DEG_LON
            lat = LAT0 - ly * METRES_PER_UNIT / M_PER_DEG_LAT
            nearest = min(tiles, key=lambda t: (t[0] - lon) ** 2 + (t[1] - lat) ** 2)
            out[name] = {"rwi": round(nearest[2], 2), "rwiTiles": 0}
    return out


def main() -> None:
    print("Nairobi map")
    adm2 = json.loads(fetch(ADM2_URL, "ken-adm2.geojson").read_text(encoding="utf-8"))
    adm1 = json.loads(fetch_adm1().read_text(encoding="utf-8"))
    county = next(f for f in adm1["features"] if f["properties"]["shapeName"] == "Nairobi")

    # A constituency is Nairobi's if its centroid falls inside the county.
    features = []
    for feature in adm2["features"]:
        outer = polygons(feature["geometry"])[0][0]
        if not (36.5 < outer[0][0] < 37.3 and -1.6 < outer[0][1] < -1.0):
            continue
        cx, cy = centroid(outer)
        if in_geometry(cx, cy, county["geometry"]):
            raw = feature["properties"]["shapeName"]
            features.append({"name": RENAMES.get(raw, raw), "geometry": feature["geometry"]})
    features.sort(key=lambda f: f["name"])

    names = [f["name"] for f in features]
    if names != EXPECTED:
        raise SystemExit(f"Unexpected constituency set:\n  got      {names}\n  expected {EXPECTED}")

    census = read_census()
    census_total = sum(c["population"] for c in census.values())
    points = sample_points(features, county)
    people = Grid(fetch(WORLDPOP_URL, "ken_ppp_2020_1km_Aggregated_UNadj.tif"))
    modelled = sum_grid(people, points)
    modelled_total = sum(modelled.values())


    shapes = []
    for feature in features:
        shape = shape_of(feature["geometry"])
        # Rounded hard, to two significant figures: the grid is 1 km and
        # Mathare is 3 km², so a figure to the nearest hundred would claim a
        # precision the method does not have.
        estimate = census_total * modelled[feature["name"]] / modelled_total
        density = estimate / shape["areaKm2"]
        shapes.append({
            "id": slug(feature["name"]),
            "name": feature["name"],
            "path": shape["path"],
            "label": shape["label"],
            "areaKm2": round(shape["areaKm2"], 1),
            "population": int(round(estimate, -4)),
            "density": int(round(density, 1 - len(str(int(density))))),
        })

    wealth = relative_wealth(features, people, {s["name"]: s for s in shapes})
    for shape in shapes:
        shape.update(wealth[shape["name"]])

    county_shape = shape_of(county["geometry"])

    subcounties = []
    for name, geometry in fetch_subcounties().items():
        shape = shape_of(geometry)
        record = census[name]
        subcounties.append({
            "id": slug(name),
            "name": name,
            "path": shape["path"],
            "label": shape["label"],
            "areaKm2": round(shape["areaKm2"], 1),
            "density": int(round(record["population"] / shape["areaKm2"], -1)),
            **{k: record[k] for k in ("population", "femalePct", "under15Pct", "age20to34Pct", "over64Pct")},
        })
    subcounties.sort(key=lambda c: c["name"])

    catalogue = yaml.safe_load(LANDMARKS.read_text(encoding="utf-8"))
    landmarks, outside = [], []
    for item in catalogue["landmarks"]:
        x, y = project(item["lon"], item["lat"])
        home = next((s for s, f in zip(shapes, features) if in_geometry(item["lon"], item["lat"], f["geometry"])), None)
        if home is None:
            outside.append(item["name"])
        landmarks.append({
            "id": slug(item["name"]),
            "name": item["name"],
            "category": item["category"],
            "x": round(x), "y": round(y),
            "lat": item["lat"], "lon": item["lon"],
            "description": " ".join(item["description"].split()),
            "constituency": home["id"] if home else None,
        })

    neighbourhoods = []
    for item in catalogue["neighbourhoods"]:
        x, y = project(item["lon"], item["lat"])
        home = next((s for s, f in zip(shapes, features) if in_geometry(item["lon"], item["lat"], f["geometry"])), None)
        if home is None:
            outside.append(item["name"])
            continue
        neighbourhoods.append({"name": item["name"], "x": round(x), "y": round(y), "rank": item["rank"],
                               "constituency": home["id"],
                               **({"rent": item["rent"]} if item.get("rent") else {})})

    points = [project(lon, lat) for polygon in polygons(county["geometry"]) for lon, lat in polygon[0]]
    points += [(lm["x"], lm["y"]) for lm in landmarks]
    xs, ys = [p[0] for p in points], [p[1] for p in points]
    view = [round(min(xs)) - PAD_UNITS, round(min(ys)) - PAD_UNITS,
            round(max(xs) - min(xs)) + 2 * PAD_UNITS, round(max(ys) - min(ys)) + 2 * PAD_UNITS]

    sources = [
        {"what": "Constituency boundaries", "who": "IEBC, via OCHA and geoBoundaries",
         "licence": "CC BY 3.0 IGO", "url": "https://www.geoboundaries.org"},
        {"what": "County boundary", "who": "RCMRD, via geoBoundaries",
         "licence": "Public domain", "url": "https://www.geoboundaries.org"},
        {"what": "Population by sub-county, age and sex",
         "who": "KNBS, 2019 Kenya Population and Housing Census, Volume III, via OCHA",
         "licence": "CC BY-IGO", "url": "https://data.humdata.org/dataset/cod-ps-ken"},
        {"what": "How the population is spread within the county", "who": "WorldPop, 2020, 1 km, UN-adjusted",
         "licence": "CC BY 4.0", "url": "https://www.worldpop.org"},
        {"what": "Census sub-county boundaries", "who": "OpenStreetMap contributors",
         "licence": "ODbL", "url": "https://www.openstreetmap.org/copyright"},
        {"what": "Relative wealth", "who": "Meta Data for Good, Relative Wealth Index (Chi et al. 2022), via HDX",
         "licence": "CC BY-NC 4.0", "url": "https://data.humdata.org/dataset/relative-wealth-index"},
        {"what": "Rent bands", "who": "All About Nairobi, from 2026 rental listings - a judgement, not a measurement",
         "licence": "", "url": "/guides/finding-housing#rough-asking-rents"},
        {"what": "Landmark and neighbourhood positions", "who": "Wikidata and OpenStreetMap contributors",
         "licence": "CC0 and ODbL", "url": "https://www.openstreetmap.org/copyright"},
    ]

    data = {
        "meta": {
            "generated": date.today().isoformat(),
            "viewBox": view,
            "origin": [LON0, LAT0],
            "unitsPerDegLon": M_PER_DEG_LON / METRES_PER_UNIT,
            "unitsPerDegLat": M_PER_DEG_LAT / METRES_PER_UNIT,
            "metresPerUnit": METRES_PER_UNIT,
            "countyAreaKm2": round(county_shape["areaKm2"], 1),
            "population": census_total,
            "sources": sources,
        },
        "outline": county_shape["path"],
        "categories": catalogue["categories"],
        "rentBands": catalogue["rent_bands"],
        "constituencies": shapes,
        "subcounties": subcounties,
        "landmarks": landmarks,
        "neighbourhoods": neighbourhoods,
    }
    OUT_JSON.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    summary = {
        "generated": data["meta"]["generated"],
        "county_area_km2": data["meta"]["countyAreaKm2"],
        "population": census_total,
        "sources": sources,
        "categories": catalogue["categories"],
        "census": sorted(({**c, "areaKm2": sc["areaKm2"], "density": sc["density"]}
                          for c in census.values() for sc in subcounties if sc["name"] == c["name"]),
                         key=lambda c: -c["population"]),
        "constituencies": [{k: s[k] for k in ("id", "name", "areaKm2", "population", "density", "rwi")} for s in shapes],
        "rent_bands": catalogue["rent_bands"],
        "rent": [n for n in neighbourhoods if n.get("rent")],
        "landmarks": [{k: lm[k] for k in ("id", "name", "category", "description", "constituency")}
                      for lm in landmarks],
        "hero": {"viewBox": view, "outline": county_shape["path"],
                 "constituencies": [{k: s[k] for k in ("id", "name", "path")} for s in shapes]},
    }
    header = ("# Generated by scripts/build_nairobi_map.py - do not edit by hand.\n"
              "# Edit content/geo/landmarks.yaml or the script, then re-run it.\n")
    OUT_SUMMARY.write_text(header + yaml.safe_dump(summary, sort_keys=False, allow_unicode=True, width=100),
                           encoding="utf-8")

    print(f"  census total {census_total:,}; WorldPop 2020 inside the county {modelled_total:,.0f}")
    print(f"  county {county_shape['areaKm2']:.1f} km2, constituencies sum {sum(s['areaKm2'] for s in shapes):.1f}")
    for s in sorted(shapes, key=lambda s: -s["density"]):
        print(f"    {s['name']:18s} {s['areaKm2']:6.1f} km2  est {s['population']:>9,}  {s['density']:>7,}/km2"
              f"  rwi {s['rwi']} ({s['rwiTiles']} tiles)")
    for c in subcounties:
        print(f"    [{c['name']:10s}] {c['areaKm2']:6.1f} km2  {c['population']:>9,}  {c['density']:>7,}/km2")
    if outside:
        print(f"  outside every constituency (dropped labels / kept landmarks): {outside}")
    print(f"  wrote {OUT_JSON.relative_to(ROOT)} ({OUT_JSON.stat().st_size / 1024:.0f} KB) and "
          f"{OUT_SUMMARY.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
