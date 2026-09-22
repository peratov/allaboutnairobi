"""
Build the data behind /map.

Run by hand, not at build time:

    python scripts/build_map_data.py

It writes templates/geo/accra-map.json, which is committed. The deploy must not
depend on a third party being up, and the boundaries change roughly never - the
last redistricting was 2018 and the last new constituency 2023.

Sources, all of which are credited on the page itself:

  * Region and district boundaries - geoBoundaries (gbOpen), which carries
    Ghana ADM1 from OpenStreetMap and ADM2 from the Ghana Statistical Service
    via USAID. CC BY 4.0.
  * District capitals and the district-to-constituency mapping - the Wikipedia
    list of parliamentary constituencies of Ghana, which reproduces the
    Electoral Commission's own tables. CC BY-SA 4.0.
  * Landmark coordinates - content/geo/landmarks.yaml in this repository,
    geocoded against OpenStreetMap. ODbL.

Two checks are worth knowing about, because they are what makes this
trustworthy rather than plausible. Every region's constituency count is
verified against the article's own summary table, and every district is
assigned to a region by testing its centroid against the region polygons
rather than by trusting a name. A mismatch stops the script.

No shapely, no numpy. Ray casting and Douglas-Peucker are twenty lines each and
this runs in a couple of seconds; a build-time dependency for a script run once
a decade is a bad trade.
"""

import json
import math
import re
import urllib.request
from collections import OrderedDict
from datetime import date
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "templates" / "geo" / "accra-map.json"
SUMMARY = ROOT / "content" / "geo" / "map-summary.yaml"
LANDMARKS = ROOT / "content" / "geo" / "landmarks.yaml"
RENT_BANDS = ROOT / "content" / "geo" / "rent-bands.yaml"
CENSUS = ROOT / "content" / "geo" / "census.yaml"
NOISE_DATA = ROOT / "content" / "geo" / "noise.yaml"

# StatsBank spells a handful of assemblies differently enough that no amount of
# normalising joins them. Written out rather than fuzzy-matched, because a
# census figure attached to the wrong district is worse than no figure at all.
CENSUS_ALIASES = {
    "Accra Metropolitan Area (AMA)": "accra-metropolitan",
    "Tema Metropolitan Area (TMA)": "tema-metropolitan",
    "Adentan Municipal": "adenta-municipal",
    "Ayawaso West Municipal": "ayawaso-west-wuogon-municipal",
    "Okaikoi North Municipal": "okaikwei-north-municipal",
    "Shai-Osudoku": "shai-osudoku",
    "Ningo-Prampram": "ningo-prampram",
    "La Dade-Kotopon Municipal": "la-dade-kotopon-municipal",
    "Korle Klottey Municipal": "korle-klottey-municipal",
}

REGION_OF_INTEREST = "Greater Accra"

# The article's own summary table. If a region's parsed count disagrees with
# this, the parse is wrong and the script should say so rather than publish it.
EXPECTED_CONSTITUENCIES = {
    "Ahafo": 6, "Ashanti": 47, "Bono": 12, "Bono East": 11, "Central": 23,
    "Eastern": 33, "Greater Accra": 34, "North East": 6, "Northern": 18,
    "Oti": 9, "Savannah": 7, "Upper East": 15, "Upper West": 11, "Volta": 18,
    "Western": 17, "Western North": 9,
}

# The projected coordinate space. Ghana is about 700km across, so 20000 units
# is roughly 35m per unit - finer than anything the map can render, and integer
# path data compresses far better than decimals.
EXTENT = 20000

USER_AGENT = "AllAboutAccra-map-builder/1.0 (https://www.allaboutaccra.com)"


# =============================================================================
# FETCHING
# =============================================================================

def fetch(url):
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=180) as response:
        return response.read()


def fetch_boundaries(level):
    meta = json.loads(fetch(f"https://www.geoboundaries.org/api/current/gbOpen/GHA/{level}/"))
    print(f"  {level}: {meta['admUnitCount']} units, {meta['boundaryLicense']}")
    return json.loads(fetch(meta["simplifiedGeometryGeoJSON"])), meta


def fetch_constituency_wikitext():
    url = (
        "https://en.wikipedia.org/w/api.php?action=parse"
        "&page=List%20of%20parliamentary%20constituencies%20of%20Ghana"
        "&prop=wikitext&format=json&formatversion=2"
    )
    return json.loads(fetch(url))["parse"]["wikitext"]


