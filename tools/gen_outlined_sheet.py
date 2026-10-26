#!/usr/bin/env python3
"""Bring Kenney's roguelikeSheet objects into Violencetown's house style.

roguelikeSheet_transparent.png (bundled, unregistered) has art the game
badly needs — a dozen distinct gravestone silhouettes, 2x2 circus tents,
interior floor tiles — but every object on it carries a light-grey bevel
highlight and NO dark border, where tinyDungeon and tinyTown (the game's
actual art source) carry a bold near-black outline on everything. Dropped in
raw, this sheet reads flat and looks like a second, foreign art pack — the
same style mismatch that got roguelikeChar rejected outright (see
plans/zone-identity.md, "The style rule this pass establishes").

The ruling (Caelan, 2026-09-07): generate, don't reject. This script
re-outlines the specific cells the game wants and packs them into a new,
gutter-free atlas — the same treatment gen_font / gen_ui_panel /
gen_emote_sheet give other art in this repo.

Source geometry: roguelikeSheet_transparent.png is a 1px-gutter sheet (57x31
cells, stride 17) — source pixel = (col*17, row*17), cell size 16x16. See
sprites.js's SpriteSheet.padding note for why the gutter matters (get it
wrong and deep rows drift up, rendering two half-cells stacked).

Outline: a working prototype confirmed on gravestones 2026-09-07 — flood a
1px stroke of colour (38,26,32,255) onto every transparent pixel 4-adjacent
to an opaque one. Used verbatim below, not rederived.

Edge clipping is real and is measured per cell, not eyeballed (alpha bbox
vs. the 16x16 cell bounds), because a silhouette flush against the cell
edge has no transparent pixel on that side for the outline to occupy:
  - 3 gravestones (archRound / flatTop / notched) fill the FULL cell
    height — top AND bottom both flush, zero margin on that axis. No 1px
    shift can free either side without cropping real silhouette pixels off
    the other, so these are inset by a ~12% shrink instead (16px -> 14px,
    centered, nearest-neighbor): no pixels are cropped, it just
    manufactures the margin an outline needs.
  - 6 gravestones touch the BOTTOM only (the stone's base sits on the
    cell's last row, which is normal for anything standing on the ground).
    These have >=1px of margin on every OTHER side, so they get a lossless
    1px shift toward that margin before outlining — no resampling.
  - 3 gravestones (gothicPeak / wideArch / engravedCross) already clear
    every edge and are outlined as extracted.
  - Both circus tents are authored as 2x2 blocks (4 cells each) that must
    join seamlessly. Outlining each 16x16 quadrant on its own would draw a
    dark cross through the middle of the tent — an internal seam, not a
    real silhouette edge. So each tent is reassembled to its native 32x32
    FIRST, outlined ONCE as a whole (its true outer silhouette turns out to
    be flush top+bottom too, so it takes the same shrink-inset as the
    full-bleed gravestones), and only THEN re-sliced back into four 16x16
    columns for the packed atlas.

Floors are extracted WITHOUT any outline or inset — deliberately. They are
tileable ground, drawn edge-to-edge against their neighbors; an outline
would draw a visible grid across the floor instead of a seamless surface.

The cemetery gateway (added 2026-09-10) is outlined but NOT inset — see the
note on GATEWAYS below. It is appended after the floors so no existing column
moves.

Output: game/assets-placeholder/kenney/rlOutlined_packed.png — a single
packed (gutter-free) row of 16x16 cells, so it registers in sprites.js with
padding: 0 (unlike its 1px-gutter source). Re-run and copy the printed
column order into OUTLINED_SPRITES in sprites.js if this list ever changes.

A second sheet (plans/zone-1-interiors-get-a-vocabulary.md): the furniture of
Kenney's Roguelike Interior Pack (CC0), roguelikeIndoor_transparent.png — 27x18
cells at the same stride 17 — outlined into
game/assets-placeholder/kenney/rlInterior_outlined.png. See INTERIOR_RUNS for
how it differs from the sheet above: furniture is mostly full-bleed and stands
side by side, so it is outlined per run and inked at the cell edge rather than
shrunk. Copy its printed order into INTERIOR_SPRITES in sprites.js.

Run (needs Pillow):
    python tools/gen_outlined_sheet.py                 # both sheets
    python tools/gen_outlined_sheet.py floors          # rlOutlined_packed.png only
    python tools/gen_outlined_sheet.py interior [--src PATH]
                                                       # rlInterior_outlined.png only
"""
import sys
from pathlib import Path
from PIL import Image

