#!/usr/bin/env python3
"""Regenerate the website favicons and the social-share image from the brand art.

    python3 scripts/site-icons.py            # from the repository root

Favicon = the DLS monkey on its own (site/assets/logo-monkey.png, the mark that
appears in the sticky header while scrolling). Share image = the full logo on
white at 1200x630 (site/assets/og-image.jpg). Needs Pillow (`pip install pillow`).
"""
from pathlib import Path

from PIL import Image, ImageFilter

SITE = Path(__file__).resolve().parent.parent / "site"
ICONS = SITE / "assets" / "icons"


def square(img: Image.Image, pad: float, bg=None) -> Image.Image:
    """Center img on a square canvas, padded by `pad` of the long side each way."""
    side = max(img.size)
    s = round(side * (1 + 2 * pad))
    canvas = Image.new("RGBA", (s, s), bg or (0, 0, 0, 0))
    canvas.paste(img, ((s - img.width) // 2, (s - img.height) // 2), img)
    return canvas


def shrink(img: Image.Image, size: int) -> Image.Image:
    out = img.resize((size, size), Image.Resampling.LANCZOS)
    if size <= 48:  # keep the hat and face readable at tab size
        out = out.filter(ImageFilter.UnsharpMask(radius=0.6, percent=60, threshold=2))
    return out


def main() -> None:
    ICONS.mkdir(parents=True, exist_ok=True)
    monkey = Image.open(SITE / "assets" / "logo-monkey.png").convert("RGBA")
    monkey = monkey.crop(monkey.getchannel("A").getbbox())
    transparent = square(monkey, 0.02)
    opaque = square(monkey, 0.10, (255, 255, 255, 255))  # iOS paints transparency black

    for size in (16, 32, 192, 512):
        shrink(transparent, size).save(ICONS / f"favicon-{size}.png", optimize=True)
    shrink(opaque, 180).convert("RGB").save(ICONS / "apple-touch-icon.png", optimize=True)
    frames = [shrink(transparent, s) for s in (48, 32, 16)]
    frames[0].save(ICONS / "favicon.ico", format="ICO", sizes=[(48, 48), (32, 32), (16, 16)], append_images=frames[1:])

    logo = Image.open(SITE / "assets" / "logo-full.png").convert("RGBA")
    logo = logo.crop(logo.getchannel("A").getbbox())
    width, height = 1200, 630
    scale = min(width * 0.84 / logo.width, height * 0.80 / logo.height)
    logo = logo.resize((round(logo.width * scale), round(logo.height * scale)), Image.Resampling.LANCZOS)
    card = Image.new("RGBA", (width, height), (255, 255, 255, 255))
    card.paste(logo, ((width - logo.width) // 2, (height - logo.height) // 2), logo)
    card.convert("RGB").save(SITE / "assets" / "og-image.jpg", quality=88, optimize=True, progressive=True)
    print("wrote", ", ".join(sorted(p.name for p in ICONS.iterdir())), "and assets/og-image.jpg")


if __name__ == "__main__":
    main()
