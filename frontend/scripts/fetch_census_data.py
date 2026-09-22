"""
Pull the 2021 census figures behind the map's demographic layers.

Run by hand, like the other generators:

    mise census-data

It writes content/geo/census.yaml, which is committed and human-readable so the
numbers can be reviewed and diffed rather than taken on trust from a blob.

Source: Ghana Statistical Service, 2021 Population and Housing Census, through
the StatsBank PxWeb API at statsbank.statsghana.gov.gh. This is the real thing
at exactly the right geography - the 2021 census uses the post-2018 districts,
so it joins to the 29 Greater Accra assemblies without any fudging.

Four tables, all at district level:

    population_table   age bands and sex
    ethnic_table       the nine major ethnic groups
    econact_table      employed, unemployed, outside the labour force
    sector_table       public, private formal, private informal and the rest

One trap worth naming. Every variable here carries its own "Total" row as a
value. PxWeb will happily eliminate - that is, sum - any variable you do not
constrain, which would add the total to its own parts and double everything.
So every variable is pinned explicitly, even the ones that look optional.
"""

import json
import re
import time
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "content" / "geo" / "census.yaml"

BASE = "https://statsbank.statsghana.gov.gh/api/v1/en/PHC%202021%20StatsBank"
USER_AGENT = "AllAboutAccra-map-builder/1.0 (https://www.allaboutaccra.com)"

# The 29 Greater Accra assemblies as StatsBank names them. The region row and
# the AMA/TMA sub-metro rows are deliberately absent: including a parent and
# its children would count the same people twice.
DISTRICTS = [
    "Ga South Municipal", "Weija Gbawe Municipal", "Ga Central Municipal",
    "Ablekuma North Municipal", "Ablekuma West Municipal", "Ablekuma Central Municipal",
    "Accra Metropolitan Area (AMA)", "Korle Klottey Municipal",
    "Ayawaso Central Municipal", "Ayawaso East Municipal", "Ayawaso North Municipal",
    "La Dade-Kotopon Municipal", "Ledzokuku Municipal", "Krowor Municipal",
    "Adentan Municipal", "Ayawaso West Municipal", "Okaikoi North Municipal",
    "Ga North Municipal", "Ga West Municipal", "Ga East Municipal",
    "La Nkwantanang Madina Municipal", "Kpone Katamanso Municipal",
    "Ashaiman Municipal", "Tema West Municipal", "Tema Metropolitan Area (TMA)",
    "Ningo-Prampram", "Shai-Osudoku", "Ada West", "Ada East",
]

ETHNIC_GROUPS = [
    "Akan", "Ga-Dangme", "Ewe", "Guan", "Gurma",
    "Mole-Dagbani", "Grusi", "Mande", "Others",
]

# Sector of employment, split the way the census splits it. "Informal" here is
# private informal work, which is what the word means in Ghana in practice.
FORMAL_SECTORS = [
    "Public (Government)", "Semi-Public/Parastatal", "Private Formal",
    "Local NGO/CSO", "International NGO/CSO", "Religious Organization (local)",
    "Religious Organization (international)", "International Organization",
]
INFORMAL_SECTORS = ["Private Informal"]


def post(table, query):
    """One PxWeb query, returned as json-stat2."""
    body = json.dumps({
        "query": [
            {"code": code, "selection": {"filter": "item", "values": values}}
            for code, values in query.items()
        ],
        "response": {"format": "json-stat2"},
    }).encode("utf-8")

    # "Economic Activity" is a real folder name with a real space in it.
    path = "/".join(urllib.parse.quote(part) for part in table.split("/"))
    request = urllib.request.Request(
        f"{BASE}/{path}",
        data=body,
        headers={"Content-Type": "application/json", "User-Agent": USER_AGENT},
    )
    with urllib.request.urlopen(request, timeout=180) as response:
        return json.load(response)


