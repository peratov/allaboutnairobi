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
        }
    return out


def worldpop_shares(features: list[dict], county: dict) -> dict[str, float]:
    """Modelled population inside each constituency, from a regular sample of the WorldPop grid."""
    image = Image.open(fetch(WORLDPOP_URL, "ken_ppp_2020_1km_Aggregated_UNadj.tif"))
    scale_x, scale_y, _ = image.tag_v2[33550]
    origin_lon, origin_lat = image.tag_v2[33922][3], image.tag_v2[33922][4]
    width, height = image.size
    pixels = image.load()
    weight = (SAMPLE_DEG / scale_x) * (SAMPLE_DEG / scale_y)

    # Cheap membership test on simplified rings in degrees, with a bbox reject.
    tests = []
    for feature in features:
        rings = []
        for polygon in polygons(feature["geometry"]):
            outer = simplify([tuple(p) for p in polygon[0]], 0.0002)
            xs, ys = [p[0] for p in outer], [p[1] for p in outer]
            rings.append((min(xs), max(xs), min(ys), max(ys), outer))
        tests.append((feature["name"], rings))

    totals = {name: 0.0 for name, _ in tests}
    lons = [p[0] for polygon in polygons(county["geometry"]) for p in polygon[0]]
    lats = [p[1] for polygon in polygons(county["geometry"]) for p in polygon[0]]
    lat = min(lats) + SAMPLE_DEG / 2
    while lat < max(lats):
        lon = min(lons) + SAMPLE_DEG / 2
        row = int((origin_lat - lat) / scale_y)
        while lon < max(lons):
            col = int((lon - origin_lon) / scale_x)
            value = pixels[col, row] if 0 <= col < width and 0 <= row < height else 0
            if value > 0:
                for name, rings in tests:
                    if any(x0 <= lon <= x1 and y0 <= lat <= y1 and point_in_ring(lon, lat, ring)
                           for x0, x1, y0, y1, ring in rings):
                        totals[name] += value * weight
                        break
            lon += SAMPLE_DEG
        lat += SAMPLE_DEG
    return totals


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
    modelled = worldpop_shares(features, county)
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

    county_shape = shape_of(county["geometry"])

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
                               "constituency": home["id"]})

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
        "constituencies": shapes,
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
        "census": sorted(census.values(), key=lambda c: -c["population"]),
        "constituencies": [{k: s[k] for k in ("id", "name", "areaKm2", "population", "density")} for s in shapes],
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
        print(f"    {s['name']:18s} {s['areaKm2']:6.1f} km2  est {s['population']:>9,}  {s['density']:>7,}/km2")
    if outside:
        print(f"  outside every constituency (dropped labels / kept landmarks): {outside}")
    print(f"  wrote {OUT_JSON.relative_to(ROOT)} ({OUT_JSON.stat().st_size / 1024:.0f} KB) and "
          f"{OUT_SUMMARY.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
