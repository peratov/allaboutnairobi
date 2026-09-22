"""
Draw the social card at templates/staticimages/og-image.png.

Run by hand, not at build time. The result is committed, because generating it
during the build would put a font dependency on the deploy runner in exchange
for an image that changes roughly never.

    python scripts/build_og_image.py

Facebook, LinkedIn, WhatsApp, Slack and X all crop toward the centre at
different aspect ratios, so nothing that matters goes near an edge. The
palette is lifted from templates/css/base/_variables.scss - if the site's
colours change, this is the second place to change them.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUTPUT = Path(__file__).resolve().parent.parent / "templates" / "staticimages" / "og-image.png"

WIDTH, HEIGHT = 1200, 630
MARGIN = 96

PAPER = "#fdfbf7"
LATERITE = "#9c4113"
TEXT = "#2a2521"
TEXT_LIGHT = "#4f4941"
BORDER = "#c2b6a0"

# Whichever of these the machine has. Segoe UI and Georgia match the site;
# DejaVu is the Linux fallback so this is runnable off Windows.
SANS = ["C:/Windows/Fonts/segoeui.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]
SANS_SEMIBOLD = ["C:/Windows/Fonts/seguisb.ttf", "C:/Windows/Fonts/segoeui.ttf",
                 "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]
SANS_BOLD = ["C:/Windows/Fonts/segoeuib.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"]
SERIF = ["C:/Windows/Fonts/georgia.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"]


def font(candidates: list[str], size: int) -> ImageFont.FreeTypeFont:
    for path in candidates:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    raise FileNotFoundError(f"None of these fonts are installed: {candidates}")


def run(draw: ImageDraw.ImageDraw, x: int, y: int, parts: list[tuple[str, ImageFont.FreeTypeFont, str]]) -> int:
    """Draw pieces of text on one baseline, and return where it ends."""
    for text, face, colour in parts:
        draw.text((x, y), text, font=face, fill=colour, anchor="ls")
        x += draw.textlength(text, font=face)
    return x


def main() -> None:
    image = Image.new("RGB", (WIDTH, HEIGHT), PAPER)
    draw = ImageDraw.Draw(image)

    # A laterite edge on two sides, so the card still reads as ours when it is
    # scaled down to a thumbnail and the words are gone.
    draw.rectangle([0, 0, 18, HEIGHT], fill=LATERITE)
    draw.rectangle([0, HEIGHT - 18, WIDTH, HEIGHT], fill=LATERITE)

    wordmark_size = 104
    run(draw, MARGIN, 300, [
        ("allabout", font(SANS_SEMIBOLD, wordmark_size), TEXT_LIGHT),
        ("accra", font(SANS_BOLD, wordmark_size), LATERITE),
        (".com", font(SANS, int(wordmark_size * 0.82)), TEXT_LIGHT),
    ])

    draw.text((MARGIN, 360), "Free guides and tools for living in Accra",
              font=font(SERIF, 44), fill=TEXT, anchor="la")

    draw.rectangle([MARGIN, 452, MARGIN + 180, 455], fill=BORDER)

    draw.text((MARGIN, 490), "Housing  ·  Ghana Card  ·  PAYE  ·  SSNIT  ·  NHIS  ·  Mobile money",
              font=font(SANS, 30), fill=TEXT_LIGHT, anchor="la")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    image.save(OUTPUT, "PNG", optimize=True)
    print(f"Wrote {OUTPUT} ({OUTPUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
