#!/usr/bin/env python3
"""Generate game/assets-placeholder/kenney/ratVariants_packed.png and
beastVariants_packed.png.

One base cell in, tinted variants out. Enemy variants are a palette, not new
art: the base sprite's body and eye colours are swapped, exactly, for the ones
a variant names. Nothing else is touched, so every variant keeps the base
cell's outline colour (the Tiny packs' plum ink, TINY_INK in sprites.js) and
its exact silhouette. Same spirit as gen_outlined_sheet.py ("generate, don't
reject") and gen_tiny_extra.py's recolour(), but by exact colour, not by hue
range, so no shading pixel can be caught by mistake.

The base is the Tiny Dungeon rat, cell (3,10). It has exactly four colours:

    outline  (63, 38, 49)    123 px, the outline and the tail; never swapped
    shade    (189, 108, 74)   37 px, the body's darker tone
    light    (234, 165, 108)  30 px, the body's lighter tone
    eye      (192, 203, 220)   2 px

The second base is the Tiny Dungeon grey beast, cell (4,10): the rat's own
silhouette in grey, with an orange tail. It also has exactly four colours:

    outline  (63, 38, 49)    123 px, never swapped
    shade    (139, 155, 180)  37 px, the body's darker grey
    light    (192, 203, 220)  21 px, the body's lighter grey
    tail     (234, 165, 108)  11 px, never swapped

Only its two greys are swapped (BEAST_VARIANTS). Lire, the lion the Lion
Whip's "Hire Lire" trick summons, is its tawny column.

The tool refuses to run if a base cell ever has any other colour, or loses
one of these, since an exact swap would then silently miss pixels.

Output: one packed (gutter-free) row of 16x16 cells per sheet, one per variant,
in the order of VARIANTS and BEAST_VARIANTS below. The column order is printed
on every run. Kenney Tiny Dungeon is CC0, and so are the cells derived from it.

Run from the repo root (needs Pillow):
    python tools/gen_recolor.py           # write both sheets
    python tools/gen_recolor.py --check   # exit 1 if a sheet on disk differs
"""
import io
import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
K = ROOT / 'game' / 'assets-placeholder' / 'kenney'
SRC = K / 'tiny' / 'dungeon' / 'tinyDungeon_packed.png'
OUT = K / 'ratVariants_packed.png'

CELL = 16
BASE_CELL = (3, 10)   # (col, row) in tinyDungeon_packed.png

OUTLINE = (63, 38, 49)
SHADE = (189, 108, 74)
LIGHT = (234, 165, 108)
EYE = (192, 203, 220)

# One row per variant: name, then what SHADE, LIGHT and EYE become.
# The first three are the Carnival rats. Sludge's shade is the sludge items'
# purple (#9a52c8, hue 0.78, SLUDGE_HUE in gen_tiny_extra.py).
VARIANTS = [
    ('birthday', (209, 105, 148), (250, 165, 201), (192, 203, 220)),
    ('sludge',   (154, 82, 200),  (200, 133, 242), (192, 203, 220)),
    ('robot',    (123, 132, 140), (178, 186, 194), (224, 52, 52)),
    ('undead',   (116, 140, 101), (163, 189, 147), (192, 203, 220)),
    ('frost',    (142, 193, 209), (212, 241, 250), (40, 90, 160)),
    ('pouch',    (184, 153, 106), (230, 206, 161), (192, 203, 220)),
]

BEAST_CELL = (4, 10)   # (col, row) in tinyDungeon_packed.png
BEAST_OUT = K / 'beastVariants_packed.png'

BEAST_SHADE = (139, 155, 180)
BEAST_LIGHT = (192, 203, 220)
BEAST_TAIL = (234, 165, 108)

# One row per variant: name, then what BEAST_SHADE and BEAST_LIGHT become.
# tawny is Lire.
BEAST_VARIANTS = [
    ('tawny', (193, 154, 107), (232, 203, 150)),
]


def base_cell(at, colours):
    """The 16x16 cell at (col, row) of the Tiny Dungeon sheet, refused unless
    its opaque pixels use exactly `colours`."""
    sheet = Image.open(SRC).convert('RGBA')
    col, row = at
    cell = sheet.crop((col * CELL, row * CELL, col * CELL + CELL, row * CELL + CELL))
    seen = {p[:3] for p in cell.get_flattened_data() if p[3]}
    if seen != set(colours):
        sys.exit(f'base cell {at} has colours {sorted(seen)}, not the four this tool swaps around')
    return cell


def recolour(cell, swap, kept):
    """Swap each colour in `swap` for its new one, exactly. Alpha and every
    other colour (the `kept` ones: the outline, the beast's tail) are left as
    they are."""
    new = list(swap.values())
    for c in new:
        if c in kept:
            sys.exit(f'{c} is a kept colour; a variant would lose it into its body')
    if len(set(new)) != len(new):
        sys.exit(f'{new}: a variant needs {len(new)} different colours')
    out = cell.copy()
    px = out.load()
    for y in range(CELL):
        for x in range(CELL):
            r, g, b, a = px[x, y]
            if a and (r, g, b) in swap:
                px[x, y] = (*swap[(r, g, b)], a)
    return out


def strip_png(cells):
    strip = Image.new('RGBA', (CELL * len(cells), CELL), (0, 0, 0, 0))
    for i, cell in enumerate(cells):
        strip.paste(cell, (i * CELL, 0))
    buf = io.BytesIO()
    strip.save(buf, format='PNG')
    return strip, buf.getvalue()


def build():
    base = base_cell(BASE_CELL, (OUTLINE, SHADE, LIGHT, EYE))
    return strip_png([recolour(base, {SHADE: shade, LIGHT: light, EYE: eye}, (OUTLINE,))
                      for _name, shade, light, eye in VARIANTS])


def build_beast():
    base = base_cell(BEAST_CELL, (OUTLINE, BEAST_SHADE, BEAST_LIGHT, BEAST_TAIL))
    return strip_png([recolour(base, {BEAST_SHADE: shade, BEAST_LIGHT: light}, (OUTLINE, BEAST_TAIL))
                      for _name, shade, light in BEAST_VARIANTS])


def main():
    check = '--check' in sys.argv[1:]
    stale = False
    for out, (strip, data), variants in ((OUT, build(), VARIANTS), (BEAST_OUT, build_beast(), BEAST_VARIANTS)):
        rel = out.relative_to(ROOT).as_posix()
        if check:
            if not out.exists() or out.read_bytes() != data:
                print(f'{rel} is out of date: run python tools/gen_recolor.py')
                stale = True
            else:
                print(f'{rel} matches')
            continue
        out.write_bytes(data)
        print('wrote', rel, strip.size)
        print('column order:')
        for i, (name, *_rest) in enumerate(variants):
            print(f'  {i}  {name}')
    if stale:
        sys.exit(1)


if __name__ == '__main__':
    main()
