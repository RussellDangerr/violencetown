// frozen-creatures.test.js — the frozen area's mooks (plans/ic4-frozen-creatures.md):
// a mob slot pooling three creatures, dealt to three spawns so all three stand in
// the area, each with art, the weakness chart's cold row, [TEXT] examine text, and
// numbers copied from an existing enemy. The bench lists them.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { SLOTS, ENTRIES, pickSlots, defaultPicks, resolveSpawn } from '../game/slots.js';
import { Enemy, spawnEnemy } from '../game/enemies.js';
import { ENEMY_SPRITES } from '../game/sprites.js';
import { weaknessesOf, resistancesOf } from '../game/elements.js';
import { elementalMult } from '../game/combat.js';
import { GameMap } from '../game/map.js';
import { loadMapRoster } from '../tools/balance-harness.mjs';

const GAME = join(dirname(fileURLToPath(import.meta.url)), '..', 'game');
const raw = (f) => JSON.parse(readFileSync(join(GAME, f), 'utf8'));

const FROZEN = 'frozen-map.json';
const SLOT = 'frozen.mob';
const POOL = ['snowman', 'yeti', 'polar_bear'];
const TYPES = ['Snowman', 'Yeti', 'Polar Bear'];

const frozen = raw(FROZEN);
const mobSpawns = frozen.enemies.filter(s => s.slot === SLOT);
const spawnedWith = (picks) => mobSpawns.map(s => spawnEnemy(resolveSpawn(s, picks)));

describe('the frozen area\'s mob slot', () => {
    test('is a mob slot on the frozen map, pooling the three creatures', () => {
        const slot = SLOTS[SLOT];
        assert.ok(slot, 'no frozen.mob slot');
        assert.equal(slot.kind, 'mob');
        assert.equal(slot.map, FROZEN);
        assert.deepEqual(slot.pool.map(p => p.entry), POOL);
        for (const id of POOL) assert.ok(ENTRIES[id], `${id} is not a registry entry`);
    });

    test('the map seats one spawn per pool entry, on open ground clear of both doors', () => {
        assert.equal(mobSpawns.length, POOL.length);
        assert.deepEqual(mobSpawns.map(s => s.seat).sort(), [0, 1, 2]);
        const map = new GameMap(frozen, FROZEN);
        const landings = [[9, 2], [17, 6]];   // where the Factory and Wilderness doors land you
        for (const s of mobSpawns) {
            assert.ok(map.isWalkable(s.x, s.y), `${s.id} stands on a blocked tile`);
            assert.ok(!frozen.transitions.some(t => t.x === s.x && t.y === s.y), `${s.id} stands in a doorway`);
            for (const [lx, ly] of landings) {
                assert.ok(Math.abs(s.x - lx) + Math.abs(s.y - ly) >= 5, `${s.id} stands on top of a landing`);
            }
        }
        assert.equal(new Set(mobSpawns.map(s => s.id)).size, mobSpawns.length, 'two spawns share an id');
    });

    test('with no deck saved (the bench, an older save) the seats deal the pool in order', () => {
        assert.deepEqual(spawnedWith(defaultPicks()).map(e => e.type), TYPES);
        assert.deepEqual(spawnedWith(null).map(e => e.type), TYPES);
        for (const e of spawnedWith(defaultPicks())) assert.equal(e.slot, SLOT);
    });

    test('every new game deals all three into the area, in an order that varies by seed', () => {
        const orders = new Set();
        for (let seed = 0; seed < 60; seed++) {
            const types = spawnedWith(pickSlots(seed)).map(e => e.type);
            assert.deepEqual([...types].sort(), [...TYPES].sort(), `seed ${seed} left a creature out`);
            orders.add(types.join(','));
        }
        assert.ok(orders.size >= 3, `only ${orders.size} deal orders across 60 seeds`);
    });

    test('the same seed deals the same deck', () => {
        for (const seed of [0, 7, 0xFFFFFFFF]) assert.deepEqual(pickSlots(seed)[SLOT], pickSlots(seed)[SLOT]);
    });

    test('a mob slot moves no anchor pick: the bosses and the Crat are picked as before', () => {
        const anchorsOnly = Object.fromEntries(Object.entries(SLOTS).filter(([, s]) => s.kind !== 'mob'));
        for (let seed = 0; seed < 100; seed++) {
            const withMob = pickSlots(seed);
            const without = pickSlots(seed, anchorsOnly);
            for (const id of Object.keys(anchorsOnly)) assert.equal(withMob[id], without[id], `seed ${seed}: ${id} moved`);
        }
    });

    test('a mob slot has no default pick, and a broken saved deck falls back to the pool order', () => {
        assert.equal(SLOT in defaultPicks(), false);
        for (const bad of [['snowman'], ['snowman', 'snowman', 'yeti'], 'yeti', ['a', 'b', 'c']]) {
            assert.deepEqual(spawnedWith({ [SLOT]: bad }).map(e => e.type), TYPES, `deck ${JSON.stringify(bad)}`);
        }
    });

    test('a seat past the deck wraps round, and a missing seat sits at the front', () => {
        const at = (seat) => resolveSpawn({ id: 'x', slot: SLOT, seat, x: 1, y: 1 }, defaultPicks()).type;
        assert.equal(at(3), 'Snowman');
        assert.equal(at(4), 'Yeti');
        assert.equal(at(undefined), 'Snowman');
        assert.equal(at(-1), 'Snowman');
    });

    test('they are born hostile', () => {
        for (const e of spawnedWith(defaultPicks())) assert.equal(e.allegiance, 'hostile', e.type);
    });
});

