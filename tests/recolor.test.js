// recolor.test.js — the rat variants sheet is the base rat with only its body
// and eye colours swapped.
//
// tools/gen_recolor.py takes the Tiny Dungeon rat, (3,10), and writes one
// 16x16 cell per variant to ratVariants_packed.png. These read the tool's own
// palette table, decode both sheets, and rebuild every variant pixel by pixel:
// if the PNG on disk and the table ever disagree, or a swap reaches the
// outline or the silhouette, a test here fails.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { SHEETS, TINY_INK, TINY_STYLE_SHEETS } from '../game/sprites.js';

const url = (p) => new URL(p, import.meta.url);
const gen = readFileSync(url('../tools/gen_recolor.py'), 'utf8');
const KENNEY = '../game/assets-placeholder/kenney/';

// Decode an 8-bit, non-interlaced PNG (palette or RGBA) to RGBA.
function readRGBA(path) {
    const buf = readFileSync(path);
    let pos = 8, width = 0, height = 0, depth = 0, type = 0, interlace = 0, plte = null, trns = null;
    const idat = [];
    while (pos < buf.length) {
        const len = buf.readUInt32BE(pos);
        const kind = buf.toString('ascii', pos + 4, pos + 8);
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
    const at = type === 6
        ? (x, y) => [...px.subarray((y * width + x) * 4, (y * width + x) * 4 + 4)]
        : (x, y) => {
            const i = px[y * width + x];
            return [plte[i * 3], plte[i * 3 + 1], plte[i * 3 + 2], trns && i < trns.length ? trns[i] : 255];
        };
    return { width, height, at };
}

// The tool's constants and palette table, read from its source.
const rgb = (s) => s.split(',').map(Number);
const pyColour = (name) => rgb(new RegExp(`^${name} = \\((\\d+, \\d+, \\d+)\\)`, 'm').exec(gen)[1]);
const OUTLINE = pyColour('OUTLINE'), SHADE = pyColour('SHADE'), LIGHT = pyColour('LIGHT'), EYE = pyColour('EYE');
const [baseCol, baseRow] = rgb(/^BASE_CELL = \((\d+, \d+)\)/m.exec(gen)[1]);
const table = /^VARIANTS = \[(.*?)^\]/ms.exec(gen)[1];
const VARIANTS = [...table.matchAll(/\('(\w+)',\s*\((\d+, \d+, \d+)\),\s*\((\d+, \d+, \d+)\),\s*\((\d+, \d+, \d+)\)\)/g)]
    .map(([, name, s, l, e]) => ({ name, shade: rgb(s), light: rgb(l), eye: rgb(e) }));

const base = readRGBA(url(KENNEY + 'tiny/dungeon/tinyDungeon_packed.png'));
const sheet = readRGBA(url(KENNEY + 'ratVariants_packed.png'));
const key = (c) => c.slice(0, 3).join(',');
const baseAt = (x, y) => base.at(baseCol * 16 + x, baseRow * 16 + y);
const cells = [...Array(16 * 16).keys()].map((i) => [i % 16, Math.floor(i / 16)]);

describe('the recolor tool: rat variants', () => {
    test('the tool reads as expected: six variants, the Carnival three first', () => {
        assert.deepEqual(VARIANTS.map((v) => v.name), ['birthday', 'sludge', 'robot', 'undead', 'frost', 'pouch']);
        assert.deepEqual([baseCol, baseRow], [3, 10]);
    });

    test('the outline the tool keeps is the Tiny packs\' ink', () => {
        assert.deepEqual(OUTLINE, TINY_INK);
    });

    test('the base rat has exactly the four colours the tool swaps around', () => {
        const seen = new Set(cells.filter(([x, y]) => baseAt(x, y)[3]).map(([x, y]) => key(baseAt(x, y))));
        assert.deepEqual([...seen].sort(), [OUTLINE, SHADE, LIGHT, EYE].map(key).sort());
    });

    test('the sheet is one 16-px row, one cell per variant', () => {
        assert.deepEqual([sheet.width, sheet.height], [16 * VARIANTS.length, 16]);
        assert.deepEqual([sheet.width, sheet.height], [96, 16]);
    });

    for (const [i, v] of VARIANTS.entries()) {
        test(`${v.name}: same silhouette and outline, only body and eye swapped`, () => {
            const swap = { [key(SHADE)]: v.shade, [key(LIGHT)]: v.light, [key(EYE)]: v.eye };
            let outline = 0, swapped = 0;
            for (const [x, y] of cells) {
                const b = baseAt(x, y), got = sheet.at(i * 16 + x, y);
                assert.equal(got[3], b[3], `(${x},${y}) alpha`);
                if (!b[3]) continue;
                if (key(b) === key(OUTLINE)) {
                    outline++;
                    assert.deepEqual(got, b, `(${x},${y}) outline untouched`);
                } else {
                    swapped++;
                    assert.deepEqual(got, [...swap[key(b)], b[3]], `(${x},${y}) swapped`);
                }
            }
            assert.equal(outline, 123);
            assert.equal(swapped, 69);
        });

        test(`${v.name}: its colours differ from the outline, from each other, and from the brown rat's body`, () => {
            const keys = [v.shade, v.light, v.eye].map(key);
            assert.equal(new Set(keys).size, 3);
            assert.ok(!keys.includes(key(OUTLINE)));
            assert.ok(!keys.includes(key(SHADE)) && !keys.includes(key(LIGHT)));
        });
    }

    test('the sheet is registered, packed, and in the Tiny style so it is not outlined twice', () => {
        const def = SHEETS.ratVariants;
        assert.ok(def, 'ratVariants is in SHEETS');
        assert.equal(def.src, './assets-placeholder/kenney/ratVariants_packed.png');
        assert.deepEqual([def.frameW, def.frameH, def.padding ?? 0], [16, 16, 0]);
        assert.ok(TINY_STYLE_SHEETS.has('ratVariants'));
    });

    test('nothing in the game draws from it yet', () => {
        const dir = url('../game/');
        const users = readdirSync(dir).filter((f) => f.endsWith('.js'))
            .filter((f) => /sheet:\s*'ratVariants'/.test(readFileSync(new URL(f, dir), 'utf8')));
        assert.deepEqual(users, []);
    });
});
