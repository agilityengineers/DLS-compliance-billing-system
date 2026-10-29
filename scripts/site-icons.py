#!/usr/bin/env python3
"""Regenerate the website favicons and the social-share image from the brand art.

    python3 scripts/site-icons.py            # from the repository root

Favicon = the DLS monkey on its own. Tab-sized icons (favicon.ico and the 16/32px
PNGs) use the monkey's head (site/assets/logo-monkey-head.png) so it stays bold at
tab size; the large icons (192/512px and the Apple touch icon) use the full-body
monkey from the sticky header (site/assets/logo-monkey.png). Share image = the full
logo on white at 1200x630 (site/assets/og-image.jpg). Needs Pillow (`pip install pillow`).
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
    def art(name: str) -> Image.Image:
        img = Image.open(SITE / "assets" / name).convert("RGBA")
        return img.crop(img.getchannel("A").getbbox())

    head, body = square(art("logo-monkey-head.png"), 0.02), square(art("logo-monkey.png"), 0.02)
    opaque = square(art("logo-monkey.png"), 0.10, (255, 255, 255, 255))  # iOS paints transparency black

    for size in (16, 32):
        shrink(head, size).save(ICONS / f"favicon-{size}.png", optimize=True)
    for size in (192, 512):
        shrink(body, size).save(ICONS / f"favicon-{size}.png", optimize=True)
    shrink(opaque, 180).convert("RGB").save(ICONS / "apple-touch-icon.png", optimize=True)
    frames = [shrink(head, s) for s in (48, 32, 16)]
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
