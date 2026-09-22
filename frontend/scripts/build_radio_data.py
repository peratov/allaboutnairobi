"""
Build the station list behind /radio, and prove every stream on it works.

    mise radio-data

Run by hand, like the map and flight generators, and commit the result: the
deploy never depends on a broadcaster's stream server being up at build time.
It writes content/geo/radio.yaml, loaded into the context as RADIO.

The stations are typed in below rather than scraped, for the same reason the
flight routes are. Nothing is taken on trust:

  * Every FM station must be ON AIR in Greater Accra at the frequency given
    here, in the National Communications Authority's register of authorised
    stations. The register is downloaded and parsed on every run, and a station
    that is missing, off air or on another frequency stops the build.
  * Every stream is fetched: it must answer 200 over HTTPS all the way through
    any redirects (an http:// stream is blocked on an https page), with an audio
    content type and MP3 or AAC frames in the first bytes. A stream that fails
    is dropped from the player with the failure recorded, not published hoping
    it comes back.
  * Every host a stream ends up on must be in the /radio Content-Security-Policy
    in BOTH vercel.json files. Otherwise the browser silently refuses to play
    it, which looks exactly like a dead station.

Stream URLs came from the Radio Browser community directory and were then
checked here; the directory's own metadata is not reliable enough to use (it
lists a Kumasi station under Accra), so identity comes from the NCA register
and the station's own website.
"""

import io
import json
import re
import sys
import urllib.request
from datetime import date, timedelta
from pathlib import Path
from urllib.parse import urlparse

import yaml

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "content" / "geo" / "radio.yaml"
VERCEL_FILES = [ROOT / "vercel.json", ROOT.parent / "vercel.json"]

NCA_REGISTER = "https://nca.org.gh/wp-content/uploads/2026/08/Authorised-FM-Station-Q2-2026.pdf"
NCA_PAGE = "https://nca.org.gh/authorised-radio/"

UA = "AllAboutAccra/1.0 (+https://www.allaboutaccra.com; stream check)"

# Streams move. Three months, not a year.
VALID_DAYS = 90

# id, name, frequency (None for online-only), owner, language, what it is, website, stream
STATIONS = [
    ("joy", "Joy FM", "99.7", "Multimedia Group", "English",
     "News and talk, and the station many people mean by Ghanaian radio",
     "https://www.myjoyonline.com", "https://mmg.streamguys1.com/JoyFM-mp3?key=8689cc761932e3151f94ddbdbfdf"),
    ("citi", "Citi FM", "97.3", "Omni Media", "English",
     "News, current affairs and talk",
     "https://citinewsroom.com", "https://citi973fm.radioca.st/stream"),
    ("peace", "Peace FM", "104.3", "Despite Media", "Akan",
     "Talk and politics in Twi, among the most listened-to stations in the country",
     "https://www.peacefmonline.com", "https://peacefm-atunwadigital.streamguys1.com/peacefm?amsparams=playerid"),
    ("adom", "Adom FM", "106.3", "Multimedia Group", "Akan",
     "Talk, news and music in Twi",
     "https://www.adomonline.com", "https://mmg.streamguys1.com/AdomFM-mp3?key=9099965b0e49394af3be11b42a7"),
    ("asempa", "Asempa FM", "94.7", "Multimedia Group", "Akan",
     "News, talk and sport in Twi",
     "https://www.myjoyonline.com", "https://mmg.streamguys1.com/AsempaFM-mp3?key=23f81ad063fc94d769b3f5666"),
    ("hitz", "Hitz FM", "103.9", "Multimedia Group", "English",
     "Urban music and sport",
     "https://www.myjoyonline.com", "https://mmg.streamguys1.com/HitzFM-mp3?"),
    ("yfm", "YFM", "107.9", "Global Media Alliance", "English",
     "Music for a young audience",
     "https://yfmghana.com", "https://atunwadigital.streamguys1.com/yfm1079accra"),
    ("okay", "Okay FM", "101.7", "Despite Media", "Akan",
     "Talk and sport in Twi",
     "https://www.okayfmonline.com", "https://atunwadigital.streamguys1.com/okayfm"),
    ("oman", "Oman FM", "107.1", "Despite Media", "Akan",
     "Talk and politics in Twi",
     "https://www.omanfm1071.com", "https://omanfm-atunwadigital.streamguys1.com/omanfm?amsparams=playerid"),
    ("happy", "Happy FM", "98.9", "Global Media Alliance", "Akan",
     "Sport and talk",
     "https://www.happyghana.com", "https://atunwadigital.streamguys1.com/happyfm989accra"),
    ("neat", "Neat FM", "100.9", "Despite Media", "Akan",
     "Music and entertainment",
     "https://neatfm.peacefmonline.com", "https://atunwadigital.streamguys1.com/neatfm"),
    ("uniiq", "Uniiq FM", "95.7", "Ghana Broadcasting Corporation", "English",
     "The state broadcaster's Accra station",
     "https://www.gbcghanaonline.com", "https://mediagh.us:2000/stream/uniiqfm"),
    ("rainbow", "Rainbow Radio", "87.5", None, None,
     "Talk and music",
     "https://rainbowradioonline.com", "https://stream.zeno.fm/wv4tseqxk8quv"),
    ("sompa", "Sompa FM", "106.5", "Sompa Media", None,
     "Talk and music",
     None, "https://stream.zeno.fm/55sg1lh4pqquv"),
    ("ahotor", "Ahotor FM", "92.3", None, None,
     "Talk and music",
     "http://www.ahotoronline.com", "https://stream.zeno.fm/bbpfy9pk21zuv"),
    ("oroko", "Oroko Radio", None, "Independent", "English",
     "Independent online radio from Accra: music, culture and conversation, with no FM signal at all",
     "https://oroko.live", "https://oroko-radio.radiocult.fm/stream"),
]

