// ice-cone.test.js — the Tiger's Blood Ice Cone (plans/ic1-tigers-blood-ice-cone.md).
//
// The item exists, carrying it does nothing yet, examining it shows its
// placeholder description, and its picture is exactly what tools/gen_ice_cone.py
// says it is: the Tiny Ski pine's top half mirrored, outlined in the Tiny plum,
// painted from the tool's own table. The tool's tables are read from its source
// and every pixel of the committed PNG is rebuilt from them.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { ITEMS } from '../game/items.js';
import { SHEETS, ITEM_SPRITES, UNKNOWN_ITEM_SPRITE, TINY_INK, TINY_STYLE_SHEETS, itemSprite } from '../game/sprites.js';
import { resolveExamine } from '../game/examine.js';
import { itemStatLine } from '../game/inspector.js';
import { TILES } from '../game/data.js';

const ID = 'tigers_blood_ice_cone';
const url = (p) => new URL(p, import.meta.url);
const gen = readFileSync(url('../tools/gen_ice_cone.py'), 'utf8');

// Decode an 8-bit, non-interlaced RGBA or palette PNG.
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

// The tool's tables, read from its source.
const rgb = (s) => s.split(',').map(Number);
const list = (name) => [...new RegExp(`^${name} = \\[(.*?)^\\]`, 'ms').exec(gen)[1]
    .matchAll(/'([^']*)'/g)].map(m => m[1]);
const colours = (name) => Object.fromEntries([...new RegExp(`^${name} = \\{(.*?)^\\}`, 'ms').exec(gen)[1]
    .matchAll(/'(\w)': \((\d+, \d+, \d+)\)/g)].map(([, k, v]) => [k, rgb(v)]));
const PINE = list('PINE');
const PAINT = list('PAINT');
const COLOURS = colours('COLOURS');
const PINE_COLOURS = colours('PINE_COLOURS');
const OUTLINE = rgb(/^OUTLINE = \((\d+, \d+, \d+)\)/m.exec(gen)[1]);
const KEEP_ROWS = Number(/^KEEP_ROWS = (\d+)/m.exec(gen)[1]);
const TOP = Number(/^TOP = (\d+)/m.exec(gen)[1]);

const extents = (row) => [row.search(/[^.]/), row.length - 1 - [...row].reverse().join('').search(/[^.]/)];
const silhouette = () => {
    const top = PINE.slice(0, KEEP_ROWS).map(extents);
    return [...top, ...top.slice(0, -1).reverse()];
};

const png = () => readRGBA(url(`../game/${SHEETS.iceCone.src.replace(/^\.\//, '')}`));

describe('the Tiger\'s Blood Ice Cone — the item', () => {
    test('it exists under his name, with the placeholder description', () => {
        const d = ITEMS[ID];
        assert.ok(d, 'no item');
        assert.equal(d.id, ID);
        assert.equal(d.name, "[Tiger's Blood Ice Cone]");
        assert.equal(d.description, '[TEXT]');
    });

    test('carrying it does nothing: no use, no slot, no stat, no effect', () => {
        const d = ITEMS[ID];
        assert.equal(d.useType, 'none');
        assert.equal(d.consumable, false);
        for (const k of ['equipSlot', 'effect', 'poition', 'damage', 'healAmount', 'armor', 'buff', 'equipDuration', 'drinkable', 'tags']) {
            assert.equal(d[k], undefined, `${k} is set`);
        }
        assert.equal(d.baseValue, 0);
    });

    test('no game code reads it beyond the item and sprite tables', () => {
        // Plus the one place that hands it out: the diner's ice cone machine,
        // a row in item-uses.js (plans/ic6-factory-bill-ice-cone-machine.md).
        const dir = url('../game/');
        const readers = readdirSync(dir).filter(f => /\.(js|json)$/.test(f))
            .filter(f => readFileSync(new URL(f, dir), 'utf8').includes(ID));
        assert.deepEqual(readers.sort(), ['item-uses.js', 'items.js', 'sprites.js']);
    });

    test('examining it on the ground names it and shows [TEXT]', () => {
        const g = {
            examinables: [], enemies: [], containers: [], groundItems: [{ type: ID, x: 4, y: 4 }],
            playerX: 5, playerY: 5, facing: 'down',
            map: { getTile: () => TILES.FLOOR.id, isInBounds: () => true, propSpawns: [] },
        };
        const r = resolveExamine(g, 4, 4);
        assert.equal(r.title, "[Tiger's Blood Ice Cone]");
        assert.ok(r.body.includes('[TEXT]'), r.body);
    });

    test('examining it in the bag shows [TEXT]', () => {
        assert.equal(itemStatLine(ITEMS[ID]), '[TEXT]');
    });
});

