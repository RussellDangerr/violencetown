#!/usr/bin/env python
"""Bake the touch-HUD control sprites from Kenney's CC0 "Mobile Controls" pack.

Source (NOT in the repo — Kenney CC0, lives in Caelan's local asset library):
    C:\\Code\\assets\\kenney\\UI assets\\Mobile Controls\\Sprites
We chose **Style F** (soft shaded) for the controls and the shared **Icons** set.

Each baked output is a single ready-to-use PNG so the DOM buttons need only a
CSS `background-image` — no runtime compositing. The Style F sprites are pale
grey-white; we *multiply* them by the brand gold so the bevel shading survives
while the hue matches the dark/gold chrome. Icons are flattened to dark ink and
centered on the round button so they read at a glance.

Outputs -> game/assets/ui/
    ctrl_dpad.png    128x128  unified cross d-pad (gold)
    ctrl_action.png   64x64   round button + burst icon (action wheel)
    ctrl_menu.png     64x64   round button + hamburger icon

Re-run after changing the tint or swapping the icon. Dev-time only; the PNGs are
committed (CC0), the Kenney source is not.
"""
import os
from PIL import Image

SRC = r"C:\Code\assets\kenney\UI assets\Mobile Controls\Sprites"
STYLE = os.path.join(SRC, "Style F", "Default")
ICONS = os.path.join(SRC, "Icons", "Default")
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "game", "assets", "ui")

GOLD = (212, 185, 106)   # brand gold (#d4b96a) — button fill after multiply
INK = (28, 24, 16)       # near-black warm ink — icon silhouette


def load(path):
    return Image.open(path).convert("RGBA")


def multiply(img, color):
    """Multiply RGB by color/255, preserving alpha — keeps the soft bevel."""
    px = img.load()
    out = Image.new("RGBA", img.size)
    op = out.load()
    cr, cg, cb = color
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = px[x, y]
            op[x, y] = (r * cr // 255, g * cg // 255, b * cb // 255, a)
    return out


def flatten(img, color):
    """Replace RGB with a flat color, keep alpha — crisp icon silhouette."""
    out = Image.new("RGBA", img.size)
    op = out.load()
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            op[x, y] = (*color, px[x, y][3])
    return out


def round_button(icon_name, icon_scale=0.52):
    """Gold round button with a centered dark icon."""
    btn = multiply(load(os.path.join(STYLE, "button_circle.png")), GOLD)
    icon = flatten(load(os.path.join(ICONS, icon_name)), INK)
    s = int(btn.width * icon_scale)
    icon = icon.resize((s, s), Image.LANCZOS)
    off = ((btn.width - s) // 2, (btn.height - s) // 2)
    btn.alpha_composite(icon, off)
    return btn


def main():
    os.makedirs(OUT, exist_ok=True)
    multiply(load(os.path.join(STYLE, "dpad.png")), GOLD).save(os.path.join(OUT, "ctrl_dpad.png"))
    round_button("icon_crosshair.png").save(os.path.join(OUT, "ctrl_action.png"))
    round_button("icon_menu.png").save(os.path.join(OUT, "ctrl_menu.png"))
    print("baked ->", OUT)
    for f in ("ctrl_dpad.png", "ctrl_action.png", "ctrl_menu.png"):
        print("  ", f)


if __name__ == "__main__":
    main()
