// forest-edge-mix.test.js — the forest past a map's edge varies (APR2). A map's
// border prop may be a list; each off-map cell picks one by a hash of its own
// position, so the same cell is the same tree every frame. A single name draws
// exactly as it always did.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { borderPropKey, borderPropKeys, PROP_SPRITES, SHEETS } from '../game/sprites.js';

const MIX = { tile: 13, prop: ['tree', 'pine'] };
const SINGLE = { tile: 52, prop: 'tree' };

describe('borderPropKey', () => {
    test('a single prop is that prop on every cell, as before', () => {
        for (let y = -8; y < 40; y++) {
            for (let x = -8; x < 40; x++) assert.equal(borderPropKey(SINGLE, x, y), 'tree');
        }
    });

    test('no border, or a border with no prop, draws no filler prop', () => {
        assert.equal(borderPropKey(null, 3, 4), null);
        assert.equal(borderPropKey({ tile: 41 }, 3, 4), null);
        assert.deepEqual(borderPropKeys({ tile: 41 }), []);
        assert.deepEqual(borderPropKeys(SINGLE), ['tree']);
        assert.deepEqual(borderPropKeys(MIX), ['tree', 'pine']);
    });

    test('the same cell always picks the same tree', () => {
        for (let y = -8; y < 40; y++) {
            for (let x = -8; x < 40; x++) {
                const first = borderPropKey(MIX, x, y);
                assert.equal(borderPropKey(MIX, x, y), first, `(${x},${y})`);
                assert.equal(borderPropKey({ ...MIX, prop: [...MIX.prop] }, x, y), first, `(${x},${y}) from a copy`);
            }
        }
    });

    test('both trees appear, near an even split, with no checkerboard or stripes', () => {
        let pines = 0, total = 0;
        const picks = {};
        for (let y = -10; y < 40; y++) {
            for (let x = -10; x < 44; x++) {
                const k = borderPropKey(MIX, x, y);
                assert.ok(MIX.prop.includes(k), `(${x},${y}) picked ${k}`);
                picks[`${x},${y}`] = k;
                total++;
                if (k === 'pine') pines++;
            }
        }
        assert.ok(pines > total * 0.4 && pines < total * 0.6, `${pines} of ${total} are pines`);
        // A pure parity or column pattern is the failure a raw FNV hash gives.
        let sameAsRight = 0, sameAsBelow = 0, n = 0;
        for (let y = -10; y < 39; y++) {
            for (let x = -10; x < 43; x++) {
                n++;
                if (picks[`${x},${y}`] === picks[`${x + 1},${y}`]) sameAsRight++;
                if (picks[`${x},${y}`] === picks[`${x},${y + 1}`]) sameAsBelow++;
            }
        }
        for (const [name, c] of [['right', sameAsRight], ['below', sameAsBelow]]) {
            assert.ok(c > n * 0.4 && c < n * 0.6, `${c} of ${n} cells match the neighbour ${name}`);
        }
    });
});

describe('the pine art', () => {
    test('is a one-cell sprite on the tall tree’s own sheet, at Tiny Town (4,2)', () => {
        const pine = PROP_SPRITES.pine;
        assert.ok(pine, 'no pine prop');
        assert.equal(pine.sheet, PROP_SPRITES.tree.sheet);
        assert.equal(SHEETS[pine.sheet].padding ?? 0, 0, 'tinyTown is packed: the stride is 16');
        assert.deepEqual([pine.sx, pine.sy, pine.sw, pine.sh], [4 * 16, 2 * 16, 16, 16]);
        assert.equal(pine.hTiles, 1);
        assert.equal(PROP_SPRITES.tree.hTiles, 2);
    });
});

describe('the maps', () => {
    const border = (file) => JSON.parse(readFileSync(new URL(`../game/${file}`, import.meta.url), 'utf8')).border;

    test('Town, the Carnival and Downtown mix the tall tree with the pine', () => {
        for (const file of ['town', 'carnival', 'downtown']) {
            const b = border(`${file}-map.json`);
            assert.deepEqual(b.prop, ['tree', 'pine'], file);
            const seen = new Set();
            for (let y = -6; y < 0; y++) for (let x = -6; x < 30; x++) seen.add(borderPropKey(b, x, y));
            assert.deepEqual([...seen].sort(), ['pine', 'tree'], `${file} past its north edge`);
        }
    });

    test('the Graveyard, Wilderness and Frozen Area keep their single tree', () => {
        for (const file of ['graveyard', 'wilderness', 'frozen']) {
            const b = border(`${file}-map.json`);
            assert.equal(b.prop, 'tree', file);
            for (let y = -6; y < 40; y++) for (let x = -6; x < 60; x++) assert.equal(borderPropKey(b, x, y), 'tree');
        }
    });

    test('every border prop, single or in a list, has art', () => {
        for (const file of ['town', 'carnival', 'downtown', 'graveyard', 'wilderness', 'frozen']) {
            const keys = borderPropKeys(border(`${file}-map.json`));
            assert.ok(keys.length > 0, `${file} names no border prop`);
            for (const k of keys) assert.ok(PROP_SPRITES[k], `${file}: border prop '${k}' has no art`);
        }
    });
});
