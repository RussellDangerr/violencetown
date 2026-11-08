// finale-gate.test.js — the bank's vault door opens only with all three Act 2
// items (plans/fin1-vault-door.md).
//
// A door gate used to take one item id. The vault door takes a list, the three
// items the Act 2 bosses drop, and stays shut until every one is in the bag.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { GameMap, carriesAll } from '../game/map.js';
import { SLOTS } from '../game/slots.js';
import { TILES } from '../game/data.js';

const GAME = join(dirname(fileURLToPath(import.meta.url)), '..', 'game');
const load = (f) => JSON.parse(readFileSync(join(GAME, f), 'utf8'));
const bag = (...ids) => ids.map(id => ({ itemDef: { id }, qty: 1 }));

const ACT2 = ['carnival.boss', 'factory.boss', 'graveyard.boss'].map(s => SLOTS[s].requiredDrop);
const DOOR = { x: 6, y: 1 };

describe('carriesAll', () => {
    test('one id, as every gate before the vault door', () => {
        assert.equal(carriesAll('grappling_hook', bag('grappling_hook')), true);
        assert.equal(carriesAll('grappling_hook', bag('pipe')), false);
    });

    test('a list wants every item on it', () => {
        assert.equal(carriesAll(['a', 'b', 'c'], bag('c', 'a', 'b')), true);
        assert.equal(carriesAll(['a', 'b', 'c'], bag('a', 'b')), false);
        assert.equal(carriesAll(['a', 'b', 'c'], bag('a', 'a', 'a')), false);
    });

    test('no requirement is an open gate', () => {
        assert.equal(carriesAll(undefined, []), true);
        assert.equal(carriesAll(null, []), true);
        assert.equal(carriesAll([], []), true);
    });

    test('empty bag slots and a missing bag are no trouble', () => {
        assert.equal(carriesAll(['a'], [null, undefined, ...bag('a')]), true);
        assert.equal(carriesAll(['a'], null), false);
    });
});

describe('the vault door in the bank', () => {
    const data = load('bank-map.json');
    const door = (data.transitions || []).find(t => t.toMap === 'vault-map.json');

    test('it stands in the back wall above the vault examine spot', () => {
        assert.ok(door, 'no door from the bank into the vault');
        assert.deepEqual([door.x, door.y], [DOOR.x, DOOR.y]);
        assert.equal(data.tiles[DOOR.y * data.width + DOOR.x], TILES.DOOR.id);
        const spot = data.examinables.find(e => e.id === 'bank_vault');
        assert.deepEqual([spot.x, spot.y], [DOOR.x, DOOR.y + 1]);
    });

    test('it asks for exactly the three items the Act 2 bosses drop', () => {
        assert.equal(ACT2.length, 3);
        assert.ok(ACT2.every(Boolean), 'an Act 2 slot lost its required drop');
        assert.deepEqual([...door.requires].sort(), [...ACT2].sort());
        assert.ok(door.requiresMsg, 'a shut door says why');
    });

    test('loaded, the gate stays on the door and only there', () => {
        const m = new GameMap(data, 'bank-map.json');
        const into = m.transitions.filter(t => t.toMap === 'vault-map.json');
        assert.deepEqual(into.map(t => [t.x, t.y]), [[DOOR.x, DOOR.y]]);
        assert.deepEqual(m.getTransition(DOOR.x, DOOR.y).requires, door.requires);
        const out = m.transitions.filter(t => t.toMap === 'downtown-map.json');
        assert.ok(out.length > 0 && out.every(t => !t.requires), 'the way out to the street is still open');
    });

    test('you can walk to it from the bank\'s entrance', () => {
        const m = new GameMap(data, 'bank-map.json');
        const blocked = new Set((data.enemies || []).map(e => `${e.x},${e.y}`));
        const seen = new Set([`${data.spawn.x},${data.spawn.y}`]);
        const queue = [[data.spawn.x, data.spawn.y]];
        while (queue.length) {
            const [x, y] = queue.shift();
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const k = `${x + dx},${y + dy}`;
                if (seen.has(k) || blocked.has(k) || !m.isWalkable(x + dx, y + dy)) continue;
                seen.add(k);
                queue.push([x + dx, y + dy]);
            }
        }
        assert.ok(seen.has(`${DOOR.x},${DOOR.y}`), 'the vault door is walled off');
    });
});

describe('the vault room', () => {
    const bank = new GameMap(load('bank-map.json'), 'bank-map.json');
    const vaultData = load('vault-map.json');
    const vault = new GameMap(vaultData, 'vault-map.json');
    const door = bank.transitions.find(t => t.toMap === 'vault-map.json');

    test('the door lands you on the vault\'s floor', () => {
        assert.ok(vault.isWalkable(door.toX, door.toY));
        assert.equal(vault.getTransition(door.toX, door.toY), null, 'landing on an exit would bounce you straight back');
    });

    test('its door leads back to the bank, in front of the vault door', () => {
        const back = vault.transitions.filter(t => t.toMap === 'bank-map.json');
        assert.ok(back.length > 0, 'no way back to the bank');
        assert.ok(back.every(t => !t.requires), 'the way back is never locked');
        const t = back[0];
        assert.deepEqual([t.toX, t.toY], [DOOR.x, DOOR.y + 1]);
        assert.ok(bank.isWalkable(t.toX, t.toY));
        assert.equal(bank.getTransition(t.toX, t.toY), null);
    });

    test('the vault has its own name', () => {
        assert.ok(vault.zoneName, 'the vault names its zone');
        assert.notEqual(vault.zoneName, bank.zoneName);
    });
});

// ── The walked-onto gate in main.js ─────────────────────────────────────────
// The gate runs inside _doMove's step callback, so its block is lifted out of
// the source (the grapple.test.js pattern) and run against a stand-in game.
describe('stepping onto a gated door (main.js)', () => {
    const src = readFileSync(join(GAME, 'main.js'), 'utf8').replace(/\r\n/g, '\n');
    const from = src.indexOf('const transition = this.map.getTransition(nx, ny);');
    const to = src.indexOf('// (Legacy tile-7', from);
    const block = from > 0 && to > from ? src.slice(from, to) : null;
    const step = block && new Function('carriesAll', `'use strict'; return function (nx, ny) { ${block} }`)(carriesAll);

    const game = (inventory) => {
        const map = new GameMap(load('bank-map.json'), 'bank-map.json');
        return { map, inventory, logs: [], _pendingTransition: null, _log(t) { this.logs.push(t); } };
    };

    test('the gate block is where it was', () => {
        assert.equal(typeof step, 'function');
    });

    test('fewer than three: shut, and the locked line is logged', () => {
        for (const held of [[], ACT2.slice(0, 1), ACT2.slice(0, 2), ACT2.slice(1)]) {
            const g = game(bag(...held, 'pipe'));
            step.call(g, DOOR.x, DOOR.y);
            assert.equal(g._pendingTransition, null, `opened with only ${held.join(', ') || 'nothing'}`);
            assert.deepEqual(g.logs, [g.map.getTransition(DOOR.x, DOOR.y).requiresMsg]);
        }
    });

    test('all three: the door takes you into the vault', () => {
        const g = game(bag(...ACT2));
        step.call(g, DOOR.x, DOOR.y);
        assert.equal(g._pendingTransition?.toMap, 'vault-map.json');
        assert.deepEqual(g.logs, []);
    });

    test('an ungated door still just opens', () => {
        const g = game([]);
        const out = g.map.transitions.find(t => t.toMap === 'downtown-map.json');
        step.call(g, out.x, out.y);
        assert.equal(g._pendingTransition, out);
    });
});
