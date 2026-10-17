"""
Build the data behind /data.

Run by hand, like the other fetchers, and the output is committed so the deploy
never depends on the World Bank being up:

    mise dashboard-data

**The honesty problem this script exists to manage.** Almost every long
economic time series about Kenya is national. A dashboard that puts Kenya's
GDP under a heading saying "Nairobi" would be the exact dishonesty this site
is built to avoid.

So every series carries a `scope`, and the page groups and labels by it:

  NAIROBI   Nairobi City County itself. Six census counts on today's
            boundaries, and the county's output per person for the five years
            KNBS has published it.
  KENYA     National. Sixty-odd years of it, and clearly labelled as Kenya
            rather than as Nairobi.
  DERIVED   Arithmetic on two real series - Nairobi's share of Kenya's
            census population, and its density. Both are honest divisions of numbers
            that are themselves sourced; neither is a projection.

Nothing here is modelled, interpolated or forecast. Where a series is sparse
it stays sparse, and the chart draws the gap rather than joining across it.

Ported from All About Accra's script of the same name.
"""

import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
DATA_OUT = ROOT / "templates" / "api" / "indicators.json"
SUMMARY_OUT = ROOT / "content" / "geo" / "indicators-summary.yaml"
MAP = ROOT / "templates" / "geo" / "nairobi-map.json"

CHECKED = "2026-10-15"
# The World Bank revises these series annually, so a year is the honest shelf
# life. StaleDataFilesLinter fails the build when it passes, the same way an
# expired constant does.
EXPIRES = "2027-10-15"
WB = "https://api.worldbank.org/v2/country/KEN/indicator/{code}?format=json&per_page=400"

# Nairobi at every census since its boundary was extended to roughly today's
# county in 1963. The 1948 and 1962 counts (about 119,000 and 267,000) were
# for a city a seventh the size, and a chart joining them to these would show
# a boundary change as growth, so they are left out.
#
# 2019 is the KNBS 2019 census; the map's sub-county figures sum to within a
# few hundred of it (they come from a different census volume).
NAIROBI_CENSUS = {
    1969: 509_286,
    1979: 827_775,
    1989: 1_324_570,
    1999: 2_143_254,
    2009: 3_138_369,
    2019: 4_397_073,
}
CENSUS_SOURCE = "Kenya census counts, 1969 to 2019 (KNBS and its predecessors)"

# Kenya at the same censuses, so Nairobi's share divides a census by a census.
# Dividing by the World Bank's mid-year estimates instead would mix two
# methods and understate the share - the 2019 estimate is about three million
# above the 2019 count.
KENYA_CENSUS = {
    1969: 10_942_705,
    1979: 15_327_061,
    1989: 21_443_636,
    1999: 28_686_607,
    2009: 38_610_097,
    2019: 47_564_296,
}

# Gross County Product per person, nominal KSh, from KNBS's 2024 GCP report,
# Annexe IV. The only year-by-year economic series KNBS publishes for Nairobi
# on its own.
NAIROBI_GCP_PER_CAPITA = {
    2019: 591_475,
    2020: 594_095,
    2021: 653_704,
    2022: 735_768,
    2023: 802_344,
}

GCP_URL = "https://www.knbs.or.ke/reports/gross-county-product-2024/"

# The same report's headline findings. Stored as stated - five-year averages
# and one year's comparison - not stretched into series.
NAIROBI_GCP = {
    "from_year": 2019,
    "to_year": 2023,
    "share_pct": 27.5,
    # Kiambu, the next largest.
    "next_share_pct": 5.6,
    "growth_pct": 6.1,
    "national_growth_pct": 4.6,
    "manufacturing_share_pct": 36.9,
    "services_share_pct": 37.4,
    "per_capita_year": 2023,
    "per_capita_ksh": 802_344,
    "national_per_capita_ksh": 293_229,
    "source": "Kenya National Bureau of Statistics, Gross County Product 2024",
    "url": GCP_URL,
}

