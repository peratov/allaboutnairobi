"""
Build the data behind /data.

Run by hand, like the other fetchers, and the output is committed so the deploy
never depends on the World Bank being up:

    mise dashboard-data

**The honesty problem this script exists to manage.** Almost no economic time
series exists for Accra. Ghana does not publish regional GDP, regional
inflation series are not available programmatically, and virtually everything
with sixty years of history is national. A dashboard that puts Ghana's GDP
under a heading saying "Accra" would be the exact dishonesty this site is
built to avoid.

So every series carries a `scope`, and the page groups and labels by it:

  ACCRA     Greater Accra itself. Real, and there is very little of it: six
            census counts, the region's area, and one estimate of its share
            of the national economy.
  GHANA     National. Sixty-odd years of it, and clearly labelled as Ghana
            rather than as Accra.
  DERIVED   Arithmetic on two real series - Greater Accra's share of Ghana's
            population, and its density. Both are honest divisions of numbers
            that are themselves sourced; neither is a projection.

Nothing here is modelled, interpolated or forecast. Where a series is sparse
it stays sparse, and the chart draws the gap rather than joining across it.
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

CHECKED = "2026-09-10"
# The World Bank revises these series annually, so a year is the honest shelf
# life. StaleDataFilesLinter fails the build when it passes, the same way an
# expired constant does - guides quote these figures, so they have to expire.
EXPIRES = "2027-09-10"
WB = "https://api.worldbank.org/v2/country/GHA/indicator/{code}?format=json&per_page=400"

# Greater Accra Region at every Ghanaian census. The whole Accra story is in
# these six numbers: an eleven-fold increase in sixty-one years.
#
# 2021 agrees with the figure build_map_data.py asserts against the district
# sums, which is two independent confirmations of the same total.
ACCRA_CENSUS = {
    1960: 491_817,
    1970: 903_447,
    1984: 1_431_099,
    2000: 2_905_726,
    2010: 4_010_054,
    2021: 5_455_692,
}

# Square kilometres. Used only to divide the counts above into a density.
ACCRA_AREA_KM2 = 3245

# UNECA and the Accra Metropolitan Authority, 2021. Deliberately stored as a
# RANGE over a period, because that is what the study reports - it gives no
# year-by-year series, and inventing one would be exactly the wrong move.
ACCRA_GDP_SHARE = {
    "from_year": 2015,
    "to_year": 2020,
    "low_pct": 34,
    "high_pct": 39,
    "per_capita_multiple": 3,
    "services_share_pct": 63,
    "manufacturing_share_pct": 20.5,
    "source": "UN Economic Commission for Africa with the Accra Metropolitan Authority, 2021",
    "url": "https://uneca.org/stories/new-study-shows-accra-generates-one-third-of-ghana%E2%80%99s-gdp",
}

# code, label, unit, group, and how to draw it.
INDICATORS = [
    # -- population ---------------------------------------------------------
    ("SP.POP.TOTL", "Population of Ghana", "people", "population", "line"),
    ("SP.POP.GROW", "Population growth", "% a year", "population", "line"),
    ("SP.URB.TOTL", "Urban population", "people", "population", "line"),
    ("SP.URB.TOTL.IN.ZS", "Share of Ghanaians living in towns and cities", "%", "population", "line"),
    ("SP.URB.GROW", "Urban population growth", "% a year", "population", "line"),
    ("SP.DYN.LE00.IN", "Life expectancy at birth", "years", "population", "line"),
    ("SP.DYN.TFRT.IN", "Births per woman", "births", "population", "line"),
    ("SP.POP.0014.TO.ZS", "Under fifteens", "% of population", "population", "line"),
    # -- economy ------------------------------------------------------------
    ("NY.GDP.MKTP.CD", "GDP", "US$", "economy", "line"),
    ("NY.GDP.PCAP.CD", "GDP per person", "US$", "economy", "line"),
    ("NY.GDP.MKTP.KD.ZG", "GDP growth", "% a year", "economy", "line"),
    ("FP.CPI.TOTL.ZG", "Inflation", "% a year", "economy", "line"),
    ("PA.NUS.FCRF", "Cedis to the US dollar", "GHS", "economy", "line"),
    ("BX.TRF.PWKR.CD.DT", "Money sent home from abroad", "US$", "economy", "line"),
    ("NE.EXP.GNFS.ZS", "Exports", "% of GDP", "economy", "line"),
    ("SL.UEM.TOTL.ZS", "Unemployment", "% of labour force", "economy", "line"),
    # -- education ----------------------------------------------------------
    ("SE.PRM.CMPT.ZS", "Finishing primary school", "% of age group", "education", "line"),
    ("SE.SEC.NENR", "Enrolled in secondary school", "% of age group", "education", "line"),
    ("SE.TER.ENRR", "Enrolled in tertiary education", "% of age group", "education", "line"),
    ("SE.XPD.TOTL.GD.ZS", "Government spending on education", "% of GDP", "education", "line"),
    ("SE.ADT.LITR.ZS", "Adult literacy", "% of adults", "education", "sparse"),
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
            request = urllib.request.Request(url, headers={"User-Agent": "allaboutaccra-build/1.0"})
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
    One series reduced to the handful of figures a page or a guide quotes.

    The full series is about 1,300 points and would be 1,300 table rows, but
    the endpoints alone are not enough: Ghana's inflation and its GDP growth
    are only interesting at their extremes, and a guide that cannot name the
    year inflation peaked has to hand-wave at the chart instead. So the peak
    and the trough come along, each with its year.
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

    # Short series come along whole. The three Accra series are six census
    # counts each and adult literacy is five observations - small enough to
    # publish in full, and a guide about Accra's growth that could only show
    # the first and last count would be hiding four of the six.
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

    `mise dashboard-data --offline`. The World Bank API is slow and flaky
    enough that thirty requests is a real wait, so changing the *shape* of the
    summary should not need new data - and refetching to change a shape would
    also quietly move every figure in every guide, which is not a change you
    want riding along with a refactor.
    """
    payload = json.loads(DATA_OUT.read_text(encoding="utf-8"))
    write_summary(payload)
    print(f"Rebuilt {SUMMARY_OUT.relative_to(ROOT)} from "
          f"{DATA_OUT.relative_to(ROOT)}, {len(payload['series'])} series, no fetch")


