// weapon-tiers.test.js — the tier generator (plans/ws2-tier-generator.md).
//
// One base weapon makes five tiers, grey to orange. A tier adds perks, never
// bigger numbers. The generated weapons stay out of the world, and nothing
// that exists today changes.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    WEAPONS, WEAPON_CLASSES, WEAPON_TIERS, WEAPON_TIER_KEYS, PERK_PLACEHOLDER,
    weaponTiers, classBase,
} from '../game/weapons.js';
import { ITEMS, VALUE_TIERS, itemTier, ARMOR_IDS, isArmorPiece } from '../game/items.js';
import { resolveItemDef, ALL_ITEM_IDS } from '../game/item-registry.js';

const GAME = join(dirname(fileURLToPath(import.meta.url)), '..', 'game');

// Every number in a def, keyed by its path, so a tier can be checked against its base.
function numbers(o, path = '', out = {}) {
    for (const [k, v] of Object.entries(o)) {
        const p = path ? `${path}.${k}` : k;
        if (typeof v === 'number') out[p] = v;
        else if (v && typeof v === 'object') numbers(v, p, out);
    }
    return out;
}

const ADDED = ['id', 'name', 'tier', 'baseId', 'perks'];

describe('the tier ladder', () => {
    test('is the five value tiers, grey to orange', () => {
        assert.deepEqual([...WEAPON_TIER_KEYS], ['grey', 'green', 'blue', 'purple', 'orange']);
        assert.deepEqual([...WEAPON_TIER_KEYS], VALUE_TIERS.map(t => t.key));
    });
});

describe('every class yields five tiers from one base', () => {
    const classIds = Object.keys(WEAPON_CLASSES);

    test('there are classes to check', () => {
        // A check that finds nothing would pass on nothing.
        assert.ok(classIds.length >= 18);
        assert.deepEqual(Object.keys(WEAPON_TIERS).sort(), [...classIds].sort());
    });

    for (const id of classIds) {
        test(`${id}: five tiers, in order, from its base`, () => {
            const base = classBase(id);
            const tiers = WEAPON_TIERS[id];
            assert.equal(tiers.length, 5);
            tiers.forEach((t, i) => {
                assert.equal(t.tier, WEAPON_TIER_KEYS[i]);
                assert.equal(t.id, `${id}_${WEAPON_TIER_KEYS[i]}`);
                assert.equal(t.baseId, base.id);
                assert.equal(t.weaponClass, id);
                assert.equal(t.equipSlot, 'weapon');
                assert.equal(itemTier(t).key, WEAPON_TIER_KEYS[i], `${t.id} shows the wrong colour`);
                assert.match(t.name, /^\[.+\]$/, `${t.id} name is not a bracketed placeholder`);
            });
            assert.equal(new Set(tiers.map(t => t.id)).size, 5);
        });
    }

    test('classBase is null for a class that is not in the table', () => {
        assert.equal(classBase('not_a_class'), null);
    });

    test('a class base carries no damage number: that is not ruled', () => {
        for (const id of classIds) assert.equal(classBase(id).damage, undefined, id);
    });
});

describe('a tier adds perks, not bigger numbers', () => {
    // The class bases carry no numbers, so also run the generator on real weapons.
    const bases = [
        ...Object.keys(WEAPON_CLASSES).map(classBase),
        ...Object.values(WEAPONS),
        ITEMS.pipe,
    ];

    test('the real weapons have numbers to compare', () => {
        assert.ok(Object.keys(numbers(WEAPONS.wooden_sword)).length > 0);
        assert.ok(Object.keys(numbers(ITEMS.pipe)).includes('damage'));
    });

    for (const base of bases) {
        test(`${base.id}: every number on every tier is the base's own`, () => {
            const want = numbers(base);
            for (const t of weaponTiers(base)) {
                const got = numbers(t);
                assert.deepEqual(got, want, `${t.id} changed a number`);
            }
        });

        test(`${base.id}: a tier changes nothing but its id, name, tier and perks`, () => {
            for (const t of weaponTiers(base)) {
                const strip = d => Object.fromEntries(Object.entries(d).filter(([k]) => !ADDED.includes(k)));
                assert.deepEqual(strip(t), strip(base), `${t.id} changed a field`);
            }
        });

        test(`${base.id}: each tier up has one more perk slot`, () => {
            const own = base.perks?.length ?? 0;
            weaponTiers(base).forEach((t, step) => {
                assert.equal(t.perks.length, own + step, `${t.id} perk count`);
                for (const p of t.perks.slice(own)) assert.equal(p, PERK_PLACEHOLDER);
            });
        });
    }

    test("a base's own perks carry up every tier", () => {
        const base = { ...classBase('axe'), perks: ['own'] };
        for (const t of weaponTiers(base)) assert.equal(t.perks[0], 'own');
        assert.deepEqual(weaponTiers(base)[4].perks, ['own', ...Array(4).fill(PERK_PLACEHOLDER)]);
    });

    test('the generated tiers cannot be changed at run time', () => {
        const t = WEAPON_TIERS.axe[2];
        assert.ok(Object.isFrozen(WEAPON_TIERS));
        assert.ok(Object.isFrozen(WEAPON_TIERS.axe));
        assert.ok(Object.isFrozen(t));
        assert.ok(Object.isFrozen(t.perks));
    });
});

