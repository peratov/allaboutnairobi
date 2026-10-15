"""
Fetch and resize the photos behind /seasons and record who took each one.

Run by hand, like build_icons.py and build_radio_data.py:

    python scripts/build_food_photos.py

Every photo is a Wikimedia Commons file, named in PHOTOS below. The script
asks Commons for a 760-pixel rendering of each - Commons makes the
thumbnail, so nothing larger than the page needs is downloaded - and writes
two things, both committed:

- templates/staticimages/food/<id>-<thumb|card|full>.webp, at three widths:
  a home-page tile, a card and a sheet. Served from this site, so the page asks nothing of Wikimedia
  and the CSP's img-src stays 'self'.
- content/geo/food-photos.yaml: the author, licence and Commons page of each
  photo, fetched from the Commons API rather than typed in. Most of these are
  CC BY or CC BY-SA, which require the author and the licence to be named.

A file whose licence is not one of the free ones in FREE stops the script
rather than being published.

All About Accra's /seasons, which this page is ported from, built its photos
from a local folder; the files that page and this one share (maize, tomato,
mango...) are the same Commons files.
"""

import html
import io
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

import yaml
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "templates" / "staticimages" / "food"
OUT_YAML = ROOT / "content" / "geo" / "food-photos.yaml"

# A home-page tile is at most about 100 CSS pixels wide, so 200 serves it at
# most densities; a card is at most about 300, so 400; the sheet gets up to 760.
SIZES = ("thumb", "card", "full")
WIDTHS = (200, 400, 760)
QUALITY = 74

FREE = ("CC BY", "CC0", "Public domain", "PD")

# id -> the Commons file it is.
PHOTOS = {
    "maize": "Sundrying maize on cobs 03.jpg",
    "irishpotato": "Irish potatoes in a sack in a market.jpg",
    "beans": "Kidney beans (Phaseolus vulgaris) marketed Baubau.jpg",
    "greengrams": "Mung beans (Vigna radiata).jpg",
    "sweetpotato": "Pile of Sweet Potatoes at Barkin Dogo Market, Kaduna North 01.jpg",
    "tomato": "Tomato_je.jpg",
    "onion": "Mixed_onions.jpg",
    "cabbage": "Brassica oleracea var. capitata zum Verkauf 2011.JPG",
    "carrot": "Vegetable-Carrot-Bundle-wStalks.jpg",
    "kale": "East African Vegetable (Sukuma wiki).jpg",
    "managu": "Traditional Managu.jpg",
    "terere": "Bowl of amaranthus vegetables (pigweed).jpg",
    "mango": "Mangos_-_single_and_halved.jpg",
    "avocado": "Persea_americana_fruit_2.JPG",
    "banana": "Bananavarieties.jpg",
    "orange": "Oranges_-_whole-halved-segment.jpg",
    "pineapple": "കൈതച്ചക്ക.jpg",
    "pawpaw": "Papaya - longitudinal section.jpg",
    "passionfruit": "Passiflora Edulis Open Fruit2.jpg",
    "watermelon": "Taiwan_2009_Tainan_City_Organic_Farm_Watermelon_FRD_7962.jpg",
    "treetomato": "Tamarillos - whole and halved.jpg",
    "cattle": "Cow_(Fleckvieh_breed)_Oeschinensee_Slaunger_2009-07-07.jpg",
    "goat": "Hausziege_04.jpg",
    "chicken": "Male_and_female_chicken_sitting_together.jpg",
    "milk": "A man milks a cow in the agricultural rich Murang'a county Kenya.jpg",
    "tilapia": "Oreochromis-niloticus-Nairobi.JPG",
    "omena": "Silver Cyprinid or Dagaa, locally known as Omena.jpg",
    "seafish": "Fish Market (Mombasa), 2025 (04).jpg",
    "nileperch": "Nile perch on Gaba landing site.jpg",
}

# Where Commons' author field is a paragraph rather than a name - a camera
# model, an email address, a note about missing metadata - the name it means.
AUTHORS = {
    "watermelon": "Fred Hsu",
}

API = "https://commons.wikimedia.org/w/api.php"
AGENT = "AllAboutNairobi-build/1.0 (https://www.allaboutnairobi.com; photo credits)"


def plain(value: str) -> str:
    """Commons returns the author as HTML - often a link to a user page."""
    text = re.sub(r"<[^>]+>", "", value or "")
    return re.sub(r"\s+", " ", html.unescape(text)).strip()


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": AGENT})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as res:
                return res.read()
        except urllib.error.HTTPError as err:
            if err.code != 429 or attempt == 3:
                raise
            time.sleep(5 * (attempt + 1))
    raise RuntimeError(url)


def commons(files: list[str]) -> dict[str, dict]:
    """Fetch imageinfo, with a 760-pixel thumbnail URL, keyed by the requested name."""
    query = urllib.parse.urlencode({
        "action": "query",
        "format": "json",
        "prop": "imageinfo",
        "iiprop": "extmetadata|url|size",
        "iiurlwidth": WIDTHS[-1],
        "titles": "|".join(f"File:{f}" for f in files),
    })
    data = json.loads(fetch(f"{API}?{query}"))["query"]

    # Commons normalises underscores to spaces; map each answer back.
    back = {f"File:{f}": f for f in files}
    for n in data.get("normalized", []):
        back[n["to"]] = back.get(n["from"], n["from"])

    out = {}
    for page in data["pages"].values():
        if "imageinfo" not in page:
            raise SystemExit(f"ERROR: {page['title']} is not on Commons")
        out[back[page["title"]]] = page["imageinfo"][0]
    return out


def main() -> int:
    info = commons(list(PHOTOS.values()))
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    credits = {}
    total = 0
    for pid, filename in PHOTOS.items():
        ii = info[filename]
        meta = ii["extmetadata"]
        licence = plain(meta.get("LicenseShortName", {}).get("value", ""))
        if not licence.startswith(FREE) or "GFDL" in licence:
            print(f"ERROR: {filename} is {licence or 'unlicensed'}, not a free licence", file=sys.stderr)
            return 1

        # The thumbnail when the original is wider than 760, else the original.
        image = Image.open(io.BytesIO(fetch(ii.get("thumburl") or ii["url"]))).convert("RGB")
        time.sleep(0.5)

        sizes = {}
        for name, width in zip(SIZES, WIDTHS):
            w = min(width, image.width)
            h = round(image.height * w / image.width)
            out = OUT_DIR / f"{pid}-{name}.webp"
            image.resize((w, h), Image.LANCZOS).save(out, "WEBP", quality=QUALITY, method=6)
            sizes[name] = {"width": w, "height": h}
            total += out.stat().st_size

        credits[pid] = {
            "file": filename.replace("_", " "),
            "author": AUTHORS.get(pid) or plain(meta.get("Artist", {}).get("value", "")) or "Unknown author",
            "licence": licence,
            "licence_url": meta.get("LicenseUrl", {}).get("value") or None,
            "page": ii["descriptionurl"],
            **sizes,
        }
        print(f"  {pid:12s} {licence:16s} {credits[pid]['author'][:40]}")

    header = (
        "# Generated by scripts/build_food_photos.py from the Wikimedia Commons API.\n"
        "# Do not edit by hand: re-run the script. Each photo is credited on its\n"
        "# item in /seasons, with its author, licence and Commons page.\n"
    )
    OUT_YAML.write_text(
        header + yaml.safe_dump({"photos": credits}, allow_unicode=True, sort_keys=False, width=100),
        encoding="utf-8",
    )
    print(f"{len(credits)} photos, {total // 1024} KB of WebP, credits in {OUT_YAML.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