describe('each creature', () => {
    const creatures = spawnedWith(defaultPicks());

    test('has its own sprite, none shared with another frozen-area type', () => {
        const cells = new Set();
        for (const t of TYPES) {
            const s = ENEMY_SPRITES[t];
            assert.ok(s, `${t} has no sprite`);
            cells.add(`${s.sheet}:${s.col},${s.row}`);
        }
        assert.equal(cells.size, TYPES.length);
    });

    test('has the weakness chart\'s cold row, which is not empty', () => {
        assert.ok(weaknessesOf('cold').length > 0 && resistancesOf('cold').length > 0);
        for (const e of creatures) {
            assert.deepEqual(e.weak, weaknessesOf('cold'), e.type);
            assert.deepEqual(e.resist, resistancesOf('cold'), e.type);
        }
    });

    test('the row is live in a fight: double from its weakness, half from its resistance', () => {
        const [w] = weaknessesOf('cold');
        const [r] = resistancesOf('cold');
        for (const e of creatures) {
            assert.equal(elementalMult(w, e), 2, e.type);
            assert.equal(elementalMult(r, e), 0.5, e.type);
            assert.equal(elementalMult('cold', e), 1, `${e.type}: its own phase is neutral`);
        }
    });

    test('carries [TEXT] examine text and a bracketed placeholder name', () => {
        for (const e of creatures) {
            assert.equal(e.examine, '[TEXT]', e.type);
            assert.equal(e.name, `[${e.type}]`);
        }
    });

    test('copies its numbers and kit from the nearest existing enemy', () => {
        const source = (file, id) => raw(file).enemies.find(s => s.id === id);
        const from = {
            Snowman: source('graveyard-map.json', 'skel1'),
            Yeti: source('sewer-map.json', 'e6'),
            'Polar Bear': source('sewer-map.json', 'e3'),
        };
        for (const e of creatures) {
            const s = from[e.type];
            assert.ok(s, `${e.type}: its source enemy moved`);
            assert.deepEqual(
                [e.entity.maxHp, e.entity.armor, e.damage, e.gold, e.loadout],
                [s.hp, s.armor, s.damage, s.gold, s.loadout],
                e.type,
            );
        }
    });
});

describe('the examine text in a save', () => {
    test('a creature keeps its examine text through a save', () => {
        const [e] = spawnedWith(defaultPicks());
        const back = Enemy.fromSave(JSON.parse(JSON.stringify(e.toSave())));
        assert.equal(back.examine, '[TEXT]');
    });

    test('an enemy with none saves exactly as before', () => {
        const plain = JSON.parse(JSON.stringify(new Enemy({ id: 'r', type: 'Rat', x: 0, y: 0 }).toSave()));
        assert.equal('examine' in plain, false);
    });
});

describe('the balance bench', () => {
    test('lists all three in the frozen area, with their copied numbers', () => {
        const rows = loadMapRoster().filter(r => r.zone === 'frozen');
        for (const t of TYPES) {
            const row = rows.find(r => r.type === t);
            assert.ok(row, `the bench does not list ${t}`);
            const entry = Object.values(ENTRIES).find(e => e.type === t);
            assert.deepEqual([row.hp, row.armor, row.damage, row.gold], [entry.hp, entry.armor, entry.damage, entry.gold]);
        }
    });
});
