#!/usr/bin/env python3
"""Generate PWA / home-screen icons from the favicon's pixel-"V" mark.

The favicon (game/favicon.svg) is a 16x16 pixel grid: a gold "V" with a single
red "violence" pip, on the #0a0a0a splash black. We redraw that exact grid as
crisp solid rectangles (no SVG rasterizer needed, no resampling blur) at the
sizes a PWA install + iOS home-screen want:

  icon-192.png            192  — Android install, "any"
  icon-512.png            512  — Android install / splash, "any"
  icon-512-maskable.png   512  — Android adaptive icon, padded into the safe zone
  apple-touch-icon.png    180  — iOS "Add to Home Screen"

Run from the repo root:  python tools/gen_pwa_icons.py
"""
from PIL import Image, ImageDraw

BG   = (10, 10, 10)     # #0a0a0a — splash black
GOLD = (212, 185, 106)  # #d4b96a — brand gold
RED  = (196, 48, 48)    # #c43030 — the "violence" pip

# (x, y, w, h, color) on the 16x16 grid — copied 1:1 from game/favicon.svg.
RECTS = [
    (2, 3, 2, 2, GOLD), (12, 3, 2, 2, GOLD),
    (3, 5, 2, 2, GOLD), (11, 5, 2, 2, GOLD),
    (4, 7, 2, 2, GOLD), (10, 7, 2, 2, GOLD),
    (5, 9, 2, 2, GOLD), (9, 9, 2, 2, GOLD),
    (6, 11, 4, 2, GOLD),
    (7, 13, 2, 1, RED),
]


def render(size, pad_frac=0.0):
    """Draw the 16-grid mark on a solid BG square. pad_frac insets the mark
    (for maskable icons, whose content must sit inside the crop-safe zone)."""
    img = Image.new("RGB", (size, size), BG)
    d = ImageDraw.Draw(img)
    inner = size * (1 - 2 * pad_frac)
    cell = inner / 16.0
    off = size * pad_frac
    for (x, y, w, h, color) in RECTS:
        x0 = round(off + x * cell)
        y0 = round(off + y * cell)
        x1 = round(off + (x + w) * cell)
        y1 = round(off + (y + h) * cell)
        d.rectangle([x0, y0, x1 - 1, y1 - 1], fill=color)
    return img


def main():
    render(192).save("game/icon-192.png")
    render(512).save("game/icon-512.png")
    render(512, pad_frac=0.10).save("game/icon-512-maskable.png")
    render(180).save("game/apple-touch-icon.png")
    print("PWA icons written to game/: icon-192, icon-512, icon-512-maskable, apple-touch-icon")


if __name__ == "__main__":
    main()
