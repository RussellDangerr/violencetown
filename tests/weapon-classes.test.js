// weapon-classes.test.js — the weapon class table (plans/ws1-weapon-class-table.md).
//
// Each ruled class exists, takes 1 or 2 hands, and lands at least one hit
// kind; every weapon in the game names a class that is in the table.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { WEAPONS, WEAPON_CLASSES, ATTACK_KINDS, weaponClassOf } from '../game/weapons.js';
import { ITEMS } from '../game/items.js';

// The ruled list: both lists are classes, book and grimoire are one class,
// shield counts once, and the fist is two classes (knuckles and claws).
const RULED = [
    'shield', 'axe', 'sword', 'dagger', 'hammer', 'great_sword', 'battle_axe', 'war_hammer',
    'book', 'bell', 'whip', 'knuckles', 'claws', 'doll',
    'wand', 'staff', 'throwing_axe', 'frying_pan',
];
const TWO_HANDED = ['great_sword', 'battle_axe', 'war_hammer'];

describe('the class table', () => {
    test('holds exactly the ruled classes', () => {
        assert.deepEqual(Object.keys(WEAPON_CLASSES).sort(), [...RULED].sort());
    });

    test('book and grimoire are one class; the fist is two', () => {
        assert.equal(WEAPON_CLASSES.grimoire, undefined);
        assert.equal(WEAPON_CLASSES.fist, undefined);
        assert.ok(WEAPON_CLASSES.book);
        assert.ok(WEAPON_CLASSES.knuckles && WEAPON_CLASSES.claws);
    });

    for (const id of RULED) {
        test(`${id}: its id, its hands and its hit kinds`, () => {
            const c = WEAPON_CLASSES[id];
            assert.equal(c.id, id);
            assert.ok(c.hands === 1 || c.hands === 2, `${id} hands is ${c.hands}`);
            assert.ok(Array.isArray(c.attackKinds) && c.attackKinds.length > 0, `${id} lands no hit kind`);
            for (const k of c.attackKinds) assert.ok(ATTACK_KINDS.includes(k), `${id}: unknown hit kind ${k}`);
            assert.equal(new Set(c.attackKinds).size, c.attackKinds.length, `${id} repeats a hit kind`);
            assert.ok(Array.isArray(c.kit), `${id} kit is not a list`);
        });
    }

    test('only the great sword, battle axe and war hammer take both hands', () => {
        const two = Object.values(WEAPON_CLASSES).filter(c => c.hands === 2).map(c => c.id).sort();
        assert.deepEqual(two, [...TWO_HANDED].sort());
    });

    test('knuckles crush and claws slash', () => {
        assert.deepEqual([...WEAPON_CLASSES.knuckles.attackKinds], ['crush']);
        assert.deepEqual([...WEAPON_CLASSES.claws.attackKinds], ['slash']);
    });

    test('the hit kinds are slash, stab and crush', () => {
        assert.deepEqual([...ATTACK_KINDS].sort(), ['crush', 'slash', 'stab']);
    });

    test('the table cannot be changed at run time', () => {
        assert.ok(Object.isFrozen(WEAPON_CLASSES));
        assert.ok(Object.isFrozen(WEAPON_CLASSES.sword));
        assert.ok(Object.isFrozen(WEAPON_CLASSES.sword.attackKinds));
        assert.ok(Object.isFrozen(ATTACK_KINDS));
    });
});

describe('every weapon names a class', () => {
    const weaponDefs = [
        ...Object.values(WEAPONS),
        ...Object.values(ITEMS).filter(d => d.equipSlot === 'weapon' || d.category === 'weapon'),
    ];

    test('there are weapons to check', () => {
        // A check that finds nothing would pass on nothing.
        assert.ok(Object.keys(WEAPONS).length >= 5);
        assert.ok(weaponDefs.some(d => d.id === 'pipe'), 'the pipe is a weapon-slot item');
    });

    for (const def of weaponDefs) {
        test(`${def.id} belongs to a class in the table`, () => {
            const c = weaponClassOf(def);
            assert.ok(c, `${def.id} names "${def.weaponClass}", which is not a class`);
            assert.equal(c, WEAPON_CLASSES[def.weaponClass]);
        });
    }

    test('the obvious ones land where they should', () => {
        assert.equal(WEAPONS.wooden_sword.weaponClass, 'sword');
        assert.equal(WEAPONS.lion_whip.weaponClass, 'whip');
    });

    test('weaponClassOf returns null for no def, or a def that names no class', () => {
        assert.equal(weaponClassOf(null), null);
        assert.equal(weaponClassOf(undefined), null);
        assert.equal(weaponClassOf({ id: 'x' }), null);
        assert.equal(weaponClassOf({ id: 'x', weaponClass: 'not_a_class' }), null);
        assert.equal(weaponClassOf(ITEMS.bandage), null);
    });
});
