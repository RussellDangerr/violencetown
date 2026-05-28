"""
Generate the ornate 9-slice panel sprite for Violencetown's canvas UI.

The atlas is laid out as three 48×48 panel variants stacked vertically
(total 48×144), all matching the existing P.{tl,t,tr,l,c,r,bl,b,br}
coordinates declared in ui-sprites.js — each 16×16 cell, 3×3 grid.

Variants (top → bottom):
  1. base   (y =  0..48 ) — parchment center, gold-brown trim, dark border
  2. dark   (y = 48..96 ) — dark center for tooltips / modal overlays
  3. glow   (y = 96..144) — base + a brighter gold border for active highlights

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


CELL = 16
PANEL = CELL * 3  # 48px per variant — smaller corners let more panels use the 9-slice


def draw_panel(img: Image.Image, oy: int, center_color, trim_color, accent_color):
    """Draw one PANEL×PANEL panel variant into `img` at vertical offset `oy`."""
    d = ImageDraw.Draw(img)
    P = PANEL

    # 1. Fill with center color so edges + center tile cleanly.
    d.rectangle([0, oy, P, oy + P], fill=center_color)

    # 2. Outer dark border (2px).
    d.rectangle([0, oy, P - 1, oy + P - 1], outline=DARK, width=2)

    # 3. Inner gold trim (2px, inset 2px from outer).
    d.rectangle([2, oy + 2, P - 3, oy + P - 3], outline=trim_color, width=2)

    # 4. Corner gem accents — single 2×2 highlight in each corner cell, just
    #    inside the trim. Even small panels read as "ornate" because the
    #    accents land right at the cell joints.
    accents = [(5, 5), (P - 7, 5), (5, P - 7), (P - 7, P - 7)]
    for cx, cy in accents:
        d.rectangle([cx, oy + cy, cx + 1, oy + cy + 1], fill=accent_color)


def main():
    img = Image.new('RGBA', (PANEL, PANEL * 3), (0, 0, 0, 0))
    draw_panel(img, 0,         center_color=PARCHMENT,    trim_color=BORDER_GOLD, accent_color=HIGHLIGHT)
    draw_panel(img, PANEL,     center_color=DARK,         trim_color=BORDER_GOLD, accent_color=HIGHLIGHT)
    draw_panel(img, PANEL * 2, center_color=PARCHMENT_LT, trim_color=GLOW,        accent_color=GLOW)

    here = os.path.dirname(os.path.abspath(__file__))
    out = os.path.abspath(os.path.join(here, '..', 'game', 'assets', 'ui_panel.png'))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    img.save(out, optimize=True)
    print(f'Wrote {out} ({os.path.getsize(out)} bytes)')


if __name__ == '__main__':
    main()
