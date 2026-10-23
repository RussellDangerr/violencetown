// sludge-brain.test.js — Sludge Brain and its puddles (plans/poisons.md stage 2).
//
// Thrown, it leaves a 3-tile sludge puddle: the landing tile and the throw's
// two forward diagonals. Ending a turn in it applies the Sludge DoT (sewer
// dwellers are healed instead); it dries after 8 actions; held walks stop at it.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ITEMS, resolveThrow } from '../game/items.js';
import { SLUDGE_DOT } from '../game/data.js';
import { isSewerDweller } from '../game/ai.js';
import { Enemy } from '../game/enemies.js';
import { puddleTiles, layPuddle, puddleAt, dryPuddles, PUDDLE_TURNS } from '../game/puddles.js';

const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');
function liveMethod(signature, freeVars = {}) {
    const at = mainSrc.indexOf(signature, mainSrc.indexOf('class Game {'));
    assert.ok(at > 0, `${signature} not found in main.js`);
    const body = mainSrc.slice(at + signature.indexOf('('), mainSrc.indexOf('\n    }', at) + '\n    }'.length);
    const names = Object.keys(freeVars);
    return new Function(...names, `'use strict'; return function ${body}`)(...names.map(n => freeVars[n]));
}
const SLUDGE_DURATION = Number(/\nconst SLUDGE_DURATION = (\d+);/.exec(mainSrc)[1]);
const layPuddleM = liveMethod('_layPuddle(from, at, kind, turns) {', { puddleTiles, layPuddle });
const tickPuddles = liveMethod('_tickPuddles() {', { puddleAt, dryPuddles, isSewerDweller, SLUDGE_DOT, SLUDGE_DURATION });

const key = (ts) => ts.map(t => `${t.x},${t.y}`).sort();

describe('the shape: the landing tile and the two forward diagonals', () => {
    test('a throw east fans north-east and south-east of the landing', () => {
        assert.deepEqual(key(puddleTiles({ x: 0, y: 5 }, { x: 4, y: 5 })), key([{ x: 4, y: 5 }, { x: 5, y: 4 }, { x: 5, y: 6 }]));
    });
    test('a throw north fans north-west and north-east', () => {
        assert.deepEqual(key(puddleTiles({ x: 3, y: 9 }, { x: 3, y: 5 })), key([{ x: 3, y: 5 }, { x: 2, y: 4 }, { x: 4, y: 4 }]));
    });
    test('a diagonal throw fans into its two cardinal halves', () => {
        assert.deepEqual(key(puddleTiles({ x: 0, y: 0 }, { x: 3, y: 3 })), key([{ x: 3, y: 3 }, { x: 4, y: 3 }, { x: 3, y: 4 }]));
    });
    test('an off-axis throw uses the sign of each axis', () => {
        assert.deepEqual(key(puddleTiles({ x: 0, y: 0 }, { x: 4, y: 1 })), key([{ x: 4, y: 1 }, { x: 5, y: 1 }, { x: 4, y: 2 }]));
    });
    test('walls are skipped, never splashed through', () => {
        const open = (x, y) => !(x === 5 && y === 4);
        assert.deepEqual(key(puddleTiles({ x: 0, y: 5 }, { x: 4, y: 5 }, open)), key([{ x: 4, y: 5 }, { x: 5, y: 6 }]));
    });
    test('landing on the thrower covers just that tile', () => {
        assert.deepEqual(key(puddleTiles({ x: 2, y: 2 }, { x: 2, y: 2 })), ['2,2']);
    });
});

describe('the puddle over time', () => {
    test('it dries after 8 actions', () => {
        let list = layPuddle([], [{ x: 1, y: 1 }], 'sludge');
        assert.equal(PUDDLE_TURNS, 8);
        for (let i = 0; i < 7; i++) list = dryPuddles(list);
        assert.ok(puddleAt(list, 1, 1), 'gone too early');
        list = dryPuddles(list);
        assert.equal(puddleAt(list, 1, 1), null);
    });
    test('re-landing tops a puddle back up instead of doubling it', () => {
        const list = layPuddle([], [{ x: 1, y: 1 }], 'sludge', 3);
        layPuddle(list, [{ x: 1, y: 1 }], 'sludge', 8);
        assert.equal(list.length, 1);
        assert.equal(list[0].turnsLeft, 8);
    });
});

