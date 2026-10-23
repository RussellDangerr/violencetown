#!/usr/bin/env python3
"""Generate game/assets-placeholder/kenney/ratVariants_packed.png.

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

The tool refuses to run if the base cell ever has any other colour, or loses
one of these, since an exact swap would then silently miss pixels.

Output: one packed (gutter-free) row of 16x16 cells, one per variant, in the
order of VARIANTS below. The column order is printed on every run. Kenney Tiny
is CC0, and so are the cells derived from it.

Run from the repo root (needs Pillow):
    python tools/gen_recolor.py           # write the sheet
    python tools/gen_recolor.py --check   # exit 1 if the sheet on disk differs
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


def base_cell():
    sheet = Image.open(SRC).convert('RGBA')
    col, row = BASE_CELL
    cell = sheet.crop((col * CELL, row * CELL, col * CELL + CELL, row * CELL + CELL))
    seen = {p[:3] for p in cell.get_flattened_data() if p[3]}
    if seen != {OUTLINE, SHADE, LIGHT, EYE}:
        sys.exit(f'base cell {BASE_CELL} has colours {sorted(seen)}, not the four this tool swaps')
    return cell


def recolour(cell, shade, light, eye):
    """Swap SHADE, LIGHT and EYE for the given colours, exactly. Alpha and
    every other colour (the outline) are left as they are."""
    for c in (shade, light, eye):
        if c == OUTLINE:
            sys.exit(f'{c} is the outline colour; a variant would lose its outline')
    if len({shade, light, eye}) != 3:
        sys.exit(f'{shade} {light} {eye}: a variant needs three different colours')
    swap = {SHADE: shade, LIGHT: light, EYE: eye}
    out = cell.copy()
    px = out.load()
    for y in range(CELL):
        for x in range(CELL):
            r, g, b, a = px[x, y]
            if a and (r, g, b) in swap:
                px[x, y] = (*swap[(r, g, b)], a)
    return out


def build():
    base = base_cell()
    strip = Image.new('RGBA', (CELL * len(VARIANTS), CELL), (0, 0, 0, 0))
    for i, (_name, shade, light, eye) in enumerate(VARIANTS):
        strip.paste(recolour(base, shade, light, eye), (i * CELL, 0))
    buf = io.BytesIO()
    strip.save(buf, format='PNG')
    return strip, buf.getvalue()


def main():
    strip, data = build()
    rel = OUT.relative_to(ROOT).as_posix()
    if '--check' in sys.argv[1:]:
        if not OUT.exists() or OUT.read_bytes() != data:
            print(f'{rel} is out of date: run python tools/gen_recolor.py')
            sys.exit(1)
        print(f'{rel} matches')
        return
    OUT.write_bytes(data)
    print('wrote', rel, strip.size)
    print('column order:')
    for i, (name, *_rest) in enumerate(VARIANTS):
        print(f'  {i}  {name}')


if __name__ == '__main__':
    main()