describe('no existing item changes', () => {
    test('generating from a weapon does not touch it', () => {
        const before = structuredClone(WEAPONS.lion_whip);
        const tiers = weaponTiers(WEAPONS.lion_whip);
        assert.deepEqual(WEAPONS.lion_whip, before);
        assert.equal(Object.isFrozen(WEAPONS.lion_whip), false);
        assert.notEqual(tiers[0].grantsTricks, WEAPONS.lion_whip.grantsTricks, 'shares an array with its base');
    });

    test('WEAPONS holds the same weapons as before', () => {
        assert.deepEqual(Object.keys(WEAPONS).sort(),
            ['fearmur', 'gator_tail', 'lion_whip', 'ray_gun', 'wooden_sword']);
    });

    test('the placed weapons keep their numbers, and gain no tier or perks', () => {
        const pinned = {
            wooden_sword: [10, 6], ray_gun: [22, 45], fearmur: [14, 28],
            gator_tail: [16, 18], lion_whip: [12, 26],
        };
        for (const [id, [damage, baseValue]] of Object.entries(pinned)) {
            const d = WEAPONS[id];
            assert.equal(d.id, id);
            assert.equal(d.damage, damage, `${id} damage`);
            assert.equal(d.baseValue, baseValue, `${id} baseValue`);
            assert.equal(d.tier, undefined, `${id} gained a tier`);
            assert.equal(d.perks, undefined, `${id} gained perks`);
        }
        assert.equal(ITEMS.pipe.id, 'pipe');
        assert.equal(ITEMS.pipe.damage, 12);
        assert.equal(ITEMS.pipe.baseValue, 8);
        assert.equal(ITEMS.pipe.tier, undefined);
        assert.equal(ITEMS.pipe.perks, undefined);
    });

    const generated = Object.values(WEAPON_TIERS).flat().map(t => t.id);

    test('no generated id is a world item', () => {
        assert.equal(generated.length, Object.keys(WEAPON_CLASSES).length * 5);
        for (const id of generated) {
            assert.equal(resolveItemDef(id), null, `${id} resolves as a world item`);
            assert.equal(ALL_ITEM_IDS.has(id), false, `${id} is in ALL_ITEM_IDS`);
            assert.equal(WEAPONS[id], undefined);
            assert.equal(ITEMS[id], undefined);
        }
    });

    test('no map places a generated weapon', () => {
        const maps = readdirSync(GAME).filter(f => f.endsWith('-map.json'));
        assert.ok(maps.length > 0, 'found no maps to check');
        for (const f of maps) {
            const text = readFileSync(join(GAME, f), 'utf8');
            for (const id of generated) {
                assert.equal(text.includes(`"${id}"`), false, `${f} places ${id}`);
            }
        }
    });
});

// ── Armor (plans/ws5-armor-tiers-same-generator.md) ──────────────────────────
// The same generator, run over every armor piece. No second generator.

