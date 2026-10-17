"""
Build the station list behind /radio, and prove every stream on it works.

    mise radio-data

Run by hand and commit the result: the deploy never depends on a broadcaster's
stream server being up at build time. Writes content/geo/radio.yaml, loaded as
RADIO. Ported from All About Accra's script of the same name.

Frequencies. Kenya's Communications Authority publishes a register of
licensees but no list of which frequency each station uses where. So a
Nairobi frequency is used here only where two independent lists agree: the
frequency-ordered list of Nairobi FM stations kept at alexkuria.blogspot.com
(2011, updated to 2022), and one of the station directories at kenyans.co.ke
(2019) or kenyaliveradio.co.ke. Where they disagree the station is left out
rather than given a guessed frequency. They are listings, not the regulator,
and a station can change or close; the page says so.

Streams. Each stream URL is the one the broadcaster's own player uses - Royal
Media's players on citizen.digital, Radio Africa's on Songa Play, a station's
own website - or names itself in its stream headers. Then every stream is
fetched here: it must answer 200 over HTTPS all the way through any redirects
(an http:// stream is blocked on an https page), with an audio content type
and MP3 or AAC frames in the first bytes. A stream that fails moves to the
list of stations without one, with the failure recorded.

Every host a stream ends up on must be in the /radio Content-Security-Policy
in BOTH vercel.json files, or the browser silently refuses to play it.
"""

import json
import sys
import time
import urllib.request
from datetime import date, timedelta
from pathlib import Path
from urllib.parse import urlparse

import yaml

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "content" / "geo" / "radio.yaml"
VERCEL_FILES = [ROOT / "vercel.json", ROOT.parent / "vercel.json"]

UA = "AllAboutNairobi/1.0 (+https://www.allaboutnairobi.com; stream check)"

# Streams move. Three months, not a year.
VALID_DAYS = 90

RMS = "Royal Media Services"
RAG = "Radio Africa Group"
MMX = "Mediamax"
SG = "Standard Group"


def atunwa(mount: str) -> str:
    return f"https://{mount}-atunwadigital.streamguys1.com/{mount}"


