"""
Turn the AI Studio app's venue list into content/geo/nightlife.yaml.

What survives the conversion and what does not is the whole point of this
script, so it is worth being explicit:

  KEPT   Real venues, their neighbourhood, coordinates, categories, opening
         hours, typical stay, and the cost model (entry, average drink,
         average food, minimum spend). The venues are genuine Accra places and
         the prices are in the right range for the city.

  DROPPED  googlePlaceId - every value was a placeholder like
           'ChIJ_republic_bar_osu'. A real Place ID is an opaque string, so
           these were decoration pretending to be a join key.

           imageUrl - Unsplash stock photographs of unrelated bars. A stock
           photo captioned as a real venue is a small lie.

           confidence: 0.98 and friends - three decimal-place confidences on
           prices whose only cited source was the word 'menu'. That is
           invented precision, and this site's whole discipline is against it.

           reviewCount, rating - asserted without a source.

  COARSENED  Price confidence becomes one of three bands - observed, estimated
             or unknown - which is what the underlying knowledge actually
             supports, and matches how rent-bands.yaml handles the same
             problem.
"""

import json
import sys
from pathlib import Path

SRC = Path(sys.argv[1])
OUT = Path(sys.argv[2])

CHECKED = "2026-09-14"
EXPIRES = "2027-03-14"  # Nightlife prices and opening hours move fast.

# Every figure is "estimated", and deriving anything finer would be dishonest.
#
# The source marked 16 of 18 venues as having "verified" prices with
# confidences like 0.95, but those numbers were generated, not measured - the
# only cited source was the word "menu". Mapping them onto a band called
# "observed" would launder invented precision into this site's vocabulary,
# which is the exact failure the vocabulary exists to prevent. Nobody has stood
# at these doors with a notebook, so nothing here claims they have.
PRICE_BASIS = "estimated"


VIBES = {
    "drinks", "food", "live_music", "dancing", "party",
    "social", "date", "chill", "premium",
}


def main() -> None:
    data = json.loads(SRC.read_text(encoding="utf-8"))

    venues = []
    for v in data["venues"]:
        costs = v["costs"]

        # What a place is FOR, which is what the planner filters on.
        #
        # The source's `atmosphere` tags alone only covered five of the nine
        # vibes, so "live music", "food" and "dancing" would have matched
        # nothing and looked broken. Categories and music say the same thing
        # more reliably: a restaurant is for food whether or not somebody
        # tagged it, and a club is for dancing.
        cats = set(v["categories"])
        music = set(v.get("music", []))
        vibes = {t for t in v.get("atmosphere", []) if t in VIBES}

        if "restaurant" in cats:
            vibes.add("food")
        if cats & {"bar", "lounge"}:
            vibes.add("drinks")
        if "live_music" in cats or "live" in music:
            vibes.add("live_music")
        if "club" in cats:
            vibes.update({"dancing", "party"})
        if music & {"dj", "amapiano", "afrobeats"} and cats & {"club", "lounge"}:
            vibes.add("dancing")
        if v["priceLevel"] >= 4:
            vibes.add("premium")

        vibes = sorted(vibes)

        venues.append({
            "id": v["id"].replace("venue_", ""),
            "name": v["name"],
            "area": v["neighborhood"],
            "address": v["address"],
            "lat": round(v["latitude"], 4),
            "lng": round(v["longitude"], 4),
            "categories": v["categories"],
            "priceLevel": v["priceLevel"],
            "vibes": vibes,
            "music": v.get("music", []),
            "opens": v["openingHours"]["open"],
            "closes": v["openingHours"]["close"],
            "days": v["openingHours"]["days"],
            "typicalStayMin": v["typicalStayMin"],
            "entry": costs["entry"],
            "avgDrink": costs["avgDrink"],
            "avgFood": costs["avgFood"],
            "minimumSpend": costs["minimumSpend"],
            "priceBasis": PRICE_BASIS,
            "hoursBasis": PRICE_BASIS,
            "description": v["description"],
            "signature": [p["item"] for p in v.get("prices", [])][:3],
        })

    venues.sort(key=lambda x: (x["area"], x["name"]))

    doc = {
        "meta": {
            "last_verified": CHECKED,
            "fail_on": EXPIRES,
            "basis": (
                "Real Accra venues. Every cost here is an estimate of what a "
                "night in each place runs to - not a price list, not quoted by "
                "the venue, and not checked at the door. Treat them as the "
                "right order of magnitude for budgeting and expect the actual "
                "bill to differ. Nightlife prices and opening hours move fast, "
                "which is why this file expires."
            ),
            "areas": sorted({v["area"] for v in venues}),
        },
        "hotspots": [
            {
                "name": h["name"],
                "area": h["neighborhood"],
                "lat": round(h["lat"], 4),
                "lng": round(h["lng"], 4),
            }
            for h in data["hotspots"]
        ],
        "venues": venues,
    }

    import yaml
    OUT.write_text(
        yaml.safe_dump(doc, sort_keys=False, allow_unicode=True, width=100),
        encoding="utf-8",
    )
    print(f"{len(venues)} venues, {len(doc['hotspots'])} hotspots -> {OUT}")
    print("areas:", ", ".join(doc["meta"]["areas"]))
    bands = {}
    for v in venues:
        bands[v["priceBasis"]] = bands.get(v["priceBasis"], 0) + 1
    print("price basis:", bands)


if __name__ == "__main__":
    main()
