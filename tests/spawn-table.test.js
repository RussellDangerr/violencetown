// spawn-table.test.js — the Carnival's rats roll from the zone's spawn table
// (plans/rv2-rats-roll-spawn-table.md, spine SL-6): one roll per rat spawn per new
// game, from the seed; kept across zone changes and across save and load.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { SLOTS, ENTRIES, pickSlots, defaultPicks, resolveSpawn } from '../game/slots.js';
import { serialize, migrate, loadInto } from '../game/save.js';
import { validateContent } from '../game/content-validate.js';
import { spawnEnemy } from '../game/enemies.js';
import { QuestEngine } from '../game/quests.js';

const GAME = join(dirname(fileURLToPath(import.meta.url)), '..', 'game');
const carnival = JSON.parse(readFileSync(join(GAME, 'carnival-map.json'), 'utf8'));
const SLOT = 'carnival.mob';
const RATS = ['birthday_rat', 'sludge_rat', 'robot_rat'];
const HAND = ['Birthday Rat', 'Sludge Rat', 'Robot Rat'];
const ratSpawns = carnival.enemies.filter(s => s.slot === SLOT);

beforeEach(() => {
    const store = new Map();
    globalThis.localStorage = {
        getItem: k => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: k => store.delete(k),
    };
    globalThis.document = { createElement: () => ({ set textContent(v) {}, get innerHTML() { return ''; } }) };
});

const crowd = (picks) => ratSpawns.map(s => resolveSpawn(s, picks).type);

// A game that resolves the real Carnival's spawns through game.slots the way main.js
// _loadMap does, with the zone coming and going.
function fakeGame(seed) {
    const g = {
        slots: pickSlots(seed), map: null, enemies: [],
        rng: { getState: () => 1, setState() {} },
        equipment: { weapon: null, top: null, bottom: null, front: null, back: null, sides: null },
        tempEquips: [], buffs: [], inventory: [], groundItems: [], containers: [], _tileDiffs: [],
        playerX: 1, playerY: 1, playerHp: 100, playerMaxHp: 100, playerMp: 1, playerMaxMp: 1,
        facing: 'down', gold: 0, turn: 0,
        _log() {}, _render() {}, _resolveItemDef: () => null, setTile() {},
        async _loadMap(url) {
            this.map = { url, zoneName: url, isInBounds: () => true, isWalkable: () => true };
            this.enemies = url === 'carnival-map.json'
                ? carnival.enemies.map(s => spawnEnemy(resolveSpawn(s, this.slots)))
                : [];
        },
    };
    g.questEngine = new QuestEngine(g);
    return g;
}
const ratTypes = (g) => g.enemies.filter(e => e.id.endsWith('-rat-1')).map(e => e.type);

describe('the Carnival spawn table', () => {
    test('is a rolled mob slot of exactly the three RV1 rats, one seat per rat spawn', () => {
        assert.equal(SLOTS[SLOT].kind, 'mob');
        assert.deepEqual(SLOTS[SLOT].pool.map(p => p.entry), RATS);
        assert.ok(SLOTS[SLOT].pool.every(p => p.weight === 1));
        assert.deepEqual(ratSpawns.map(s => s.seat).sort(), [0, 1, 2]);
        assert.equal(ratSpawns.length, SLOTS[SLOT].seats);
    });

    test('the same seed always gives the same crowd, and every rat is one of the three', () => {
        for (const seed of [1, 7, 12345]) {
            assert.deepEqual(crowd(pickSlots(seed)), crowd(pickSlots(seed)));
            for (const t of crowd(pickSlots(seed))) assert.ok(HAND.includes(t));
        }
    });

    test('different seeds give different crowds, and repeats are possible', () => {
        const crowds = new Set();
        let repeat = false;
        for (let seed = 1; seed <= 60; seed++) {
            const c = crowd(pickSlots(seed));
            crowds.add(c.join('|'));
            if (new Set(c).size < c.length) repeat = true;
        }
        assert.ok(crowds.size > 5, `only ${crowds.size} crowds in 60 seeds`);
        assert.ok(repeat, 'rolls never repeated a rat');
    });

    test('rolling the table moves no other pick', () => {
        const before = pickSlots(99);
        const without = { ...SLOTS };
        delete without[SLOT];
        const after = pickSlots(99, without);
        for (const k of Object.keys(after)) assert.deepEqual(before[k], after[k]);
    });

    test('walking out and back in keeps the same rats', async () => {
        const g = fakeGame(31);
        await g._loadMap('carnival-map.json');
        const first = ratTypes(g);
        assert.equal(first.length, 3);
        await g._loadMap('town-map.json');
        await g._loadMap('carnival-map.json');
        assert.deepEqual(ratTypes(g), first);
    });

    test('saving and loading keeps the same rats', async () => {
        const g = fakeGame(31);
        await g._loadMap('carnival-map.json');
        const first = ratTypes(g);
        const blob = JSON.parse(JSON.stringify(serialize(g)));
        assert.equal(blob.slots[SLOT].length, 3);
        const g2 = fakeGame(5);   // a different new game, then the load
        await loadInto(g2, blob);
        await g2._loadMap('carnival-map.json');
        assert.deepEqual(ratTypes(g2), first);
    });

    test('an old save without the table loads the hand-placed crowd', () => {
        const slots = migrate({ slots: { 'carnival.boss': 'bigfoot' } }).slots;
        assert.equal(slots[SLOT], undefined);
        assert.deepEqual(crowd(slots), HAND);
        assert.deepEqual(crowd(defaultPicks()), HAND);
    });

    test('a damaged saved roll falls back to the hand-placed crowd', () => {
        for (const bad of [['x', 'y', 'z'], ['sludge_rat'], 'robot_rat', null]) {
            assert.deepEqual(crowd({ [SLOT]: bad }), HAND);
        }
    });
});

describe('content validation sees the table', () => {
    test('a rat spawn with no valid seat, or a seat count that does not match, is a problem', () => {
        const maps = (enemies) => [{ file: 'carnival-map.json', data: { ...carnival, enemies } }];
        const real = validateContent(maps(carnival.enemies)).problems.join('\n');
        assert.ok(!/carnival\.mob/.test(real), real);
        const noSeat = carnival.enemies.map(s => (s.id === 'robot-rat-1' ? { ...s, seat: undefined } : s));
        assert.match(validateContent(maps(noSeat)).problems.join('\n'), /needs a seat/);
        const missing = carnival.enemies.filter(s => s.id !== 'robot-rat-1');
        assert.match(validateContent(maps(missing)).problems.join('\n'), /rolls 3 seats but 2 spawns/);
    });
});
