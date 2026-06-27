#!/usr/bin/env python3
"""Pack a strip of Kenney Emote Pack (Pixel, Style 1) balloons for Town Clock
ambient reactions + disposition faces.

SOURCE is the local CC0 Kenney library (sibling of the repos, NOT in-repo — see
CLAUDE.md asset notes). The OUTPUT, game/assets-placeholder/kenney/emotes_style1.png,
is the committed artifact the game actually loads. Re-run only when changing the
emote set (then update EMOTE_SPRITES in game/sprites.js to match the order below).

Kenney Emote Pack — CC0 1.0. The Pixel emotes are native 16x16, each a small
white speech balloon with a down-tail and a symbol inside.
"""
from pathlib import Path
from PIL import Image

# Local CC0 Kenney library (see CLAUDE.md "Repo location" / asset hygiene notes).
SRC = Path(r"C:\Code\assets\kenney\2D assets\Emote Pack\PNG\Pixel\Style 1")
OUT = (Path(__file__).resolve().parent.parent
       / "game" / "assets-placeholder" / "kenney" / "emotes_style1.png")

# Column order — KEEP IN SYNC with EMOTE_SPRITES in game/sprites.js.
ORDER = [
    "dots1", "dots2", "dots3", "question", "exclamation", "sleep",
    "music", "anger", "heart", "idea", "laugh", "star",
    "drop", "faceHappy", "faceAngry", "faceSad", "alert", "swirl",
]

CELL = 16


def main():
    strip = Image.new("RGBA", (CELL * len(ORDER), CELL), (0, 0, 0, 0))
    for i, name in enumerate(ORDER):
        src = SRC / f"emote_{name}.png"
        img = Image.open(src).convert("RGBA")
        if img.size != (CELL, CELL):
            img = img.resize((CELL, CELL), Image.NEAREST)
        strip.paste(img, (i * CELL, 0), img)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    strip.save(OUT)
    print(f"wrote {OUT} ({strip.width}x{strip.height}, {len(ORDER)} emotes)")
    print("order:", ", ".join(ORDER))


if __name__ == "__main__":
    main()
