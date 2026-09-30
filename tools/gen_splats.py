"""
Generate the hit-splat badge atlas: one pixel silhouette per damage type, so a
hit's TYPE reads from its shape before its colour (plans/hit-splat-art.md §10).

  Output: game/assets/ui_splats.png  (COLS*CELL_W x ROWS*CELL_H RGBA)

Rows = damage types, in TYPES order — game/sprites.js SPLAT_ROWS must match
(tests/splat-sheet.test.js pins it). Columns = the number's length, 1..4
characters, then the same four again with a gold outline for a crit:

    col 0-3: 1, 2, 3, 4 characters      col 4-7: the crit versions

Every shape is a BODY the digits sit in (a pill 12px tall, as wide as the
number plus 3px each end — game/splat-layout.js splatPill) plus a decoration
that gives the type its silhouette. The body is centred in the cell, so the
renderer draws every cell the same way.

    physical  a jagged burst        fire    flames licking up off the top
    sludge    drips hanging below   cold    a pointed ice crystal
    poison    bubbles rising        energy  a sharp-cornered zap with a bolt
    heal      a heart

All our own art — nothing from a pack. (The Kenney 1-Bit heart the plan named
is a fixed 16px and cannot hold a three-character heal, so the heart is drawn
here, sized to the number like the rest.)

Fill colours are read from game/renderer.js SPLAT_COLOR, the one place they
are defined; a type with no colour there (energy, until ruling EC) takes
physical's, exactly as the renderer's own fallback does.

Run (needs Pillow):
    python tools/gen_splats.py
"""
import math
import os
import re
from PIL import Image, ImageDraw

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), ".."))
RENDERER = os.path.join(ROOT, "game", "renderer.js")
OUT = os.path.join(ROOT, "game", "assets", "ui_splats.png")

TYPES = ["physical", "sludge", "poison", "fire", "cold", "energy", "heal"]
BODY_W = [12, 16, 20, 26]      # by character count 1..4: round(n * 4.8) + 6, never under BODY_H
BODY_H = 12
CELL_W, CELL_H = 40, 30
CX, CY = CELL_W // 2, CELL_H // 2
GOLD = (240, 215, 130)         # the crit outline — renderer's old gold border, #f0d782


def splat_colors():
    src = open(RENDERER, encoding="utf-8").read()
    block = re.search(r"const SPLAT_COLOR = \{(.*?)\};", src, re.S)
    if not block:
        raise SystemExit("SPLAT_COLOR not found in game/renderer.js")
    found = dict(re.findall(r"(\w+):\s*'#([0-9a-fA-F]{6})'", block.group(1)))
    if "physical" not in found:
        raise SystemExit("SPLAT_COLOR has no physical colour")
    rgb = lambda h: tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))
    return {t: rgb(found.get(t, found["physical"])) for t in TYPES}


def shade(c, k):
    return tuple(max(0, min(255, round(v * k))) for v in c)


# ── Shapes: each draws white onto an 'L' mask; (x0, y0, x1, y1) is the body ────

def body_box(bw):
    x0 = CX - bw // 2
    y0 = CY - BODY_H // 2
    return x0, y0, x0 + bw - 1, y0 + BODY_H - 1


def pill(d, box, r=5):
    d.rounded_rectangle(box, radius=r, fill=255)