# id, name, Nairobi frequency, owner, language, what it is, website, stream
STATIONS = [
    ("radio-citizen", "Radio Citizen", "106.7", RMS, "Swahili",
     "News, talk and music, and Kenya's most listened-to station",
     "https://citizen.digital/radio", atunwa("radiocitizen")),
    ("radio-jambo", "Radio Jambo", "97.5", RAG, "Swahili",
     "Talk, sport and call-ins",
     "https://www.radiojambo.co.ke", atunwa("radiojambo")),
    ("radio-maisha", "Radio Maisha", "102.7", SG, "Swahili",
     "News, talk and music",
     "https://www.standardmedia.co.ke", atunwa("radiomaisha")),
    ("milele-fm", "Milele FM", "104.8", MMX, "Swahili",
     "Music and talk",
     "https://www.mediamax.app", atunwa("milelefm")),
    ("kbc-radio-taifa", "KBC Radio Taifa", "92.9", "Kenya Broadcasting Corporation", "Swahili",
     "The state broadcaster's national service",
     "https://www.kbc.co.ke", "https://stream.zeno.fm/ud2u96xst5quv"),
    ("radio-47", "Radio 47", "103.0", "Cape Media", "Swahili",
     "News, talk and music",
     "https://www.radio47.fm", "https://streaming.shoutcast.com/radio-47"),
    ("capital-fm", "Capital FM", "98.4", "Capital Group", "English",
     "Music, news and talk",
     "https://www.capitalfm.co.ke", "https://atunwadigital.streamguys1.com/capitalfm"),
    ("kiss-100", "Kiss 100", "100.3", RAG, "English",
     "Hit music",
     "https://songaplay.com/radio/kiss-fm-101", atunwa("kiss100fm")),
    ("classic-105", "Classic 105", "105.2", RAG, "English",
     "Classic hits and talk",
     "https://songaplay.com/radio/classic-105", atunwa("classic105")),
    ("homeboyz-radio", "Homeboyz Radio", "103.5", RAG, "English",
     "Urban music and sport",
     "https://songaplay.com/radio/hbr-103-5-fm", atunwa("homeboyzradio")),
    ("hot-96", "Hot 96", "96.0", RMS, "English",
     "Urban music and talk",
     "https://citizen.digital/radio", atunwa("hot96")),
    ("spice-fm", "Spice FM", "94.4", SG, "English",
     "Talk, current affairs and music",
     "https://www.standardmedia.co.ke", atunwa("spicefm")),
    ("nrg-radio", "NRG Radio", "97.1", "NRG Media", "English",
     "Music for a young audience",
     "https://nrg.radio", "https://streamingv2.shoutcast.com/nrg-radio-ke"),
    ("ghetto-radio", "Ghetto Radio", "89.5", None, "Sheng",
     "Music and talk from Nairobi's estates",
     "https://ghettoradio.co.ke", "https://stream.zeno.fm/eghcv7h647zuv"),
    ("bbc-world-service", "BBC World Service", "93.9", "BBC", "English",
     "International news, relayed on FM in Nairobi",
     "https://www.bbc.co.uk/worldserviceradio", "https://stream.live.vc.bbcmedia.co.uk/bbc_world_service"),
    ("kameme-fm", "Kameme FM", "101.1", MMX, "Kikuyu",
     "News, talk and music",
     "https://www.mediamax.app/kameme-fm", atunwa("kamemefm")),
    ("inooro-fm", "Inooro FM", "98.9", RMS, "Kikuyu",
     "News, talk and music",
     "https://citizen.digital/radio", atunwa("inoorofm")),
    ("gukena-fm", "Gukena FM", "92.2", RAG, "Kikuyu",
     "Music and talk",
     "https://songaplay.com/radio/gukena", atunwa("gukenafm")),
    ("ramogi-fm", "Ramogi FM", "107.1", RMS, "Luo",
     "News, talk and music",
     "https://citizen.digital/radio", atunwa("ramogifm")),
    ("mulembe-fm", "Mulembe FM", "97.9", RMS, "Luhya",
     "News, talk and music",
     "https://citizen.digital/radio", atunwa("mulembefm")),
    ("musyi-fm", "Musyi FM", "102.2", RMS, "Kamba",
     "News, talk and music",
     "https://citizen.digital/radio", atunwa("musyifm")),
    ("chamgei-fm", "Chamgei FM", "90.4", RMS, "Kalenjin",
     "News, talk and music",
     "https://citizen.digital/radio", atunwa("chamgeifm")),
    ("emoo-fm", "Emoo FM", "104.2", MMX, None,
     "Music and talk",
     "https://www.mediamax.app", atunwa("emoofm")),
    ("star-fm", "Star FM", "105.9", None, "Somali",
     "News and talk in Somali",
     "https://starfm.co.ke", "https://stream.zeno.fm/ts7xywfh4f8uv"),
    ("east-fm", "East FM", "106.3", RAG, "English and Hindi",
     "Asian music and community radio",
     "https://songaplay.com/radio/east-fm", atunwa("eastfm")),
    ("sound-asia", "Sound Asia", "88.0", None, "English and Hindi",
     "Asian music",
     "https://www.soundasiafm.com", "https://cast5.asurahosting.com/proxy/soundasi/stream"),
    ("hope-fm", "Hope FM", "93.3", "Hope Media", "English and Swahili",
     "Christian radio",
     "https://www.hopemediakenya.org", "https://a5.asurahosting.com:7530/radio.mp3"),
    ("truth-fm", "Truth FM", "90.7", None, "English",
     "Christian radio",
     None, atunwa("truthfm")),
    ("radio-waumini", "Radio Waumini", "88.3", "Kenya Conference of Catholic Bishops", "Swahili and English",
     "Catholic radio",
     "https://radiowaumini.co.ke", "https://stream.zeno.fm/gvk894g072quv"),
]

# On the Nairobi dial, by the same two-source rule, but with no stream that
# could be verified: listed with their frequency and no play button, rather
# than a guessed URL that might play someone else.
UNSTREAMED = [
    ("Choice Radio", "87.7"), ("Radio Maria", "88.1"), ("Sound City", "88.5"), ("Kass FM", "89.1"),
    ("Mwangaza wa Neno", "89.3"), ("Radio France Internationale", "89.9"), ("Radio Midnimo", "90.2"),
    ("FunX Radio", "91.3"), ("China Radio International", "91.9"), ("Mbaitu FM", "92.5"),
    ("KBC Mwatu FM", "93.1"), ("Osiepe FM", "93.6"), ("Iqra FM", "95.0"), ("Trace FM", "95.3"),
    ("KBC English Service", "95.6"), ("Nation FM", "96.3"), ("Bibilia Husema", "96.7"),
    ("Pearl Radio", "96.9"), ("Kigooco FM", "98.6"), ("Athiani FM", "99.2"), ("KBC Coro FM", "99.5"),
    ("Koch FM", "99.9"), ("Pamoja FM", "99.9"), ("KU FM", "99.9"), ("MMU FM", "99.9"), ("USIU Radio", "99.9"),
    ("KBC Iftiin FM", "101.9"), ("Family Radio 316", "103.9"), ("Vybez Radio", "104.5"),
    ("Smooth FM", "105.5"), ("Voice of America", "107.5"),
]