# =============================================================================
# WIKITEXT
# =============================================================================

ROWSPAN = re.compile(r"^\s*rowspan\s*=\s*\"?(\d+)\"?\s*\|", re.I)

REGION_FIXUPS = {
    "Central Region, Ghana": "Central",
    "Eastern Region, Ghana": "Eastern",
    "North East Region, Ghana": "North East",
    "Northern Region, Ghana": "Northern",
    "Western Region, Ghana": "Western",
}


def unlink(cell):
    cell = re.sub(r"<ref[^>]*>.*?</ref>", "", cell, flags=re.S)
    cell = re.sub(r"<ref[^>]*/>", "", cell)
    cell = re.sub(r"\[\[([^\]|]+)\|([^\]]+)\]\]", r"\2", cell)
    cell = re.sub(r"\[\[([^\]]+)\]\]", r"\1", cell)
    cell = re.sub(r"<br\s*/?>", " ", cell)
    cell = cell.replace("'''", "").replace("''", "")
    return " ".join(cell.split()).strip()


def split_span(cell):
    match = ROWSPAN.match(cell)
    if match:
        return int(match.group(1)), unlink(cell[match.end():])
    return 1, unlink(cell)


def parse_constituencies(wikitext):
    """
    region -> [{district, capital, constituency}]

    Rowspan is the whole difficulty. Where a district holds several seats the
    district and capital cells carry rowspan=N and the next N-1 rows contain
    only the constituency. Accra Metropolitan alone hides four seats that way.
    """
    regions = OrderedDict()
    current = None
    pending = None

    for line in wikitext.splitlines():
        heading = re.match(r"^==\s*(?:\[\[)?([^\]=|]+?)(?:\|[^\]]*)?(?:\]\])?\s*==\s*$", line)
        if heading:
            name = heading.group(1).strip().removesuffix(" Region").strip()
            current = REGION_FIXUPS.get(name, name)
            regions.setdefault(current, [])
            pending = None
            continue

        if not current or not line.startswith("|") or line.startswith(("|-", "|}")):
            continue
        if "||" not in line:
            continue

        cells = line.lstrip("|").split("||")

        if pending and pending["left"] > 0:
            constituency = unlink(cells[0])
            if constituency:
                regions[current].append({
                    "district": pending["district"],
                    "capital": pending["capital"],
                    "constituency": constituency,
                })
                pending["left"] -= 1
                if pending["left"] == 0:
                    pending = None
            continue

        if len(cells) < 3:
            continue

        span, district = split_span(cells[0])
        _, capital = split_span(cells[1])
        constituency = unlink(cells[2])
        if not district or district.lower().startswith("district"):
            continue

        regions[current].append(
            {"district": district, "capital": capital, "constituency": constituency}
        )
        if span > 1:
            pending = {"district": district, "capital": capital, "left": span - 1}

    return {k: v for k, v in regions.items() if v}


# =============================================================================
# GEOMETRY
# =============================================================================

def rings_of(geometry):
    """Every outer ring of a Polygon or MultiPolygon, largest first."""
    kind = geometry["type"]
    polygons = [geometry["coordinates"]] if kind == "Polygon" else geometry["coordinates"]
    return [polygon[0] for polygon in polygons if polygon and len(polygon[0]) > 3]


def ring_area(ring):
    """Twice the signed area. Only ever compared, never used as an area."""
    total = 0.0
    for i in range(len(ring) - 1):
        x1, y1 = ring[i][0], ring[i][1]
        x2, y2 = ring[i + 1][0], ring[i + 1][1]
        total += x1 * y2 - x2 * y1
    return abs(total) / 2


def centroid_of(rings):
    """Area-weighted centroid of the largest ring - good enough to sit a label on."""
    largest = max(rings, key=ring_area)
    area = 0.0
    cx = cy = 0.0
    for i in range(len(largest) - 1):
        x1, y1 = largest[i][0], largest[i][1]
        x2, y2 = largest[i + 1][0], largest[i + 1][1]
        cross = x1 * y2 - x2 * y1
        area += cross
        cx += (x1 + x2) * cross
        cy += (y1 + y2) * cross
    if area == 0:
        return largest[0][0], largest[0][1]
    area *= 0.5
    return cx / (6 * area), cy / (6 * area)