describe('the Tiger\'s Blood Ice Cone — the picture', () => {
    test('it draws from its own cell, not the plain bag', () => {
        const spr = ITEM_SPRITES[ID];
        assert.ok(spr, 'no ITEM_SPRITES entry');
        assert.notDeepEqual(itemSprite(ID), UNKNOWN_ITEM_SPRITE);
        assert.equal(spr.sheet, 'iceCone');
        assert.deepEqual([spr.x, spr.y, spr.w, spr.h], [0, 0, 16, 16]);
        assert.equal(SHEETS.iceCone.src, './assets-placeholder/ice_cone.png');
    });

    test('it is already outlined, so the draw-time outline pass leaves it alone', () => {
        assert.ok(TINY_STYLE_SHEETS.has('iceCone'));
        assert.deepEqual(OUTLINE, TINY_INK);
    });

    test('the tool carries the pine with its own colours, and keeps its top half', () => {
        assert.equal(PINE.length, 16);
        assert.ok(PINE.every(r => r.length === 16));
        assert.deepEqual(PINE_COLOURS.A, TINY_INK, "the pine's outline is the Tiny plum");
        assert.equal(KEEP_ROWS, 8);
        const s = silhouette();
        assert.equal(s.length, 15, 'a 16x15 double point');
        const widths = s.map(([l, r]) => r - l + 1);
        assert.equal(Math.max(...widths), widths[KEEP_ROWS - 1], 'the mirror line is the widest row');
    });

    test('every pixel is the mirrored pine, outlined in plum and painted from the table', () => {
        const im = png();
        assert.deepEqual([im.width, im.height], [16, 16]);
        const s = silhouette();
        const inside = (y, x) => y >= 0 && y < s.length && x >= s[y][0] && x <= s[y][1];
        let painted = 0;
        for (let y = 0; y < 16; y++) {
            for (let x = 0; x < 16; x++) {
                const [r, g, b, a] = im.at(x, y);
                const cy = y - TOP;
                if (!inside(cy, x)) { assert.equal(a, 0, `(${x},${y}) should be clear`); continue; }
                assert.equal(a, 255, `(${x},${y}) should be solid`);
                const interior = [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => inside(cy + dy, x + dx));
                if (!interior) { assert.deepEqual([r, g, b], OUTLINE, `(${x},${y}) is outline`); continue; }
                const first = [...Array(16).keys()].find(xx => [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => inside(cy + dy, xx + dx)) && inside(cy, xx));
                const ch = PAINT[cy][x - first];
                assert.ok(ch, `PAINT row ${cy} is short`);
                assert.deepEqual([r, g, b], COLOURS[ch], `(${x},${y}) should be ${ch}`);
                painted++;
            }
        }
        assert.ok(painted > 50, `only ${painted} painted pixels`);
    });

    test('syrup on top, ice in the middle, a band at the widest row, paper below', () => {
        const top = PAINT.slice(1, 4).join('');
        assert.ok(/^[rRp]+$/.test(top), `the tip is syrup: ${top}`);
        assert.ok(PAINT[6].includes('w'), 'ice above the band');
        assert.ok(/^b+$/.test(PAINT[KEEP_ROWS - 1]), 'the band sits on the widest row');
        const sleeve = PAINT.slice(KEEP_ROWS).join('');
        assert.ok(/^[sf]+$/.test(sleeve), `the sleeve is paper and its fold: ${sleeve}`);
        assert.ok(sleeve.includes('f') && sleeve.split('').filter(c => c === 's').length > sleeve.length / 2,
            'one flat paper colour with a fold line through it');
    });
});
