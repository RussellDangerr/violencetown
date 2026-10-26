// tier-weapon-damage.test.js — plans/fx6-tier-weapon-damage.md.
//
// A weapon with no damage number swung for NaN, and NaN hp never reaches 0,
// so the enemy could not die. takeDamage now treats a non-number hit as 0
// (the minimum 1 still lands), and the content check fails on any holdable
// weapon with no damage number.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Entity, attack, computeHit } from '../game/combat.js';
import { validateContent, isHoldableWeapon } from '../game/content-validate.js';
import { WEAPONS } from '../game/weapons.js';
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