def fetch(url: str, limit: int) -> tuple[int, str, str, bytes, dict]:
    request = urllib.request.Request(url, headers={"User-Agent": UA, "Icy-MetaData": "0"})
    with urllib.request.urlopen(request, timeout=20) as response:
        return response.status, response.geturl(), response.headers.get("Content-Type", ""), response.read(limit), dict(response.headers)


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


def host_of(url: str) -> str:
    parsed = urlparse(url)
    return parsed.hostname + (f":{parsed.port}" if parsed.port else "")


def probe(url: str, attempts: int = 2) -> dict:
    for attempt in range(attempts):
        try:
            status, final, ctype, data, headers = fetch(url, 16384)
            break
        except Exception as error:
            if attempt == attempts - 1:
                return {"ok": False, "reason": f"{type(error).__name__}: {str(error)[:80]}"}
            time.sleep(3)
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
    bitrate = headers.get("icy-br") or headers.get("Icy-Br")
    return {
        "ok": not failed,
        "reason": ", ".join(f"not {f}" for f in failed) if failed else None,
        "hosts": {host_of(url), host_of(final)},
        "bitrate": int(bitrate.split(",")[0]) if bitrate and bitrate.split(",")[0].isdigit() else None,
    }


def main() -> int:
    today = date.today()
    frequencies = [f for _, _, f, *_ in STATIONS] + [f for _, f in UNSTREAMED]
    clashes = {f for f in frequencies if frequencies.count(f) > 1 and f != "99.9"}
    if clashes:
        raise SystemExit(f"Two stations on one Nairobi frequency: {sorted(clashes)}")

    csp = csp_media_hosts()
    stations, dropped = [], []
    for sid, name, freq, owner, language, about, homepage, stream in STATIONS:
        result = probe(stream)
        if result["ok"]:
            for path, hosts in zip(VERCEL_FILES, csp):
                missing = [h for h in result["hosts"] if not allowed(h, hosts)]
                if missing:
                    raise SystemExit(f"{name}'s stream uses {missing}, which the /radio CSP in {path} "
                                     f"does not allow. The browser would refuse to play it.")
        print(f"  {'ok  ' if result['ok'] else 'DROP'} {name:20} {freq:6} {result.get('reason') or ''}")
        if result["ok"]:
            stations.append({k: v for k, v in {
                "id": sid, "name": name, "frequency": float(freq), "owner": owner, "language": language,
                "about": about, "homepage": homepage, "stream": stream, "bitrate": result.get("bitrate"),
            }.items() if v is not None})
        else:
            dropped.append({"name": name, "frequency": freq, "reason": result["reason"]})

    unstreamed = [{"name": n, "frequency": f} for n, f in UNSTREAMED]
    unstreamed += [{"name": d["name"], "frequency": d["frequency"]} for d in dropped]
    unstreamed.sort(key=lambda s: float(s["frequency"]))

    rates = sorted(s["bitrate"] for s in stations if s.get("bitrate"))
    document = {
        "meta": {
            "last_verified": today.isoformat(),
            "fail_on": (today + timedelta(days=VALID_DAYS)).isoformat(),
            "checked_on": f"{today.day} {today:%B %Y}",
            "typical_kbps": rates[len(rates) // 2] if rates else 128,
            "basis": (
                "Nairobi frequencies where two independent public lists agree; the Communications "
                "Authority publishes no frequency list. Streams are the ones the broadcasters' own "
                "players use, each fetched and checked on the date above."
            ),
        },
        "stations": stations,
        "unstreamed": unstreamed,
        "dropped": dropped,
    }
    header = (
        "# Generated by scripts/build_radio_data.py - do not edit by hand.\n"
        "# Change the STATIONS list in the script and re-run it.\n"
    )
    OUTPUT.write_text(header + yaml.safe_dump(document, sort_keys=False, allow_unicode=True, width=100), encoding="utf-8")
    print(f"\nWrote {OUTPUT.relative_to(ROOT)}: {len(stations)} streams, {len(unstreamed)} on the dial without one.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