# Well-known Accra stations with no stream that could be verified. They are
# listed in the guide with their NCA frequency, and the page says why there
# is no play button - rather than a guessed URL that might play someone else.
UNSTREAMED = [
    ("3FM", "92.7"), ("Asaase Radio", "99.5"), ("Class FM", "91.3"), ("Radio Gold", "90.5"),
    ("Atinka FM", "104.7"), ("Onua FM", "95.1"), ("Radio Univers", "105.7"), ("Kasapa FM", "102.5"),
    ("Accra FM", "100.5"), ("Hot FM", "93.9"), ("Top FM", "103.1"), ("Obonu FM", "96.5"),
    ("BBC World Service", "101.3"), ("Radio France Internationale", "89.5"),
]


def fetch(url: str, limit: int | None = None) -> tuple[int, str, str, bytes, dict]:
    request = urllib.request.Request(url, headers={"User-Agent": UA, "Icy-MetaData": "0"})
    with urllib.request.urlopen(request, timeout=20) as response:
        body = response.read(limit) if limit else response.read()
        return response.status, response.geturl(), response.headers.get("Content-Type", ""), body, dict(response.headers)


def nca_greater_accra() -> tuple[dict[str, str], dict]:
    """Frequency -> status for every Greater Accra station in the register."""
    import pymupdf  # only needed here

    _, _, _, pdf, _ = fetch(NCA_REGISTER)
    doc = pymupdf.open(stream=io.BytesIO(pdf), filetype="pdf")

    summary = doc[1].get_text()
    # The summary row reads: total authorised, public, public (foreign),
    # community, campus, commercial, in operation, not in operation.
    m = re.search(r"GREATER ACCRA\s*\n" + r"\s*(\d+)\s*\n" * 8, summary)
    if not m:
        raise SystemExit("Could not read the Greater Accra totals from the NCA summary page.")
    keys = ["authorised", "public", "public_foreign", "community", "campus", "commercial", "on_air", "not_on_air"]
    totals = dict(zip(keys, map(int, m.groups())))
    if totals["on_air"] + totals["not_on_air"] != totals["authorised"] or sum(totals[k] for k in keys[1:6]) != totals["authorised"]:
        raise SystemExit(f"The NCA Greater Accra row does not add up: {totals}. The layout has probably changed.")

    start = next(i for i, p in enumerate(doc) if "GREATER ACCRA REGION" in p.get_text())
    lines: list[str] = []
    for i in range(start, doc.page_count):
        text = doc[i].get_text()
        if i > start and re.search(r"\n\s*[A-Z ]+ REGION\s*\n", text) and "GREATER ACCRA" not in text:
            break
        lines += [line.strip() for line in text.splitlines()]

    freq_re = re.compile(r"^(\d{2,3}(?:\.\d)?)MHZ$", re.I)
    found: dict[str, str] = {}
    for i, line in enumerate(lines):
        m = freq_re.match(line.replace(" ", ""))
        if m and i + 1 < len(lines):
            status = lines[i + 1].upper()
            # A frequency can be reassigned; ON AIR wins over NOT ON AIR.
            if found.get(m.group(1)) != "ON AIR":
                found[m.group(1)] = status
    return found, totals


def csp_media_hosts() -> list[set[str]]:
    hosts = []
    for path in VERCEL_FILES:
        config = json.loads(path.read_text(encoding="utf-8"))
        policy = next(
            (h["value"] for rule in config["headers"] if rule["source"].startswith("/radio")
             for h in rule["headers"] if h["key"].lower() == "content-security-policy"),
            None,
        )
        if not policy:
            raise SystemExit(f"{path} has no Content-Security-Policy for /radio.")
        media = next((d for d in policy.split(";") if d.strip().startswith("media-src")), "")
        hosts.append(set(media.split()[1:]))
    return hosts