def to_records(payload):
    """
    json-stat2 into {(dim value, ...): number}.

    The values are a flat array in row-major order over the dimensions, so the
    index arithmetic is just an odometer.
    """
    dims = payload["id"]
    sizes = payload["size"]
    values = payload["value"]

    labels = []
    for dim in dims:
        category = payload["dimension"][dim]["category"]
        index = category["index"]
        if isinstance(index, dict):
            ordered = sorted(index, key=lambda k: index[k])
        else:
            ordered = list(index)
        labels.append(ordered)

    records = {}
    for flat, value in enumerate(values):
        if value is None:
            continue
        key = []
        remainder = flat
        for axis in range(len(sizes) - 1, -1, -1):
            key.append(labels[axis][remainder % sizes[axis]])
            remainder //= sizes[axis]
        records[tuple(reversed(key))] = value
    return records, dims


def field(records, dims, **where):
    """Look one value up by dimension name."""
    key = tuple(where[dim] for dim in dims)
    return records.get(key)


def fetch_population():
    print("  population (age bands and sex)...")
    payload = post("Population/population_table.px", {
        "Age": ["All ages", "0 years to 14 years", "15 years to 64 years", "65 years and older"],
        "Sex": ["Both sexes", "Male", "Female"],
        "Locality": ["All Locality Types"],
        "Education": ["Total"],
        "Geographic_Area": DISTRICTS,
    })
    records, dims = to_records(payload)

    out = {}
    for name in DISTRICTS:
        get = lambda age, sex: field(  # noqa: E731
            records, dims, Age=age, Sex=sex, Locality="All Locality Types",
            Education="Total", Geographic_Area=name,
        )
        out[name] = {
            "population": get("All ages", "Both sexes"),
            "male": get("All ages", "Male"),
            "female": get("All ages", "Female"),
            "age_0_14": get("0 years to 14 years", "Both sexes"),
            "age_15_64": get("15 years to 64 years", "Both sexes"),
            "age_65_plus": get("65 years and older", "Both sexes"),
        }
    return out


def fetch_ethnicity():
    print("  ethnicity...")
    payload = post("Population/ethnic_table.px", {
        "Ethnicity": ["Total"] + ETHNIC_GROUPS,
        "Age": ["All ages"],
        "Sex": ["Both sexes"],
        "Locality": ["All Locality Types"],
        "Education": ["Total"],
        "Geographic_Area": DISTRICTS,
    })
    records, dims = to_records(payload)

    out = {}
    for name in DISTRICTS:
        groups = {}
        for group in ETHNIC_GROUPS:
            value = field(
                records, dims, Ethnicity=group, Age="All ages", Sex="Both sexes",
                Locality="All Locality Types", Education="Total", Geographic_Area=name,
            )
            if value:
                groups[group] = value
        out[name] = {
            "total": field(
                records, dims, Ethnicity="Total", Age="All ages", Sex="Both sexes",
                Locality="All Locality Types", Education="Total", Geographic_Area=name,
            ),
            "groups": groups,
        }
    return out


def fetch_economic_activity():
    print("  economic activity...")
    payload = post("Economic Activity/econact_table.px", {
        "Econact": ["Total", "Employed", "Unemployed", "Outside Labour Force"],
        "Age": ["Total"],
        "Sex": ["Both sexes"],
        "Locality": ["All Locality Types"],
        "Education": ["Total"],
        "Geographic_Area": DISTRICTS,
    })
    records, dims = to_records(payload)

    out = {}
    for name in DISTRICTS:
        get = lambda act: field(  # noqa: E731
            records, dims, Econact=act, Age="Total", Sex="Both sexes",
            Locality="All Locality Types", Education="Total", Geographic_Area=name,
        )
        out[name] = {
            "aged_15_plus": get("Total"),
            "employed": get("Employed"),
            "unemployed": get("Unemployed"),
            "outside_labour_force": get("Outside Labour Force"),
        }
    return out


