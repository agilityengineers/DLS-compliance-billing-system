#!/usr/bin/env python3
"""Convert website images to WebP (and optionally a phone-sized variant).

    python3 scripts/site-images.py site/assets/photos/new-photo.jpg
    python3 scripts/site-images.py --wide site/assets/photos/new-hero.jpg

Writes `<name>.webp` next to each input. With --wide (for full-bleed hero,
band and CTA backgrounds) it also writes `<name>-960.webp` for small screens;
reference both via srcset in the HTML. Photos use lossy quality 80; artwork
with transparency (logos, mascots) is written lossless when that is smaller,
else lossy quality 90 with alpha kept. Needs Pillow (`pip install pillow`).
"""
import argparse
import io
from pathlib import Path

from PIL import Image

PHONE_WIDTH = 960


def encode(img: Image.Image, photo: bool) -> bytes:
    def to_bytes(**kw) -> bytes:
        buf = io.BytesIO()
        img.save(buf, "WEBP", method=6, **kw)
        return buf.getvalue()

    if photo:
        return to_bytes(quality=80)
    lossless, lossy = to_bytes(lossless=True), to_bytes(quality=90)
    return lossless if len(lossless) <= len(lossy) else lossy


def convert(path: Path, wide: bool) -> None:
    img = Image.open(path)
    photo = img.mode != "RGBA"
    img = img.convert("RGB" if photo else "RGBA")
    out = path.with_suffix(".webp")
    out.write_bytes(encode(img, photo))
    print(f"{path} -> {out.name}  {path.stat().st_size // 1024} KB -> {out.stat().st_size // 1024} KB")
    if wide and img.width > PHONE_WIDTH:
        small = img.resize((PHONE_WIDTH, round(img.height * PHONE_WIDTH / img.width)), Image.Resampling.LANCZOS)
        small_out = path.with_name(f"{path.stem}-{PHONE_WIDTH}.webp")
        small_out.write_bytes(encode(small, photo))
        print(f"{' ' * len(str(path))} -> {small_out.name}  {small_out.stat().st_size // 1024} KB ({small.width}x{small.height})")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("files", nargs="+", type=Path)
    ap.add_argument("--wide", action="store_true", help="also write a 960px-wide variant for phones")
    args = ap.parse_args()
    for f in args.files:
        convert(f, args.wide)


if __name__ == "__main__":
    main()
