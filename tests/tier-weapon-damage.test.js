// tier-weapon-damage.test.js — plans/fx6-tier-weapon-damage.md.
//
// A weapon with no damage number swung for NaN, and NaN hp never reaches 0,
// so the enemy could not die. takeDamage now treats a non-number hit as 0
// (the minimum 1 still lands), and the content check fails on any holdable
// weapon with no damage number. Every tier weapon carries its class's damage:
// the four classes with a weapon in the game copy it, the rest take 10, the
// same at every tier.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Entity, attack, computeHit } from '../game/combat.js';
import { validateContent, isHoldableWeapon } from '../game/content-validate.js';
import {
    WEAPONS, WEAPON_CLASSES, WEAPON_TIERS, WEAPON_CLASS_DAMAGE, WEAPON_TIER_KEYS, classBase,
} from '../game/weapons.js';
import { ITEMS } from '../game/items.js';

const NOT_NUMBERS = [undefined, null, NaN, '12', {}];

describe('a hit that is not a number', () => {
    for (const bad of NOT_NUMBERS) {
        test(`${String(bad)}: lands the minimum and leaves hp a real number`, () => {
            const e = new Entity({ name: 'target', hp: 30 });
            const dealt = e.takeDamage(bad);
            assert.equal(dealt, 1);
            assert.equal(e.hp, 29);
            assert.ok(Number.isFinite(e.hp));
            assert.equal(e.isAlive(), true);
        });
    }

    test('armour cannot turn it into NaN either', () => {
        const e = new Entity({ name: 'target', hp: 30, armor: 5 });
        assert.equal(e.takeDamage(NaN), 1);
        assert.equal(e.hp, 29);
    });

    test('enough of them still kill', () => {
        const e = new Entity({ name: 'target', hp: 3 });
        for (let i = 0; i < 3; i++) e.takeDamage(undefined);
        assert.equal(e.hp, 0);
        assert.equal(e.isDead(), true);
    });

    test("a weapon with no damage, through the game's hit math, cannot leave an enemy at NaN", () => {
        // A Cleave swings for the weapon's damage * 2/3 (main.js), and with no
        // damage that is NaN all the way through computeHit to attack().
        const weapon = { id: 'no_damage', equipSlot: 'weapon' };
        const swing = computeHit({ base: weapon.damage * 2 / 3 });
        assert.ok(Number.isNaN(swing), 'the hole this guards: computeHit passes NaN on');
        const player = { name: 'p' };
        const enemy = new Entity({ name: 'enemy', hp: 2 });
        const first = attack(player, enemy, swing);
        assert.ok(Number.isFinite(enemy.hp), `hp is ${enemy.hp}`);
        assert.equal(first.dealt, 1);
        assert.equal(first.rawDamage, 0);
        assert.equal(first.blocked, -1, 'blocked reads as it does for any hit of 0');
        const second = attack(player, enemy, swing);
        assert.equal(second.killed, true);
        assert.equal(enemy.hp, 0);
    });

    test('a real number hits exactly as before', () => {
        const e = new Entity({ name: 'target', hp: 100, armor: 3 });
        assert.equal(e.takeDamage(10), 7);
        assert.equal(e.hp, 93);
        const r = attack({ name: 'p' }, new Entity({ name: 't', hp: 100, armor: 3 }), 10);
        assert.deepEqual([r.rawDamage, r.dealt, r.blocked], [10, 7, 3]);
    });
});

describe('the content check: every holdable weapon has a damage number', () => {
    const gameDir = fileURLToPath(new URL('../game/', import.meta.url));
    const maps = readdirSync(gameDir).filter(f => f.endsWith('-map.json')).sort()
        .map(file => ({ file, data: JSON.parse(readFileSync(join(gameDir, file), 'utf8')) }));
    const damageProblems = r => r.problems.filter(p => /no damage number/.test(p));

    test("today's weapons all pass", () => {
        // A check that finds nothing would pass on nothing.
        const holdable = [...Object.values(WEAPONS), ...Object.values(ITEMS).filter(isHoldableWeapon)];
        assert.ok(holdable.length >= 6, `only ${holdable.length} holdable weapons found`);
        assert.ok(holdable.some(d => d.id === 'pipe'), 'the pipe is a holdable weapon');
        assert.deepEqual(damageProblems(validateContent(maps)), []);
    });

    for (const bad of [undefined, null, NaN, '12', Infinity]) {
        test(`a weapon whose damage is ${String(bad)} fails`, () => {
            const weapons = { ...WEAPONS, broken: { id: 'broken', equipSlot: 'weapon', damage: bad } };
            const got = damageProblems(validateContent(maps, { weapons }));
            assert.deepEqual(got, ["weapon 'broken': has no damage number"]);
        });
    }

    test('a weapon-slot item with no damage fails', () => {
        const items = { ...ITEMS, bare_pipe: { id: 'bare_pipe', equipSlot: 'weapon' } };
        const got = damageProblems(validateContent(maps, { items }));
        assert.deepEqual(got, ["item 'bare_pipe': has no damage number"]);
    });

    test('an item that is not held in the weapon slot needs no damage', () => {
        assert.equal(isHoldableWeapon(ITEMS.pipe), true);
        for (const id of ['rock', 'soap', 'foil_hat', 'bandage']) assert.equal(isHoldableWeapon(ITEMS[id]), false, id);
        assert.equal(isHoldableWeapon(null), false);
    });
});