def fetch_sector():
    print("  sector of employment...")
    payload = post("Economic Activity/sector_table.px", {
        "Sector": ["Total"] + FORMAL_SECTORS + INFORMAL_SECTORS,
        "Age": ["All ages"],
        "Sex": ["Both sexes"],
        "Locality": ["All Locality Types"],
        "Education": ["Total"],
        "Geographic_Area": DISTRICTS,
    })
    records, dims = to_records(payload)

    out = {}
    for name in DISTRICTS:
        get = lambda sector: field(  # noqa: E731
            records, dims, Sector=sector, Age="All ages", Sex="Both sexes",
            Locality="All Locality Types", Education="Total", Geographic_Area=name,
        ) or 0
        formal = sum(get(s) for s in FORMAL_SECTORS)
        informal = sum(get(s) for s in INFORMAL_SECTORS)
        out[name] = {
            "employed": get("Total"),
            "formal": formal,
            "informal": informal,
            "public": get("Public (Government)"),
            "private_formal": get("Private Formal"),
            "private_informal": get("Private Informal"),
        }
    return out


def main():
    print("Fetching PHC 2021 from StatsBank...")
    population = fetch_population()
    time.sleep(1)
    ethnicity = fetch_ethnicity()
    time.sleep(1)
    econact = fetch_economic_activity()
    time.sleep(1)
    sector = fetch_sector()

    districts = []
    for name in DISTRICTS:
        pop = population[name]
        eth = ethnicity[name]
        act = econact[name]
        sec = sector[name]

        if not pop["population"]:
            raise SystemExit(f"No population for {name}. Refusing to write a partial file.")

        largest = max(eth["groups"].items(), key=lambda kv: kv[1]) if eth["groups"] else (None, 0)
        eth_total = eth["total"] or sum(eth["groups"].values()) or 1
        labour_force = (act["employed"] or 0) + (act["unemployed"] or 0)
        sec_total = (sec["formal"] or 0) + (sec["informal"] or 0)

        districts.append({
            "statsbank_name": name,
            "population": pop["population"],
            "female": pop["female"],
            "male": pop["male"],
            "female_pct": round(100 * pop["female"] / pop["population"], 1),
            "age_0_14": pop["age_0_14"],
            "age_15_64": pop["age_15_64"],
            "age_65_plus": pop["age_65_plus"],
            "under_15_pct": round(100 * pop["age_0_14"] / pop["population"], 1),
            "over_64_pct": round(100 * pop["age_65_plus"] / pop["population"], 1),
            "ethnicity": {k: round(100 * v / eth_total, 1) for k, v in sorted(
                eth["groups"].items(), key=lambda kv: -kv[1])},
            "largest_ethnic_group": largest[0],
            "largest_ethnic_pct": round(100 * largest[1] / eth_total, 1) if largest[0] else None,
            "employed": act["employed"],
            "unemployed": act["unemployed"],
            "outside_labour_force": act["outside_labour_force"],
            "unemployment_pct": round(100 * act["unemployed"] / labour_force, 1) if labour_force else None,
            "participation_pct": round(100 * labour_force / act["aged_15_plus"], 1) if act["aged_15_plus"] else None,
            "informal_pct": round(100 * sec["informal"] / sec_total, 1) if sec_total else None,
            "public_pct": round(100 * sec["public"] / sec_total, 1) if sec_total else None,
        })

    payload = {
        "meta": {
            "generated": date.today().isoformat(),
            "source": "Ghana Statistical Service, 2021 Population and Housing Census",
            "via": "StatsBank PxWeb API, statsbank.statsghana.gov.gh",
            "note": (
                "Real census counts at district level. The 2021 census uses the "
                "post-2018 districts, so these join to the 29 Greater Accra "
                "assemblies directly. Percentages are computed here from the "
                "counts; the counts are as published."
            ),
        },
        "districts": districts,
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        yaml.safe_dump(payload, allow_unicode=True, sort_keys=False, width=100),
        encoding="utf-8",
    )

    total = sum(d["population"] for d in districts)
    print(f"\nWrote {OUTPUT.relative_to(ROOT)}")
    print(f"  {len(districts)} districts, {total:,} people")
    print(f"  Greater Accra 2021 census total was about 5.45 million - "
          f"this is {total / 5_455_692:.1%} of that")


if __name__ == "__main__":
    main()
