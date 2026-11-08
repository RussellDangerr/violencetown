"""Generate game/assets-placeholder/ice_cone.png, the Tiger's Blood Ice Cone.

The picture starts from Kenney's Tiny Ski snowy pine (tile_0030, the packed
sheet's cell (6,2); CC0 1.0). Its top half, rows 0-7, is kept and mirrored
below its widest row, giving a 16x15 double point. The outline is redrawn one
pixel wide in the Tiny plum, and the inside is repainted from PAINT: red syrup
on the top tip fading to white ice, a band where the sleeve meets the ice, and
the mirrored bottom as a paper sleeve with a darker fold line. Every colour
already appears in the Tiny packs.

The pine's pixels are carried inline (PINE), so this runs without the Kenney
library. When the library copy is present it is checked against PINE first.

Run from the repo root:  python tools/gen_ice_cone.py
"""
import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'game' / 'assets-placeholder' / 'ice_cone.png'
LIBRARY_PINE = Path(r'C:\Users\caela\OneDrive\Assets\Kenney\2D assets\Tiny Ski\Tiles\tile_0030.png')

# Tiny Ski tile_0030, one letter per colour, '.' transparent.
PINE = [
    '......AAAA......',
    '.....AAAAAA.....',
    '....AAABBAAA....',
    '....AABBBBAA....',
    '...AAABCCBAAA...',
    '...AABCCCCBAA...',
    '...AACDCCCCAA...',
    '..AAACCCBBCAAA..',
    '..AABCCCBBCBAA..',
    '..AADCCCCCCDAA..',
    '..AADDCCCCDDAA..',
    '..AADDDDDDDDAA..',
    '..AADCDDDDBDAA..',
    '..AADDDDDDDDAA..',
    '..AAADDDDDDAAA..',
    '...AAAAEEAAAA...',
]
PINE_COLOURS = {
    'A': (63, 38, 49),
    'B': (235, 243, 246),
    'C': (132, 198, 105),
    'D': (71, 159, 74),
    'E': (189, 108, 74),
}

KEEP_ROWS = 8          # the pine's rows 0-7; row 7 is its widest, the mirror line
TOP = 1                # the cone's first row in the 16x16 cell (bottom-aligned)

OUTLINE = (63, 38, 49)  # the Tiny packs' plum

# The inside of each cone row, left to right. Its length is fixed by the
# silhouette; the outline pixels are not listed.
COLOURS = {
    'R': (195, 75, 53),    # syrup, shade
    'r': (232, 69, 55),    # syrup
    'p': (255, 112, 109),  # syrup thinning into the ice
    'w': (238, 248, 254),  # ice
    'i': (207, 231, 247),  # ice, shade
    'b': (189, 108, 74),   # the band where the sleeve meets the ice
    's': (247, 194, 130),  # paper sleeve
    'f': (234, 165, 108),  # the sleeve's fold line
}
PAINT = [
    '',            # row 0: outline only
    'prrr',
    'prrrrR',
    'rrrrrR',
    'wprrprRp',
    'wwpwpwpi',
    'wwwwwwii',
    'bbbbbbbbbb',  # the widest row
    'ssfsssss',
    'sssfssss',
    'sssfssss',
    'ssfsss',
    'sssfss',
    'ssfs',
    '',            # row 14: outline only
]


def check_library():
    """Fail loudly if the Kenney copy exists and disagrees with PINE."""
    if not LIBRARY_PINE.exists():
        print(f'note: {LIBRARY_PINE} not found; using the inline pine')
        return
    im = Image.open(LIBRARY_PINE).convert('RGBA')
    for y, row in enumerate(PINE):
        for x, ch in enumerate(row):
            r, g, b, a = im.getpixel((x, y))
            want = None if ch == '.' else PINE_COLOURS[ch]
            got = None if a == 0 else (r, g, b)
            if want != got:
                sys.exit(f'PINE disagrees with {LIBRARY_PINE} at ({x},{y}): {want} vs {got}')


def extents(row):
    """First and last filled column of a grid row."""
    filled = [x for x, ch in enumerate(row) if ch != '.']
    return filled[0], filled[-1]


def silhouette():
    """The cone's (left, right) for each of its 15 rows: the pine's top half,
    then the same rows mirrored below the widest one."""
    top = [extents(PINE[y]) for y in range(KEEP_ROWS)]
    return top + top[-2::-1]


def build():
    rows = silhouette()
    assert len(rows) == len(PAINT) == 15
    inside = lambda y, x: 0 <= y < len(rows) and rows[y][0] <= x <= rows[y][1]
    im = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    px = im.load()
    for y, (left, right) in enumerate(rows):
        fill = [x for x in range(left, right + 1)
                if all(inside(y + dy, x + dx) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))]
        if len(fill) != len(PAINT[y]) or (fill and fill != list(range(fill[0], fill[-1] + 1))):
            sys.exit(f'PAINT row {y} has {len(PAINT[y])} pixels; the inside is {len(fill)}')
        for x in range(left, right + 1):
            if x in fill:
                px[x, TOP + y] = COLOURS[PAINT[y][x - fill[0]]] + (255,)
            else:
                px[x, TOP + y] = OUTLINE + (255,)
    return im


if __name__ == '__main__':
    check_library()
    build().save(OUT)
    print(f'wrote {OUT.relative_to(ROOT)}')
