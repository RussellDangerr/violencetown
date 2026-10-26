// boss-drops.test.js — a beaten boss's loot lands where you can see it
// (plans/fx3-boss-loot-spread.md).
//
// The corpse is drawn over its own tile, so a drop left there is never seen.
// Runs the live _handleEnemyDeath (and the two helpers it places through) out
// of main.js against a stand-in game, on the real Graveyard map with its real
// boss, and on small hand-drawn rooms for the edge cases.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { defaultPicks, resolveSpawn, requiredDropFor, dropLineFor } from '../game/slots.js';
import { spawnEnemy, Enemy } from '../game/enemies.js';
import { ITEMS } from '../game/items.js';
import { GameMap } from '../game/map.js';
import { recordDrop, dropLoadout } from '../game/drops.js';

const GAME = new URL('../game/', import.meta.url);
const mainSrc = readFileSync(new URL('main.js', GAME), 'utf8');
function liveMethod(signature, freeVars = {}) {
    const at = mainSrc.indexOf(signature, mainSrc.indexOf('class Game {'));
    assert.ok(at > 0, `${signature} not found in main.js`);
    const body = mainSrc.slice(at + signature.indexOf('('), mainSrc.indexOf('\n    }', at) + '\n    }'.length);
    const names = Object.keys(freeVars);
    return new Function(...names, `'use strict'; return function ${body}`)(...names.map(n => freeVars[n]));
}

const audio = { playSfx() {} };
const handleEnemyDeath = liveMethod('    _handleEnemyDeath(', {
    audio, ITEMS, dropLoadout, requiredDropFor, dropLineFor,
    transferGold: (from, to, n) => { from.gold -= n; to.gold = (to.gold || 0) + n; },
    onSewerEnemyKilled: () => {},
});
const placeDeathDrop = liveMethod('    _placeDeathDrop(');
const deathDropTile = liveMethod('    _deathDropTile(');
const tryPickup = liveMethod('    _tryPickup(', { audio });

// A stand-in game around `map`, with `enemies` and the player at `player`.
function standIn(map, enemies, player, { bag = 99 } = {}) {
    const g = {
        map, enemies, containers: [], groundItems: [], gold: 0,
        playerX: player.x, playerY: player.y, inventory: [],
        _droppedItems: {}, _collectedItems: new Set(), _mapUrl: 'test', _muggedIds: new Set(),
        logged: [], questEngine: null,
        _log(t) { this.logged.push(t); },
        _spawnEventWord() {},
        emitGameEvent() {},
        _grantItem() { return false; },
        _recordDrop(type, x, y) { recordDrop(this._droppedItems, this._mapUrl, type, x, y); },
        _addToInventory(def) { if (this.inventory.length >= bag) return false; this.inventory.push(def); return true; },
    };
    g._placeDeathDrop = placeDeathDrop.bind(g);
    g._deathDropTile = deathDropTile.bind(g);
    g.die = handleEnemyDeath.bind(g);
    g.pickup = tryPickup.bind(g);
    return g;
}

// A hand-drawn room: '#' wall, '.' floor, 'D' an exit.
function room(rows) {
    const H = rows.length, W = rows[0].length;
    return {
        isInBounds: (x, y) => x >= 0 && y >= 0 && x < W && y < H,
        isWalkable: (x, y) => x >= 0 && y >= 0 && x < W && y < H && rows[y][x] !== '#',
        getTransition: (x, y) => (rows[y]?.[x] === 'D' ? { x, y } : null),
    };
}
const dead = (e) => { e.entity.hp = 0; return e; };
const at = (g, x, y) => g.groundItems.filter(i => i.x === x && i.y === y);
const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

describe('the Graveyard boss, beaten where it stands', () => {
    const file = 'graveyard-map.json';
    const data = JSON.parse(readFileSync(new URL(file, GAME), 'utf8'));
    const map = new GameMap(data, file);
    const spawn = data.enemies.find(s => s.slot === 'graveyard.boss');
    const kill = () => {
        const boss = dead(spawnEnemy(resolveSpawn(spawn, defaultPicks())));
        // You beat it from the tile north of it.
        const g = standIn(map, [boss], { x: boss.x, y: boss.y - 1 });
        g.die(boss);
        return { g, boss };
    };

    test('the fixture really drops a pile: its kit and its required item', () => {
        const { g, boss } = kill();
        assert.ok(g.groundItems.length >= 2, `only ${g.groundItems.length} drops`);
        assert.ok(g.groundItems.some(i => i.type === requiredDropFor(boss, data.enemies)));
    });

    test('nothing lands under the body', () => {
        const { g, boss } = kill();
        assert.deepEqual(at(g, boss.x, boss.y), []);
    });

    test('every drop has its own tile, on open ground, off the player and off the exits', () => {
        const { g, boss } = kill();
        const tiles = g.groundItems.map(i => `${i.x},${i.y}`);
        assert.equal(new Set(tiles).size, tiles.length, `stacked: ${tiles.join(' ')}`);
        for (const i of g.groundItems) {
            assert.ok(map.isWalkable(i.x, i.y), `${i.type} on a wall at ${i.x},${i.y}`);
            assert.ok(!map.getTransition(i.x, i.y), `${i.type} on an exit`);
            assert.ok(!(i.x === g.playerX && i.y === g.playerY), `${i.type} under the player`);
            assert.ok(manhattan(i, boss) <= 3, `${i.type} landed ${manhattan(i, boss)} tiles away`);
        }
    });

    test('the required item is placed first: first in line, on the nearest free tile', () => {
        const { g, boss } = kill();
        const required = requiredDropFor(boss, data.enemies);
        assert.equal(g.groundItems[0].type, required);
        assert.equal(manhattan(g.groundItems[0], boss), 1);
        // South is the first free neighbour (you stand north).
        assert.deepEqual([g.groundItems[0].x, g.groundItems[0].y], [boss.x, boss.y + 1]);
    });

    test('every drop is recorded where it actually lies, so it comes back on re-entry', () => {
        const { g } = kill();
        assert.deepEqual(
            g._droppedItems.test.map(d => `${d.type}@${d.x},${d.y}`).sort(),
            g.groundItems.map(i => `${i.type}@${i.x},${i.y}`).sort(),
        );
    });

    test('the log lines are unchanged and keep their order', () => {
        const { g } = kill();
        const kitAt = g.logged.indexOf("[They drop what they didn't get to use.]");
        const reqAt = g.logged.findIndex(l => l === `[${ITEMS.act2_item_c.name} dropped.]`);
        assert.ok(kitAt >= 0 && reqAt > kitAt, g.logged.join(' | '));
    });
});

