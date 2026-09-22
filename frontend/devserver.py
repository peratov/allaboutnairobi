"""
Development server for the built site.

The site uses extensionless URLs (/guides/rent-advance, not
/guides/rent-advance.html), which is what Caddy serves in production. A plain
http.server returns 404 for those, so this mirrors the production rewrite
rules: try the path, then path.html, then path/index.html, then the 404 page.
"""

import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote, unquote

ROOT = Path(__file__).parent / "output"


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def send_head(self):
        # Unquote first. Twenty-two glossary terms are two words, so their URLs
        # arrive as /glossary/Ghana%20Card and the file is "Ghana Card.html".
        # Vercel resolves that; a plain string join does not.
        path = ROOT / unquote(self.path.split("?")[0]).lstrip("/")

        if not path.exists():
            for candidate in (path.with_suffix(".html"), path / "index.html"):
                if candidate.is_file():
                    self.path = "/" + quote(str(candidate.relative_to(ROOT)).replace("\\", "/"))
                    break
            else:
                if (ROOT / "404.html").is_file():
                    self.send_response(404)
                    body = (ROOT / "404.html").read_bytes()
                    self.send_header("Content-Type", "text/html; charset=utf-8")
                    self.send_header("Content-Length", str(len(body)))
                    self.end_headers()
                    return __import__("io").BytesIO(body)

        return super().send_head()

    def log_message(self, fmt, *args):
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    ThreadingHTTPServer.allow_reuse_address = True
    with ThreadingHTTPServer(("", port), Handler) as server:
        print(f"Serving {ROOT} on http://localhost:{port}")
        server.serve_forever()
