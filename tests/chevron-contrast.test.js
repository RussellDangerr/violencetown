// chevron-contrast.test.js — the facing chevron reads on every map's ground
// (plans/fx16-facing-chevron-reads.md).
//
// Its fill was a pale tan, the colour of the town's road, so on the road only
// its thin outline showed. It is the house plum now (TINY_INK). This measures
// it the way a player sees it: each map's ground is its most common walkable
// tile, that tile's colour is the mean of its opaque pixels in the very sheet
// cell the renderer draws, and the chevron is its colour laid over that ground
// at its own opacity. WCAG contrast, at least 3:1, on every map.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { TILE_BY_ID } from '../game/data.js';
import { TILE_SPRITE_MAP, TOWN_TILE_SPRITE_MAP, ZONE_TILE_SPRITE_MAP, SHEETS, TINY_INK } from '../game/sprites.js';
import { CHEVRON_COLOR } from '../game/renderer.js';

const GAME_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'game');
const TILE_ART = { ...TILE_SPRITE_MAP, ...TOWN_TILE_SPRITE_MAP, ...ZONE_TILE_SPRITE_MAP };
const MIN_CONTRAST = 3;

// Just enough PNG decoding for colour: 8-bit, non-interlaced, palette (with
// tRNS) or RGBA, which is all the game's art is. Anything else throws.
function readPng(path) {
    const buf = readFileSync(path);
    let pos = 8, width = 0, height = 0, depth = 0, type = 0, interlace = 0, plte = null, trns = null;
    const idat = [];
    while (pos < buf.length) {
        const len = buf.readUInt32BE(pos), kind = buf.toString('ascii', pos + 4, pos + 8);
        const data = buf.subarray(pos + 8, pos + 8 + len);
        if (kind === 'IHDR') {
            width = data.readUInt32BE(0); height = data.readUInt32BE(4);
            depth = data[8]; type = data[9]; interlace = data[12];
        } else if (kind === 'PLTE') plte = data;
        else if (kind === 'tRNS') trns = data;
        else if (kind === 'IDAT') idat.push(data);
        else if (kind === 'IEND') break;
        pos += 12 + len;
    }
    if (depth !== 8 || interlace !== 0 || (type !== 3 && type !== 6)) {
        throw new Error(`${path}: unsupported PNG (depth ${depth}, colour type ${type}, interlace ${interlace})`);
    }
    const bpp = type === 6 ? 4 : 1, stride = width * bpp;
    const raw = inflateSync(Buffer.concat(idat));
    const px = Buffer.alloc(stride * height);
    for (let y = 0; y < height; y++) {
        const filter = raw[y * (stride + 1)];
        const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
        for (let i = 0; i < stride; i++) {
            const a = i >= bpp ? px[y * stride + i - bpp] : 0;
            const b = y > 0 ? px[(y - 1) * stride + i] : 0;
            const c = y > 0 && i >= bpp ? px[(y - 1) * stride + i - bpp] : 0;
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
    const rgbaAt = type === 6
        ? (x, y) => { const o = (y * width + x) * 4; return [px[o], px[o + 1], px[o + 2], px[o + 3]]; }
        : (x, y) => {
            const i = px[y * width + x];
            return [plte[i * 3], plte[i * 3 + 1], plte[i * 3 + 2], trns && i < trns.length ? trns[i] : 255];
        };
    return { width, height, rgbaAt };
}

// WCAG 2 relative luminance and contrast ratio.
const channel = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
function contrast(a, b) {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

function parseRgba(css) {
    const m = /^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/.exec(css.replace(/\s+/g, ''));
    assert.ok(m, `not an rgba() colour: ${css}`);
    return { rgb: [Number(m[1]), Number(m[2]), Number(m[3])], alpha: Number(m[4]) };
}
const over = ({ rgb, alpha }, ground) => rgb.map((v, i) => v * alpha + ground[i] * (1 - alpha));

// The mean colour of a tile's opaque pixels, read from the cell the renderer
// draws (a 2x2 picture's first quadrant stands in for the whole).
const sheets = new Map();
function groundColour(id) {
    let ref = TILE_ART[id];
    if (ref?.quad) ref = ref.quad[0];
    assert.ok(ref, `tile ${id} has no art`);
    const sheet = SHEETS[ref.sheet];
    const path = join(GAME_DIR, sheet.src.replace(/^\.\//, ''));
    if (!sheets.has(path)) sheets.set(path, readPng(path));
    const img = sheets.get(path);
    const stride = sheet.frameW + (sheet.padding ?? 0);
    const sum = [0, 0, 0];
    let n = 0;
    for (let y = 0; y < sheet.frameH; y++) {
        for (let x = 0; x < sheet.frameW; x++) {
            const p = img.rgbaAt(ref.col * stride + x, ref.row * stride + y);
            if (p[3] < 128) continue;
            sum[0] += p[0]; sum[1] += p[1]; sum[2] += p[2]; n++;
        }
    }
    assert.ok(n > 0, `tile ${id} draws no opaque pixels`);
    return sum.map(v => v / n);
}

// A map's ground: the walkable tile it places most.
function groundOf(file) {
    const map = JSON.parse(readFileSync(join(GAME_DIR, file), 'utf8'));
    const counts = new Map();
    for (const id of map.tiles) if (TILE_BY_ID[id]?.walkable) counts.set(id, (counts.get(id) ?? 0) + 1);
    const [id] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? [];
    return id;
}

const mapFiles = readdirSync(GAME_DIR).filter(f => f.endsWith('-map.json')).sort();
const grounds = mapFiles.map(file => ({ file, id: groundOf(file) }));

describe('the facing chevron reads on every map\'s ground', () => {
    const chevron = parseRgba(CHEVRON_COLOR);

    test('it is drawn in the house plum, not a colour of its own', () => {
        assert.deepEqual(chevron.rgb, TINY_INK);
    });

    test('every map has a ground to measure against', () => {
        assert.ok(mapFiles.length > 0, 'no maps found');
        assert.ok(grounds.length > 0, 'no grounds checked');
        for (const { file, id } of grounds) assert.notEqual(id, undefined, `${file} has no walkable tile`);
    });

    for (const { file, id } of grounds) {
        test(`${file}: at least ${MIN_CONTRAST}:1 on its ground (${TILE_BY_ID[id]?.name ?? id})`, () => {
            const ground = groundColour(id);
            const ratio = contrast(over(chevron, ground), ground);
            assert.ok(ratio >= MIN_CONTRAST, `${file}: ${ratio.toFixed(2)}:1 on tile ${id}`);
        });
    }

    test('the old tan fill failed this on the town road, so the measure can tell', () => {
        const town = grounds.find(g => g.file === 'town-map.json');
        assert.ok(town, 'town-map.json not found');
        const ground = groundColour(town.id);
        const oldTan = { rgb: [212, 185, 106], alpha: 0.9 };
        assert.ok(contrast(over(oldTan, ground), ground) < MIN_CONTRAST);
    });
});