describe('where a drop may land', () => {
    test('a wall-locked corridor: drops go along it, never through the wall', () => {
        const map = room([
            '#######',
            '#.....#',
            '#######',
        ]);
        const boss = dead(new Enemy({ id: 'b', type: 'Boss', x: 3, y: 1, slot: 'graveyard.boss' }));
        boss.loadout = ['bandage', 'soap'];
        const g = standIn(map, [boss], { x: 2, y: 1 });
        g.die(boss);
        // Required first takes the first free neighbour (east: west is you), then on outward.
        assert.deepEqual(g.groundItems.map(i => [i.type, i.x, i.y]), [
            ['act2_item_c', 4, 1], ['bandage', 5, 1], ['soap', 1, 1],
        ]);
    });

    test('corpses, containers and other items block a tile; a living enemy does too', () => {
        const map = room([
            '.....',
            '.....',
            '.....',
            '.....',
            '.....',
        ]);
        const boss = dead(new Enemy({ id: 'b', type: 'Boss', x: 2, y: 2 }));
        const corpse = dead(new Enemy({ id: 'c', type: 'Rat', x: 2, y: 3 }));      // south
        const alive = new Enemy({ id: 'a', type: 'Rat', x: 2, y: 1 });             // north
        const g = standIn(map, [boss, corpse, alive], { x: 0, y: 0 });
        g.containers.push({ x: 3, y: 2 });                                          // east
        g.groundItems.push({ type: 'rock', x: 1, y: 2, def: {} });                  // west
        const t = g._deathDropTile(boss, 'bandage');
        assert.equal(manhattan(t, boss), 2, `landed at ${t.x},${t.y}`);
        assert.ok(!(t.x === 0 && t.y === 0));
    });

    test('a tile already holding the same item is free, so a re-kill cannot farm records', () => {
        const map = room(['.....', '.....', '.....']);
        const kill = (g) => {
            const boss = dead(new Enemy({ id: 'b', type: 'Boss', x: 2, y: 1, slot: 'graveyard.boss' }));
            g.enemies = [boss];
            g.die(boss);
        };
        const g = standIn(map, [], { x: 0, y: 0 });
        kill(g);
        kill(g);   // the boss respawned on re-entry and died on the same tile
        assert.equal(g._droppedItems.test.length, 1, JSON.stringify(g._droppedItems.test));
    });

    test('an exit is never a landing tile, and the search does not pass through one', () => {
        const map = room([
            '#####',
            '#.D.#',
            '#####',
        ]);
        const boss = dead(new Enemy({ id: 'b', type: 'Boss', x: 1, y: 1 }));
        const g = standIn(map, [boss], { x: 0, y: 0 });
        // Only the exit is next to it, and the floor beyond it is behind the exit.
        assert.deepEqual(g._deathDropTile(boss, 'bandage'), { x: 1, y: 1 });
    });

    test('boxed in, everything falls back to the body tile, the required item first in line', () => {
        const map = room([
            '###',
            '#.#',
            '###',
        ]);
        const boss = dead(new Enemy({ id: 'b', type: 'Boss', x: 1, y: 1, slot: 'graveyard.boss' }));
        boss.loadout = ['bandage', 'soap'];
        const g = standIn(map, [boss], { x: 0, y: 0 }, { bag: 1 });
        g.die(boss);
        assert.ok(g.groundItems.every(i => i.x === 1 && i.y === 1));
        assert.equal(g.groundItems[0].type, 'act2_item_c');
        // Stand on the pile with room for one: the required item is the one you take.
        g.playerX = 1; g.playerY = 1;
        g.pickup();
        assert.deepEqual(g.inventory.map(d => d.id), ['act2_item_c']);
    });

    test('the Were-Rat\'s fur and Pike\'s rope spread the same way', () => {
        const map = room(['.....', '.....', '.....', '.....', '.....']);
        for (const [tag, type] of [['wererat_boss', 'wererat_fur'], ['pike_boss', 'grappling_hook']]) {
            const boss = dead(new Enemy({ id: tag, type: 'Boss', x: 2, y: 2, tag }));
            const g = standIn(map, [boss], { x: 2, y: 1 });
            g.die(boss);
            const it = g.groundItems.find(i => i.type === type);
            assert.ok(it, `${tag} dropped no ${type}`);
            assert.deepEqual([it.x, it.y], [2, 3], `${type} not on the first free neighbour`);
        }
    });
});