def point_in_rings(point, rings):
    """Ray casting. A point on a shared border may go either way; centroids do not sit on borders."""
    x, y = point
    inside = False
    for ring in rings:
        for i in range(len(ring) - 1):
            x1, y1 = ring[i][0], ring[i][1]
            x2, y2 = ring[i + 1][0], ring[i + 1][1]
            if (y1 > y) != (y2 > y):
                crossing = x1 + (y - y1) / (y2 - y1) * (x2 - x1)
                if crossing > x:
                    inside = not inside
    return inside


def perpendicular_distance(point, start, end):
    x, y = point
    x1, y1 = start
    x2, y2 = end
    dx, dy = x2 - x1, y2 - y1
    if dx == 0 and dy == 0:
        return math.hypot(x - x1, y - y1)
    return abs(dy * x - dx * y + x2 * y1 - y2 * x1) / math.hypot(dx, dy)


def simplify(points, tolerance):
    """Douglas-Peucker, iterative so a long coastline cannot blow the stack."""
    if len(points) < 3:
        return points

    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]

    while stack:
        first, last = stack.pop()
        worst = 0.0
        index = -1
        for i in range(first + 1, last):
            distance = perpendicular_distance(points[i], points[first], points[last])
            if distance > worst:
                worst, index = distance, i
        if worst > tolerance and index > 0:
            keep[index] = True
            stack.append((first, index))
            stack.append((index, last))

    return [p for p, k in zip(points, keep) if k]


# =============================================================================
# PROJECTION
# =============================================================================

class Projection:
    """
    Equidistant cylindrical, with longitude scaled by the cosine of the mean
    latitude so the country is not stretched sideways. Ghana spans seven
    degrees of latitude near the equator, where this is within a rounding error
    of anything fancier - and it is invertible in one line, which the client
    needs to place a landmark from its coordinates.
    """

    def __init__(self, bounds):
        west, south, east, north = bounds
        self.west, self.south = west, south
        self.k = math.cos(math.radians((south + north) / 2))

        width = (east - west) * self.k
        height = north - south
        self.scale = EXTENT / max(width, height)
        self.width = round(width * self.scale)
        self.height = round(height * self.scale)

    def __call__(self, lon, lat):
        x = (lon - self.west) * self.k * self.scale
        y = (self.height) - (lat - self.south) * self.scale  # SVG y grows downwards
        return x, y


def path_of(rings, projection, tolerance):
    """An SVG path with integer coordinates - about 40% smaller than decimals."""
    parts = []
    for ring in rings:
        projected = [projection(p[0], p[1]) for p in ring]
        reduced = simplify(projected, tolerance)
        if len(reduced) < 3:
            continue
        points = [(round(x), round(y)) for x, y in reduced]
        # Drop consecutive duplicates that rounding may have created.
        deduped = [points[0]]
        for point in points[1:]:
            if point != deduped[-1]:
                deduped.append(point)
        if len(deduped) < 3:
            continue
        head = deduped[0]
        body = "".join(f"L{x} {y}" for x, y in deduped[1:])
        parts.append(f"M{head[0]} {head[1]}{body}Z")
    return "".join(parts)


# =============================================================================
# NAME MATCHING
# =============================================================================

NOISE = re.compile(
    r"\b(metropolitan|metropolis|metro|municipal|district|assembly|the)\b", re.I
)


def normalise(name):
    name = NOISE.sub(" ", name)
    name = re.sub(r"[^a-z0-9 ]+", " ", name.lower())
    return " ".join(name.split())