describe("every tier weapon hits for its class's number", () => {
    // The ruled numbers: the four classes with a weapon copy it, the rest take 10.
    const RULED = { sword: 10, wand: 22, whip: 12, hammer: 12 };
    const classIds = Object.keys(WEAPON_CLASSES);

    test('the table names every class, and only the classes', () => {
        assert.ok(classIds.length >= 18, `only ${classIds.length} classes`);
        assert.deepEqual(Object.keys(WEAPON_CLASS_DAMAGE).sort(), [...classIds].sort());
        assert.ok(Object.isFrozen(WEAPON_CLASS_DAMAGE));
    });

    test('each class takes the ruled number', () => {
        for (const id of classIds) assert.equal(WEAPON_CLASS_DAMAGE[id], RULED[id] ?? 10, id);
    });

    test('the four classes with a weapon copy that weapon', () => {
        assert.equal(WEAPON_CLASS_DAMAGE.sword, WEAPONS.wooden_sword.damage);
        assert.equal(WEAPON_CLASS_DAMAGE.wand, WEAPONS.ray_gun.damage);
        assert.equal(WEAPON_CLASS_DAMAGE.whip, WEAPONS.lion_whip.damage);
        assert.equal(WEAPON_CLASS_DAMAGE.hammer, ITEMS.pipe.damage, 'the hammer copies the pipe');
    });

    test("a class base carries its class's damage", () => {
        for (const id of classIds) assert.equal(classBase(id).damage, WEAPON_CLASS_DAMAGE[id], id);
    });

    test('every tier of every class carries the same real damage', () => {
        const all = Object.values(WEAPON_TIERS).flat();
        assert.equal(all.length, classIds.length * WEAPON_TIER_KEYS.length);
        for (const [id, tiers] of Object.entries(WEAPON_TIERS)) {
            for (const t of tiers) {
                assert.ok(Number.isFinite(t.damage) && t.damage > 0, `${t.id} damage is ${t.damage}`);
                assert.equal(t.damage, WEAPON_CLASS_DAMAGE[id], `${t.id} damage`);
            }
        }
    });

    test('a tier weapon, through the hit math, kills an enemy', () => {
        for (const tiers of Object.values(WEAPON_TIERS)) {
            const t = tiers.at(-1);
            const swing = computeHit({ base: t.damage });
            assert.equal(swing, t.damage, t.id);
            const enemy = new Entity({ name: 'enemy', hp: 25 });
            let r;
            for (let i = 0; i < 25 && enemy.isAlive(); i++) r = attack({ name: 'p' }, enemy, swing);
            assert.equal(r.killed, true, `${t.id} never killed`);
            assert.equal(enemy.hp, 0);
        }
    });
});

describe('the content check covers the tier weapons', () => {
    const gameDir = fileURLToPath(new URL('../game/', import.meta.url));
    const maps = readdirSync(gameDir).filter(f => f.endsWith('-map.json')).sort()
        .map(file => ({ file, data: JSON.parse(readFileSync(join(gameDir, file), 'utf8')) }));
    const damageProblems = r => r.problems.filter(p => /no damage number/.test(p));

    test("today's tiers all pass", () => {
        assert.ok(Object.values(WEAPON_TIERS).flat().length >= 90);
        assert.deepEqual(damageProblems(validateContent(maps)), []);
    });

    for (const bad of [undefined, NaN, '10']) {
        test(`a tier whose damage is ${String(bad)} fails`, () => {
            const axe = WEAPON_TIERS.axe.map((t, i) => (i === 2 ? { ...t, damage: bad } : t));
            const got = damageProblems(validateContent(maps, { weaponTiers: { ...WEAPON_TIERS, axe } }));
            assert.deepEqual(got, ["weapon tier 'axe_blue': has no damage number"]);
        });
    }

    test('a whole class built from a base with no damage fails at every tier', () => {
        const { damage, ...bare } = classBase('bell');
        assert.equal(damage, 10);
        const bell = WEAPON_TIERS.bell.map(t => ({ ...bare, id: t.id, tier: t.tier }));
        const got = damageProblems(validateContent(maps, { weaponTiers: { ...WEAPON_TIERS, bell } }));
        assert.deepEqual(got, WEAPON_TIER_KEYS.map(k => `weapon tier 'bell_${k}': has no damage number`));
    });
});
