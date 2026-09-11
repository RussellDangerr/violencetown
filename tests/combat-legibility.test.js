// combat-legibility.test.js — a fight shows its heals and its damage over time.
//
// Enemies eat their own kits (0922928) and bosses buy HP (6bdb7ad), but the only
// sign of either was a log line — and every regeneration tick of sewer fare logged
// exactly like damage: applyDot printed Math.abs(dmg), and _log flattens the
// em-dash to a hyphen, so a fungus healing itself read "[Violet Fungus - Sludge 3]".
// Meanwhile the combat-feel pass had built typed hit-splats for sludge, poison,
// fire and heal (renderer.js: oozes, rattles, flickers, "gentle float + holy
// glow") and nothing but a plain hit and the fire bottle ever spawned one.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tickBuffList } from '../game/buffs.js';
import { Enemy } from '../game/enemies.js';
import { tickNpcState } from '../game/npc.js';

// ── DoT ticks ───────────────────────────────────────────────────────────────

function game(hp = 100) {
    return {
        playerHp: hp, playerMaxHp: 100, playerX: 3, playerY: 4,
        buffs: [], logs: [], splats: [], _lastDefeatedBy: null,
        _log(m) { this.logs.push(m); },
        _hasSludgeImmunity: () => false,
        _spawnHitSplat(x, y, text, type, opts = {}) { this.splats.push({ x, y, text, type, killed: !!opts.killed }); },
    };
}
const fungus = (hp, buffs) => ({ type: 'Violet Fungus', x: 7, y: 2, entity: { hp, maxHp: 100, alive: true }, buffs });

describe('a DoT tick says which way it went', () => {
    test('a healing tick reads as a heal, not as damage', () => {
        const g = game();
        const f = fungus(50, [{ id: 'sludge', turns: 3, dmg: -3 }]);
        tickBuffList(f.buffs, f, g);
        assert.equal(f.entity.hp, 53);
        assert.equal(g.logs[0], '[Violet Fungus — Sludge (+3 HP)]');
    });

    test('a damage tick reads as it always did', () => {
        const g = game();
        const f = fungus(50, [{ id: 'sludge', turns: 3, dmg: 3 }]);
        tickBuffList(f.buffs, f, g);
        assert.equal(g.logs[0], '[Violet Fungus — Sludge 3]');
    });

    test('the heal it reports is the heal it gave — clamped at the Hundred', () => {
        const g = game(98);
        g.buffs = [{ id: 'poison', turns: 2, dmg: -5 }];
        tickBuffList(g.buffs, g, g);
        assert.equal(g.playerHp, 100);
        assert.equal(g.logs[0], '[You — Poison (+2 HP)]');
    });
});

describe('a DoT tick shows over whoever it touched', () => {
    test('damage wears its own colour', () => {
        for (const id of ['sludge', 'poison', 'fire']) {
            const g = game();
            const f = fungus(50, [{ id, turns: 2, dmg: 5 }]);
            tickBuffList(f.buffs, f, g);
            assert.deepEqual(g.splats, [{ x: 7, y: 2, text: '-5', type: id, killed: false }], id);
        }
    });

    test('a heal is a heal splat, whatever carried it', () => {
        const g = game();
        const f = fungus(50, [{ id: 'sludge', turns: 2, dmg: -3 }]);
        tickBuffList(f.buffs, f, g);
        assert.deepEqual(g.splats, [{ x: 7, y: 2, text: '+3', type: 'heal', killed: false }]);
    });

    test("the player's own ticks show over the player", () => {
        const g = game(50);
        g.buffs = [{ id: 'fire', turns: 2, dmg: 5 }];
        tickBuffList(g.buffs, g, g);
        assert.deepEqual(g.splats, [{ x: 3, y: 4, text: '-5', type: 'fire', killed: false }]);
    });

    test('a tick that changes nothing shows nothing', () => {
        const full = game(100);
        full.buffs = [{ id: 'poison', turns: 2, dmg: -5 }];
        tickBuffList(full.buffs, full, full);
        const floored = game(1);                       // Law 7 holds the player at 1
        floored.buffs = [{ id: 'fire', turns: 2, dmg: 5 }];
        tickBuffList(floored.buffs, floored, floored);
        assert.deepEqual([...full.splats, ...floored.splats], []);
    });

    test('a killing tick shows what it took, and marks the kill', () => {
        const g = game();
        const f = fungus(4, [{ id: 'poison', turns: 2, dmg: 10 }]);
        tickBuffList(f.buffs, f, g);
        assert.deepEqual(g.splats, [{ x: 7, y: 2, text: '-4', type: 'poison', killed: true }]);
    });

    test('a game with no splat hook still ticks', () => {
        const g = game();
        delete g._spawnHitSplat;
        const f = fungus(50, [{ id: 'poison', turns: 2, dmg: 5 }]);
        assert.doesNotThrow(() => tickBuffList(f.buffs, f, g));
        assert.equal(f.entity.hp, 45);
    });
});

// ── An enemy healing itself carries the amount to the presentation layer ───
//
// npc.js owns the turn and reports it; main.js owns what the player sees. So the
// report carries `heal` (what it actually gained) and, when the healed body is not
// the actor, `healTarget` — and _routeWorldMessages turns that into the splat.

