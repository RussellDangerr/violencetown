// job-board.test.js — BP6: the Job board in Town pays Shards; four make a boon poition
// (plans/bp6-job-board-shards.md).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JOBS, jobAt, useJobBoard, SHARDS_PER_BOON, BOARD_ID } from '../game/jobs.js';
import { ITEMS, BOON_CAP } from '../game/items.js';
import { serialize } from '../game/save.js';
import sources from '../game/item-sources.js';
import { spawnEnemy } from '../game/enemies.js';
import { labelOf } from '../game/slots.js';
import { RNG } from '../game/rng.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const readMap = (f) => JSON.parse(readFileSync(new URL(`../game/${f}`, import.meta.url), 'utf8'));

function fakeGame(slots = { a: 'x' }) {
    const g = {
        slots, boons: {}, jobs: { done: 0, shards: 0 }, inventory: [], logs: [], granted: [],
        rng: new RNG(5),
        _log(m) { g.logs.push(m); },
        _removeFromSlot(i) { const s = g.inventory[i]; if (s.count > 1) s.count--; else g.inventory.splice(i, 1); },
        _grantItem(id, msg) { g.granted.push(id); if (msg) g.logs.push(msg); return true; },
    };
    return g;
}
const bag = (g, id, n = 1) => g.inventory.push({ itemDef: ITEMS[id], count: n });
const current = (g) => jobAt(g, g.jobs.done);

describe('the pool', () => {
    test('every job names a real item that its enemy carries, in a map of its zone', async () => {
        const maps = ['sewer-map.json', 'sewer-north-map.json', 'downtown-map.json', 'carrion-room-map.json'].map(readMap);
        for (const j of JOBS) {
            assert.ok(ITEMS[j.item], j.item);
            assert.ok((sources[j.item]?.droppedBy || []).includes(j.from), `${j.item} is not in a ${j.from}'s kit`);
            const spawns = maps.filter(m => String(m.zoneName).toUpperCase() === j.zone.toUpperCase())
                .flatMap(m => m.enemies || []).filter(e => !e.slot && !e.entry && labelOf(e) === j.from);
            assert.ok(spawns.length > 0, `no ${j.from} in the ${j.zone} maps`);
            for (const sp of spawns) {
                const e = spawnEnemy(structuredClone(sp), new Set());
                assert.ok((e.loadout || []).includes(j.item), `${j.from} at ${sp.x},${sp.y} carries no ${j.item}`);
            }
        }
    });
});

describe('the draw', () => {
    test('is repeatable, never the same job twice running, and never reads game.rng', () => {
        const g = fakeGame();
        const before = JSON.stringify(g.rng.getState?.() ?? g.rng);
        const seq = Array.from({ length: 40 }, (_, n) => jobAt(g, n));
        assert.deepEqual(seq, Array.from({ length: 40 }, (_, n) => jobAt(g, n)));
        for (let n = 1; n < 40; n++) assert.notEqual(seq[n], seq[n - 1]);
        assert.equal(JSON.stringify(g.rng.getState?.() ?? g.rng), before);
    });
    test('different games draw different sequences', () => {
        const a = Array.from({ length: 12 }, (_, n) => jobAt(fakeGame({ q: 1 }), n).item).join();
        const b = Array.from({ length: 12 }, (_, n) => jobAt(fakeGame({ q: 2 }), n).item).join();
        assert.notEqual(a, b);
    });
});

describe('using the board', () => {
    test('without the item it says the job and pays nothing', () => {
        const g = fakeGame();
        assert.equal(useJobBoard(g), false);
        assert.match(g.logs.join('\n'), new RegExp(ITEMS[current(g).item].name));
        assert.deepEqual(g.jobs, { done: 0, shards: 0 });
    });
    test('with the item it takes one, pays one Shard and moves to the next job', () => {
        const g = fakeGame();
        const first = current(g);
        bag(g, first.item, 2);
        assert.equal(useJobBoard(g), true);
        assert.equal(g.inventory[0].count, 1);
        assert.deepEqual(g.jobs, { done: 1, shards: 1 });
        assert.notEqual(current(g), first);
    });
    test('four Shards make one boon poition and leave none held', () => {
        const g = fakeGame();
        for (let i = 0; i < SHARDS_PER_BOON; i++) { bag(g, current(g).item); useJobBoard(g); }
        assert.deepEqual(g.granted, ['boon_poition']);
        assert.deepEqual(g.jobs, { done: 4, shards: 0 });
    });
    test('no boon before the fourth Shard', () => {
        const g = fakeGame();
        for (let i = 0; i < SHARDS_PER_BOON - 1; i++) { bag(g, current(g).item); useJobBoard(g); }
        assert.deepEqual(g.granted, []);
    });
    test('at the 12-boon cap the board pays nothing more', () => {
        const g = fakeGame();
        g.boons = { mana: 10 * BOON_CAP };
        bag(g, current(g).item);
        assert.equal(useJobBoard(g), false);
        assert.deepEqual(g.jobs, { done: 0, shards: 0 });
        assert.equal(g.inventory.length, 1);
    });
    test('no line has square brackets', () => {
        const g = fakeGame();
        for (let i = 0; i < 4; i++) { useJobBoard(g); bag(g, current(g).item); useJobBoard(g); }
        assert.ok(g.logs.length > 4);
        for (const l of g.logs) assert.doesNotMatch(l, /[\[\]]/);
    });
});

describe('the save', () => {
    const base = { map: { url: 'town-map.json' }, turn: 1, playerX: 1, playerY: 1, playerHp: 1, playerMaxHp: 1,
        playerMp: 1, playerMaxMp: 1, facing: 'down', gold: 0, rng: { getState: () => 0 }, equipment: {}, tempEquips: [],
        buffs: [], inventory: [], selectedSlot: -1, groundItems: [], containers: [], enemies: [], _tileDiffs: [] };
    test('leaves the entry out while both counts are zero, keeps it otherwise', () => {
        assert.equal('jobs' in serialize({ ...base }).player, false);
        assert.equal('jobs' in serialize({ ...base, jobs: { done: 0, shards: 0 } }).player, false);
        assert.deepEqual(serialize({ ...base, jobs: { done: 5, shards: 2 } }).player.jobs, { done: 5, shards: 2 });
        assert.deepEqual(serialize({ ...base, jobs: { done: 0, shards: 1 } }).player.jobs, { done: 0, shards: 1 });
    });
    test('a bad entry reads as none', () => {
        assert.deepEqual(serialize({ ...base, jobs: { done: -3, shards: 'x' } }).player.jobs, undefined);
    });
});

describe('Town', () => {
    test('has the board as an examinable on a walkable tile', () => {
        const town = readMap('town-map.json');
        const b = town.examinables.find(e => e.id === BOARD_ID);
        assert.ok(b);
        assert.ok(b.text && !/[\[\]]/.test(b.text));
        assert.ok(!town.enemies.some(e => e.x === b.x && e.y === b.y));
        assert.ok(![...town.transitions, ...town.props, ...town.items].some(e => e.x === b.x && e.y === b.y));
    });
    test('main.js and save.js carry the board and its counts', () => {
        const main = readFileSync(new URL('../game/main.js', import.meta.url), 'utf8');
        const save = readFileSync(new URL('../game/save.js', import.meta.url), 'utf8');
        assert.equal((main.match(/this\._useJobBoard\?\./g) || []).length, 2);
        assert.match(main, /this\.jobs = \{ done: 0, shards: 0 \}/);
        for (const needle of ['jobsEntry(game)', 'sanitizeJobs(p.jobs)', 'game.jobs ']) assert.ok(save.includes(needle), needle);
    });
});