describe('every armor piece yields five tiers from one base', () => {
    test('the armor set is the five Sewer pieces', () => {
        // A check that finds nothing would pass on nothing.
        assert.deepEqual([...ARMOR_IDS].sort(),
            ['cardboard_cuirass', 'foil_hat', 'latex_gloves', 'red_cape', 'shoe_bags']);
        assert.ok(Object.isFrozen(ARMOR_IDS));
    });

    test('weapons, duration equips and throwables are not armor', () => {
        for (const id of ['pipe', 'soap', 'bandage', 'rock', 'boardwalk_burger']) {
            assert.equal(isArmorPiece(ITEMS[id]), false, id);
        }
        for (const w of Object.values(WEAPONS)) assert.equal(isArmorPiece(w), false, w.id);
        assert.equal(isArmorPiece(null), false);
        assert.equal(isArmorPiece(undefined), false);
    });

    for (const id of ARMOR_IDS) {
        const base = ITEMS[id];

        test(`${id}: five tiers, in order, from its base`, () => {
            const tiers = weaponTiers(base);
            assert.equal(tiers.length, 5);
            tiers.forEach((t, i) => {
                assert.equal(t.tier, WEAPON_TIER_KEYS[i]);
                assert.equal(t.id, `${id}_${WEAPON_TIER_KEYS[i]}`);
                assert.equal(t.baseId, id);
                assert.equal(t.equipSlot, base.equipSlot);
                assert.equal(t.useType, 'equip');
                assert.ok(isArmorPiece(t), `${t.id} is no longer armor`);
                assert.equal(itemTier(t).key, WEAPON_TIER_KEYS[i], `${t.id} shows the wrong colour`);
                assert.match(t.name, /^\[.+\]$/, `${t.id} name is not a bracketed placeholder`);
                assert.ok(Object.isFrozen(t) && Object.isFrozen(t.perks), `${t.id} is not frozen`);
            });
            assert.equal(new Set(tiers.map(t => t.id)).size, 5);
        });

        test(`${id}: every number on every tier is the base's own`, () => {
            const want = numbers(base);
            assert.ok('armor' in want, `${id} has no armor number to compare`);
            for (const t of weaponTiers(base)) assert.deepEqual(numbers(t), want, `${t.id} changed a number`);
        });

        test(`${id}: a tier changes nothing but its id, name, tier and perks`, () => {
            const strip = d => Object.fromEntries(Object.entries(d).filter(([k]) => !ADDED.includes(k)));
            for (const t of weaponTiers(base)) assert.deepEqual(strip(t), strip(base), `${t.id} changed a field`);
        });

        test(`${id}: each tier up has one more perk slot`, () => {
            weaponTiers(base).forEach((t, step) => {
                assert.equal(t.perks.length, step, `${t.id} perk count`);
                for (const p of t.perks) assert.equal(p, PERK_PLACEHOLDER);
            });
        });
    }

    test('the armor pieces keep their numbers, and gain no tier or perks', () => {
        const pinned = {
            foil_hat: [2, 10], cardboard_cuirass: [4, 14], latex_gloves: [1, 8],
            red_cape: [1, 10], shoe_bags: [2, 10],
        };
        for (const [id, [armor, baseValue]] of Object.entries(pinned)) {
            const before = structuredClone(ITEMS[id]);
            weaponTiers(ITEMS[id]);
            assert.deepEqual(ITEMS[id], before, `generating changed ${id}`);
            assert.equal(Object.isFrozen(ITEMS[id]), false);
            assert.equal(ITEMS[id].armor, armor, `${id} armor`);
            assert.equal(ITEMS[id].baseValue, baseValue, `${id} baseValue`);
            assert.equal(ITEMS[id].tier, undefined, `${id} gained a tier`);
            assert.equal(ITEMS[id].perks, undefined, `${id} gained perks`);
        }
        assert.equal(ITEMS.shoe_bags.sludgeImmune, true);
        assert.equal(weaponTiers(ITEMS.shoe_bags)[4].sludgeImmune, true, 'a tier lost the shoe bags flag');
    });

    const generated = ARMOR_IDS.flatMap(id => weaponTiers(ITEMS[id]).map(t => t.id));

    test('no generated armor is a world item, and no map places one', () => {
        assert.equal(generated.length, ARMOR_IDS.length * 5);
        for (const id of generated) {
            assert.equal(resolveItemDef(id), null, `${id} resolves as a world item`);
            assert.equal(ALL_ITEM_IDS.has(id), false, `${id} is in ALL_ITEM_IDS`);
        }
        const maps = readdirSync(GAME).filter(f => f.endsWith('-map.json'));
        assert.ok(maps.length > 0, 'found no maps to check');
        for (const f of maps) {
            const text = readFileSync(join(GAME, f), 'utf8');
            for (const id of generated) assert.equal(text.includes(`"${id}"`), false, `${f} places ${id}`);
        }
    });
});