describe('an enemy that heals itself says how much', () => {
    const openRoom = ['...........', '...........', '...........', '...........', '...........'];
    function arena(px, py) {
        const H = openRoom.length, W = openRoom[0].length;
        return {
            playerX: px, playerY: py, enemies: [], containers: [], turn: 0, _MOVE_MS: 150,
            map: { isWalkable: (x, y) => x >= 0 && y >= 0 && x < W && y < H },
            rng: { pick: (a) => a[0], float: () => 0.5 },
            applyDamageToPlayer() {},
        };
    }
    const hurt = (g, hp, over = {}) => {
        const e = new Enemy({ id: 'k1', type: 'Fungus', x: 5, y: 2, sightRange: 8, facing: 'S', damage: 9, ...over });
        e.entity.hp = hp;
        g.enemies.push(e);
        return e;
    };
    const healReports = (msgs) => {
        const found = msgs.filter(m => typeof m === 'object' && 'heal' in m);
        assert.ok(found.length, `no report carries a heal: ${JSON.stringify(msgs.map(m => m.text ?? m))}`);
        return found;
    };

    test('eating food reports the HP it gave', () => {
        const g = arena(5, 3);
        const e = hurt(g, 50, { loadout: ['bandage'] });
        const [r] = healReports(tickNpcState(g, e, 1));
        assert.equal(r.heal, 25);
        assert.equal(r.healTarget ?? r.sourceEnemy, e);
    });

    test('a poition that heals over time reports nothing now — its ticks do', () => {
        const g = arena(5, 3);
        const e = hurt(g, 50, { loadout: ['sludge_sack'], sewerDweller: true });
        const [r] = healReports(tickNpcState(g, e, 1));
        assert.equal(r.heal, 0);
    });

    test('a grunt buying HP reports what it bought', () => {
        const g = arena(5, 3);
        const e = hurt(g, 30, { gold: 100 });
        const [r] = healReports(tickNpcState(g, e, 1));
        assert.ok(r.heal > 0, 'no heal on the purchase report');
        assert.equal(e.entity.hp, 30 + r.heal);
    });

    test("a boss paying for an ally's HP points the heal at the ally", () => {
        const g = arena(5, 3);
        const boss = hurt(g, 100, { id: 'b1', boss: true, gold: 60, allegiance: 'hostile' });
        const ward = new Enemy({ id: 'w1', type: 'Fungus', x: 6, y: 1, allegiance: 'hostile' });
        ward.entity.hp = 40;
        g.enemies.push(ward);
        const [r] = healReports(tickNpcState(g, boss, 1));
        assert.equal(r.healTarget, ward);
        assert.equal(ward.entity.hp, 40 + r.heal);
    });
});

// ── …and main.js shows it ───────────────────────────────────────────────────

const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');
function liveMethod(name, params) {
    const signature = `${name}(${params}) {`;
    const at = mainSrc.indexOf(signature);
    assert.ok(at > 0, `${name}(${params}) not found in main.js`);
    const closeAt = mainSrc.indexOf('\n    }', at);
    const body = mainSrc.slice(at + name.length, closeAt + '\n    }'.length);
    return new Function(`'use strict'; return function ${body}`)();
}

describe('_routeWorldMessages shows a heal where it landed', () => {
    const route = liveMethod('_routeWorldMessages', 'msgs');
    const view = () => ({
        logs: [], splats: [],
        _log(t) { this.logs.push(t); },
        _spawnHitSplat(x, y, text, type) { this.splats.push({ x, y, text, type }); },
        _spawnOverheadDialogue() {}, emitGameEvent() {},
    });
    const fungusAt = (x, y) => ({ x, y, type: 'Fungus' });

    test('a heal report floats a heal splat over the healer, and still logs', () => {
        const v = view(), f = fungusAt(4, 5);
        route.call(v, [{ text: '[Fungus digs out a bandage.]', sourceEnemy: f, category: 'combat', heal: 25 }]);
        assert.deepEqual(v.splats, [{ x: 4, y: 5, text: '+25', type: 'heal' }]);
        assert.deepEqual(v.logs, ['[Fungus digs out a bandage.]']);
    });

    test('a heal paid for someone else floats over them', () => {
        const v = view(), boss = fungusAt(4, 5), ward = fungusAt(6, 6);
        route.call(v, [{ text: '[Boss pays.]', sourceEnemy: boss, healTarget: ward, category: 'combat', heal: 40 }]);
        assert.deepEqual(v.splats, [{ x: 6, y: 6, text: '+40', type: 'heal' }]);
    });

    test('a zero heal and an ordinary report show no splat', () => {
        const v = view(), f = fungusAt(4, 5);
        route.call(v, [
            { text: '[Fungus drinks a sack.]', sourceEnemy: f, category: 'combat', heal: 0 },
            { text: '[Fungus loses interest.]', sourceEnemy: f, category: 'deaggro' },
            'a plain string',
        ]);
        assert.deepEqual(v.splats, []);
        assert.equal(v.logs.length, 3);
    });
});
