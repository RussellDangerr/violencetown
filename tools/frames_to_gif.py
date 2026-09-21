"""frames_to_gif.py — stitch the autoplay runner's PNG frames into a GIF.

    python tools/frames_to_gif.py <frames-dir> <out.gif> [frame-ms]

Frames are halved to 640 px wide with nearest-neighbour, so the pixel art
stays crisp and the file stays small enough to send to a phone.
"""
import sys
from pathlib import Path
from PIL import Image

src, out = Path(sys.argv[1]), sys.argv[2]
ms = int(sys.argv[3]) if len(sys.argv) > 3 else 250
paths = sorted(src.glob('*.png'))
if not paths:
    sys.exit(f'no frames in {src}')
frames = []
for p in paths:
    im = Image.open(p).convert('RGB')
    w = 640
    frames.append(im.resize((w, round(im.height * w / im.width)), Image.NEAREST).quantize(colors=128))
frames[0].save(out, save_all=True, append_images=frames[1:], duration=ms, loop=0, optimize=True)
print(f'{out}: {len(frames)} frames')
