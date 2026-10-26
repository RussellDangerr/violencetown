// armor-tier-table.test.js — the armor tier table (plans/fx22-armor-tier-table.md).
//
// ARMOR_TIERS sits beside WEAPON_TIERS in weapons.js: every armor piece's five
// tiers, grey to orange, made by the one generator. It is data only; no tier
// is in the world.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARMOR_TIERS, WEAPON_TIERS, WEAPON_TIER_KEYS, weaponTiers } from '../game/weapons.js';
import { ITEMS, ARMOR_IDS, isArmorPiece, itemTier } from '../game/items.js';
import { resolveItemDef, ALL_ITEM_IDS } from '../game/item-registry.js';

const GAME = join(dirname(fileURLToPath(import.meta.url)), '..', 'game');

describe('the armor tier table', () => {
    test('has one entry per armor piece, and there are pieces to check', () => {
        // A check that finds nothing would pass on nothing.
        assert.ok(ARMOR_IDS.length >= 5);
        assert.deepEqual(Object.keys(ARMOR_TIERS).sort(), [...ARMOR_IDS].sort());
    });

    test('is its own table, not part of the weapon one', () => {
        for (const id of ARMOR_IDS) assert.equal(WEAPON_TIERS[id], undefined, id);
    });

    for (const id of ARMOR_IDS) {
        test(`${id}: matches the generator, tier by tier`, () => {
            const want = weaponTiers(ITEMS[id]);
            const got = ARMOR_TIERS[id];
            assert.equal(got.length, 5);
            assert.deepEqual(got, want);
        });

        test(`${id}: five armor tiers, grey to orange, from this piece`, () => {
            ARMOR_TIERS[id].forEach((t, i) => {
                assert.equal(t.tier, WEAPON_TIER_KEYS[i]);
                assert.equal(t.id, `${id}_${WEAPON_TIER_KEYS[i]}`);
                assert.equal(t.baseId, id);
                assert.ok(isArmorPiece(t), `${t.id} is not armor`);
                assert.equal(itemTier(t).key, WEAPON_TIER_KEYS[i], `${t.id} shows the wrong colour`);
                assert.match(t.name, /^\[.+\]$/, `${t.id} name is not a bracketed placeholder`);
            });
        });
    }

    test('cannot be changed at run time', () => {
        assert.ok(Object.isFrozen(ARMOR_TIERS));
        for (const id of ARMOR_IDS) {
            assert.ok(Object.isFrozen(ARMOR_TIERS[id]), id);
            for (const t of ARMOR_TIERS[id]) assert.ok(Object.isFrozen(t) && Object.isFrozen(t.perks), t.id);
        }
    });

    test('building it left the armor pieces as they were', () => {
        for (const id of ARMOR_IDS) {
            assert.equal(Object.isFrozen(ITEMS[id]), false, id);
            assert.equal(ITEMS[id].tier, undefined, `${id} gained a tier`);
            assert.equal(ITEMS[id].perks, undefined, `${id} gained perks`);
        }
    });

    const generated = Object.values(ARMOR_TIERS).flat().map(t => t.id);

    test('no tier in it is a world item, and no map places one', () => {
        assert.equal(generated.length, ARMOR_IDS.length * 5);
        for (const id of generated) {
            assert.equal(resolveItemDef(id), null, `${id} resolves as a world item`);
            assert.equal(ALL_ITEM_IDS.has(id), false, `${id} is in ALL_ITEM_IDS`);
            assert.equal(ITEMS[id], undefined, `${id} is in ITEMS`);
        }
        const maps = readdirSync(GAME).filter(f => f.endsWith('-map.json'));
        assert.ok(maps.length > 0, 'found no maps to check');
        for (const f of maps) {
            const text = readFileSync(join(GAME, f), 'utf8');
            for (const id of generated) assert.equal(text.includes(`"${id}"`), false, `${f} places ${id}`);
        }
    });
});