REPO = Path(__file__).resolve().parent.parent
SRC  = REPO / "game" / "assets-placeholder" / "kenney" / "roguelikeSheet_transparent.png"
OUT  = REPO / "game" / "assets-placeholder" / "kenney" / "rlOutlined_packed.png"

# The Interior Pack's sheet. Kept beside the other Kenney sources when bundled;
# `interior --src PATH` reads it from anywhere else (e.g. the Kenney library).
INTERIOR_SRC = REPO / "game" / "assets-placeholder" / "kenney" / "roguelikeIndoor_transparent.png"
INTERIOR_OUT = REPO / "game" / "assets-placeholder" / "kenney" / "rlInterior_outlined.png"

CELL    = 16
STRIDE  = 17                          # 1px gutter — SOURCE sheet only, not the output
OUTLINE_COLOUR = (38, 26, 32, 255)    # working prototype, verified on gravestones 2026-09-07

# Column order — KEEP IN SYNC with OUTLINED_SPRITES in game/sprites.js.
# (name, (col, row)) against roguelikeSheet_transparent.png's native grid.
GRAVESTONES = [
    ("gravestoneArchRound",     (40, 8)),
    ("gravestoneFlatTop",       (41, 8)),
    ("gravestoneGothicPeak",    (42, 8)),
    ("gravestoneNotched",       (47, 8)),
    ("gravestoneWideArch",      (48, 8)),
    ("gravestoneEngravedCross", (44, 8)),
    ("gravestoneBlankA",        (51, 9)),
    ("gravestonePlusCross1",    (51, 10)),
    ("gravestonePlusCross2",    (52, 10)),
    ("gravestonePlusCross3",    (53, 10)),
    ("gravestoneWoodCross",     (53, 9)),
    ("gravestoneBlankB",        (51, 11)),
]

# 2x2 blocks — quadrant coords in (TL, TR, BL, BR) order. Assembled to 32x32
# BEFORE outlining (see module docstring) so the join between quadrants
# stays seamless instead of getting a dark cross drawn through the middle.
CIRCUS_TENTS = [
    ("tentGreen", [(46, 10), (47, 10), (46, 11), (47, 11)]),
    ("tentTan",   [(48, 10), (49, 10), (48, 11), (49, 11)]),
]

# Interior floor — extracted WITHOUT outline or inset. These tile; an
# outline would draw a grid across the ground instead of a seamless floor.
FLOOR = [
    ("floorPlainA", (5, 2)),
    ("floorPlainB", (6, 2)),
    ("floorRugA",   (13, 12)),
    ("floorRugB",   (14, 12)),
]

# A stone gateway for the graveyard's fence: the left and right pieces of the
# sheet's arched wall opening, (31,17) and (33,17), placed side by side so they
# frame a 2-tile path. (zone-identity.md named (41,18)+(42,18) as the gate —
# at this stride those cells are minecart rails.) Assembled FIRST and outlined
# ONCE, like the tents, so the join between the pieces stays seamless. Unlike
# the tents it is NOT inset: its posts are flush with every edge of the strip,
# the shrink-inset would squash a 32x16 strip unevenly, and flush is right —
# the posts meet the fence on either side, where an outline would draw a seam.
# Appended last, so every existing column index above stays where it was.
GATEWAYS = [
    ("cemeteryArch", [(31, 17), (33, 17)]),
]

# ── The Interior Pack (rlInterior_outlined.png) ──────────────────────────────
# The Tiny packs' plum, the colour sprites.js TINY_INK gives every sprite from a
# foreign pack at draw time, so this furniture matches whatever stands beside it.
INTERIOR_INK = (63, 38, 49, 255)

# Runs: pieces that stand side by side in a room, each list read left to right
# against roguelikeIndoor_transparent.png's grid. A run is assembled into one
# strip, outlined ONCE and sliced back into cells, so the cells carry no stroke
# where they meet: any middle cell sits between any other with no seam, and
# only the strip's two ends carry a side stroke.
# Column order — KEEP IN SYNC with INTERIOR_SPRITES in game/sprites.js.
INTERIOR_RUNS = [
    # Kitchen counter: grey top over cupboards. Left end, six middles, right end.
    [("counterL", (0, 12)), ("counterDrawers", (1, 12)), ("counterDoors", (2, 12)),
     ("counterGrill", (4, 12)), ("counterBottles", (5, 12)), ("counterDishes", (7, 12)),
     ("counterSink", (8, 12)), ("counterR", (9, 12))],
    # Service counter: a long plain front. Left, a repeatable middle, right.
    [("deskL", (8, 15)), ("deskMid", (9, 15)), ("deskR", (10, 15))],
    # Green-felt oval table, two cells wide.
    [("feltTableL", (19, 10)), ("feltTableR", (20, 10))],
]