def slugify(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def display_name(district):
    """
    The official designation, trimmed of a trailing "Assembly".

    Wikipedia has "La Nkwantanang Madina Municipal"; geoBoundaries has
    "La-nkwantanang-madina". Only one of those belongs on a page. Where a
    district did not match a row, geoBoundaries is all there is.
    """
    name = district.get("official") or district["name"]
    return re.sub(r"\s+Assembly$", "", name).strip()


def district_type(name):
    lowered = name.lower()
    if "metropolitan" in lowered:
        return "Metropolitan"
    if "municipal" in lowered:
        return "Municipal"
    return "District"


def match_district(target, candidates):
    """Exact on the normalised name, then a containment fallback."""
    wanted = normalise(target)
    for key in candidates:
        if normalise(key) == wanted:
            return key

    best, best_score = None, 0
    wanted_words = set(wanted.split())
    for key in candidates:
        words = set(normalise(key).split())
        if not words:
            continue
        score = len(wanted_words & words) / len(wanted_words | words)
        if score > best_score:
            best, best_score = key, score
    return best if best_score >= 0.6 else None


# =============================================================================
# BUILD
# =============================================================================

def main():
    print("Fetching boundaries...")
    adm1, adm1_meta = fetch_boundaries("ADM1")
    adm2, adm2_meta = fetch_boundaries("ADM2")

    print("Fetching constituencies...")
    by_region = parse_constituencies(fetch_constituency_wikitext())

    total = sum(len(v) for v in by_region.values())
    print(f"  {len(by_region)} regions, {total} constituencies")
    for name, expected in EXPECTED_CONSTITUENCIES.items():
        got = len(by_region.get(name, []))
        if got != expected:
            raise SystemExit(
                f"{name}: parsed {got} constituencies, the article's own summary "
                f"table says {expected}. The parse is wrong; not publishing it."
            )
    print("  every region matches the article's summary table")

    # --- regions ------------------------------------------------------------
    regions = []
    for feature in adm1["features"]:
        name = feature["properties"]["shapeName"].removesuffix(" Region").strip()
        rings = rings_of(feature["geometry"])
        regions.append({"name": name, "rings": rings})

    lons = [p[0] for r in regions for ring in r["rings"] for p in ring]
    lats = [p[1] for r in regions for ring in r["rings"] for p in ring]
    projection = Projection((min(lons), min(lats), max(lons), max(lats)))
    print(f"  projected space {projection.width} x {projection.height}")

    # --- districts to regions, by geometry not by name -----------------------
    districts = []
    for feature in adm2["features"]:
        rings = rings_of(feature["geometry"])
        if not rings:
            continue
        districts.append({
            "name": feature["properties"]["shapeName"].strip(),
            "rings": rings,
            "centroid": centroid_of(rings),
        })

    for district in districts:
        district["region"] = next(
            (r["name"] for r in regions if point_in_rings(district["centroid"], r["rings"])),
            None,
        )

    unplaced = [d["name"] for d in districts if not d["region"]]
    if unplaced:
        print(f"  {len(unplaced)} districts whose centroid fell outside every region: {unplaced[:5]}")

    accra_districts = [d for d in districts if d["region"] == REGION_OF_INTEREST]
    print(f"  {len(accra_districts)} districts in {REGION_OF_INTEREST}")

    # --- join the constituencies --------------------------------------------
    lookup = {d["name"]: d for d in accra_districts}
    for district in accra_districts:
        district["constituencies"] = []
        district["capital"] = ""
        district["official"] = ""

    unmatched = []
    for row in by_region[REGION_OF_INTEREST]:
        key = match_district(row["district"], lookup)
        if not key:
            unmatched.append(row)
            continue
        district = lookup[key]
        district["capital"] = district["capital"] or row["capital"]
        district["official"] = district["official"] or row["district"]
        if row["constituency"] not in district["constituencies"]:
            district["constituencies"].append(row["constituency"])

    seats = sum(len(d["constituencies"]) for d in accra_districts)
    print(f"  {seats} constituencies placed, {len(unmatched)} unmatched")
    for row in unmatched:
        print(f"    ! {row['district']} ({row['constituency']})")

    expected_seats = EXPECTED_CONSTITUENCIES[REGION_OF_INTEREST]
    if seats != expected_seats or unmatched:
        raise SystemExit(
            f"{seats} of {expected_seats} constituencies landed on a district. "
            "Every seat has to land somewhere, or the map is quietly incomplete."
        )

    # --- landmarks ----------------------------------------------------------
    landmarks = []
    if LANDMARKS.exists():
        for item in yaml.safe_load(LANDMARKS.read_text(encoding="utf-8")) or []:
            x, y = projection(item["lon"], item["lat"])
            landmarks.append({
                "id": slugify(item["name"]),
                "name": item["name"],
                "category": item["category"],
                "blurb": item.get("blurb", ""),
                "url": item.get("url", ""),
                "lat": round(item["lat"], 5),
                "lon": round(item["lon"], 5),
                "x": round(x),
                "y": round(y),
            })
    print(f"  {len(landmarks)} landmarks")

    # --- emit ---------------------------------------------------------------
    # Regions are only ever seen zoomed out, districts only zoomed in, so they
    # are simplified to different tolerances. In projected units, where one
    # unit is about 35m.
    payload = {
        "meta": {
            "generated": date.today().isoformat(),
            "extent": [projection.width, projection.height],
            "origin": [projection.west, projection.south],
            "scale": projection.scale,
            "cos_lat": round(projection.k, 8),
            "sources": [
                {
                    "what": "Region and district boundaries",
                    "who": "geoBoundaries (gbOpen) - " + adm2_meta["boundarySource"],
                    "licence": adm2_meta["boundaryLicense"],
                    "url": "https://www.geoboundaries.org",
                },
                {
                    "what": "District capitals and constituencies",
                    "who": "Wikipedia, List of parliamentary constituencies of Ghana",
                    "licence": "CC BY-SA 4.0",
                    "url": "https://en.wikipedia.org/wiki/List_of_parliamentary_constituencies_of_Ghana",
                },
                {
                    "what": "Landmark coordinates",
                    "who": "OpenStreetMap contributors",
                    "licence": "ODbL",
                    "url": "https://www.openstreetmap.org/copyright",
                },
            ],
        },
        "regions": [],
        "districts": [],
        "landmarks": landmarks,
    }

    district_counts = {}
    for district in districts:
        if district["region"]:
            district_counts[district["region"]] = district_counts.get(district["region"], 0) + 1

    for region in sorted(regions, key=lambda r: r["name"]):
        cx, cy = projection(*centroid_of(region["rings"]))
        payload["regions"].append({
            "id": slugify(region["name"]),
            "name": region["name"],
            "d": path_of(region["rings"], projection, tolerance=6),
            "cx": round(cx),
            "cy": round(cy),
            "districts": district_counts.get(region["name"], 0),
            "constituencies": len(by_region.get(region["name"], [])),
        })

    # --- indicative rent bands ----------------------------------------------
    # Not measured, not published anywhere, and labelled as such everywhere it
    # appears. Every district must carry one or the heatmap has holes that look
    # like data rather than like gaps.
    # --- 2021 census, joined by name -----------------------------------------
    census = yaml.safe_load(CENSUS.read_text(encoding="utf-8"))
    census_by_id = {}
    for row in census["districts"]:
        name = row["statsbank_name"]
        district_id = CENSUS_ALIASES.get(name) or slugify(name)
        if district_id in census_by_id:
            raise SystemExit(f"Two census rows landed on {district_id}")
        census_by_id[district_id] = row
    payload["census"] = {"meta": census["meta"]}

    rent = yaml.safe_load(RENT_BANDS.read_text(encoding="utf-8"))
    rent_by_id = {row["id"]: row for row in rent["districts"]}
    # YAML reads bare dates as date objects, which json cannot serialise.
    rent_meta = {
        key: value.isoformat() if isinstance(value, date) else value
        for key, value in rent["meta"].items()
    }
    payload["rent"] = {"meta": rent_meta, "bands": rent["bands"]}

    for district in sorted(accra_districts, key=display_name):
        cx, cy = projection(*district["centroid"])
        name = display_name(district)
        district_id = slugify(name)
        band = rent_by_id.get(district_id)
        if not band:
            raise SystemExit(
                f"No rent band for {district_id}. Add it to "
                f"{RENT_BANDS.relative_to(ROOT)}, or the heatmap shows a hole "
                "where a district should be."
            )
        payload["districts"].append({
            "id": district_id,
            "name": name,
            "type": district_type(district["official"] or district["name"]),
            "capital": district["capital"],
            "d": path_of(district["rings"], projection, tolerance=1.5),
            "cx": round(cx),
            "cy": round(cy),
            "constituencies": sorted(district["constituencies"]),
            "rent": band["band"],
            "rentSpread": band.get("spread", "moderate"),
            "rentDrivenBy": band.get("driven_by", ""),
        })

        stats = census_by_id.get(district_id)
        if not stats:
            raise SystemExit(
                f"No 2021 census row for {district_id}. Every assembly must have "
                "one, or a demographic layer draws a hole and calls it data."
            )
        payload["districts"][-1].update({
            "population": stats["population"],
            "femalePct": stats["female_pct"],
            "under15Pct": stats["under_15_pct"],
            "over64Pct": stats["over_64_pct"],
            "unemploymentPct": stats["unemployment_pct"],
            "participationPct": stats["participation_pct"],
            "informalPct": stats["informal_pct"],
            "publicPct": stats["public_pct"],
            "ethnicity": stats["ethnicity"],
            "largestEthnicGroup": stats["largest_ethnic_group"],
            "largestEthnicPct": stats["largest_ethnic_pct"],
        })

    # --- noise, modelled ----------------------------------------------------
    # Three real counts per district, combined by averaging their quintile
    # RANKS with equal weight. Ranks rather than values because the three are in
    # different units and one of them - people per km² - spans three orders of
    # magnitude; equal weight because any other split would be a coefficient I
    # had made up. Absent on the first run, before fetch_noise_data has been.
    if NOISE_DATA.exists():
        noise = yaml.safe_load(NOISE_DATA.read_text(encoding="utf-8"))
        noise_by_id = {row["id"]: row for row in noise["districts"]}
        payload["noise"] = {"meta": noise["meta"]}

        def quintile_ranks(field):
            values = sorted(row[field] for row in noise["districts"])
            cuts = [values[(i * len(values)) // 5] for i in range(1, 5)]
            return {
                row["id"]: sum(1 for cut in cuts if row[field] >= cut) + 1
                for row in noise["districts"]
            }

        ranks = {
            field: quintile_ranks(field)
            for field in ("road_km_per_km2", "premises_per_km2", "people_per_km2")
        }

        for district in payload["districts"]:
            row = noise_by_id.get(district["id"])
            if not row:
                raise SystemExit(
                    f"No noise row for {district['id']}. Re-run fetch_noise_data."
                )
            score = sum(ranks[f][district["id"]] for f in ranks) / len(ranks)
            district.update({
                "areaKm2": row["area_km2"],
                "roadPerKm2": row["road_km_per_km2"],
                "premisesPerKm2": row["premises_per_km2"],
                "peoplePerKm2": row["people_per_km2"],
                "noiseScore": round(score, 1),
            })
        print(f"  noise joined: {len(noise_by_id)} districts")
    else:
        print("  no noise.yaml - run scripts/fetch_noise_data.py to add those layers")

    ids = {d["id"] for d in payload["districts"]}
    unused = set(rent_by_id) - ids
    if unused:
        raise SystemExit(f"Rent bands for districts that do not exist: {sorted(unused)}")
    orphan_census = set(census_by_id) - ids
    if orphan_census:
        raise SystemExit(f"Census rows for districts that do not exist: {sorted(orphan_census)}")

    # The strongest check available: the parts must sum to the published whole.
    # If a sub-metro slipped in or an assembly dropped out, this catches it.
    total = sum(d["population"] for d in payload["districts"])
    if total != 5_455_692:
        raise SystemExit(
            f"District populations sum to {total:,}, but the 2021 census puts "
            "Greater Accra at 5,455,692. Something is double-counted or missing."
        )
    print(f"  census joined: {total:,} people, matching the published regional total")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    size = OUTPUT.stat().st_size
    print(f"\nWrote {OUTPUT.relative_to(ROOT)} - {size // 1024}KB")

    # The same thing without geometry, for the page to render server-side. That
    # is what a reader with JavaScript off gets, and what a crawler indexes -
    # 29 districts and 34 constituencies as text rather than a blank <svg>.
    summary = {
        "generated": payload["meta"]["generated"],
        "rent": payload["rent"],
        "census": payload["census"],
        "noise": payload.get("noise"),
        "regions": [
            {k: v for k, v in region.items() if k not in ("d", "cx", "cy")}
            for region in payload["regions"]
        ],
        "districts": [
            {k: v for k, v in district.items() if k not in ("d", "cx", "cy")}
            for district in payload["districts"]
        ],
        "landmarks": [
            {k: v for k, v in landmark.items() if k not in ("x", "y")}
            for landmark in payload["landmarks"]
        ],
    }
    SUMMARY.parent.mkdir(parents=True, exist_ok=True)
    SUMMARY.write_text(
        yaml.safe_dump(summary, allow_unicode=True, sort_keys=False, width=100),
        encoding="utf-8",
    )
    print(f"Wrote {SUMMARY.relative_to(ROOT)} - {SUMMARY.stat().st_size // 1024}KB")
    print(f"  {len(payload['regions'])} regions, {len(payload['districts'])} districts, "
          f"{seats} constituencies, {len(landmarks)} landmarks")


if __name__ == "__main__":
    main()
