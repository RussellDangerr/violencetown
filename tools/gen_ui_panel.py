"""
Generate the ornate 9-slice panel sprite for Violencetown's canvas UI.

The atlas is laid out as three 96×96 panel variants stacked vertically
(total 96×288), all matching the existing P.{tl,t,tr,l,c,r,bl,b,br}
coordinates declared in ui-sprites.js — each 32×32 cell, 3×3 grid.

Variants (top → bottom):
  1. base   (y =   0..96 ) — parchment center, gold-brown trim, dark border
  2. dark   (y =  96..192) — dark center for tooltips / modal overlays
  3. glow   (y = 192..288) — base + a brighter gold border for active highlights

Each variant is its own 9-slice panel — drawPanelBig picks which 96px
band by adding a `variant` arg later. The cells tile horizontally
(top/bottom edges) and vertically (left/right edges); the center is
solid-color and tiles in both directions.

Run from anywhere:
    python tools/gen_ui_panel.py

Output: game/assets/ui_panel.png
"""
import os
from PIL import Image, ImageDraw


# Colors aligned with ui-sprites.js UI palette
PARCHMENT     = (200, 184, 136, 255)   # #c8b888 — main fill
PARCHMENT_LT  = (216, 200, 152, 255)   # slight highlight
PARCHMENT_DK  = (172, 156, 116, 255)   # slight shadow
BORDER_GOLD   = (139, 115,  64, 255)   # #8b7340 — main trim
BORDER_LIGHT  = (184, 160,  96, 255)   # #b8a060
HIGHLIGHT     = (212, 185, 106, 255)   # #d4b96a — gem accents
DARK          = ( 42,  34,  24, 255)   # #2a2218 — outer/inner shadow
DARK_DEEP     = ( 26,  22,  16, 255)   # #1a1610 — deepest
GLOW          = (240, 215, 130, 255)   # active-state brighter gold


def draw_panel(img: Image.Image, oy: int, center_color, trim_color, accent_color):
    """Draw one 96×96 panel variant into `img` at vertical offset `oy`."""
    d = ImageDraw.Draw(img)

    # 1. Fill the whole 96×96 region with center color so center cell + edge
    #    interiors are consistent.
    d.rectangle([0, oy, 96, oy + 96], fill=center_color)

    # 2. Outer dark border (2px) — frames the panel.
    d.rectangle([0, oy, 95, oy + 95], outline=DARK, width=2)

    # 3. Inner gold trim (2px, inset 2px from outer).
    d.rectangle([2, oy + 2, 93, oy + 93], outline=trim_color, width=2)

    # 4. Inner dark hairline (1px, inset 4px) — separates trim from fill.
    d.rectangle([4, oy + 4, 91, oy + 91], outline=DARK_DEEP, width=1)

    # 5. Corner gem accents — small 3×3 highlight squares inset into each
    #    corner cell, just inside the trim. Gives the panel a "studded
    #    parchment" character without making the edges noisy.
    for cx, cy in [(6, 6), (87, 6), (6, 87), (87, 87)]:
        d.rectangle([cx, oy + cy, cx + 2, oy + cy + 2], fill=accent_color)

    # 6. Edge highlight pixels — a single bright pixel in the middle of each
    #    edge cell, ornate-coin style. Tiles cleanly since each cell carries
    #    its own mid-pixel.
    for ex, ey in [(48, 4), (48, 91), (4, 48), (91, 48)]:
        d.rectangle([ex, oy + ey, ex + 1, oy + ey + 1], fill=accent_color)


def main():
    img = Image.new('RGBA', (96, 96 * 3), (0, 0, 0, 0))
    # Base variant (parchment fill, gold trim, gold accents)
    draw_panel(img, 0,   center_color=PARCHMENT,    trim_color=BORDER_GOLD,  accent_color=HIGHLIGHT)
    # Dark variant (dark fill, dim trim, faint accents) — for tooltips, modals
    draw_panel(img, 96,  center_color=DARK,         trim_color=BORDER_GOLD,  accent_color=HIGHLIGHT)
    # Glow variant (parchment fill, bright gold trim) — for active highlights
    draw_panel(img, 192, center_color=PARCHMENT_LT, trim_color=GLOW,         accent_color=GLOW)

    here = os.path.dirname(os.path.abspath(__file__))
    out = os.path.abspath(os.path.join(here, '..', 'game', 'assets', 'ui_panel.png'))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    img.save(out, optimize=True)
    print(f'Wrote {out} ({os.path.getsize(out)} bytes)')


if __name__ == '__main__':
    main()