# Pieces that stand alone, one cell each.
INTERIOR_SINGLES = [
    ("stove",       (14, 14)),
    ("chairDown",   (0, 2)),     # seat toward you
    ("chairUp",     (1, 2)),     # back toward you
    ("chairRight",  (2, 2)),
    ("chairLeft",   (3, 2)),
    ("tableSquare", (5, 3)),
    ("tableRound",  (7, 0)),
    ("shelfA",      (20, 17)),
    ("shelfB",      (21, 17)),
    ("plantA",      (16, 0)),
    ("plantB",      (17, 0)),
]


def extract(sheet, col, row):
    """Pull one native 16x16 cell out of the 1px-gutter source sheet."""
    sx, sy = col * STRIDE, row * STRIDE
    return sheet.crop((sx, sy, sx + CELL, sy + CELL))


def alpha_bbox(img):
    """(min_x, min_y, max_x, max_y) of non-transparent pixels, or None."""
    px = img.load()
    w, h = img.size
    xs = [x for x in range(w) for y in range(h) if px[x, y][3] > 0]
    ys = [y for y in range(h) for x in range(w) if px[x, y][3] > 0]
    if not xs:
        return None
    return min(xs), min(ys), max(xs), max(ys)


def outline(cell, colour=OUTLINE_COLOUR):
    """Flood a 1px dark border onto every transparent pixel 4-adjacent to an
    opaque one. Working prototype, verified on gravestones 2026-09-07 — used
    as given."""
    w, h = cell.size
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    px = cell.load()
    op = [[px[x, y][3] > 0 for y in range(h)] for x in range(w)]
    out.paste(cell, (0, 0))
    o = out.load()
    for x in range(w):
        for y in range(h):
            if op[x][y]:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and op[nx][ny]:
                    o[x, y] = colour
                    break
    return out


def inset_for_outline(img):
    """Guarantee >=1px of transparent margin on every side before outlining,
    so the outline stroke always has somewhere to go. Returns (outlined,
    method):
      'clean'   — already had margin on all four sides.
      'shifted' — margin existed OPPOSITE the touching side(s); a lossless
                   1px translation freed them, no resampling.
      'shrunk'  — flush against BOTH edges of the same axis (e.g. top and
                   bottom both at zero margin) — no translation can free one
                   side without cropping real silhouette pixels off the
                   other, so the whole image is shrunk ~1px per side
                   (nearest-neighbor, nothing cropped) to manufacture margin.
    """
    w, h = img.size
    bb = alpha_bbox(img)
    if bb is None:
        return outline(img), 'clean'  # fully transparent cell — nothing to inset
    min_x, min_y, max_x, max_y = bb
    touch_l, touch_r = min_x == 0, max_x == w - 1
    touch_t, touch_b = min_y == 0, max_y == h - 1

    if not (touch_l or touch_r or touch_t or touch_b):
        return outline(img), 'clean'

    if (touch_l and touch_r) or (touch_t and touch_b):
        shrunk = img.resize((w - 2, h - 2), Image.NEAREST)
        padded = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        padded.paste(shrunk, (1, 1), shrunk)
        return outline(padded), 'shrunk'

    dx = 1 if touch_l else (-1 if touch_r else 0)
    dy = 1 if touch_t else (-1 if touch_b else 0)
    shifted = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    shifted.paste(img, (dx, dy), img)
    return outline(shifted), 'shifted'


