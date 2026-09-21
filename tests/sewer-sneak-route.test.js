// sewer-sneak-route.test.js — quest 1 can be snuck through (ruling Q1-8/Q1-9).
//
// Caelan ruled the Fungus King is meant to be got past by sneaking (Q1-8). The
// autoplay's sneak then proved that, as first built, it could not be: from the
// sewer entrance, hidden ground reached two tiles. The Ghost Fungus (5,7; sight
// 12, facing south) held a cone over every way east, and the Red Fungus sentry
// (16,7) held one over every tile beside the Wererat. Turning EITHER alone
// opened nothing; turning BOTH north opened a hidden route to the tile behind
// the boss (Q1-9). This pins that route with the game's own perception, so a
// map edit that closes it fails here, in node, not only in the Chrome eval.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GameMap } from '../game/map.js';
import { spawnEnemy } from '../game/enemies.js';
import { perceives, VERDICT } from '../game/perception.js';
import { isHostile } from '../game/ai.js';

const data = JSON.parse(readFileSync(new URL('../game/sewer-map.json', import.meta.url), 'utf8'));
const map = new GameMap(data, 'sewer-map.json');
const enemies = data.enemies.map((s) => spawnEnemy(s));
const watchers = enemies.filter((e) => isHostile(e));
const entrance = data.transitions.find((t) => t.toMap === 'town-map.json');
const start = { x: entrance.x + 1, y: entrance.y };   // the first open tile inside
const boss = enemies.find((e) => e.tag === 'wererat_boss');

const hidden = (x, y) => watchers.every((w) => perceives(map, w, x, y) === VERDICT.NONE);
const blocked = (x, y) => enemies.some((e) => e.x === x && e.y === y)
    || (data.containers || []).some((c) => c.x === x && c.y === y);

// Every tile reachable from `from` over open, unoccupied tiles that pass `ok`.
function reach(from, ok) {
    const seen = new Set([`${from.x},${from.y}`]);
    const queue = [from];
    while (queue.length) {
        const c = queue.shift();
        for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
            const x = c.x + dx, y = c.y + dy, k = `${x},${y}`;
            if (seen.has(k) || !map.isWalkable(x, y) || blocked(x, y) || !ok(x, y)) continue;
            seen.add(k);
            queue.push({ x, y });
        }
    }
    return seen;
}

describe('the sewer can be snuck through', () => {
    test('the way in is hidden', () => {
        assert.ok(hidden(start.x, start.y), `${start.x},${start.y} is watched`);
    });

    test('hidden ground reaches a tile beside the Wererat', () => {
        const got = reach(start, hidden);
        const beside = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => `${boss.x + dx},${boss.y + dy}`);
        assert.ok(beside.some((k) => got.has(k)),
            `no hidden route from ${start.x},${start.y} to the Wererat (hidden ground reaches ${got.size} tiles)`);
    });

    test('the two sentries face north — the facings the route depends on', () => {
        const at = (x, y) => data.enemies.find((e) => e.x === x && e.y === y);
        assert.equal(at(5, 7).facing, 'N', 'the Ghost Fungus at (5,7)');
        assert.equal(at(16, 7).facing, 'N', 'the Red Fungus sentry at (16,7)');
    });
});
