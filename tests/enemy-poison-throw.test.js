// enemy-poison-throw.test.js — the two Red Fungi throw Tunnel Mushrooms (plans/ps1-fungi-throw-mushrooms.md).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Enemy } from '../game/enemies.js';
import { tickNpcState } from '../game/npc.js';
import { ITEMS, poitionBuff } from '../game/items.js';

function makeGame(px, py) {
    return {
        playerX: px, playerY: py, enemies: [], containers: [], turn: 0, _MOVE_MS: 150,
        map: { isWalkable: (x, y) => x >= 0 && y >= 0 && x < 11 && y < 8 },
        rng: { pick: (a) => a[0], float: () => 0.5 },
        thrown: [], damageTaken: 0,
        applyDamageToPlayer(d) { this.damageTaken += d; },
        _enemyThrow(npc, def) { this.thrown.push({ by: npc.id, item: def.id }); return '[x]'; },
    };
}
const fungus = (g, type, loadout) => {
    const e = new Enemy({ id: 'f1', type, x: 5, y: 1, hp: 100, damage: 9, sightRange: 8, facing: 'S', loadout });
    g.enemies.push(e);
    return e;
};
const run = (g, e) => tickNpcState(g, e, 1);

describe('who throws the mushroom', () => {
    test('a Red Fungus seeing you from 3 tiles throws it; it leaves the kit', () => {
        const g = makeGame(5, 4);
        const e = fungus(g, 'Red Fungus', ['tunnel_mushroom', 'sludge_sack']);
        run(g, e);
        assert.deepEqual(g.thrown, [{ by: 'f1', item: 'tunnel_mushroom' }]);
        assert.deepEqual(e.loadout, ['sludge_sack']);
    });
    for (const type of ['Violet Fungus', 'Ghost Fungus', 'Fungus King']) {
        test(`${type} keeps its mushroom as food`, () => {
            const g = makeGame(5, 4);
            const e = fungus(g, type, ['tunnel_mushroom']);
            run(g, e);
            assert.equal(g.thrown.length, 0);
        });
    }
    test('adjacent, a Red Fungus swings instead', () => {
        const g = makeGame(5, 2);
        const e = fungus(g, 'Red Fungus', ['tunnel_mushroom']);
        run(g, e);
        assert.equal(g.thrown.length, 0);
    });
    test('the mushroom is still not an enemy-thrown poison by item flag', () => {
        assert.ok(!ITEMS.tunnel_mushroom.enemyThrows);
    });
    test('the sewer has exactly two Red Fungi, both carrying a mushroom', () => {
        const m = JSON.parse(readFileSync(new URL('../game/sewer-map.json', import.meta.url), 'utf8'));
        const reds = m.enemies.filter(e => e.type === 'Red Fungus');
        assert.equal(reds.length, 2);
        for (const r of reds) assert.ok(r.loadout.includes('tunnel_mushroom'));
    });
});

describe('what lands on you', () => {
    const src = readFileSync(new URL('../game/main.js', import.meta.url), 'utf8');
    const at = src.indexOf('    _enemyThrow(npc, def) {');
    const body = src.slice(at + '    _enemyThrow'.length, src.indexOf('\n    }', at) + '\n    }'.length);
    const enemyThrow = new Function('poitionBuff', `'use strict'; return function ${body}`)(poitionBuff);
    const game = () => ({
        playerX: 5, playerY: 5, buffs: [], splats: [],
        addBuff(id, name, turns, type, extra = {}) { this.buffs.push({ id, name, turns, type, ...extra }); },
        _spawnHitSplat(x, y, text, kind) { this.splats.push({ x, y, text, kind }); },
    });
    test('you are Poisoned 5 a turn for 2 turns, with a poison splat on you', () => {
        const g = game();
        const line = enemyThrow.call(g, { id: 'f1', type: 'Red Fungus', x: 5, y: 2 }, ITEMS.tunnel_mushroom);
        assert.equal(g.buffs.length, 1);
        assert.deepEqual([g.buffs[0].id, g.buffs[0].name, g.buffs[0].turns, g.buffs[0].dmg], ['poison', 'Poisoned', 2, 5]);
        assert.deepEqual([g.splats[0].x, g.splats[0].y, g.splats[0].kind], [5, 5, 'poison']);
        assert.match(line, /Red Fungus throws Tunnel Mushroom at you/);
    });
    test('a second hit refreshes rather than stacking', () => {
        const g = game();
        g.buffs.push({ id: 'poison', name: 'Poisoned', turns: 1, type: 'debuff', dmg: 5 });
        enemyThrow.call(g, { id: 'f1', type: 'Red Fungus', x: 5, y: 2 }, ITEMS.tunnel_mushroom);
        assert.equal(g.buffs.length, 1);
        assert.equal(g.buffs[0].turns, 2);
    });
});