def physical(d, box, bw):
    # A burst: spikes alternate out and in around the body, unevenly, like a splat.
    a, b = bw / 2, BODY_H / 2
    spikes = 8 + 2 * (BODY_W.index(bw))
    jitter = [3, 2, 4, 2, 3, 4, 2, 3, 2, 4, 3, 2, 4, 3]
    pts = []
    for i in range(spikes * 2):
        ang = math.pi * i / spikes - math.pi / 2
        out = jitter[(i // 2) % len(jitter)] if i % 2 == 0 else 0
        rx, ry = a + out, b + out
        pts.append((CX - 0.5 + rx * math.cos(ang), CY - 0.5 + ry * math.sin(ang)))
    d.polygon(pts, fill=255)
    pill(d, box, r=4)               # the body stays whole under the spikes


def sludge(d, box, bw):
    x0, y0, x1, y1 = box
    pill(d, box)
    drips = [(0.30, 5), (0.72, 3)] if bw <= 12 else [(0.20, 4), (0.52, 6), (0.80, 3)]
    for frac, length in drips:
        x = x0 + round(frac * (bw - 1))
        d.rectangle((x - 1, y1 - 2, x + 1, y1 + length - 1), fill=255)
        d.point((x, y1 + length), fill=255)          # a rounded tip


def poison(d, box, bw):
    x0, y0, x1, y1 = box
    pill(d, box)
    d.ellipse((x1 - 5, y0 - 6, x1 - 1, y0 - 2), fill=255)     # a bubble...
    d.rectangle((x1 - 9, y0 - 8, x1 - 8, y0 - 7), fill=255)   # ...and a smaller one higher
    if bw > 12:
        d.ellipse((x0 + 2, y0 - 4, x0 + 5, y0 - 1), fill=255)


def fire(d, box, bw):
    x0, y0, x1, y1 = box
    pill(d, box)
    tongues = [(0.30, 6), (0.72, 4)] if bw <= 12 else [(0.16, 4), (0.46, 7), (0.78, 5)]
    for frac, h in tongues:
        x = x0 + round(frac * (bw - 1))
        # A tongue leaning right: wide at the body, a point up top.
        d.polygon([(x - 3, y0 + 2), (x + 3, y0 + 2), (x + 3, y0 - h + 3), (x + 2, y0 - h)], fill=255)


def cold(d, box, bw):
    x0, y0, x1, y1 = box
    # A crystal: the body's ends come to points, with a facet spike top and bottom.
    d.polygon([(x0 - 4, CY - 0.5), (x0 + 2, y0), (x1 - 2, y0), (x1 + 4, CY - 0.5), (x1 - 2, y1), (x0 + 2, y1)], fill=255)
    d.polygon([(CX - 3, y0), (CX - 0.5, y0 - 4), (CX + 2, y0)], fill=255)
    d.polygon([(CX - 3, y1), (CX - 0.5, y1 + 4), (CX + 2, y1)], fill=255)


def energy(d, box, bw):
    x0, y0, x1, y1 = box
    d.rectangle(box, fill=255)                                   # hard corners, no rounding
    d.polygon([(x1 - 5, y0), (x1 + 4, y0 - 5), (x1, y0 + 3)], fill=255)   # a bolt up and out...
    d.polygon([(x0 + 5, y1), (x0 - 4, y1 + 5), (x0, y1 - 3)], fill=255)   # ...and down and out
    for k in range(3):                                           # saw-toothed ends
        y = y0 + 1 + k * 4
        d.polygon([(x1, y), (x1 + 2, y + 1), (x1, y + 3)], fill=255)
        d.polygon([(x0, y), (x0 - 2, y + 1), (x0, y + 3)], fill=255)


def heal(d, box, bw):
    x0, y0, x1, y1 = box
    hw = bw // 2 + 2
    # Two lobes over a point, wide enough that the number sits inside.
    d.ellipse((CX - hw, y0 - 3, CX - 1, y0 + 8), fill=255)
    d.ellipse((CX, y0 - 3, CX + hw - 1, y0 + 8), fill=255)
    d.polygon([(CX - hw, y0 + 3), (CX + hw - 1, y0 + 3), (CX, y1 + 7), (CX - 1, y1 + 7)], fill=255)


SHAPES = dict(physical=physical, sludge=sludge, poison=poison, fire=fire, cold=cold, energy=energy, heal=heal)


def cell(kind, bw, fill, crit):
    mask = Image.new("L", (CELL_W, CELL_H), 0)
    SHAPES[kind](ImageDraw.Draw(mask), body_box(bw), bw)
    m = mask.load()
    inside = lambda x, y: 0 <= x < CELL_W and 0 <= y < CELL_H and m[x, y] > 0
    out = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
    px = out.load()
    edge = GOLD if crit else shade(fill, 0.45)
    light = shade(fill, 1.22)
    for y in range(CELL_H):
        for x in range(CELL_W):
            if inside(x, y):
                # A one-pixel highlight along the top edge, as the HP bar has.
                px[x, y] = (light if not inside(x, y - 1) else fill) + (255,)
            elif any(inside(x + dx, y + dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1)):
                px[x, y] = edge + (255,)            # the outline, outside the shape
    return out


def main():
    colors = splat_colors()
    sheet = Image.new("RGBA", (CELL_W * len(BODY_W) * 2, CELL_H * len(TYPES)), (0, 0, 0, 0))
    for row, kind in enumerate(TYPES):
        for crit in (False, True):
            for i, bw in enumerate(BODY_W):
                col = i + (len(BODY_W) if crit else 0)
                sheet.paste(cell(kind, bw, colors[kind], crit), (col * CELL_W, row * CELL_H))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    sheet.save(OUT)
    print(f"wrote {os.path.relpath(OUT, ROOT)} ({sheet.size[0]}x{sheet.size[1]}, {len(TYPES)} types)")


if __name__ == "__main__":
    main()
