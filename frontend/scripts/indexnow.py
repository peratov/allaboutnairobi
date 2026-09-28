"""
Tell search engines which pages changed, through IndexNow.

    python scripts/indexnow.py public          # what changed since the live site
    python scripts/indexnow.py public --all    # every URL in the sitemap
    python scripts/indexnow.py output --dry-run  # show what would be sent

IndexNow (https://www.indexnow.org) is a single POST that Bing, Yandex, Seznam,
Naver and Yep share between them. Google does not take part, and no longer
accepts sitemap pings either; resubmit the sitemap in Search Console for that.

The Vercel build runs this after `ursus build` on production deploys. At that
moment the new site exists in the build directory but the old one is still what
the world sees, so the difference between the two sitemaps is exactly what this
deploy changes: URLs that are new, and URLs whose `lastmod` moved. Only those
are sent, so a deploy that fixes one guide pings one URL, not the whole site.

The submission goes out a minute or so before the deploy is live. That is fine:
engines queue IndexNow URLs and crawl them later, not in the same second.

Proving ownership is the key file at the site root - `<KEY>.txt`, containing
the key and nothing else. It lives in templates/, so every build publishes it.
The key is not a secret; publishing it is how the protocol works.

This must never break a deploy. Every failure is logged and the script exits 0.
"""

import argparse
import json
import sys
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

HOST = "www.allaboutnairobi.com"
SITE = f"https://{HOST}"
KEY = "c43fcadc27e9164c9964607903d4cd70"
ENDPOINT = "https://api.indexnow.org/indexnow"
NS = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
# The protocol's limit per request.
MAX_URLS = 10_000
TIMEOUT = 20


def parse(xml: bytes) -> dict[str, str]:
    """Map each <loc> to its <lastmod>, or "" when it has none."""
    root = ET.fromstring(xml)
    return {
        url.findtext("sm:loc", "", NS).strip(): url.findtext("sm:lastmod", "", NS).strip()
        for url in root.findall("sm:url", NS)
    }


def live_sitemap() -> dict[str, str] | None:
    request = urllib.request.Request(f"{SITE}/sitemap.xml", headers={"User-Agent": "allaboutnairobi-indexnow"})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            return parse(response.read())
    except (urllib.error.URLError, ET.ParseError, TimeoutError) as error:
        print(f"    could not read the live sitemap ({error})")
        return None


def submit(urls: list[str]) -> None:
    body = json.dumps({
        "host": HOST,
        "key": KEY,
        "keyLocation": f"{SITE}/{KEY}.txt",
        "urlList": urls,
    }).encode()
    request = urllib.request.Request(
        ENDPOINT,
        data=body,
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            # 200 is accepted; 202 is accepted with the key still to be checked,
            # which is normal on the very first submission.
            print(f"    IndexNow answered {response.status}")
    except urllib.error.HTTPError as error:
        # 403 means the key file is missing or wrong on the live site; 422
        # means a URL does not belong to the host. Neither should stop a deploy.
        print(f"    IndexNow refused the submission: HTTP {error.code} {error.reason}")
    except (urllib.error.URLError, TimeoutError) as error:
        print(f"    IndexNow could not be reached ({error})")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("build_dir", help="the directory the site was built into")
    parser.add_argument("--all", action="store_true", help="submit every URL, not just the changes")
    parser.add_argument("--dry-run", action="store_true", help="list what would be sent, and send nothing")
    args = parser.parse_args()

    print("==> IndexNow")
    sitemap = Path(args.build_dir) / "sitemap.xml"
    try:
        built = parse(sitemap.read_bytes())
    except (OSError, ET.ParseError) as error:
        print(f"    skipped: could not read {sitemap} ({error})")
        return 0

    if not (Path(args.build_dir) / f"{KEY}.txt").is_file():
        print(f"    skipped: {KEY}.txt is not in the build, so the engines could not verify it")
        return 0

    if args.all:
        changed = list(built)
    else:
        live = live_sitemap()
        if live is None:
            # Without a baseline, "changed" would mean "everything". Sending
            # the whole site on every failed fetch is the wrong default.
            print("    skipped: no baseline to compare against")
            return 0
        changed = [url for url, lastmod in built.items() if live.get(url) != lastmod]

    changed = [url for url in changed if url.startswith(SITE)][:MAX_URLS]
    if not changed:
        print("    nothing new or changed")
        return 0

    print(f"    submitting {len(changed)} URL(s)")
    for url in changed[:15]:
        print(f"      {url}")
    if len(changed) > 15:
        print(f"      ... and {len(changed) - 15} more")
    if args.dry_run:
        print("    dry run: nothing sent")
        return 0
    submit(changed)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:  # noqa: BLE001 - a deploy must not fail over a ping
        print(f"    IndexNow step failed and was skipped: {error!r}")
        sys.exit(0)
