// act2-enemy-counts.test.js — the Carnival and the Graveyard hold the ruled number of fighters
// (plans/ep3-act2-enemy-counts.md, ruling EP3R1 a: Carnival 9, Graveyard 6, since 7: CA1 adds the angel,
// since 8: AK1 adds the Ankou).
//
// A "fighter" is any enemy spawn on the map, boss and rats included. The new Clowns and
// Skeletons are copies of their zone's own ordinary enemy at placeholder spots.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { GameMap } from '../game/map.js';
import { spawnEnemy, resolveEnemyTurns } from '../game/enemies.js';
import { resolveSpawn, defaultPicks } from '../game/slots.js';
import { recordKill, stepRespawns, deadIds, RESPAWN_STEPS } from '../game/drops.js';
import { RNG } from '../game/rng.js';
import { makeHostile } from '../game/give-action.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const GAME = new URL('../game/', import.meta.url);
const mapData = (file) => JSON.parse(readFileSync(new URL(file, GAME), 'utf8'));

const ZONES = [
    // 18: the three circling horses (plans/cb1-carnival-horses-circle.md) join the 11, and the
    // four circling dolls (plans/ec1-carnival-doll-pack.md) join them. 19: the assistant manager
    // (plans/as1-unicycle-clown.md) is a spawn on the map but never fights; he is counted so the
    // one-spawn-per-tile and unique-id checks still cover him.
    { file: 'carnival-map.json',  total: 19, original: 'clown1', copies: ['clown2', 'clown3', 'clown4', 'clown5'], boss: 'carnival_boss' },
    { file: 'graveyard-map.json', total: 8, original: 'skel1',  copies: ['skel2', 'skel3', 'skel4', 'skel5'],     boss: 'graveyard_boss' },
];

// The road the loops autoplay walks in the Carnival: the north door, then the lion whip and the
// fire blood. A new spawn keeps clear of it (and of its wander range) so that record stays still.
const LOOPS_WALK = [{ x: 4, y: 0 }, { x: 4, y: 2 }, { x: 10, y: 5 }, { x: 11, y: 3 }];
const CLEAR = 10;   // tiles of room around any door, the boss, the spawn and the loops walk

const dist = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

for (const z of ZONES) {
    describe(`${z.file}: ${z.total} fighters`, () => {
        const data = mapData(z.file);
        const spawn = (id) => data.enemies.find(e => e.id === id);

        test(`holds ${z.total} fighters, each with its own id`, () => {
            assert.equal(data.enemies.length, z.total);
            assert.equal(new Set(data.enemies.map(e => e.id)).size, z.total);
        });

        test('the map loads the same number as spawns', () => {
            assert.equal(new GameMap(data, z.file).enemySpawns.length, z.total);
        });

        test('each copy is the original with only its id and spot changed', () => {
            const orig = spawn(z.original);
            assert.ok(orig, `${z.original} is gone`);
            for (const id of z.copies) {
                const c = spawn(id);
                assert.ok(c, `${id} is missing`);
                const { id: _i, x: _x, y: _y, ...rest } = c;
                const { id: _oi, x: _ox, y: _oy, ...origRest } = orig;
                assert.deepEqual(rest, origRest, `${id} differs from ${z.original}`);
                assert.equal(c.damage, 12, `${id} should hit for 12 (EP2)`);
            }
        });

        test('each copy stands on open ground, clear of the boss, the doors and every item', () => {
            const map = new GameMap(data, z.file);
            // AK1: the Ankou is hand-placed at (8,21), right beside skel4 on purpose, so it is not one of
            // the fighters a copy must keep two tiles from (its own spot is pinned in ankou.test.js).
            const others = data.enemies.filter(e => !z.copies.includes(e.id) && e.entry !== 'ankou');
            const taken = new Set(data.enemies.map(e => `${e.x},${e.y}`));
            assert.equal(taken.size, z.total, 'two fighters share a tile');
            for (const id of z.copies) {
                const c = spawn(id);
                assert.ok(map.isWalkable(c.x, c.y), `${id} stands in a wall or on a solid prop`);
                const boss = spawn(z.boss);
                assert.ok(dist(c, boss) >= 4, `${id} is on top of the boss`);
                for (const t of data.transitions) assert.ok(dist(c, t) >= 6, `${id} is by the door at ${t.x},${t.y}`);
                for (const i of data.items || []) assert.ok(dist(c, i) >= 2, `${id} is on an item`);
                for (const o of others) assert.ok(dist(c, o) >= 2, `${id} is on ${o.id}`);
            }
        });

        test('each copy keeps off the loops autoplay walk', () => {
            if (z.file !== 'carnival-map.json') return;     // the loops never enter the Graveyard
            for (const id of z.copies) {
                const c = spawn(id);
                for (const p of LOOPS_WALK) assert.ok(dist(c, p) >= CLEAR, `${id} is within ${CLEAR} of ${p.x},${p.y}`);
            }
        });

        test('every copy spawns, fights back for 12, and carries its original\'s kit and purse', () => {
            const map = new GameMap(data, z.file);
            const orig = spawnEnemy({ ...resolveSpawn(spawn(z.original), defaultPicks()), facing: 'S' });
            for (const id of z.copies) {
                const s = spawn(id);
                const e = spawnEnemy({ ...resolveSpawn(s, defaultPicks()), facing: 'S' });
                assert.equal(e.id, id);
                assert.deepEqual(e.loadout, orig.loadout);
                assert.equal(e.gold, orig.gold);
                assert.equal(e.name ?? e.type, orig.name ?? orig.type);

                makeHostile(e);
                const blows = [];
                const g = {
                    map, enemies: [e], containers: [], groundItems: [],
                    playerX: s.x, playerY: s.y + 1, playerHp: 100, playerMaxHp: 100,
                    turn: 0, _MOVE_MS: 150, rng: new RNG(7), gold: 0, logs: [],
                    _log(m) { this.logs.push(m); },
                    hasBuff: () => false,
                    _spawnHitSplat() {}, _handleEnemyDeath() {}, _cascadeMark() {},
                    applyDamageToPlayer(raw) { blows.push(raw); return raw; },
                };
                for (let t = 1; t <= 12; t++) { g.turn = t; resolveEnemyTurns(g); }
                assert.ok(blows.length > 0, `${id} never hit back`);
                assert.ok(blows.every(b => b === 12), `${id} landed ${blows}`);
            }
        });

        test('a killed copy goes on the respawn list and comes back like the original', () => {
            const url = z.file;
            const lists = {};
            const ids = [z.original, ...z.copies];
            for (const id of ids) assert.ok(recordKill(lists, url, id), `${id} would not go on the list`);
            const dead = deadIds(lists, url);
            for (const id of ids) assert.ok(dead.has(id), `${id} is not held dead`);
            // The spawns the map would leave out while they wait are exactly the killed ones.
            const map = new GameMap(data, z.file);
            const standing = map.enemySpawns.filter(s => !dead.has(s.id)).map(s => s.id);
            assert.deepEqual(standing.sort(), data.enemies.map(e => e.id).filter(id => !ids.includes(id)).sort());
            const back = [];
            for (let i = 0; i < RESPAWN_STEPS; i++) back.push(...(stepRespawns(lists)[url] || []));
            assert.deepEqual(back.sort(), ids.slice().sort());
            assert.deepEqual(lists, {});
        });
    });
}
