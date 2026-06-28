#!/usr/bin/env python
"""Extract the menu/panel 9-slice tiles from Kenney's CC0 "UI Pack - Pixel
Adventure" (Large tiles / Thick outline).

Source (NOT in the repo — Kenney CC0, Caelan's local asset library):
    C:\\Code\\assets\\kenney\\UI assets\\UI Pack - Pixel Adventure\\Tiles\\Large tiles\\Thick outline
Each 32x32 tile is a complete framed panel (corner brackets + border + fill),
usable directly as a CSS `border-image` source with an 8px slice.

Chosen tones (see the in-context chooser): a PARCHMENT panel (cream fill) holding
AGED-BROWN buttons. Outputs are copied verbatim — the tile art is already the
right size; the recolor lives in CSS (text colors) so one tile serves both
border-image-with-fill (panel/button center) and the frame.

Outputs -> game/assets/ui/
    panel_parchment.png   tile_0007  cream fill, gold border, steel corners
    panel_brown.png       tile_0030  brown fill, gold border, steel corners

Dev-time only; the PNGs are committed (CC0), the Kenney source is not.
"""
import os
import shutil

SRC = r"C:\Code\assets\kenney\UI assets\UI Pack - Pixel Adventure\Tiles\Large tiles\Thick outline"
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "game", "assets", "ui")

TILES = {
    "tile_0007.png": "panel_parchment.png",
    "tile_0030.png": "panel_brown.png",
}


def main():
    os.makedirs(OUT, exist_ok=True)
    for src_name, out_name in TILES.items():
        shutil.copyfile(os.path.join(SRC, src_name), os.path.join(OUT, out_name))
        print("baked ->", out_name)


if __name__ == "__main__":
    main()