def allowed(host_with_port: str, sources: set[str]) -> bool:
    for source in sources:
        s = source.removeprefix("https://")
        if s == host_with_port:
            return True
        if s.startswith("*.") and host_with_port.split(":")[0].endswith(s[1:]):
            return True
    return False


def probe(url: str) -> dict:
    try:
        status, final, ctype, data, headers = fetch(url, 16384)
    except Exception as error:
        return {"ok": False, "reason": f"{type(error).__name__}: {str(error)[:80]}"}
    frames = data[:3] == b"ID3" or any(
        data[i] == 0xFF and (data[i + 1] & 0xE0) == 0xE0 for i in range(min(len(data) - 1, 4096))
    )
    checks = {
        "answered 200": status == 200,
        "https throughout": final.startswith("https://"),
        "audio content type": ctype.startswith("audio/"),
        "audio frames": frames and len(data) > 8000,
    }
    failed = [name for name, passed in checks.items() if not passed]
    parsed = urlparse(final)
    host = parsed.hostname + (f":{parsed.port}" if parsed.port else "")
    bitrate = headers.get("icy-br") or headers.get("Icy-Br")
    return {
        "ok": not failed,
        "reason": ", ".join(f"not {f}" for f in failed) if failed else None,
        "final_host": host,
        "bitrate": int(bitrate.split(",")[0]) if bitrate and bitrate.split(",")[0].isdigit() else None,
    }


def main() -> int:
    today = date.today()
    register, totals = nca_greater_accra()
    print(f"NCA register: Greater Accra has {totals['authorised']} authorised stations, {totals['on_air']} on air.")

    problems = []
    for _, name, freq, *_ in STATIONS:
        if freq and register.get(freq) != "ON AIR":
            problems.append(f"{name} {freq}: {register.get(freq, 'not in the register')}")
    for name, freq in UNSTREAMED:
        if register.get(freq) != "ON AIR":
            problems.append(f"{name} {freq}: {register.get(freq, 'not in the register')}")
    if problems:
        raise SystemExit("Not on air in Greater Accra per the NCA register:\n  " + "\n  ".join(problems))

    csp = csp_media_hosts()
    stations, dropped = [], []
    for sid, name, freq, owner, language, about, website, stream in STATIONS:
        result = probe(stream)
        if result["ok"]:
            missing = [str(path) for path, hosts in zip(VERCEL_FILES, csp) if not allowed(result["final_host"], hosts)]
            if missing:
                raise SystemExit(
                    f"{name}'s stream ends up on {result['final_host']}, which the /radio CSP in "
                    f"{', '.join(missing)} does not allow. The browser would refuse to play it."
                )
        print(f"  {'ok  ' if result['ok'] else 'DROP'} {name:14} {freq or 'online':6} {result.get('final_host') or result['reason']}")
        entry = {k: v for k, v in {
            "id": sid, "name": name, "frequency": freq, "owner": owner, "language": language,
            "about": about, "website": website, "stream": stream,
            "bitrate": result.get("bitrate"),
        }.items() if v is not None}
        (stations if result["ok"] else dropped).append(entry if result["ok"] else {"name": name, "reason": result["reason"]})

    document = {
        "meta": {
            "last_verified": today.isoformat(),
            "fail_on": (today + timedelta(days=VALID_DAYS)).isoformat(),
            "register": NCA_PAGE,
            "register_as_at": "Q2 2026",
            "greater_accra_authorised": totals["authorised"],
            "greater_accra_on_air": totals["on_air"],
            "greater_accra_by_type": {k: totals[k] for k in ("public", "public_foreign", "community", "campus", "commercial")},
            "basis": (
                "Frequencies from the NCA register of authorised FM stations. Streams checked on the date "
                "above by fetching audio from each; stations with no stream that could be verified are "
                "listed without one."
            ),
        },
        "stations": stations,
        "unstreamed": [{"name": n, "frequency": f} for n, f in UNSTREAMED],
        "dropped": dropped,
    }
    header = (
        "# Generated by scripts/build_radio_data.py - do not edit by hand.\n"
        "# Change the STATIONS list in the script and re-run it.\n"
    )
    OUTPUT.write_text(header + yaml.safe_dump(document, sort_keys=False, allow_unicode=True, width=100), encoding="utf-8")
    print(f"\nWrote {OUTPUT.relative_to(ROOT)}: {len(stations)} streams, {len(dropped)} dropped.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
