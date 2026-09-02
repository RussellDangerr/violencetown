// item-registry.test.js — direct coverage of the one function everything in
// Task 7 routes through. Before item-registry.js existed, resolveItemDef's
// logic only had four independent copies (Game._resolveItemDef, two inline
// checks in enemies.js, and a paraphrase in a test stub) and none of them
// were tested directly — every test that exercised it did so indirectly,
// through a caller. A caller test proves "X calls the resolver"; it proves
// nothing about what the resolver returns if gutted. These do.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { resolveItemDef, ALL_ITEM_IDS, WEAPON_ONLY_IDS } from '../game/item-registry.js';
import { ITEMS } from '../game/items.js';
import { WEAPONS } from '../game/weapons.js';

describe('resolveItemDef', () => {
    test('resolves a WEAPONS id', () => {
        assert.equal(resolveItemDef('lion_whip'), WEAPONS.lion_whip);
    });

    test('resolves an ITEMS id', () => {
        assert.equal(resolveItemDef('bandage'), ITEMS.bandage);
    });

    test('an unknown id resolves to null, not undefined', () => {
        assert.equal(resolveItemDef('not_a_real_item_xyz'), null);
    });

    test('is falsy-id-safe', () => {
        assert.equal(resolveItemDef(null), null);
        assert.equal(resolveItemDef(undefined), null);
        assert.equal(resolveItemDef(''), null);
    });
});

describe('ALL_ITEM_IDS / WEAPON_ONLY_IDS', () => {
    test('ALL_ITEM_IDS is the union of both tables', () => {
        assert.ok(ALL_ITEM_IDS.has('bandage'));
        assert.ok(ALL_ITEM_IDS.has('lion_whip'));
        assert.equal(ALL_ITEM_IDS.size, Object.keys(ITEMS).length + Object.keys(WEAPONS).length);
    });

    test('WEAPON_ONLY_IDS holds exactly the ids WEAPONS has and ITEMS does not', () => {
        for (const id of Object.keys(WEAPONS)) assert.ok(WEAPON_ONLY_IDS.has(id), `${id} missing from WEAPON_ONLY_IDS`);
        for (const id of WEAPON_ONLY_IDS) assert.equal(ITEMS[id], undefined, `${id} is in WEAPON_ONLY_IDS but also in ITEMS`);
    });
});
