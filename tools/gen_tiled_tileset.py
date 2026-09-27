"""Paint the Tiled tileset image for tools/tiled.mjs (plans/tiled-pipeline.md).

Reads a recipe as JSON on stdin — tools/tiled.mjs resolves every tile id to the
same sheet cells the renderer draws — and writes one PNG where the cell at index
N is game tile id N. Each tile is a stack of layers, bottom first: a flat colour
({"fill": "#rrggbb"}) or a crop of a sheet ({"src", "x", "y", "w", "h"}), scaled
to the tile size with nearest-neighbour when the crop is bigger (the car).
"""
import json
import sys

from PIL import Image


def main():
    recipe = json.load(sys.stdin)
    size = recipe["size"]
    sheet = Image.new("RGBA", (recipe["columns"] * size, recipe["rows"] * size), (0, 0, 0, 0))
    cache = {}
    for tile in recipe["tiles"]:
        cell = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        for layer in tile["layers"]:
            if "fill" in layer:
                cell = Image.alpha_composite(cell, Image.new("RGBA", (size, size), layer["fill"]))
                continue
            src = layer["src"]
            if src not in cache:
                cache[src] = Image.open(src).convert("RGBA")
            crop = cache[src].crop((layer["x"], layer["y"], layer["x"] + layer["w"], layer["y"] + layer["h"]))
            if crop.size != (size, size):
                crop = crop.resize((size, size), Image.NEAREST)
            cell = Image.alpha_composite(cell, crop)
        n = tile["id"]
        sheet.paste(cell, ((n % recipe["columns"]) * size, (n // recipe["columns"]) * size))
    sheet.save(recipe["out"])


if __name__ == "__main__":
    main()