describe('who stands in it', () => {
    const game = (over = {}) => {
        const g = {
            playerX: 1, playerY: 1, buffs: [], enemies: [], logs: [], _puddles: layPuddle([], [{ x: 1, y: 1 }, { x: 2, y: 1 }], 'sludge'),
            _log(m) { this.logs.push(m); }, _hasSludgeImmunity: () => false,
            hasBuff(id) { return this.buffs.some(b => b.id === id); },
            addBuff(id, name, turns, type) { const b = this.buffs.find(x => x.id === id); if (b) b.turns = turns; else this.buffs.push({ id, name, turns, type }); },
            ...over,
        };
        return g;
    };

    test('ending a turn in it gives you Sludge, and the puddle dries a step', () => {
        const g = game();
        tickPuddles.call(g);
        assert.equal(g.buffs.find(b => b.id === 'sludge').turns, SLUDGE_DURATION);
        assert.equal(g._puddles[0].turnsLeft, PUDDLE_TURNS - 1);
        assert.match(g.logs[0], /standing in sludge/);
    });
    test('bagged feet keep you dry', () => {
        const g = game({ _hasSludgeImmunity: () => true });
        tickPuddles.call(g);
        assert.equal(g.buffs.length, 0);
    });
    test('an enemy in it is sludged; a sewer dweller is healed instead', () => {
        const thug = new Enemy({ id: 't', type: 'Rattling Skeleton', x: 2, y: 1, hp: 100, damage: 5 });
        const fungus = new Enemy({ id: 'f', type: 'Violet Fungus', x: 1, y: 1, hp: 100, damage: 5, sewerDweller: true });
        assert.ok(isSewerDweller(fungus) && !isSewerDweller(thug));
        const g = game({ playerX: 9, playerY: 9, enemies: [thug, fungus] });
        tickPuddles.call(g);
        assert.equal(thug.buffs.find(b => b.id === 'sludge').dmg, SLUDGE_DOT);
        assert.equal(fungus.buffs.find(b => b.id === 'sludge').dmg, -SLUDGE_DOT);
    });
    test('the world beat ticks the puddles every action', () => {
        const at = mainSrc.indexOf('    _worldBeat({ ambient }) {');
        assert.match(mainSrc.slice(at, mainSrc.indexOf('\n    }', at)), /this\._tickPuddles\(\);/);
    });
    test('a held walk stops at a puddle', () => {
        const at = mainSrc.indexOf('    _autoRepeatShouldStop(dir) {');
        assert.match(mainSrc.slice(at, mainSrc.indexOf('\n    }', at)), /puddleAt\(this\._puddles, nx, ny\)/);
    });
    test('leaving the zone clears them', () => {
        const at = mainSrc.indexOf('    async _loadMap(url, spawnX, spawnY) {');
        assert.match(mainSrc.slice(at, mainSrc.indexOf('\n    }', at)), /this\._puddles = \[\];/);
    });
});

describe('the item', () => {
    test('Sludge Brain is a thrown puddle-maker with no burst of its own', () => {
        const d = ITEMS.sludge_brain;
        assert.equal(d.useType, 'throw');
        assert.deepEqual(d.puddle, { kind: 'sludge', turns: 8 });
        assert.equal(d.poition, undefined);
        assert.equal(d.damage, undefined);
    });
    test('a throw lays the puddle fanned away from you', () => {
        const g = { playerX: 0, playerY: 5, _puddles: [], enemies: [],
                    map: { isWalkable: () => true }, _entitiesInRadius: () => [] };
        g._layPuddle = layPuddleM;
        const msg = resolveThrow(g, ITEMS.sludge_brain, null, 1, { x: 4, y: 5 });
        assert.deepEqual(key(g._puddles), key([{ x: 4, y: 5 }, { x: 5, y: 4 }, { x: 5, y: 6 }]));
        assert.match(msg, /puddle on 3 tiles/);
    });
});
