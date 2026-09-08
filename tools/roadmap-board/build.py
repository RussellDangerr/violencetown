"""build.py — inline the board model and the seed into page.html -> dist/index.html.

The artifact CSP allows no external modules, so the page must be one file.
Same pattern as the other tools/ generators: source in, artifact out.
Run from the repo root:  python tools/roadmap-board/build.py

Local verification: the artifact host normally supplies the <meta charset> for
this page, so dist/index.html deliberately carries none itself (adding one here
would be a stray head tag the wrapper doesn't expect). That means a plain
`python -m http.server` is NOT enough to check it locally — it sends a bare
`Content-Type: text/html` with no charset, and the em dashes come out as
mojibake — so use a server that declares one (a `Content-Type: text/html;
charset=utf-8` response header) if you want to serve it. Simplest option:
open dist/index.html directly as a file:// URL — with no server header to
trust, the browser sniffs the bytes as UTF-8 and it renders correctly.
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