def main() -> None:
    print("Building /data")

    series = []

    # ---- Accra itself ----------------------------------------------------

    census = [{"year": y, "value": v} for y, v in sorted(ACCRA_CENSUS.items())]
    series.append({
        "id": "accra-population",
        "scope": "accra",
        "group": "population",
        "label": "People in Greater Accra",
        "unit": "people",
        "shape": "census",
        "source": "Ghana Statistical Service census counts, 1960 to 2021",
        "note": "Census counts, not estimates. Six points in sixty-one years, and nothing in between.",
        "points": census,
    })

    series.append({
        "id": "accra-density",
        "scope": "derived",
        "group": "population",
        "label": "People per square kilometre in Greater Accra",
        "unit": "per km²",
        "shape": "census",
        "source": f"Census counts divided by the region's {ACCRA_AREA_KM2:,} km²",
        "note": "Honest division of two sourced numbers. The region's boundaries have changed over this period, which this cannot account for.",
        "points": [
            {"year": p["year"], "value": round(p["value"] / ACCRA_AREA_KM2, 1)}
            for p in census
        ],
    })

    print("  fetching World Bank indicators")
    national: dict[str, list[dict]] = {}
    for code, label, unit, group, shape in INDICATORS:
        rows = world_bank(code)
        national[code] = rows
        status = "sparse" if len(rows) < 15 else f"{len(rows)} pts"
        print(f"    {code:<20} {status:>9}  {label}")
        series.append({
            "id": code.lower().replace(".", "-"),
            "scope": "ghana",
            "group": group,
            "label": label,
            "unit": unit,
            "shape": shape,
            "source": f"World Bank, indicator {code}",
            "points": rows,
        })

    # ---- derived, from two real series -----------------------------------

    ghana_population = {r["year"]: r["value"] for r in national["SP.POP.TOTL"]}
    share = [
        {"year": p["year"], "value": round(p["value"] / ghana_population[p["year"]] * 100, 1)}
        for p in census
        if p["year"] in ghana_population
    ]
    series.append({
        "id": "accra-share-of-ghana",
        "scope": "derived",
        "group": "population",
        "label": "Share of all Ghanaians living in Greater Accra",
        "unit": "%",
        "shape": "census",
        "source": "Census counts for Greater Accra over World Bank population for Ghana",
        "note": "Two sourced series divided by each other. Not a projection.",
        "points": share,
    })

    payload = {
        "meta": {
            "generated": CHECKED,
            "last_verified": CHECKED,
            "fail_on": EXPIRES,
            "scopes": {
                "accra": "Greater Accra itself",
                "ghana": "Ghana as a whole, not Accra",
                "derived": "Arithmetic on two sourced series",
            },
            "groups": GROUPS,
            "accra_area_km2": ACCRA_AREA_KM2,
            "accra_gdp_share": ACCRA_GDP_SHARE,
            "caveat": (
                "Almost no economic time series exists for Accra alone. Everything marked "
                "Ghana is national and is labelled that way on purpose."
            ),
            "sources": [
                {"what": "National indicators, 1960 onwards", "who": "World Bank Open Data",
                 "url": "https://data.worldbank.org/country/ghana", "licence": "CC BY 4.0"},
                {"what": "Greater Accra census counts", "who": "Ghana Statistical Service",
                 "url": "https://statsghana.gov.gh", "licence": "Official statistics"},
                {"what": "Accra's share of national GDP", "who": ACCRA_GDP_SHARE["source"],
                 "url": ACCRA_GDP_SHARE["url"], "licence": "UN report"},
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
    print(f"  Greater Accra: {census[0]['value']:,} in {census[0]['year']} "
          f"to {census[-1]['value']:,} in {census[-1]['year']} "
          f"({census[-1]['value'] / census[0]['value']:.1f} times)")
    print(f"\n  {DATA_OUT.relative_to(ROOT)}  {DATA_OUT.stat().st_size / 1024:.1f}KB")
    print(f"  {SUMMARY_OUT.relative_to(ROOT)}  {SUMMARY_OUT.stat().st_size / 1024:.1f}KB")


if __name__ == "__main__":
    if "--offline" in sys.argv:
        rebuild_summary()
    else:
        main()
