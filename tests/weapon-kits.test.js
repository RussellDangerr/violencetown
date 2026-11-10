// weapon-kits.test.js — a weapon class owns its wheel moves (plans/wk1-weapon-class-moves.md).
//
// WKR1: the sword owns Cleave, the two-handers own Spin, the hammer owns a stun.
// WKR2: a move outside the kit is not on the wheel at all.

import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WEAPONS, WEAPON_CLASSES, weaponClassOf } from '../game/weapons.js';
import { ITEMS } from '../game/items.js';
import { ROOT, MELEE_MOVES, setMeleeKit, isOffensiveLeaf } from '../game/wheel-model.js';

const melee = () => ROOT.children[0].children[0];
const keys = () => melee().children.map(c => c.key);
const KIT_MOVES = ['cleave', 'spin', 'stun'];

afterEach(() => setMeleeKit(null));

describe('class kits follow the ruling', () => {
    test('the sword brings Cleave', () => assert.deepEqual([...WEAPON_CLASSES.sword.kit], ['cleave']));
    test('the hammer brings the stun', () => assert.deepEqual([...WEAPON_CLASSES.hammer.kit], ['stun']));
    for (const id of ['great_sword', 'battle_axe', 'war_hammer']) {
        test(`${id} (two-handed) brings Spin`, () => assert.deepEqual([...WEAPON_CLASSES[id].kit], ['spin']));
    }
    test('no other class brings anything yet', () => {
        const owners = ['sword', 'hammer', 'great_sword', 'battle_axe', 'war_hammer'];
        for (const c of Object.values(WEAPON_CLASSES)) {
            if (!owners.includes(c.id)) assert.deepEqual([...c.kit], [], c.id);
        }
    });
    test('every kit entry is a move on the Melee ring', () => {
        const all = MELEE_MOVES.map(m => m.key);
        for (const c of Object.values(WEAPON_CLASSES)) for (const k of c.kit) assert.ok(all.includes(k), `${c.id}: ${k}`);
    });
    test('the starting sword keeps Cleave', () => {
        assert.deepEqual([...weaponClassOf(WEAPONS.wooden_sword).kit], ['cleave']);
    });
    test('the great sword in the world is a two-hander with Spin', () => {
        assert.deepEqual([...weaponClassOf(WEAPONS.great_sword).kit], ['spin']);
    });
    test('the pipe is a hammer and carries the stun', () => {
        const pipe = Object.values(ITEMS).concat(Object.values(WEAPONS)).find(d => d.weaponClass === 'hammer');
        assert.ok(pipe);
        assert.deepEqual([...weaponClassOf(pipe).kit], ['stun']);
    });
});

describe('the Melee ring shows only the kit', () => {
    test('it starts as Hit, Cleave, Spin (the stun comes only with a hammer)', () => assert.deepEqual(keys(), ['hit', 'cleave', 'spin']));
    test('a sword: Hit and Cleave', () => {
        setMeleeKit(WEAPON_CLASSES.sword.kit);
        assert.deepEqual(keys(), ['hit', 'cleave']);
    });
    test('a hammer: Hit and the stun', () => {
        setMeleeKit(WEAPON_CLASSES.hammer.kit);
        assert.deepEqual(keys(), ['hit', 'stun']);
    });
    test('a two-hander: Hit and Spin', () => {
        setMeleeKit(WEAPON_CLASSES.great_sword.kit);
        assert.deepEqual(keys(), ['hit', 'spin']);
    });
    test('a class with no kit: Hit alone, and nothing is greyed in its place', () => {
        setMeleeKit(WEAPON_CLASSES.dagger.kit);
        assert.deepEqual(keys(), ['hit']);
        assert.ok(!melee().children.some(c => c.placeholder));
    });
    test('Hit stays first whatever the kit', () => {
        for (const c of Object.values(WEAPON_CLASSES)) {
            setMeleeKit(c.kit);
            assert.equal(keys()[0], 'hit');
            assert.ok(!keys().some(k => KIT_MOVES.includes(k) && !c.kit.includes(k)), c.id);
        }
    });
    test('the stun is an adjacent, offensive move', () => {
        const stun = MELEE_MOVES.find(m => m.key === 'stun');
        assert.equal(stun.aimType, 'adjacent');
        assert.ok(isOffensiveLeaf(stun));
    });
});

describe('main.js wires it', () => {
    const src = readFileSync(new URL('../game/main.js', import.meta.url), 'utf8');
    test('the wheel is synced to the weapon in hand when it opens', () => {
        assert.match(src, /_openWheel\(\) \{[^]*?this\._syncMeleeKit\?\.\(\)/);
    });
    test('the stun costs the survivor a turn, as the shove does', () => {
        const m = src.match(/case 'stunAttack': \{[^]*?\r?\n            \}\r?\n/);
        assert.ok(m, 'no stunAttack case');
        assert.match(m[0], /_spunTurns = 1/);
    });
});
