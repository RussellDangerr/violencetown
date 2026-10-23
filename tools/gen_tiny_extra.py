"""Generate game/assets-placeholder/kenney/tinyExtra_packed.png.

Icons and tiles the Kenney Tiny packs almost have, derived from their cells
(CC0, like the packs). A 16-px strip, one cell each, in this order:

    0  rock          tinyDungeon (0,2) with its maroon ground keyed out, so the
                     stones sit on the floor instead of a square of dirt
    1  sludge_brain  tinyDungeon (6,10), the green vial, recoloured to sludge
    2  sludge_sack   tinyTown (10,8), the bedroll/pouch, recoloured to sludge
    3  fire_blood    tinyDungeon (7,9), the red bottle, recoloured to fire orange
                     (the red bottle itself stays the bandage)
    4  goo vat       tinyDungeon (8,2) with the dungeon-floor orange keyed out, so
                     the factory floor shows around it instead of orange strips

Run from the repo root:  python tools/gen_tiny_extra.py
"""
import colorsys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
K = ROOT / 'game' / 'assets-placeholder' / 'kenney'
TD = Image.open(K / 'tiny' / 'dungeon' / 'tinyDungeon_packed.png').convert('RGBA')
TT = Image.open(K / 'tiny' / 'town' / 'tinyTown_packed.png').convert('RGBA')


def cell(sheet, col, row):
    return sheet.crop((col * 16, row * 16, col * 16 + 16, row * 16 + 16))


def key_out(im, rgb):
    """Make every pixel of exactly `rgb` transparent."""
    out = im.copy()
    px = out.load()
    for y in range(16):
        for x in range(16):
            r, g, b, a = px[x, y]
            if a and (r, g, b) == rgb:
                px[x, y] = (0, 0, 0, 0)
    return out


def most_common(im):
    counts = {}
    for p in im.get_flattened_data():
        if p[3]:
            counts[p[:3]] = counts.get(p[:3], 0) + 1
    return max(counts, key=counts.get)


def recolour(im, pick, hue):
    """Shift the hue of every pixel `pick(h, s, v)` accepts to `hue` (0-1),
    keeping its lightness, so the shading survives."""
    out = im.copy()
    px = out.load()
    for y in range(16):
        for x in range(16):
            r, g, b, a = px[x, y]
            if not a:
                continue
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if pick(h, s, v):
                nr, ng, nb = colorsys.hsv_to_rgb(hue, max(s, 0.35), v)
                px[x, y] = (round(nr * 255), round(ng * 255), round(nb * 255), a)
    return out


SLUDGE_HUE = 0.78   # the sludge purple of the damage type (#9a52c8)

rock_src = cell(TD, 0, 2)
rock = key_out(rock_src, most_common(rock_src))
brain = recolour(cell(TD, 6, 10), lambda h, s, v: 0.2 < h < 0.5 and s > 0.25, SLUDGE_HUE)
sack = recolour(cell(TT, 10, 8), lambda h, s, v: (h < 0.15 or h > 0.95) and s > 0.25 and v > 0.3, SLUDGE_HUE)

fire = recolour(cell(TD, 7, 9), lambda h, s, v: (h < 0.06 or h > 0.94) and s > 0.3, 0.075)

goo = key_out(cell(TD, 8, 2), (234, 165, 108))

strip = Image.new('RGBA', (16 * 5, 16), (0, 0, 0, 0))
for i, im in enumerate([rock, brain, sack, fire, goo]):
    strip.alpha_composite(im, (i * 16, 0))
out = K / 'tinyExtra_packed.png'
strip.save(out)
print('wrote', out.relative_to(ROOT), strip.size)
