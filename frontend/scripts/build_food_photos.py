"""
Resize the photos behind /seasons and record who took each one.

Run by hand, like build_icons.py and build_radio_data.py:

    python scripts/build_food_photos.py --source /path/to/photos

`--source` is a folder of JPEGs named by item id (mango.jpg, okra.jpg...), the
way the seasons app this page grew out of shipped them. Every one is a
Wikimedia Commons file, named in PHOTOS below.

Two things come out, both committed:

- templates/staticimages/food/<id>-<width>.webp, at two widths: a card and a
  sheet. Served from this site, so the page asks nothing of Wikimedia and the
  CSP's img-src stays 'self'.
- content/geo/food-photos.yaml: the author, licence and Commons page of each
  photo, fetched from the Commons API rather than typed in. Most of these are
  CC BY or CC BY-SA, which require the author and the licence to be named; a
  file name alone, which is all the app carried, does not do that.

The script also checks each local photo has the shape of the Commons file it
claims to be. A photo that does not is stopped rather than credited to
somebody who did not take it.
"""

import argparse
import html
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

# A card is at most about 300 CSS pixels wide, so 400 serves it at most
# densities; the sheet gets the source's own width, up to 760.
WIDTHS = (400, 760)
QUALITY = 74

# id -> the Commons file it is. From the seasons app's credits.ts.
PHOTOS = {
    "maize": "Sundrying maize on cobs 03.jpg",
    "cassava": "Harvested cassava tubers scattered on grass and in a basin.png",
    "rice": "20201102.Hengnan.Hybrid_rice_Sanyou-1.6.jpg",
    "tomato": "Tomato_je.jpg",
    "pepper": "Scotch_bonnet_chili_pepper.jpg",
    "okra": "Hong_Kong_Okra_Aug_25_2012.JPG",
    "gardenegg": "Solanum_aethiopicum.jpg",
    # The app used fir0002's "Cabbage and cross section on white", which is
    # GFDL 1.2 only - a licence chosen to keep the work out of commercial
    # use. This one is CC BY-SA, cabbages for sale.
    "cabbage": "Brassica oleracea var. capitata zum Verkauf 2011.JPG",
    "lettuce": "Iceberg_lettuce_in_SB.jpg",
    "springonion": "CSA-Red-Spring-Onions.jpg",
    "carrot": "Vegetable-Carrot-Bundle-wStalks.jpg",
    "cucumber": "ARS_cucumber.jpg",
    "cauliflower": "Chou-fleur_02.jpg",
    "onion": "Mixed_onions.jpg",
    "ayoyo": "Corchorus_olitorius_(2).JPG",
    "watermelon": "Taiwan_2009_Tainan_City_Organic_Farm_Watermelon_FRD_7962.jpg",
    "cowpea": "Lobia.jpg",
    "sweetcorn": "VegCorn.jpg",
    "mango": "Mangos_-_single_and_halved.jpg",
    "pineapple": "കൈതച്ചക്ക.jpg",
    "pawpaw": "Papaya - longitudinal section.jpg",
    "banana": "Bananavarieties.jpg",
    "plantain": "Mega_racimos_de_guineos.jpg",
    "coconut": "Fresh coconut FB7DBC47-2807-4FFF-94E6-92E70D83EE82.jpg",
    "orange": "Oranges_-_whole-halved-segment.jpg",
    "avocado": "Persea_americana_fruit_2.JPG",
    "guava": "Guava_pink_fruit.jpg",
    "cashew": "Cashew_apples.jpg",
    "chicken": "Male_and_female_chicken_sitting_together.jpg",
    "goat": "Hausziege_04.jpg",
    "cattle": "Cow_(Fleckvieh_breed)_Oeschinensee_Slaunger_2009-07-07.jpg",
    "pig": "Pig_farm_Vampula_1.jpg",
    "snail": "Giant_tiger_land_snail_(Achatina_achatina)_Ghana.jpg",
    "sardinella": "Sardinella_gibbosa.jpg",
    "tilapia": "Oreochromis-niloticus-Nairobi.JPG",
}

# Where Commons' author field is a paragraph rather than a name - a camera
# model, an email address, a note about missing metadata - the name it means.
AUTHORS = {
    "gardenegg": "Hans B.",
    "watermelon": "Fred Hsu",
    "sweetcorn": "wstoakLL at English Wikipedia",
}

API = "https://commons.wikimedia.org/w/api.php"
AGENT = "AllAboutAccra-build/1.0 (https://www.allaboutaccra.com; photo credits)"


def plain(value: str) -> str:
    """Commons returns the author as HTML - often a link to a user page."""
    text = re.sub(r"<[^>]+>", "", value or "")
    return re.sub(r"\s+", " ", html.unescape(text)).strip()


def commons(files: list[str]) -> dict[str, dict]:
    """Fetch imageinfo for up to 50 files at once, keyed by the requested name."""
    titles = "|".join(f"File:{f}" for f in files)
    query = urllib.parse.urlencode({
        "action": "query",
        "format": "json",
        "prop": "imageinfo",
        "iiprop": "extmetadata|url|size",
        "titles": titles,
    })
    req = urllib.request.Request(f"{API}?{query}", headers={"User-Agent": AGENT})
    with urllib.request.urlopen(req, timeout=60) as res:
        data = json.load(res)["query"]

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
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--source", required=True, help="folder of <id>.jpg photos")
    args = parser.parse_args()
    source = Path(args.source)

    info = commons(list(PHOTOS.values()))
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    credits = {}
    total = 0
    for pid, filename in PHOTOS.items():
        src = source / f"{pid}.jpg"
        if not src.exists():
            print(f"ERROR: {src} is missing", file=sys.stderr)
            return 1
        ii = info[filename]
        meta = ii["extmetadata"]

        image = Image.open(src).convert("RGB")
        local = image.width / image.height
        remote = ii["width"] / ii["height"]
        # Thumbnails round, so a percent or two is noise. More than that is a
        # different photograph.
        if abs(local - remote) / remote > 0.03:
            print(f"ERROR: {pid}.jpg is {image.width}x{image.height}, but {filename} "
                  f"is {ii['width']}x{ii['height']} - not the same photo", file=sys.stderr)
            return 1

        sizes = {}
        for name, width in zip(("card", "full"), WIDTHS):
            w = min(width, image.width)
            h = round(image.height * w / image.width)
            out = OUT_DIR / f"{pid}-{name}.webp"
            image.resize((w, h), Image.LANCZOS).save(out, "WEBP", quality=QUALITY, method=6)
            sizes[name] = {"width": w, "height": h}
            total += out.stat().st_size

        licence = plain(meta.get("LicenseShortName", {}).get("value", ""))
        if not licence:
            print(f"ERROR: {filename} has no licence on Commons", file=sys.stderr)
            return 1
        credits[pid] = {
            "file": filename,
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
