// tw2-unreachable-tap.test.js - TW2: a tap you can't reach still moves you (ruling TWR1 a).
// Runs the game's own _tapWalkTo (lifted out of main.js) with the real findPath and pathToNearest.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { findPath, pathToNearest } from '../game/pathing.js';

const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');
const start = mainSrc.indexOf('    _tapWalkTo(tile) {');
assert.ok(start > 0, '_tapWalkTo not found in main.js');
const end = mainSrc.indexOf('\n    }', start) + 6;
const tapWalkTo = new Function('findPath', 'pathToNearest',
    `'use strict'; return function ${mainSrc.slice(start + 4, end)}`)(findPath, pathToNearest);

function makeGame(rows, at) {
    const H = rows.length, W = rows[0].length;
    const g = {
        playerX: at.x, playerY: at.y, enemies: [], containers: [], walked: null,
        map: { isWalkable: (x, y) => x >= 0 && y >= 0 && x < W && y < H && rows[y][x] !== '#' },
        _walkPath(p) { this.walked = p; },
    };
    g._tapWalkTo = tapWalkTo;
    return g;
}
const last = (p) => p[p.length - 1];

describe('TW2 tap on a tile you cannot stand on or reach', () => {
    test('a wall tile walks you to the reachable tile nearest it', () => {
        const g = makeGame(['.....', '.###.', '.....'], { x: 0, y: 0 });
        assert.equal(g._tapWalkTo({ x: 2, y: 1 }), true);
        assert.deepEqual(last(g.walked), { x: 2, y: 0 });   // tie with (2,2): nearer you wins
    });
    test('a sealed room: you walk to the nearest tile outside its wall', () => {
        const g = makeGame(['......', '.####.', '.#..#.', '.####.', '......'], { x: 0, y: 0 });
        assert.equal(g._tapWalkTo({ x: 2, y: 2 }), true);
        const e = last(g.walked);
        assert.ok(Math.abs(e.x - 2) + Math.abs(e.y - 2) >= 2);
        assert.ok(g.map.isWalkable(e.x, e.y));
    });
    test('a tap beyond the map edge walks to the nearest edge tile', () => {
        const g = makeGame(['.....'], { x: 0, y: 0 });
        assert.equal(g._tapWalkTo({ x: 9, y: 0 }), true);
        assert.deepEqual(last(g.walked), { x: 4, y: 0 });
    });
    test('a route past the search cap still walks you toward it', () => {
        const g = makeGame(['.'.repeat(80)], { x: 0, y: 0 });
        const p = pathToNearest(g, { x: 0, y: 0 }, { x: 79, y: 0 }, { maxNodes: 10 });
        assert.ok(p.length > 0 && last(p).x < 79);
    });
    test('your own tile does nothing', () => {
        const g = makeGame(['...'], { x: 1, y: 0 });
        assert.equal(g._tapWalkTo({ x: 1, y: 0 }), false);
        assert.equal(g.walked, null);
    });
    test('already on the nearest tile: nothing to walk', () => {
        const g = makeGame(['.#', '..'], { x: 0, y: 0 });
        assert.equal(g._tapWalkTo({ x: 1, y: 0 }), false);
    });
    test('a reachable floor tile still takes the plain path', () => {
        const g = makeGame(['.....'], { x: 0, y: 0 });
        assert.equal(g._tapWalkTo({ x: 3, y: 0 }), true);
        assert.deepEqual(last(g.walked), { x: 3, y: 0 });
    });
});
