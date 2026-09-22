"""
Draw the installable-app icons from the favicon.

Run by hand, like build_og_image.py and build_icons.py. The results are
committed, because they change roughly never and generating them during the
deploy would put a browser on the build runner.

    python scripts/build_pwa_icons.py

Pillow cannot read SVG and the alternatives all want native Cairo bindings, so
this drives the headless Chromium that is already on the machine. That renders
the real favicon rather than an approximation of it, which matters: the tab
icon and the home-screen icon should be the same drawing.

Four files come out, because the platforms want different things:

  icon-192.png            the manifest's small "any" icon
  icon-512.png            the manifest's large "any" icon, and the splash
  icon-maskable-512.png   full-bleed, for Android's adaptive mask
  apple-touch-icon.png    180px, opaque, square - iOS rounds it itself

"any" and "maskable" have to be separate files. Android crops a maskable icon
to whatever shape the launcher uses, so anything with its own rounded corners
comes out with the corners clipped twice; and a full-bleed square used as
"any" looks unrounded everywhere else. The maskable one pulls the glyph in to
72% so it survives the crop.
"""

import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "templates" / "staticimages" / "favicon.svg"
OUT = ROOT / "templates" / "staticimages"

# The laterite the favicon's own background uses. Only needed for the opaque
# iOS icon, which cannot be transparent.
LATERITE = "#b3541e"

CHROME = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
]

# Rendered big and scaled down, so the small sizes are resampled from a clean
# raster rather than rendered at a size where hinting coarsens the curves.
RENDER_AT = 1024


def browser() -> str:
    for candidate in CHROME:
        if Path(candidate).exists():
            return candidate
    found = shutil.which("chromium") or shutil.which("google-chrome")
    if found:
        return found
    raise FileNotFoundError(f"No Chromium found. Looked in: {CHROME}")


def page(svg: str) -> str:
    """An HTML shell that puts the SVG on an exact square with no margin."""
    return (
        "<!doctype html><meta charset='utf-8'>"
        "<style>html,body{margin:0;padding:0;background:transparent}"
        f"svg{{display:block;width:{RENDER_AT}px;height:{RENDER_AT}px}}</style>"
        f"{svg}"
    )


def render(svg: str, destination: Path) -> Image.Image:
    """Rasterise one SVG through headless Chromium."""
    with tempfile.TemporaryDirectory() as work:
        html = Path(work) / "icon.html"
        html.write_text(page(svg), encoding="utf-8")
        shot = Path(work) / "shot.png"

        subprocess.run(
            [
                browser(),
                "--headless=new",
                "--disable-gpu",
                "--hide-scrollbars",
                # Transparent, so the favicon's rounded corners stay rounded.
                "--default-background-color=00000000",
                f"--screenshot={shot}",
                f"--window-size={RENDER_AT},{RENDER_AT}",
                html.as_uri(),
            ],
            check=True,
            capture_output=True,
        )

        image = Image.open(shot).convert("RGBA")
        image.load()
        return image


def maskable(svg: str) -> str:
    """Square the corners and pull the glyph into the safe circle."""
    out = svg.replace('rx="20"', 'rx="0"')
    out = out.replace(
        '<g fill="#faf7f2"',
        '<g transform="translate(50,50) scale(0.72) translate(-50,-50)"><g fill="#faf7f2"',
    )
    return out.replace("</svg>", "</g></svg>")


def save(image: Image.Image, size: int, name: str, opaque: bool = False) -> None:
    resized = image.resize((size, size), Image.LANCZOS)

    if opaque:
        # iOS shows the alpha channel as black rather than compositing it, so
        # the apple icon gets the laterite painted in behind it.
        ground = Image.new("RGBA", resized.size, LATERITE)
        ground.alpha_composite(resized)
        resized = ground.convert("RGB")

    path = OUT / name
    resized.save(path, "PNG", optimize=True)
    print(f"  {name:<26} {size}x{size}  {path.stat().st_size / 1024:.1f}KB")


def main() -> None:
    svg = SOURCE.read_text(encoding="utf-8")
    print(f"Rendering {SOURCE.name} at {RENDER_AT}px through {Path(browser()).name}")

    rounded = render(svg, OUT)
    save(rounded, 192, "icon-192.png")
    save(rounded, 512, "icon-512.png")

    square = render(maskable(svg), OUT)
    save(square, 512, "icon-maskable-512.png")
    save(square, 180, "apple-touch-icon.png", opaque=True)


if __name__ == "__main__":
    main()