# code, label, unit, group, and how to draw it.
INDICATORS = [
    # -- population ---------------------------------------------------------
    ("SP.POP.TOTL", "Population of Kenya", "people", "population", "line"),
    ("SP.POP.GROW", "Population growth", "% a year", "population", "line"),
    ("SP.URB.TOTL", "Urban population", "people", "population", "line"),
    ("SP.URB.TOTL.IN.ZS", "Share of Kenyans living in towns and cities", "%", "population", "line"),
    ("SP.URB.GROW", "Urban population growth", "% a year", "population", "line"),
    ("SP.DYN.LE00.IN", "Life expectancy at birth", "years", "population", "line"),
    ("SP.DYN.TFRT.IN", "Births per woman", "births", "population", "line"),
    ("SP.POP.0014.TO.ZS", "Under fifteens", "% of population", "population", "line"),
    # -- economy ------------------------------------------------------------
    ("NY.GDP.MKTP.CD", "GDP", "US$", "economy", "line"),
    ("NY.GDP.PCAP.CD", "GDP per person", "US$", "economy", "line"),
    ("NY.GDP.MKTP.KD.ZG", "GDP growth", "% a year", "economy", "line"),
    ("FP.CPI.TOTL.ZG", "Inflation", "% a year", "economy", "line"),
    ("PA.NUS.FCRF", "Shillings to the US dollar", "KES", "economy", "line"),
    ("BX.TRF.PWKR.CD.DT", "Money sent home from abroad", "US$", "economy", "line"),
    ("NE.EXP.GNFS.ZS", "Exports", "% of GDP", "economy", "line"),
    ("SL.UEM.TOTL.ZS", "Unemployment", "% of labour force", "economy", "line"),
    # -- education ----------------------------------------------------------
    ("SE.PRM.CMPT.ZS", "Finishing primary school", "% of age group", "education", "line"),
    ("SE.SEC.NENR", "Enrolled in secondary school", "% of age group", "education", "sparse"),
    ("SE.TER.ENRR", "Enrolled in tertiary education", "% of age group", "education", "line"),
    ("SE.XPD.TOTL.GD.ZS", "Government spending on education", "% of GDP", "education", "line"),
    # Adult literacy (SE.ADT.LITR.ZS) is left out: the World Bank has one
    # observation for Kenya, from 2000, and one point is not a chart.
    # -- living conditions --------------------------------------------------
    ("EG.ELC.ACCS.ZS", "Access to electricity", "% of population", "living", "line"),
    ("SH.H2O.BASW.ZS", "Basic drinking water", "% of population", "living", "line"),
    ("SH.STA.BASS.ZS", "Basic sanitation", "% of population", "living", "line"),
    ("IT.NET.USER.ZS", "Using the internet", "% of population", "living", "line"),
    ("IT.CEL.SETS.P2", "Mobile subscriptions", "per 100 people", "living", "line"),
    ("SH.XPD.CHEX.GD.ZS", "Health spending", "% of GDP", "living", "line"),
]

# A series with no more than this many observations is published in full in
# the summary, not just as endpoints.
SHORT_SERIES = 10

GROUPS = {
    "population": "People",
    "economy": "The economy",
    "education": "Education",
    "living": "Daily life",
}


def fetch(url: str, attempts: int = 3):
    """The World Bank API times out often enough to need retries."""
    last = None
    for attempt in range(attempts):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "allaboutnairobi-build/1.0"})
            with urllib.request.urlopen(request, timeout=90) as response:
                return json.loads(response.read())
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            last = error
            if attempt < attempts - 1:
                time.sleep(3 * (attempt + 1))
    raise RuntimeError(f"gave up on {url}: {last}")


def world_bank(code: str) -> list[dict]:
    payload = fetch(WB.format(code=code))
    rows = [
        {"year": int(r["date"]), "value": r["value"]}
        for r in (payload[1] or [])
        if r["value"] is not None
    ]
    rows.sort(key=lambda r: r["year"])
    return rows


def headline(entry: dict) -> dict:
    """
    One series reduced to the handful of figures a page or a guide quotes:
    the endpoints, and the peak and the trough with their years.
    """
    points = entry["points"]
    first, last = points[0], points[-1]
    lowest = min(points, key=lambda p: p["value"])
    highest = max(points, key=lambda p: p["value"])

    row = {
        "id": entry["id"],
        "scope": entry["scope"],
        "group": entry["group"],
        "label": entry["label"],
        "unit": entry["unit"],
        "source": entry["source"],
        "first_year": first["year"],
        "first_value": first["value"],
        "last_year": last["year"],
        "last_value": last["value"],
        "min_year": lowest["year"],
        "min_value": lowest["value"],
        "max_year": highest["year"],
        "max_value": highest["value"],
        "points": len(points),
    }
    # Absent where the first observation is zero - internet use and mobile
    # phones both start at nothing, and dividing by it would print infinity.
    if first["value"] not in (None, 0):
        row["multiple"] = round(last["value"] / first["value"], 2)

    # Short series come along whole: the census counts are six points each.
    if len(points) <= SHORT_SERIES:
        row["values"] = points

    return row


def write_summary(payload: dict) -> None:
    SUMMARY_OUT.write_text(yaml.safe_dump({
        "meta": payload["meta"],
        "series": [headline(s) for s in payload["series"]],
    }, sort_keys=False, allow_unicode=True), encoding="utf-8")


def rebuild_summary() -> None:
    """
    Rewrite the summary from the committed JSON, fetching nothing.

    `mise dashboard-data --offline`, for changing the summary's shape without
    quietly moving every figure along with it.
    """
    payload = json.loads(DATA_OUT.read_text(encoding="utf-8"))
    write_summary(payload)
    print(f"Rebuilt {SUMMARY_OUT.relative_to(ROOT)} from "
          f"{DATA_OUT.relative_to(ROOT)}, {len(payload['series'])} series, no fetch")