def build():
    sheet = Image.open(SRC).convert('RGBA')

    columns = []  # (name, PIL.Image 16x16) in final packed order
    report = {'clean': [], 'shifted': [], 'shrunk': []}

    for name, (col, row) in GRAVESTONES:
        result, method = inset_for_outline(extract(sheet, col, row))
        columns.append((name, result))
        report[method].append(name)

    for tent_name, (tl, tr, bl, br) in CIRCUS_TENTS:
        assembled = Image.new('RGBA', (CELL * 2, CELL * 2), (0, 0, 0, 0))
        assembled.paste(extract(sheet, *tl), (0, 0))
        assembled.paste(extract(sheet, *tr), (CELL, 0))
        assembled.paste(extract(sheet, *bl), (0, CELL))
        assembled.paste(extract(sheet, *br), (CELL, CELL))
        result, method = inset_for_outline(assembled)
        report[method].append(tent_name)
        for suffix, (qx, qy) in zip(("TL", "TR", "BL", "BR"),
                                     ((0, 0), (CELL, 0), (0, CELL), (CELL, CELL))):
            columns.append((tent_name + suffix, result.crop((qx, qy, qx + CELL, qy + CELL))))

    floor_names = []
    for name, (col, row) in FLOOR:
        columns.append((name, extract(sheet, col, row)))
        floor_names.append(name)

    gateway_names = []
    for gate_name, pieces in GATEWAYS:
        strip = Image.new('RGBA', (CELL * len(pieces), CELL), (0, 0, 0, 0))
        for i, (col, row) in enumerate(pieces):
            strip.paste(extract(sheet, col, row), (CELL * i, 0))
        strip = outline(strip)
        for suffix, i in zip(("L", "R"), range(len(pieces))):
            columns.append((gate_name + suffix, strip.crop((CELL * i, 0, CELL * (i + 1), CELL))))
        gateway_names.append(gate_name)

    atlas = Image.new('RGBA', (CELL * len(columns), CELL), (0, 0, 0, 0))
    for i, (_, img) in enumerate(columns):
        atlas.paste(img, (i * CELL, 0))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(OUT)

    names = [n for n, _ in columns]
    print(f"wrote {OUT} ({atlas.width}x{atlas.height}, {len(columns)} cells)")
    print("order:", ", ".join(names))
    print()
    print("-- edge-clipping report (measured, not eyeballed) --")
    print(f"clean, no inset needed:        {report['clean']}")
    print(f"shifted 1px, lossless:         {report['shifted']}")
    print(f"shrunk ~1px inset, no crop:    {report['shrunk']}")
    print(f"not outlined, tileable floor:  {floor_names}")
    print(f"outlined in place, no inset:   {gateway_names}")


def outline_to_edge(img, colour=INTERIOR_INK):
    """The interior outline. Like outline(), every transparent pixel 4-adjacent
    to an opaque one is inked. Furniture is mostly full-bleed, though: where the
    silhouette runs into the image edge there is no transparent pixel outside it
    to ink, so the silhouette's own pixels on that edge are inked instead —
    Kenney's dark brown border, recoloured. The piece keeps its size; nothing
    is shrunk or cropped (inset_for_outline's shrink would squash a strip of
    cells unevenly)."""
    w, h = img.size
    px = img.load()
    op = [[px[x, y][3] > 0 for y in range(h)] for x in range(w)]
    out = img.copy()
    o = out.load()
    for x in range(w):
        for y in range(h):
            if op[x][y]:
                if x == 0 or y == 0 or x == w - 1 or y == h - 1:
                    o[x, y] = colour
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and op[nx][ny]:
                    o[x, y] = colour
                    break
    return out


def build_interior(src=INTERIOR_SRC):
    sheet = Image.open(src).convert('RGBA')
    columns = []

    for run in INTERIOR_RUNS:
        strip = Image.new('RGBA', (CELL * len(run), CELL), (0, 0, 0, 0))
        for i, (_, (col, row)) in enumerate(run):
            strip.paste(extract(sheet, col, row), (CELL * i, 0))
        strip = outline_to_edge(strip)
        for i, (name, _) in enumerate(run):
            columns.append((name, strip.crop((CELL * i, 0, CELL * (i + 1), CELL))))

    for name, (col, row) in INTERIOR_SINGLES:
        columns.append((name, outline_to_edge(extract(sheet, col, row))))

    atlas = Image.new('RGBA', (CELL * len(columns), CELL), (0, 0, 0, 0))
    for i, (_, img) in enumerate(columns):
        atlas.paste(img, (i * CELL, 0))
    INTERIOR_OUT.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(INTERIOR_OUT)

    print(f"wrote {INTERIOR_OUT} ({atlas.width}x{atlas.height}, {len(columns)} cells)")
    print("order:", ", ".join(n for n, _ in columns))


if __name__ == '__main__':
    args = sys.argv[1:]
    what = args[0] if args and not args[0].startswith('--') else 'all'
    src = Path(args[args.index('--src') + 1]) if '--src' in args else INTERIOR_SRC
    if what in ('all', 'floors'):
        build()
    if what in ('all', 'interior'):
        if src.exists():
            build_interior(src)
        else:
            print(f"skipped the interior sheet: {src} not found (pass --src PATH)")
