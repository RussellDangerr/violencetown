"""build.py — inline the board model and the seed into page.html -> dist/index.html.

The artifact CSP allows no external modules, so the page must be one file.
Same pattern as the other tools/ generators: source in, artifact out.
Run from the repo root:  python tools/roadmap-board/build.py
"""
import json, pathlib, re, sys

here = pathlib.Path(__file__).parent
page = (here / "page.html").read_text(encoding="utf-8")
model = (here / "board-model.js").read_text(encoding="utf-8")
seed = json.loads((here / "cards.json").read_text(encoding="utf-8"))

# The model is an ES module; inlined into a classic <script> its `export`s are invalid.
model_inline = re.sub(r"^export\s+(const|function)\s", r"\1 ", model, flags=re.M)

for marker in ("/* @@BOARD_MODEL@@ */", "/* @@SEED@@ */ []"):
    if marker not in page:
        sys.exit(f"page.html is missing marker {marker}")

out = page.replace("/* @@BOARD_MODEL@@ */", model_inline, 1)
out = out.replace("/* @@SEED@@ */ []", json.dumps(seed, ensure_ascii=False), 1)

dist = here / "dist"; dist.mkdir(exist_ok=True)
(dist / "index.html").write_text(out, encoding="utf-8")
print(f"wrote dist/index.html ({len(out):,} bytes, {len(seed)} seed cards)")