def main() -> None:
    print("Building /data")

    # The county's area as the map measures it from its boundary, so the
    # density here and the map's cannot disagree.
    area = round(json.loads(MAP.read_text(encoding="utf-8"))["meta"]["countyAreaKm2"])

    series = []

    # ---- Nairobi itself --------------------------------------------------

    census = [{"year": y, "value": v} for y, v in sorted(NAIROBI_CENSUS.items())]
    series.append({
        "id": "nairobi-population",
        "scope": "nairobi",
        "group": "population",
        "label": "People in Nairobi",
        "unit": "people",
        "shape": "census",
        "source": CENSUS_SOURCE,
        "note": "Census counts, not estimates. Six points in fifty years, and nothing in between.",
        "points": census,
    })

    series.append({
        "id": "nairobi-density",
        "scope": "derived",
        "group": "population",
        "label": "People per square kilometre in Nairobi",
        "unit": "per km²",
        "shape": "census",
        "source": f"Census counts divided by the county's {area:,} km²",
        "note": "Honest division of two sourced numbers, on today's boundary.",
        "points": [
            {"year": p["year"], "value": round(p["value"] / area, 1)}
            for p in census
        ],
    })

    series.append({
        "id": "nairobi-gcp-per-person",
        "scope": "nairobi",
        "group": "economy",
        "label": "Output per person in Nairobi",
        "unit": "KSh",
        "shape": "census",
        "source": "KNBS, Gross County Product 2024, Annexe IV (current prices)",
        "note": "Gross County Product per person, in shillings of each year. Five years are all KNBS has published on this basis.",
        "points": [{"year": y, "value": v} for y, v in sorted(NAIROBI_GCP_PER_CAPITA.items())],
    })

    print("  fetching World Bank indicators")
    national: dict[str, list[dict]] = {}
    for code, label, unit, group, shape in INDICATORS:
        rows = world_bank(code)
        if not rows:
            print(f"    {code:<20} no data - left out")
            continue
        national[code] = rows
        status = "sparse" if len(rows) < 15 else f"{len(rows)} pts"
        print(f"    {code:<20} {status:>9}  {label}")
        series.append({
            "id": code.lower().replace(".", "-"),
            "scope": "kenya",
            "group": group,
            "label": label,
            "unit": unit,
            "shape": "sparse" if len(rows) < 15 else shape,
            "source": f"World Bank, indicator {code}",
            "points": rows,
        })

    # ---- derived, from two real series -----------------------------------

    share = [
        {"year": p["year"], "value": round(p["value"] / KENYA_CENSUS[p["year"]] * 100, 1)}
        for p in census
    ]
    series.append({
        "id": "nairobi-share-of-kenya",
        "scope": "derived",
        "group": "population",
        "label": "Share of all Kenyans living in Nairobi",
        "unit": "%",
        "shape": "census",
        "source": "Census counts for Nairobi over census counts for Kenya",
        "note": "Two sourced series divided by each other. Not a projection.",
        "points": share,
    })

    payload = {
        "meta": {
            "generated": CHECKED,
            "last_verified": CHECKED,
            "fail_on": EXPIRES,
            "scopes": {
                "nairobi": "Nairobi City County itself",
                "kenya": "Kenya as a whole, not Nairobi",
                "derived": "Arithmetic on two sourced series",
            },
            "groups": GROUPS,
            "nairobi_area_km2": area,
            "nairobi_gcp": NAIROBI_GCP,
            "caveat": (
                "Very little economic data is published for Nairobi alone. Everything marked "
                "Kenya is national and is labelled that way on purpose."
            ),
            "sources": [
                {"what": "National indicators, 1960 onwards", "who": "World Bank Open Data",
                 "url": "https://data.worldbank.org/country/kenya", "licence": "CC BY 4.0"},
                {"what": "Nairobi census counts", "who": "Kenya National Bureau of Statistics",
                 "url": "https://www.knbs.or.ke", "licence": "Official statistics"},
                {"what": "Nairobi's output and its share of the economy", "who": NAIROBI_GCP["source"],
                 "url": GCP_URL, "licence": "Official statistics"},
                {"what": "Nairobi's households at the 2019 census", "who": "KNBS census tables via census.ke (Open Institute)",
                 "url": "https://census.ke", "licence": "CC BY"},
            ],
        },
        "series": series,
    }

    DATA_OUT.parent.mkdir(parents=True, exist_ok=True)
    DATA_OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    write_summary(payload)

    by_scope: dict[str, int] = {}
    for entry in series:
        by_scope[entry["scope"]] = by_scope.get(entry["scope"], 0) + 1
    points = sum(len(s["points"]) for s in series)

    print(f"\n  {len(series)} series, {points:,} data points")
    for scope, count in sorted(by_scope.items()):
        print(f"    {scope:<10} {count}")
    print(f"  Nairobi: {census[0]['value']:,} in {census[0]['year']} "
          f"to {census[-1]['value']:,} in {census[-1]['year']} "
          f"({census[-1]['value'] / census[0]['value']:.1f} times)")
    print(f"\n  {DATA_OUT.relative_to(ROOT)}  {DATA_OUT.stat().st_size / 1024:.1f}KB")
    print(f"  {SUMMARY_OUT.relative_to(ROOT)}  {SUMMARY_OUT.stat().st_size / 1024:.1f}KB")


if __name__ == "__main__":
    if "--offline" in sys.argv:
        rebuild_summary()
    else:
        main()
