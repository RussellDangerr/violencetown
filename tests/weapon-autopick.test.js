// weapon-autopick.test.js — WK2: tapping an enemy uses the move your weapon brings
// (plans/wk2-weapon-move-autopick.md).
//
// Drives the real tap path: _fireResolver's 'hit' case (what a tap's Hit verb runs)
// into the wheel's own _fireWheel, lifted out of main.js. Stand-ins below the wheel:
// combatAttack (it records the damage and lowers hp), _advanceWorld and _render.

import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createWheelState, affectedTiles, selectedNode, compose, needsFriendlyConfirm, setMeleeKit,
         tapMoveKey, meleePathTo } from '../game/wheel-model.js';
import { WEAPONS, weaponClassOf } from '../game/weapons.js';
import { ITEMS } from '../game/items.js';
import { isHostile } from '../game/ai.js';
import { Enemy } from '../game/enemies.js';

const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');
afterEach(() => setMeleeKit(null));

function liveMethod(name, params, freeVars = {}) {
    const signature = `${name}(${params}) {`;
    const at = mainSrc.indexOf(signature);
    assert.ok(at > 0, `${signature} not found in main.js`);
    const closeAt = mainSrc.indexOf('\n    }', at);
    const body = mainSrc.slice(at + name.length, closeAt + '\n    }'.length);
    const names = Object.keys(freeVars);
    return new Function(...names, `'use strict'; return function ${body}`)(...names.map(n => freeVars[n]));
}
function liveConst(name) {
    const m = new RegExp(`\\nconst ${name}\\s*=\\s*`).exec(mainSrc);
    const from = m.index + m[0].length;
    const end = mainSrc.indexOf('\n};', from);
    return new Function(`'use strict'; return ${mainSrc.slice(from, end + 2)}`)();
}
const STATE = liveConst('STATE');
const audio = { playSfx() {}, playMusic() {} };

const foe = (x, y, over = {}) => new Enemy({ id: `e${x}${y}`, type: 'Ruffian', x, y, hp: 100, ...over });

function makeGame(weapon, enemies) {
    const g = {
        state: STATE.IDLE, playerX: 5, playerY: 5, wheel: createWheelState(),
        equipment: { weapon }, enemies, hits: [], logs: [], advanced: 0, rendered: 0,
        _lastHitTarget: null,
        _log(m) { this.logs.push(m); }, _render() { this.rendered++; }, _advanceWorld() { this.advanced++; },
        _resumeHeldWalk() {},
        combatAttack(e, dmg, opts) { this.hits.push({ id: e.id, dmg }); e.entity.hp -= dmg; return String(dmg); },
    };
    const free = { STATE, audio, weaponClassOf, setMeleeKit, tapMoveKey, meleePathTo, affectedTiles, isHostile,
                   compose, selectedNode, needsFriendlyConfirm, emitNoise() {}, NOISE: {} };
    for (const [n, p] of [['_fireResolver', 'verb, t'], ['_tapWithWeaponMove', 'npc'], ['_syncMeleeKit', ''],
                          ['_fireWheel', ''], ['_closeWheel', ''], ['_aoeStrike', 'tiles, damage, opts = {}'],
                          ['_enemiesPresent', 'tiles']]) g[n] = liveMethod(n, p, free);
    return g;
}
// What a tap on `e` runs: the Hit verb's resolver, on that enemy.
const tap = (g, e) => g._fireResolver({ key: 'hit', resolver: 'hit' }, { x: e.x, y: e.y, npc: e });

const sword = WEAPONS.wooden_sword;
const hammer = Object.values(ITEMS).concat(Object.values(WEAPONS)).find(d => d.weaponClass === 'hammer');
const noMove = Object.values(ITEMS).concat(Object.values(WEAPONS)).find(d => d.equipSlot === 'weapon' && weaponClassOf(d) && weaponClassOf(d).kit.length === 0);

describe('a tap uses the weapon\'s own move', () => {
    test('the sword cleaves: the tapped enemy and the one beside it both take 2/3', () => {
        const a = foe(6, 5), b = foe(6, 6);
        const g = makeGame(sword, [a, b]);
        tap(g, a);
        assert.deepEqual(g.hits.map(h => h.id).sort(), [a.id, b.id].sort());
        assert.ok(g.hits.every(h => Math.abs(h.dmg - sword.damage * 2 / 3) < 1e-9));
        assert.equal(g.advanced, 1);
        assert.equal(g.state, STATE.IDLE);
    });
    test('the hammer stuns: a full hit, and the survivor loses a turn', () => {
        const a = foe(6, 5);
        const g = makeGame(hammer, [a]);
        tap(g, a);
        assert.deepEqual(g.hits, [{ id: a.id, dmg: hammer.damage }]);
        assert.equal(a._spunTurns, 1);
        assert.equal(g.state, STATE.IDLE);
    });
    test('a tap fires through the wheel: the fired node is the class move', () => {
        const a = foe(6, 5);
        const g = makeGame(sword, [a]);
        tap(g, a);
        assert.equal(g.wheel.lastFired.nodeKey, 'cleave');
        const h = makeGame(hammer, [foe(6, 5)]);
        tap(h, h.enemies[0]);
        assert.equal(h.wheel.lastFired.nodeKey, 'stun');
    });
    test('a weapon with no move of its own still hits once, as today', () => {
        assert.ok(noMove, 'a weapon with an empty kit exists');
        const a = foe(6, 5), b = foe(6, 6);
        const g = makeGame(noMove, [a, b]);
        tap(g, a);
        assert.deepEqual(g.hits, [{ id: a.id, dmg: noMove.damage }]);
        assert.equal(g.wheel.lastFired, null);
        assert.equal(g.advanced, 1);
    });
});

describe('a tap never strikes someone who is not hostile', () => {
    test('a friend on the Cleave flank: the sword falls back to the single hit', () => {
        const a = foe(6, 5), friend = foe(6, 6, { allegiance: 'neutral', behavior: ['IDLE'], damage: 0 });
        assert.ok(!isHostile(friend));
        const g = makeGame(sword, [a, friend]);
        tap(g, a);
        assert.deepEqual(g.hits, [{ id: a.id, dmg: sword.damage }]);
    });
});

describe('the pure pieces', () => {
    test('tapMoveKey: the kit\'s own move, else hit', () => {
        assert.equal(tapMoveKey(['cleave']), 'cleave');
        assert.equal(tapMoveKey(['stun']), 'stun');
        assert.equal(tapMoveKey(['spin']), 'spin');
        assert.equal(tapMoveKey([]), 'hit');
        assert.equal(tapMoveKey(null), 'hit');
    });
    test('meleePathTo finds the move on the synced ring, and nothing when it is absent', () => {
        setMeleeKit(['cleave']);
        assert.ok(meleePathTo('cleave'));
        assert.equal(meleePathTo('stun'), null);
    });
    test('the tap reaches the wheel from main.js\'s Hit verb', () => {
        assert.match(mainSrc, /case 'hit':\s+if \(npc && this\._tapWithWeaponMove\?\.\(npc\)\) break;/);
    });
});
