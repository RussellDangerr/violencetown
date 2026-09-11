// png-alpha.js — just enough PNG decoding to ask "is this pixel see-through?"
//
// Node has no image decoder built in, and the tests only need alpha. Handles
// what the game's art actually is: 8-bit, non-interlaced, palette (colour type
// 3, alpha from tRNS) or RGBA (colour type 6). Anything else throws, so a new
// sheet in an unexpected format fails loudly instead of reading as opaque.

import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

export function readAlpha(path) {
    const buf = readFileSync(path);
    let pos = 8;                                   // past the signature
    let width = 0, height = 0, depth = 0, type = 0, interlace = 0, trns = null;
    const idat = [];
    while (pos < buf.length) {
        const len = buf.readUInt32BE(pos);
        const kind = buf.toString('ascii', pos + 4, pos + 8);
        const data = buf.subarray(pos + 8, pos + 8 + len);
        if (kind === 'IHDR') {
            width = data.readUInt32BE(0); height = data.readUInt32BE(4);
            depth = data[8]; type = data[9]; interlace = data[12];
        } else if (kind === 'tRNS') trns = data;
        else if (kind === 'IDAT') idat.push(data);
        else if (kind === 'IEND') break;
        pos += 12 + len;
    }
    if (depth !== 8 || interlace !== 0 || (type !== 3 && type !== 6)) {
        throw new Error(`${path}: unsupported PNG (depth ${depth}, colour type ${type}, interlace ${interlace})`);
    }
    const bpp = type === 6 ? 4 : 1;
    const stride = width * bpp;
    const raw = inflateSync(Buffer.concat(idat));
    const px = Buffer.alloc(stride * height);
    for (let y = 0; y < height; y++) {
        const filter = raw[y * (stride + 1)];
        const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
        for (let i = 0; i < stride; i++) {
            const a = i >= bpp ? px[y * stride + i - bpp] : 0;           // left
            const b = y > 0 ? px[(y - 1) * stride + i] : 0;              // up
            const c = y > 0 && i >= bpp ? px[(y - 1) * stride + i - bpp] : 0;   // up-left
            let v = src[i];
            if (filter === 1) v += a;
            else if (filter === 2) v += b;
            else if (filter === 3) v += (a + b) >> 1;
            else if (filter === 4) {
                const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
                v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
            }
            px[y * stride + i] = v & 0xff;
        }
    }
    const alphaAt = type === 6
        ? (x, y) => px[(y * width + x) * 4 + 3]
        : (x, y) => { const idx = px[y * width + x]; return trns && idx < trns.length ? trns[idx] : 255; };
    return { width, height, alphaAt };
}

// How many pixels of a w x h region are not fully opaque.
export function seeThroughCount(img, x0, y0, w = 16, h = 16) {
    let n = 0;
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (img.alphaAt(x, y) < 255) n++;
    return n;
}
