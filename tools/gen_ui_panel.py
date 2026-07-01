"""
Generate the shared 9-slice canvas panel atlas for Violencetown's UI from
Kenney's CC0 "Fantasy UI Borders" pack — a dark-ornate stone-and-gold frame
that replaces the old warm-parchment look across every canvas panel.

  Output: game/assets/ui_panel.png  (48 x 144 RGBA)

Three 48x48 variants stacked vertically, matching PANEL_VARIANT_OY in
game/ui-sprites.js (base:0, dark:48, glow:96). Each variant is a 3x3 grid of
16x16 cells (P.{tl,t,tr,l,c,r,bl,b,br}). drawPanelBig() native-draws the four
corners and STRETCHES the edges/center — the chosen source tile is authored on
a clean 16px grid with translation-invariant edge middles, so naive slicing
stretches seamlessly.

Source (Kenney CC0 — NOT committed; read from the local asset library):
  Fantasy UI Borders / Transparent center / panel-transparent-center-013.png
  A 48x48 tile of PURE WHITE geometry on transparent — the ornament is shape,
  not color. Alpha is banded: a=0 outside, a~127 the panel FILL region, a=255
  the ornate FRAME. We threshold (a>=200 => frame, 0<a<200 => fill) and recolor
  each region per variant, so the frame becomes gold and the fill becomes dark
  stone. The fill is LIGHTER than the inset wells (UI.panelBgDark) so bars/slots
  drawn with drawInset() still read against the panel.

Run (needs Pillow):
    python tools/gen_ui_panel.py
"""
import os
from PIL import Image

FANTASY_DIR = (r"C:\Code\assets\kenney\UI assets\Fantasy UI Borders"
               r"\PNG\Default\Transparent center")
TILE = "panel-transparent-center-013.png"   # gold corner bezels + thin rule; 9-slice-clean

CELL = 16
PANEL = CELL * 3          # 48px per variant
FRAME_THRESH = 200        # alpha >= this = ornate frame; 0 < a < this = panel fill

# (frame_color, fill_color) per variant. Fill stays a step LIGHTER than the
# inset wells (#14110b) so drawInset bars/slots read on the panel.
VARIANTS = {
    "base": ((212, 185, 106, 255), (42, 38, 32, 255)),   # gold frame  / #2a2620 stone
    "dark": ((139, 115, 64, 255),  (20, 17, 11, 255)),   # bronze      / #14110b well
    "glow": ((240, 222, 150, 255), (50, 44, 34, 255)),   # bright gold / #322c22 lit
}


def recolor(tile, frame_col, fill_col):
    out = Image.new("RGBA", tile.size, (0, 0, 0, 0))
    src, dst = tile.load(), out.load()
    for y in range(tile.height):
        for x in range(tile.width):
            a = src[x, y][3]
            if a >= FRAME_THRESH:
                dst[x, y] = frame_col
            elif a > 0:
                dst[x, y] = fill_col
            # else: transparent (outside the panel)
    return out


def main():
    tile = Image.open(os.path.join(FANTASY_DIR, TILE)).convert("RGBA")
    if tile.size != (PANEL, PANEL):
        tile = tile.resize((PANEL, PANEL), Image.NEAREST)

    atlas = Image.new("RGBA", (PANEL, PANEL * 3), (0, 0, 0, 0))
    for i, key in enumerate(("base", "dark", "glow")):
        frame_col, fill_col = VARIANTS[key]
        atlas.paste(recolor(tile, frame_col, fill_col), (0, PANEL * i))

    here = os.path.dirname(os.path.abspath(__file__))
    out = os.path.abspath(os.path.join(here, "..", "game", "assets", "ui_panel.png"))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    atlas.save(out, optimize=True)
    print(f"Wrote {out} ({os.path.getsize(out)} bytes) — 48x144 dark-ornate, base/dark/glow")


if __name__ == "__main__":
    main()
