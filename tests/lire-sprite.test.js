// lire-sprite.test.js — Lire, the summoned lion, draws the tawny beast.
//
// tools/gen_recolor.py takes the Tiny Dungeon grey beast, (4,10), and writes one
// 16x16 cell per BEAST_VARIANTS row to beastVariants_packed.png, swapping only
// its two greys. These read the tool's own table, decode both sheets and rebuild
// every pixel, the way tests/recolor.test.js checks the rats; then they follow
// the summon from its trick to the sprite the renderer looks up.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { SHEETS, ENEMY_SPRITES, TINY_INK, TINY_STYLE_SHEETS } from '../game/sprites.js';
import { TRICKS } from '../game/tricks.js';

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

// The tool's constants and beast table, read from its source.
const rgb = (s) => s.split(',').map(Number);
const pyColour = (name) => rgb(new RegExp(`^${name} = \\((\\d+, \\d+, \\d+)\\)`, 'm').exec(gen)[1]);
const OUTLINE = pyColour('OUTLINE');
const RAT_SHADE = pyColour('SHADE'), RAT_LIGHT = pyColour('LIGHT');
const SHADE = pyColour('BEAST_SHADE'), LIGHT = pyColour('BEAST_LIGHT'), TAIL = pyColour('BEAST_TAIL');
const [baseCol, baseRow] = rgb(/^BEAST_CELL = \((\d+, \d+)\)/m.exec(gen)[1]);
const table = /^BEAST_VARIANTS = \[(.*?)^\]/ms.exec(gen)[1];
const VARIANTS = [...table.matchAll(/\('(\w+)',\s*\((\d+, \d+, \d+)\),\s*\((\d+, \d+, \d+)\)\)/g)]
    .map(([, name, s, l]) => ({ name, shade: rgb(s), light: rgb(l) }));

const base = readRGBA(url(KENNEY + 'tiny/dungeon/tinyDungeon_packed.png'));
const sheet = readRGBA(url(KENNEY + 'beastVariants_packed.png'));
const key = (c) => c.slice(0, 3).join(',');
const baseAt = (x, y) => base.at(baseCol * 16 + x, baseRow * 16 + y);
const cells = [...Array(16 * 16).keys()].map((i) => [i % 16, Math.floor(i / 16)]);

describe('the recolor tool: the grey beast', () => {
    test('the tool reads as expected: the grey beast (4,10), one tawny variant', () => {
        assert.deepEqual([baseCol, baseRow], [4, 10]);
        assert.deepEqual(VARIANTS.map((v) => v.name), ['tawny']);
        assert.deepEqual(OUTLINE, TINY_INK);
    });

    test('the base beast has exactly the four colours the tool works around', () => {
        const count = new Map();
        for (const [x, y] of cells) {
            const b = baseAt(x, y);
            if (b[3]) count.set(key(b), (count.get(key(b)) || 0) + 1);
        }
        assert.deepEqual(Object.fromEntries(count), {
            [key(OUTLINE)]: 123, [key(SHADE)]: 37, [key(LIGHT)]: 21, [key(TAIL)]: 11,
        });
    });

    test('the sheet is one 16-px row, one cell per variant', () => {
        assert.deepEqual([sheet.width, sheet.height], [16 * VARIANTS.length, 16]);
    });

    for (const [i, v] of VARIANTS.entries()) {
        test(`${v.name}: same silhouette, outline and tail; only the two greys swapped`, () => {
            const swap = { [key(SHADE)]: v.shade, [key(LIGHT)]: v.light };
            let kept = 0, swapped = 0;
            for (const [x, y] of cells) {
                const b = baseAt(x, y), got = sheet.at(i * 16 + x, y);
                assert.equal(got[3], b[3], `(${x},${y}) alpha`);
                if (!b[3]) continue;
                if (swap[key(b)]) {
                    swapped++;
                    assert.deepEqual(got, [...swap[key(b)], b[3]], `(${x},${y}) swapped`);
                } else {
                    kept++;
                    assert.deepEqual(got, b, `(${x},${y}) kept`);
                }
            }
            assert.equal(kept, 123 + 11);
            assert.equal(swapped, 37 + 21);
        });

        test(`${v.name}: its colours differ from the kept ones, each other, the greys and the brown rat`, () => {
            const keys = [v.shade, v.light].map(key);
            assert.equal(new Set(keys).size, 2);
            for (const c of [OUTLINE, TAIL, SHADE, LIGHT, RAT_SHADE, RAT_LIGHT]) {
                assert.ok(!keys.includes(key(c)), `${v.name} reuses ${key(c)}`);
            }
        });
    }

    test('the sheet is registered, packed, and in the Tiny style so it is not outlined twice', () => {
        const def = SHEETS.beastVariants;
        assert.ok(def, 'beastVariants is in SHEETS');
        assert.equal(def.src, './assets-placeholder/kenney/beastVariants_packed.png');
        assert.deepEqual([def.frameW, def.frameH, def.padding ?? 0], [16, 16, 0]);
        assert.ok(TINY_STYLE_SHEETS.has('beastVariants'));
    });

    test('only Lire draws from it', () => {
        const dir = url('../game/');
        const users = readdirSync(dir).filter((f) => f.endsWith('.js'))
            .filter((f) => /sheet:\s*'beastVariants'/.test(readFileSync(new URL(f, dir), 'utf8')));
        assert.deepEqual(users, ['sprites.js']);
        const drawn = Object.entries(ENEMY_SPRITES)
            .filter(([, s]) => s.sheet === 'beastVariants').map(([type]) => type);
        assert.deepEqual(drawn, ['Lire']);
    });
});

describe('Lire, the summoned lion, has a picture', () => {
    test('the summon trick spawns a type named Lire', () => {
        // main.js _spawnSummon names the ally summonName, and the renderer
        // looks its sprite up by that name.
        assert.equal(TRICKS.hire_lion.summonName, 'Lire');
    });

    test('Lire draws the tawny column of the beast sheet', () => {
        const s = ENEMY_SPRITES[TRICKS.hire_lion.summonName];
        assert.ok(s, 'Lire has no ENEMY_SPRITES entry: he would draw as the fallback box');
        assert.equal(s.sheet, 'beastVariants');
        assert.equal(s.row, 0);
        assert.equal(VARIANTS[s.col]?.name, 'tawny');
    });

    test('the tawny cell is not the brown rat\'s, so the two never read as one', () => {
        assert.notDeepEqual(ENEMY_SPRITES.Lire, ENEMY_SPRITES.Rat);
        assert.notEqual(ENEMY_SPRITES.Lire.sheet, ENEMY_SPRITES.Rat.sheet);
    });
});
