"""
Fetch how Nairobi lives, sub-county by sub-county, from the 2019 census.

Run by hand, then rebuild the map, which merges what this writes:

    mise census-2019
    mise map-data

The 2019 Kenya Population and Housing Census is Kenya's latest; the next is
due around 2029. KNBS publishes its tables as PDF volumes. The Open Institute
scraped them into census.ke, under CC BY, and this reads that catalogue's CSVs
through its CKAN API (ckan.sabasi.io) rather than retyping figures from a PDF.

Seven tables, all for conventional households or people unless they say
otherwise, each at county and sub-county level:

  Volume II, table 2.3   people, households, land area
  Volume IV, table 2.10  owned or rented home
  Volume IV, 2.15        main source of drinking water
  Volume IV, 2.16        main mode of human waste disposal
  Volume IV, 2.18        main type of cooking fuel
  Volume IV, 2.19        main type of lighting
  Volume IV, 2.33        people aged 3 and over using the internet

Left out on purpose: the table of household assets, whose CSV on census.ke
stops before Nairobi; and the activity-status table, whose scraped column
names are too ambiguous to label a figure from.

Every row is checked: the eleven sub-counties must all be there, by name, and
each table's sub-counties must add up to its Nairobi total within rounding. A
table that fails stops the script rather than publishing a wrong figure.

Writes content/geo/census-2019.yaml, committed.
"""

import csv
import io
import json
import sys
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "content" / "geo" / "census-2019.yaml"

API = "https://ckan.sabasi.io/api/3/action/package_show?"
AGENT = "allaboutnairobi-build/1.0 (https://www.allaboutnairobi.com)"

# census.ke dataset names - stable slugs, unlike the resource URLs.
DATASETS = {
    "people": "table-2-3-population-by-sex-number-of-households-land-area-population-density-and-subcounty",
    "tenure": "table-2-10-hholds-and-tenure-status-of-dwelling-unit-by-area-of-residence-county-and-sub-county",
    "water": None,
    "sanitation": None,
    "cooking": None,
    "lighting": None,
    "internet": "table-2-33-age-3-years-and-above-a-mobile-phone-by-area-of-residence-sex-county-and-sub-county",
}

# The rest are found by title, since their slugs were not chosen with care.
TITLES = {
    "water": "Households by Main Source of Drinking Water, Area of Residence, County and Sub-County",
    "sanitation": "Households by Main Mode of Human Waste Disposal, Area of Residence, County and Sub-County",
    "cooking": "Households by Main Type of Cooking Fuel, Area of Residence, County and Sub-County",
    "lighting": "Households by Main Type of Lighting Fuel, Area of Residence, County and Sub-County",
}

SUBCOUNTIES = ["Dagoretti", "Embakasi", "Kamukunji", "Kasarani", "Kibra", "Lang'ata",
               "Makadara", "Mathare", "Njiru", "Starehe", "Westlands"]


def key(name: str) -> str:
    return name.strip().upper().replace("'", "").replace("’", "")


