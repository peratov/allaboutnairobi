"""
Check that what is live is what you committed.

    mise check-deploy

Every page carries the commit it was built from:

    <meta name="git-commit-hash" content="...">

So the live site can be asked which commit it is serving, and that answer
compared to local HEAD. If they differ, the deploy did not land.

This exists because of a real and embarrassing failure. An invalid route
pattern in `vercel.json` - `/drive/?(.*)`, which path-to-regexp rejects with
"Unexpected MODIFIER" - made the build fail. Vercel kept serving the previous
deployment, so the site was up, every page returned 200, and three consecutive
commits went nowhere. Nothing about a working site says "your last three
commits are not on it". The new page 404ing looked like slow propagation.

`git push` is not a deploy, and a 200 is not a confirmation. This is the
confirmation.

It also checks the host, because that broke silently too. The project's
primary domain changed in the Vercel dashboard, the apex stopped redirecting,
and every page began declaring the apex canonical - two copies of the site,
all 200s, nothing visibly wrong. So this also asserts that a live page names
the www host as canonical, and that the apex answers with a redirect to it.

Exit codes: 0 if all of that holds, 1 if anything does not.
"""

import re
import subprocess
import sys
import urllib.error
import urllib.request

SITE = "https://www.allaboutnairobi.com/"
# Both, because they are matched differently: Vercel does not match `/:path*`
# against a bare `/`, so the apex home page kept answering 200 after every
# other apex URL redirected. The root needs its own rule, and its own check.
APEX_URLS = ("https://allaboutnairobi.com/", "https://allaboutnairobi.com/guides")
CANONICAL_PREFIX = "https://www.allaboutnairobi.com/"
HASH_META = re.compile(r'name="git-commit-hash"\s+content="([0-9a-f]{7,40})"')
CANONICAL = re.compile(r'<link\s+rel="canonical"\s+href="([^"]+)"')


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def host_problems(html: str) -> list[str]:
    problems = []

    canonical = CANONICAL.search(html)
    if not canonical or not canonical.group(1).startswith(CANONICAL_PREFIX):
        problems.append(
            f"The home page's canonical is {canonical.group(1) if canonical else 'missing'}, "
            f"not on {CANONICAL_PREFIX}. Check CANONICAL_ORIGIN in ursus_config.py."
        )

    opener = urllib.request.build_opener(_NoRedirect)
    for apex in APEX_URLS:
        request = urllib.request.Request(apex, headers={"User-Agent": "allaboutnairobi-deploy-check"})
        try:
            with opener.open(request, timeout=30) as response:
                problems.append(
                    f"{apex} answered {response.status} instead of redirecting. The apex "
                    f"is serving a second copy of the site. Check the host redirects at "
                    f"the top of `redirects` in vercel.json, and the Vercel domain settings."
                )
        except urllib.error.HTTPError as error:
            location = error.headers.get("Location", "")
            if error.code not in (301, 308) or not location.startswith(CANONICAL_PREFIX):
                problems.append(f"{apex} answered {error.code} to {location or 'nowhere'}, not a permanent redirect to www.")

    return problems


def fetch(url: str) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": "allaboutnairobi-deploy-check"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8", "replace")


def live_commit(html: str, url: str) -> str:
    match = HASH_META.search(html)
    if not match:
        raise SystemExit(
            f"{url} carries no git-commit-hash meta tag. Either the deploy is very "
            f"old, or _layout.html stopped emitting it - check that before trusting "
            f"this script again."
        )
    return match.group(1)


def local_commit() -> str:
    return subprocess.run(
        ["git", "rev-parse", "HEAD"],
        capture_output=True, text=True, check=True,
    ).stdout.strip()


def main() -> int:
    url = sys.argv[1] if len(sys.argv) > 1 else SITE

    try:
        html = fetch(url)
    except urllib.error.URLError as error:
        raise SystemExit(f"Could not reach {url}: {error}")
    live = live_commit(html, url)

    head = local_commit()

    # The meta tag may be abbreviated; compare on the shorter length.
    width = min(len(live), len(head))
    if live[:width] == head[:width]:
        print(f"Live: {live[:12]}  matches local HEAD. Deployed.")
        problems = host_problems(html)
        for problem in problems:
            print(f"HOST: {problem}")
        if not problems:
            print("Host: canonical is www, and the apex redirects to it.")
        return 1 if problems else 0

    print(f"Live: {live[:12]}")
    print(f"HEAD: {head[:12]}")
    print()
    print("The deploy has not landed. The site is still serving an older commit.")
    print("A working site and 200s prove nothing here - check the Vercel build log.")
    print()
    print("The usual cause is vercel.json: it is schema-valid long after it has")
    print("become unroutable, because Vercel compiles every `source` with")
    print("path-to-regexp and fails the build on a pattern it cannot parse.")
    print("`/drive/?(.*)` was one. `/drive/:path*` is the shape that works.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
