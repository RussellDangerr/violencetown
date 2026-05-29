#!/usr/bin/env python3
"""Generate a labeled contact sheet from a packed Kenney Tiny tilemap.

Upscales each 16x16 cell by SCALE with a grid + (col,row) label overlay so
sprite coords can be picked precisely without counting pixels. Mirrors the
sprite-picker.html workflow but produces a static, agent-readable PNG.

Usage:
    python tools/gen_contact_sheet.py <packed_png> <out_png> [cols] [rows]

Defaults to the Tiny pack geometry: 12 cols x 11 rows, 16px cells, no gutter.
"""
import sys
from PIL import Image, ImageDraw, ImageFont

CELL = 16
SCALE = 9          # upscale factor per cell
PAD = 2            # padding inside each cell box for the source sprite
LABEL_H = 12       # label strip height above each cell
GUTTER = 0         # packed sheets are gutter-free


def load_font(size):
    for name in ("consola.ttf", "cour.ttf", "DejaVuSansMono.ttf", "arial.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    src_path, out_path = sys.argv[1], sys.argv[2]
    cols = int(sys.argv[3]) if len(sys.argv) > 3 else 12
    rows = int(sys.argv[4]) if len(sys.argv) > 4 else 11

    sheet = Image.open(src_path).convert("RGBA")
    stride = CELL + GUTTER

    cell_px = CELL * SCALE
    box_w = cell_px + PAD * 2
    box_h = cell_px + PAD * 2 + LABEL_H
    out_w = cols * box_w
    out_h = rows * box_h

    out = Image.new("RGBA", (out_w, out_h), (24, 24, 30, 255))
    draw = ImageDraw.Draw(out)
    font = load_font(10)

    # Checkerboard so transparent sprites are visible.
    checker_a = (60, 60, 68, 255)
    checker_b = (44, 44, 52, 255)

    for r in range(rows):
        for c in range(cols):
            sx, sy = c * stride, r * stride
            cell = sheet.crop((sx, sy, sx + CELL, sy + CELL))
            big = cell.resize((cell_px, cell_px), Image.NEAREST)

            bx = c * box_w
            by = r * box_h
            # checkerboard background for the sprite area
            for yy in range(0, cell_px, SCALE):
                for xx in range(0, cell_px, SCALE):
                    fill = checker_a if ((xx // SCALE + yy // SCALE) % 2 == 0) else checker_b
                    draw.rectangle(
                        [bx + PAD + xx, by + LABEL_H + PAD + yy,
                         bx + PAD + xx + SCALE - 1, by + LABEL_H + PAD + yy + SCALE - 1],
                        fill=fill,
                    )
            out.alpha_composite(big, (bx + PAD, by + LABEL_H + PAD))
            # cell border
            draw.rectangle([bx, by, bx + box_w - 1, by + box_h - 1], outline=(90, 90, 100, 255))
            # label "c,r" (col,row) — matches sprites.js {col, row} convention
            draw.text((bx + 3, by + 1), f"{c},{r}", fill=(255, 220, 120, 255), font=font)

    out.convert("RGB").save(out_path)
    print(f"wrote {out_path} ({out_w}x{out_h}) from {src_path} [{cols}x{rows}]")


if __name__ == "__main__":
    main()
