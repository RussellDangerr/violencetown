#!/usr/bin/env python3
"""Generate game/assets/ant.png, the ants' art (plans/an4-ants-pico-mite-art.md).

The picture starts from the Pico-8 Platformer mite: Kenney's Pico-8 Platformer
(CC0 1.0), the small red walker at cell (0,6) of its packed 8x8 sheet. It is
reshaped a little and recoloured:

  * the body is three dots in a line (head, thorax, abdomen), with three legs a
    side, one beside each dot;
  * every pixel is the Tiny packs' outline colour (TINY_INK in sprites.js), so
    the ants sit in the world the way the Tiny sprites' own ink does;
  * two or three mites fill one 16x16 cell, in different directions, so a single
    ant reads as a crowd on its tile. The mite's 8px grid is the measure: each
    reshaped mite is 6x8 pixels (8x6 turned sideways), the mite's own 8px grid.

The sheet is one row of four cells, left to right: three mites, two mites,
three mites, two mites. The game gives each ant one of them by its id
(ENEMY_SPRITES['Ant'].variants in sprites.js).

The mite's mask is carried inline (MITE), so this runs without the Kenney
library. When the library copy is present it is checked against MITE first.

Run from the repo root:
    python tools/gen_ant.py           # write the sheet
    python tools/gen_ant.py --check   # exit 1 if the sheet on disk differs
"""
import io
import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'game' / 'assets' / 'ant.png'
LIBRARY_SHEETS = [
    Path(r'C:\Code\assets\kenney\2D assets\Pico-8 Platformer\Transparent\Tilemap\tilemap_packed.png'),
    Path(r'C:\Users\caela\OneDrive\Assets\Kenney\2D assets\Pico-8 Platformer\Transparent\Tilemap\tilemap_packed.png'),
]
MITE_CELL = (0, 6)     # (col, row) in the packed sheet, 8x8 cells

INK = (63, 38, 49, 255)   # the Tiny packs' outline plum
CELL = 16

# The Pico-8 mite, 8x8, '#' opaque. Its body, its two feet and its side feet.
MITE = [
    '........',
    '.##..##.',
    '.######.',
    '.######.',
    '.######.',
    '.######.',
    '#.####.#',
    '..#..#..',
]

# The reshaped mite, head up, 6 wide and 8 tall: three dots (head, thorax,
# abdomen), each a 2x2 blob with a gap between, and three legs a side, one beside
# each dot: the front pair reaching forward, the middle pair straight out, the
# rear pair trailing back.
UP = [
    '#.##.#',
    '.####.',
    '......',
    '..##..',
    '######',
    '......',
    '.####.',
    '#.##.#',
]
# Turned a quarter to walk sideways: 8 wide and 6 tall.
SIDE = [''.join(UP[y][x] for y in range(len(UP))) for x in range(len(UP[0]))]


def flip(rows):
    return [r[::-1] for r in rows]


def upside(rows):
    return rows[::-1]


# One entry per cell: (pattern, x, y) for each mite, placed by hand so none touch.
CELLS = [
    [(UP, 1, 0), (upside(UP), 8, 1), (SIDE, 4, 10)],
    [(SIDE, 1, 1), (UP, 9, 8)],
    [(SIDE, 1, 0), (flip(SIDE), 8, 7), (upside(UP), 1, 8)],
    [(UP, 2, 3), (upside(UP), 9, 6)],
]


def check_library():
    """Fail loudly if the Kenney copy exists and disagrees with MITE."""
    for path in LIBRARY_SHEETS:
        if not path.exists():
            continue
        im = Image.open(path).convert('RGBA')
        ox, oy = MITE_CELL[0] * 8, MITE_CELL[1] * 8
        for y, row in enumerate(MITE):
            for x, ch in enumerate(row):
                opaque = im.getpixel((ox + x, oy + y))[3] > 0
                if opaque != (ch == '#'):
                    sys.exit(f'MITE disagrees with {path} at ({x},{y})')
        return
    print('note: the Pico-8 Platformer sheet not found; using the inline mite')


def mites_in(cell):
    return len(CELLS[cell])


def build():
    im = Image.new('RGBA', (CELL * len(CELLS), CELL), (0, 0, 0, 0))
    px = im.load()
    for c, mites in enumerate(CELLS):
        for pattern, ox, oy in mites:
            for y, row in enumerate(pattern):
                for x, ch in enumerate(row):
                    if ch != '#':
                        continue
                    gx, gy = ox + x, oy + y
                    if not (0 <= gx < CELL and 0 <= gy < CELL):
                        sys.exit(f'cell {c}: a mite leaves the cell at ({gx},{gy})')
                    px[c * CELL + gx, gy] = INK
        # No two mites may touch, even corner to corner, or they read as one.
        spots = [(set(), pattern, ox, oy) for pattern, ox, oy in mites]
        for s, pattern, ox, oy in spots:
            for y, row in enumerate(pattern):
                for x, ch in enumerate(row):
                    if ch == '#':
                        s.add((ox + x, oy + y))
        for i in range(len(spots)):
            for j in range(i + 1, len(spots)):
                for (ax, ay) in spots[i][0]:
                    for (bx, by) in spots[j][0]:
                        if abs(ax - bx) <= 1 and abs(ay - by) <= 1:
                            sys.exit(f'cell {c}: mites {i} and {j} touch at ({ax},{ay})')
    return im


def png_bytes(im):
    buf = io.BytesIO()
    im.save(buf, 'PNG')
    return buf.getvalue()


if __name__ == '__main__':
    check_library()
    sheet = build()
    if '--check' in sys.argv:
        same = OUT.exists() and Image.open(OUT).convert('RGBA').tobytes() == sheet.tobytes()
        if not same:
            sys.exit(f'{OUT.relative_to(ROOT)} differs from the generator; run tools/gen_ant.py')
        print('ok')
    else:
        OUT.parent.mkdir(parents=True, exist_ok=True)
        sheet.save(OUT)
        print(f'wrote {OUT.relative_to(ROOT)} ({len(CELLS)} cells: '
              + ', '.join(f'{mites_in(i)} mites' for i in range(len(CELLS))) + ')')