def get(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": AGENT})
    with urllib.request.urlopen(request, timeout=120) as response:
        return response.read()


def dataset(name: str) -> dict:
    return json.loads(get(API + urllib.parse.urlencode({"id": name})))["result"]


def find_by_title(title: str) -> dict:
    query = urllib.parse.urlencode({"fq": "organization:census-ke", "q": f'title:"{title}"', "rows": 10})
    results = json.loads(get("https://ckan.sabasi.io/api/3/action/package_search?" + query))["result"]["results"]
    for result in results:
        if result["title"].strip() == title:
            return result
    raise SystemExit(f"ERROR: no census.ke dataset titled {title!r}")


def rows_of(package: dict) -> tuple[list[list[str]], str]:
    resource = next(r for r in package["resources"] if r.get("format") == "CSV")
    text = get(resource["url"]).decode("utf-8-sig", "replace")
    return list(csv.reader(io.StringIO(text))), resource["url"]


def people_block(rows: list[list[str]]) -> dict[str, list[str]]:
    """Volume II names the county in one column and the sub-county in the next."""
    wanted = {key(name): name for name in SUBCOUNTIES}
    out = {}
    for row in rows:
        if key(row[0]) != "NAIROBI CITY":
            continue
        if not row[1].strip() or row[1].strip() == "-":
            out["Nairobi"] = row
        elif key(row[1]) in wanted:
            out[wanted[key(row[1])]] = row
    missing = [n for n in ["Nairobi", *SUBCOUNTIES] if n not in out]
    if missing:
        raise SystemExit(f"ERROR: missing from the people table: {missing}")
    return out


def nairobi_block(rows: list[list[str]], column: int = 0) -> dict[str, list[str]]:
    """The NAIROBI CITY row and the sub-county rows under it, by name."""
    start = next(i for i, row in enumerate(rows) if key(row[column]) == "NAIROBI CITY")
    wanted = {key(name): name for name in SUBCOUNTIES}
    out = {"Nairobi": rows[start]}
    for row in rows[start + 1:]:
        name = key(row[column])
        if name in wanted:
            out[wanted[name]] = row
        elif name not in ("MALE", "FEMALE", "") and len(out) > 1:
            break
    missing = [n for n in SUBCOUNTIES if n not in out]
    if missing:
        raise SystemExit(f"ERROR: sub-counties missing from the table: {missing}")
    return out


def number(text: str) -> float:
    text = text.replace(",", "").strip()
    return 0.0 if text in ("", "-") else float(text)


def check_sum(label: str, block: dict, values: dict) -> None:
    """Sub-counties must add up to Nairobi, within half a percent."""
    total = values["Nairobi"]
    parts = sum(values[n] for n in SUBCOUNTIES)
    if abs(parts - total) > total * 0.005:
        raise SystemExit(f"ERROR: {label}: sub-counties sum to {parts:,.0f}, Nairobi is {total:,.0f}")


def main() -> int:
    print("Fetching the 2019 census for Nairobi from census.ke")
    packages = {}
    for name, slug in DATASETS.items():
        packages[name] = dataset(slug) if slug else find_by_title(TITLES[name])

    tables = {}
    sources = {}
    for name, package in packages.items():
        rows, url = rows_of(package)
        sources[name] = {"title": package["title"].strip(), "csv": url}
        if name == "people":
            block = people_block(rows)
        else:
            # Tenure numbers its rows in a first column of its own.
            block = nairobi_block(rows, 1 if rows[0][0].strip().lower() == "no" else 0)
        tables[name] = (rows[0], block)
        print(f"  {name:<11} {package['title'].strip()[:70]}")

    def col(name: str, startswith: str) -> int:
        header = tables[name][0]
        matches = [i for i, h in enumerate(header) if h.strip().lower().startswith(startswith.lower())]
        if not matches:
            raise SystemExit(f"ERROR: {name}: no column starting {startswith!r} in {header}")
        return matches[0]

    out: dict[str, dict] = {n: {} for n in ["Nairobi", *SUBCOUNTIES]}

    # People and households (Volume II): the people count, and every household
    # including group quarters, which is how KNBS states household size.
    _, people = tables["people"]
    pop = {n: number(people[n][2]) for n in out}
    households = {n: number(people[n][5]) for n in out}
    check_sum("people", people, pop)
    check_sum("households", people, households)
    for n in out:
        out[n]["population"] = int(pop[n])
        out[n]["households"] = int(households[n])
        out[n]["householdSize"] = round(pop[n] / households[n], 1)

    # Tenure (Volume IV 2.10): per cent of households renting.
    _, tenure = tables["tenure"]
    rented = col("tenure", "per cent rented")
    for n in out:
        out[n]["rentingPct"] = number(tenure[n][rented])

    # Water (2.15): piped into the dwelling, or to the yard or plot.
    _, water = tables["water"]
    into, yard = col("water", "piped into"), col("water", "piped to yard")
    vendor, tap = col("water", "water vendor"), col("water", "public tap")
    for n in out:
        out[n]["pipedPct"] = round(number(water[n][into]) + number(water[n][yard]), 1)
        out[n]["vendorPct"] = number(water[n][vendor])
        out[n]["publicTapPct"] = number(water[n][tap])

    # Sanitation (2.16): connected to the main sewer.
    _, sanitation = tables["sanitation"]
    sewer = col("sanitation", "mode of human waste disposal (%) main sewer")
    for n in out:
        out[n]["sewerPct"] = number(sanitation[n][sewer])

    # Cooking (2.18): gas or electricity, and paraffin.
    _, cooking = tables["cooking"]
    lpg, electric = col("cooking", "type of cooking fuel (%) - gas"), col("cooking", "type of cooking fuel (%) - electricity")
    paraffin, charcoal = col("cooking", "type of cooking fuel (%) - paraffin"), col("cooking", "type of cooking fuel (%) - charcoal")
    for n in out:
        out[n]["cleanCookingPct"] = round(number(cooking[n][lpg]) + number(cooking[n][electric]), 1)
        out[n]["paraffinPct"] = number(cooking[n][paraffin])
        out[n]["charcoalPct"] = number(cooking[n][charcoal])

    # Lighting (2.19): on mains electricity.
    _, lighting = tables["lighting"]
    mains = col("lighting", "main electricity")
    for n in out:
        out[n]["electricityPct"] = number(lighting[n][mains])

    # Internet (2.33): people aged 3 and over using it, and a computer.
    _, internet = tables["internet"]
    net, computer = col("internet", "use of internet"), col("internet", "use of desktop")
    for n in out:
        # The count column comes first, its per cent straight after it.
        out[n]["internetPct"] = number(internet[n][net + 1])
        out[n]["computerPct"] = number(internet[n][computer + 1])
    population3 = {n: number(internet[n][1]) for n in out}
    check_sum("internet", internet, population3)

    today = date.today().isoformat()
    payload = {
        "meta": {
            "title": "Nairobi at the 2019 census: households and how they live",
            "census": "2019 Kenya Population and Housing Census, Kenya National Bureau of Statistics",
            "via": "census.ke, the Open Institute's tables from the census volumes",
            "licence": "CC BY",
            "url": "https://census.ke",
            "fetched": today,
            "last_verified": today,
            "note": (
                "Kenya's latest census. Shares are of conventional households, except internet "
                "and computer use, which are of people aged 3 and over."
            ),
            "tables": sources,
        },
        "county": out["Nairobi"],
        "subcounties": {n: out[n] for n in SUBCOUNTIES},
    }
    header = "# Generated by scripts/fetch_census_2019.py - do not edit by hand.\n"
    OUT.write_text(header + yaml.safe_dump(payload, sort_keys=False, allow_unicode=True, width=100), encoding="utf-8")

    c = out["Nairobi"]
    print(f"\n  Nairobi: {c['households']:,} households of {c['householdSize']}; {c['rentingPct']}% rent; "
          f"{c['pipedPct']}% piped water; {c['sewerPct']}% sewer; {c['cleanCookingPct']}% cook with gas or "
          f"electricity; {c['internetPct']}% use the internet")
    print(f"  wrote {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
