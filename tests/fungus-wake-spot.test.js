// fungus-wake-spot.test.js — FX46 (plans/fx46-fungus-wake-spot.md).
//
// Losing to the fungus in the sewer wakes you on a fixed tile. That tile must be
// one no sewer enemy can see, judged by the game's own sight rule (perceives)
// against the real sewer map and the enemies the game really spawns there. A
// moved enemy, a longer sight range or an opened wall fails this file.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DEFEAT_SCENARIOS, pickScenario } from '../game/defeat-scenarios.js';
import { GameMap } from '../game/map.js';
import { spawnEnemy } from '../game/enemies.js';
import { resolveSpawn, defaultPicks } from '../game/slots.js';
import { perceives, VERDICT, FACING_VECTORS } from '../game/perception.js';
import { findPath } from '../game/pathing.js';

const sewer = JSON.parse(fs.readFileSync(new URL('../game/sewer-map.json', import.meta.url), 'utf8'));
const map = new GameMap(sewer);
const enemies = sewer.enemies.map(s => spawnEnemy(resolveSpawn(s, defaultPicks()))).filter(Boolean);
const watchers = enemies.filter(e => (e.sightRange || 0) > 0);

// Where the defeat used to wake you, in the middle of the soap-mine.
const OLD_SPOT = { x: 10, y: 10 };

const fungus = DEFEAT_SCENARIOS.find(s => s.id === 'processed_by_fungus');
const spot = fungus.consequence.wakeAt.spot;

// Every tile a watcher may stand on: its post, plus its whole home region when it
// wanders (pickWanderTarget keeps a wanderer inside its region).
function standingTiles(e) {
    const out = [{ x: e.x, y: e.y }];
    if (Array.isArray(e.behavior) && e.behavior.includes('WANDER')) {
        const r = e.homeRegion ? map.getRegion(e.homeRegion) : null;
        assert.ok(r, `${e.id} wanders with no home region, so its reach is unbounded`);
        for (let y = r.y; y < r.y + r.h; y++)
            for (let x = r.x; x < r.x + r.w; x++)
                if (map.isWalkable(x, y)) out.push({ x, y });
    }
    return out;
}

// Who can see (x,y) at all: any standing tile, any of the eight facings, in daylight.
// PERIPHERAL counts too, because it is what makes them turn and look.
function seenBy(x, y) {
    const who = [];
    for (const e of watchers) {
        const sees = standingTiles(e).some(p => Object.values(FACING_VECTORS).some(([fx, fy]) =>
            perceives(map, { x: p.x, y: p.y, sightRange: e.sightRange, _lastDx: fx, _lastDy: fy }, x, y) !== VERDICT.NONE));
        if (sees) who.push(`${e.id} (${e.type})`);
    }
    return who;
}

const pathGame = { map, enemies: [], containers: sewer.containers || [], playerX: -1, playerY: -1 };
const walk = (to) => {
    const p = findPath(pathGame, OLD_SPOT, to);
    return p ? p.length : Infinity;
};

describe('the fungus defeat wakes you out of sight (FX46)', () => {
    test('the sewer roster is real: the fungus and its king are there and can see', () => {
        const types = watchers.map(e => e.type);
        for (const t of ['Violet Fungus', 'Red Fungus', 'Ghost Fungus', 'Fungus King'])
            assert.ok(types.includes(t), `${t} spawns in the sewer with a sight range`);
        assert.ok(watchers.length >= 6, `expected the sewer's watchers, got ${watchers.length}`);
    });

    test('the check bites: the old wake spot is in plain sight', () => {
        const who = seenBy(OLD_SPOT.x, OLD_SPOT.y);
        assert.ok(who.some(w => w.includes('Fungus King')), `the Fungus King sees the old spot (seen by ${who})`);
        assert.ok(who.some(w => w.includes('Violet Fungus')), 'a Violet Fungus sees the old spot');
    });

    test('a fungus defeat in the sewer still picks this scenario', () => {
        const ctx = { zone: sewer.zoneName, by: { type: 'Violet Fungus', entity: {} }, cause: 'unknown' };
        const picked = pickScenario(ctx, [fungus], () => 0);
        assert.equal(picked && picked.id, 'processed_by_fungus');
    });

    test('the wake tile is somewhere you can stand', () => {
        assert.ok(map.isWalkable(spot.x, spot.y), `(${spot.x},${spot.y}) is walkable`);
        assert.ok(!map.transitions.some(t => t.x === spot.x && t.y === spot.y), 'not a doorway out');
        assert.ok(!(sewer.containers || []).some(c => c.x === spot.x && c.y === spot.y), 'not a chest');
        assert.ok(!sewer.enemies.some(e => e.x === spot.x && e.y === spot.y), 'not on an enemy post');
        assert.ok(Number.isFinite(walk(spot)), 'reachable on foot from the soap-mine');
    });

    test('no sewer enemy can see the wake tile, from its post or its wander ground, facing any way', () => {
        assert.deepEqual(seenBy(spot.x, spot.y), []);
    });

    test('it is the nearest such tile: no hidden tile is a shorter walk from the soap-mine', () => {
        const mine = walk(spot);
        const closer = [];
        for (let y = 0; y < map.height; y++)
            for (let x = 0; x < map.width; x++) {
                if (!map.isWalkable(x, y)) continue;
                if (walk({ x, y }) >= mine) continue;
                if (seenBy(x, y).length === 0) closer.push(`(${x},${y})`);
            }
        assert.deepEqual(closer, [], `hidden tiles closer than (${spot.x},${spot.y}) at ${mine} steps`);
    });
});
