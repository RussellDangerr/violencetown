// weapon-art.test.js — every weapon wears its own picture (plans/wa1-weapon-pictures-match.md).
//
// Four weapons used to borrow a cell that read as another weapon. They now
// draw from recoloured cells on the Tiny extra sheet, and no two holdable
// weapons may point at the same cell again.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ITEM_SPRITES, UNKNOWN_ITEM_SPRITE, itemSprite, SHEETS } from '../game/sprites.js';
import { ITEMS } from '../game/items.js';
import { WEAPONS, WEAPON_TIERS } from '../game/weapons.js';
import { ALL_ITEM_IDS, resolveItemDef } from '../game/item-registry.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXTRA = join(ROOT, 'game', 'assets-placeholder', 'kenney', 'tinyExtra_packed.png');

// Everything a player can hold in the weapon slot.
const HOLDABLE = [...new Set([
    ...Object.keys(WEAPONS),
    ...Object.keys(ITEMS).filter(id => ITEMS[id].equipSlot === 'weapon'),
])].sort();

const cellKey = s => `${s.sheet}@${s.x},${s.y}`;

// A small PNG reader: 8-bit RGBA, not interlaced (what Pillow writes for the sheet).
function readPng(path) {
    const buf = readFileSync(path);
    let off = 8, width = 0, height = 0, depth = 0, colour = 0;
    const idat = [];
    while (off < buf.length) {
        const len = buf.readUInt32BE(off);
        const type = buf.toString('latin1', off + 4, off + 8);
        const data = buf.subarray(off + 8, off + 8 + len);
        if (type === 'IHDR') {
            width = data.readUInt32BE(0); height = data.readUInt32BE(4);
            depth = data[8]; colour = data[9];
        } else if (type === 'IDAT') idat.push(data);
        else if (type === 'IEND') break;
        off += 12 + len;
    }
    assert.equal(depth, 8); assert.equal(colour, 6, 'the sheet is RGBA');
    const raw = inflateSync(Buffer.concat(idat));
    const stride = width * 4, px = Buffer.alloc(stride * height);
    for (let y = 0; y < height; y++) {
        const f = raw[y * (stride + 1)];
        const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
        for (let i = 0; i < stride; i++) {
            const a = i >= 4 ? px[y * stride + i - 4] : 0;
            const b = y ? px[(y - 1) * stride + i] : 0;
            const c = y && i >= 4 ? px[(y - 1) * stride + i - 4] : 0;
            let v = line[i];
            if (f === 1) v += a;
            else if (f === 2) v += b;
            else if (f === 3) v += (a + b) >> 1;
            else if (f === 4) {
                const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
                v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
            }
            px[y * stride + i] = v & 0xff;
        }
    }
    return { width, height, at: (x, y) => [...px.subarray((y * width + x) * 4, (y * width + x) * 4 + 4)] };
}

function cellPixels(png, s) {
    const out = [];
    for (let y = s.y; y < s.y + s.h; y++) for (let x = s.x; x < s.x + s.w; x++) out.push(png.at(x, y));
    return out;
}

describe('every holdable weapon wears its own picture', () => {
    test('there are weapons to check, the Pipe among them', () => {
        // A check that finds nothing would pass on nothing.
        assert.ok(HOLDABLE.length >= 6, HOLDABLE.join(', '));
        for (const id of ['wooden_sword', 'ray_gun', 'fearmur', 'gator_tail', 'lion_whip', 'pipe']) {
            assert.ok(HOLDABLE.includes(id), id);
        }
    });

    for (const id of HOLDABLE) {
        test(`${id} has a picture of its own, not the plain bag`, () => {
            const s = ITEM_SPRITES[id];
            assert.ok(s, `${id} has no ITEM_SPRITES entry`);
            assert.ok(SHEETS[s.sheet], `${id}: unknown sheet ${s.sheet}`);
            assert.notEqual(itemSprite(id), UNKNOWN_ITEM_SPRITE);
            assert.notEqual(cellKey(s), cellKey(UNKNOWN_ITEM_SPRITE), `${id} draws as the bag`);
        });
    }

    test('no two weapons share a cell', () => {
        const seen = new Map();
        for (const id of HOLDABLE) {
            const k = cellKey(ITEM_SPRITES[id]);
            assert.ok(!seen.has(k), `${id} and ${seen.get(k)} both draw ${k}`);
            seen.set(k, id);
        }
        assert.equal(seen.size, HOLDABLE.length);
    });

    test('no other item borrows a weapon\'s cell either', () => {
        const weaponCells = new Map(HOLDABLE.map(id => [cellKey(ITEM_SPRITES[id]), id]));
        for (const [id, s] of Object.entries(ITEM_SPRITES)) {
            if (HOLDABLE.includes(id)) continue;
            assert.ok(!weaponCells.has(cellKey(s)), `${id} draws ${weaponCells.get(cellKey(s))}'s picture`);
        }
    });

    test('the generated tier weapons cannot be held yet, so they are not checked here', () => {
        // They draw as the plain bag. If one enters the item registry it needs art,
        // and this test is the reminder.
        const tierIds = Object.values(WEAPON_TIERS).flat().map(t => t.id);
        assert.ok(tierIds.length > 0);
        for (const id of tierIds) {
            assert.ok(!ALL_ITEM_IDS.has(id) && !resolveItemDef(id), `${id} is holdable now: give it a picture`);
        }
    });
});

describe('the four recoloured weapons', () => {
    const PICKED = { lion_whip: 5, gator_tail: 6, fearmur: 7, pipe: 8 };
    const OUTLINE = [63, 38, 49];
    const png = readPng(EXTRA);

    test('each draws from its own cell on the Tiny extra sheet', () => {
        for (const [id, col] of Object.entries(PICKED)) {
            const s = ITEM_SPRITES[id];
            assert.deepEqual([s.sheet, s.x, s.y, s.w, s.h], ['tinyExtra', col * 16, 0, 16, 16], id);
            assert.ok(s.x + s.w <= png.width, `${id} points past the sheet's edge`);
        }
    });

    test('the Wooden Sword keeps its Tiny Dungeon cell', () => {
        const s = ITEM_SPRITES.wooden_sword;
        assert.deepEqual([s.sheet, s.x, s.y], ['tinyDungeon', 11 * 16, 8 * 16]);
    });

    for (const [id, col] of Object.entries(PICKED)) {
        test(`${id}'s cell is drawn, and keeps the Tiny outline`, () => {
            const px = cellPixels(png, { x: col * 16, y: 0, w: 16, h: 16 });
            const opaque = px.filter(p => p[3] === 255);
            assert.ok(opaque.length >= 30, `${id}: only ${opaque.length} pixels drawn`);
            const outline = opaque.filter(p => p[0] === OUTLINE[0] && p[1] === OUTLINE[1] && p[2] === OUTLINE[2]);
            assert.ok(outline.length >= 20, `${id}: the outline is gone`);
            assert.ok(opaque.length > outline.length, `${id} is outline only`);
        });
    }

    test('no two of the four cells are the same picture', () => {
        const ids = Object.keys(PICKED);
        const sig = id => JSON.stringify(cellPixels(png, { x: PICKED[id] * 16, y: 0, w: 16, h: 16 }));
        for (let i = 0; i < ids.length; i++) {
            for (let j = i + 1; j < ids.length; j++) {
                assert.notEqual(sig(ids[i]), sig(ids[j]), `${ids[i]} and ${ids[j]} look the same`);
            }
        }
    });
});
