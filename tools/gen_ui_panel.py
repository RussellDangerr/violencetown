"""
Generate the shared 9-slice canvas panel atlas for Violencetown's UI from
Kenney's CC0 "UI Pack - Pixel Adventure" tiles, so the canvas-drawn panels
(HUD + all modals) read identically to the DOM pop-up menus, which use the same
tiles via CSS border-image.

  Output: game/assets/ui_panel.png  (48 x 144 RGBA)

Three 48x48 variants stacked vertically, matching PANEL_VARIANT_OY in
game/ui-sprites.js (base:0, dark:48, glow:96). Each variant is a 3x3 grid of
16x16 cells (P.{tl,t,tr,l,c,r,bl,b,br}). drawPanelBig() native-draws the four
corners, STRETCHES the edge cells along one axis and the center along both — so:
  - corners hold the Kenney steel corner brackets, sampled native;
  - each edge cell is rebuilt from a SINGLE clean 1px border line taken from the
    correct side (top/bottom/left/right), so it is translation-invariant along
    its stretch axis and no edge-midpoint notch can smear;
  - the center is a flat fill (seamless under both-axis stretch).

Sources (Kenney CC0 — NOT committed; read from Caelan's local asset library):
  tile_0007 = cream/parchment fill, steel + gold trim   -> base, glow
  tile_0008 = straight steel border, transparent center -> dark (filled #2a2218)

Run from anywhere:
    python tools/gen_ui_panel.py
"""
import os
from PIL import Image

KENNEY_DIR = (r"C:\Code\assets\kenney\UI assets\UI Pack - Pixel Adventure"
              r"\Tiles\Large tiles\Thick outline")
TILE_PARCHMENT = "tile_0007.png"
TILE_DARK = "tile_0008.png"

CELL = 16
PANEL = CELL * 3          # 48px per variant
SCALE = 2                 # 32 -> 64 nearest; the ~6px frame becomes ~12px (< 16 corner cell)
EDGE_OFF = 20             # sample edges at x/y=20 on the 64px tile: past the ~12px corner
                          # bracket and off the centered notch at 32.

DARK_FILL = (42, 34, 24, 255)     # #2a2218  UI.panelBgDark
GLOW_GOLD = (212, 185, 106, 255)  # #d4b96a  UI.gold — glow trim target
GLOW_AMT = 0.35                   # lerp of base toward gold for the "lit" variant


def load_2x(name):
    im = Image.open(os.path.join(KENNEY_DIR, name)).convert("RGBA")
    return im.resize((im.width * SCALE, im.height * SCALE), Image.NEAREST)


def edge_cell(tile2x, side):
    """16x16 edge cell with the border on the correct side, rebuilt from one
    clean 1px line so the stretch axis is uniform (notch-proof)."""
    out = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    if side in ("t", "b"):
        sy = 0 if side == "t" else 64 - CELL
        col = tile2x.crop((EDGE_OFF, sy, EDGE_OFF + 1, sy + CELL))   # 1px-wide cross-section
        for x in range(CELL):
            out.paste(col, (x, 0))
    else:
        sx = 0 if side == "l" else 64 - CELL
        row = tile2x.crop((sx, EDGE_OFF, sx + CELL, EDGE_OFF + 1))   # 1px-tall cross-section
        for y in range(CELL):
            out.paste(row, (0, y))
    return out


def slice_variant(tile2x, center_fill):
    """Assemble one 48x48 variant from a 64x64 (2x) source tile."""
    v = Image.new("RGBA", (PANEL, PANEL), (0, 0, 0, 0))
    # corners — native, keep the steel brackets
    v.paste(tile2x.crop((0, 0, CELL, CELL)), (0, 0))
    v.paste(tile2x.crop((64 - CELL, 0, 64, CELL)), (PANEL - CELL, 0))
    v.paste(tile2x.crop((0, 64 - CELL, CELL, 64)), (0, PANEL - CELL))
    v.paste(tile2x.crop((64 - CELL, 64 - CELL, 64, 64)), (PANEL - CELL, PANEL - CELL))
    # edges — clean, side-correct
    v.paste(edge_cell(tile2x, "t"), (CELL, 0))
    v.paste(edge_cell(tile2x, "b"), (CELL, PANEL - CELL))
    v.paste(edge_cell(tile2x, "l"), (0, CELL))
    v.paste(edge_cell(tile2x, "r"), (PANEL - CELL, CELL))
    # center — flat fill
    v.paste(Image.new("RGBA", (CELL, CELL), center_fill), (CELL, CELL))
    return v


def tint_toward(variant, target, amount):
    """Lerp every opaque pixel toward `target` by `amount` — 'lights up' base."""
    tr, tg, tb, _ = target
    px = variant.load()
    for y in range(variant.height):
        for x in range(variant.width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            px[x, y] = (round(r + (tr - r) * amount),
                        round(g + (tg - g) * amount),
                        round(b + (tb - b) * amount), a)
    return variant


def main():
    parch2x = load_2x(TILE_PARCHMENT)
    dark2x = load_2x(TILE_DARK)
    cream = parch2x.getpixel((32, 32))   # exact parchment fill, sampled deep in the fill

    atlas = Image.new("RGBA", (PANEL, PANEL * 3), (0, 0, 0, 0))

    # base — parchment, flat cream center
    atlas.paste(slice_variant(parch2x, cream), (0, 0))

    # dark — steel frame composited OVER a solid dark fill so the (transparent)
    # interior and any gaps read opaque, frame on top.
    dark_bg = Image.new("RGBA", (PANEL, PANEL), DARK_FILL)
    dark_bg.alpha_composite(slice_variant(dark2x, DARK_FILL))
    atlas.paste(dark_bg, (0, PANEL))

    # glow — base lit toward warm gold
    glow = tint_toward(slice_variant(parch2x, cream), GLOW_GOLD, GLOW_AMT)
    atlas.paste(glow, (0, PANEL * 2))

    here = os.path.dirname(os.path.abspath(__file__))
    out = os.path.abspath(os.path.join(here, "..", "game", "assets", "ui_panel.png"))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    atlas.save(out, optimize=True)
    print(f"Wrote {out} ({os.path.getsize(out)} bytes) — 48x144, base/dark/glow; cream={cream}")


if __name__ == "__main__":
    main()
