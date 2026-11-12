// default-attack.test.js — WK3: you choose your default attack
// (plans/wk3-choose-default-attack.md).
//
// Holding a Melee move on the wheel (F on keys) stars it; a tap on an enemy then uses
// the starred move. The choice is saved, and it belongs to the weapon it was starred on.
// Drives the real main.js methods (lifted out of the source, as weapon-autopick.test.js
// does) and the real save.js serialize / loadInto.

import { test, describe, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createWheelState, affectedTiles, selectedNode, compose, needsFriendlyConfirm, setMeleeKit,
         tapMoveKey, meleePathTo, meleeRingKeys, resolveDefaultKey, starrableMove } from '../game/wheel-model.js';
import { WEAPONS, weaponClassOf } from '../game/weapons.js';
import { ITEMS } from '../game/items.js';
import { isHostile } from '../game/ai.js';
import { Enemy } from '../game/enemies.js';
import { serialize, loadInto } from '../game/save.js';
import { QuestEngine } from '../game/quests.js';

const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');
const rendererSrc = readFileSync(fileURLToPath(new URL('../game/renderer.js', import.meta.url)), 'utf8');
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
        defaultAttack: null, _lastHitTarget: null,
        _log(m) { this.logs.push(m); }, _render() { this.rendered++; }, _advanceWorld() { this.advanced++; },
        _resumeHeldWalk() {},
        combatAttack(e, dmg) { this.hits.push({ id: e.id, dmg }); e.entity.hp -= dmg; return String(dmg); },
    };
    const free = { STATE, audio, weaponClassOf, setMeleeKit, tapMoveKey, meleePathTo, affectedTiles, isHostile,
                   compose, selectedNode, needsFriendlyConfirm, meleeRingKeys, resolveDefaultKey, starrableMove,
                   emitNoise() {}, NOISE: {} };
    for (const [n, p] of [['_fireResolver', 'verb, t'], ['_tapWithWeaponMove', 'npc'], ['_syncMeleeKit', ''],
                          ['_defaultMoveKey', ''], ['_setDefaultAttack', ''],
                          ['_fireWheel', ''], ['_closeWheel', ''], ['_aoeStrike', 'tiles, damage, opts = {}'],
                          ['_enemiesPresent', 'tiles']]) g[n] = liveMethod(n, p, free);
    return g;
}
const tap = (g, e) => g._fireResolver({ key: 'hit', resolver: 'hit' }, { x: e.x, y: e.y, npc: e });
// Put the wheel's highlight on a Melee move, as the player would by spinning to it.
function highlight(g, key) {
    g._syncMeleeKit();
    g.wheel.path = meleePathTo(key);
    assert.ok(g.wheel.path, `${key} is on the ring`);
}

const sword = WEAPONS.wooden_sword;
const all = Object.values(ITEMS).concat(Object.values(WEAPONS));
const hammer = all.find(d => d.weaponClass === 'hammer');

describe('choosing the default', () => {
    test('with nothing chosen, the weapon\'s own move is the default (as WK2)', () => {
        const g = makeGame(sword, [foe(6, 5)]);
        g._syncMeleeKit();
        assert.equal(g._defaultMoveKey(), 'cleave');
    });
    test('starring Hit on a sword makes a tap the single plain hit, not the cleave', () => {
        const a = foe(6, 5), b = foe(6, 6);
        const g = makeGame(sword, [a, b]);
        highlight(g, 'hit');
        assert.equal(g._setDefaultAttack(), true);
        assert.deepEqual(g.defaultAttack, { weaponId: sword.id, key: 'hit' });
        tap(g, a);
        assert.deepEqual(g.hits, [{ id: a.id, dmg: sword.damage }], 'one foe, full damage');
    });
    test('starring Cleave back again makes a tap cleave', () => {
        const a = foe(6, 5), b = foe(6, 6);
        const g = makeGame(sword, [a, b]);
        highlight(g, 'hit'); g._setDefaultAttack();
        highlight(g, 'cleave'); g._setDefaultAttack();
        tap(g, a);
        assert.equal(g.hits.length, 2);
        assert.equal(g.wheel.lastFired.nodeKey, 'cleave');
    });
    test('a move that is not on the Melee ring cannot be starred', () => {
        const g = makeGame(sword, [foe(6, 5)]);
        g._syncMeleeKit();
        g.wheel.path = [3];   // a top-level ring, not a Melee move
        assert.equal(starrableMove(g.wheel), null);
        assert.equal(g._setDefaultAttack(), false);
        assert.equal(g.defaultAttack, null);
    });
    test('the wheel must not be mid-aim to star', () => {
        const g = makeGame(sword, [foe(6, 5)]);
        highlight(g, 'hit');
        g.wheel.aiming = true;
        assert.equal(starrableMove(g.wheel), null);
    });
});

describe('swapping weapons', () => {
    test('a starred move falls back to the new weapon\'s own move', () => {
        assert.ok(hammer, 'a hammer exists');
        const a = foe(6, 5);
        const g = makeGame(sword, [a]);
        highlight(g, 'hit'); g._setDefaultAttack();
        g.equipment.weapon = hammer;
        tap(g, a);
        assert.equal(g.defaultAttack, null, 'the choice was reset');
        assert.equal(g.wheel.lastFired.nodeKey, 'stun');
    });
    test('swapping back does not resurrect the old choice', () => {
        const g = makeGame(sword, [foe(6, 5)]);
        highlight(g, 'hit'); g._setDefaultAttack();
        g.equipment.weapon = hammer; g._syncMeleeKit();
        g.equipment.weapon = sword; g._syncMeleeKit();
        assert.equal(g._defaultMoveKey(), 'cleave');
    });
    test('resolveDefaultKey: a choice for another weapon, or a move off the ring, loses to the own move', () => {
        const base = { weaponId: 'a', ringKeys: ['hit', 'cleave'], own: 'cleave' };
        assert.equal(resolveDefaultKey({ ...base, chosen: { weaponId: 'a', key: 'hit' } }), 'hit');
        assert.equal(resolveDefaultKey({ ...base, chosen: { weaponId: 'b', key: 'hit' } }), 'cleave');
        assert.equal(resolveDefaultKey({ ...base, chosen: { weaponId: 'a', key: 'stun' } }), 'cleave');
        assert.equal(resolveDefaultKey({ ...base, chosen: null }), 'cleave');
    });
});

describe('the choice is saved', () => {
    const DEFS = { wooden_sword: sword };
    function fake() {
        const g = {
            logs: [], map: null, rng: { getState: () => 1, setState() {} }, turn: 0, playerX: 0, playerY: 0,
            playerHp: 100, playerMaxHp: 100, playerMp: 100, playerMaxMp: 100, facing: 'down', gold: 0,
            equipment: { weapon: sword, top: null, bottom: null, front: null, back: null, sides: null },
            tempEquips: [], buffs: [], inventory: [], selectedSlot: -1, groundItems: [], containers: [],
            enemies: [], _tileDiffs: [], _pendingTransition: null, _sewerEscape: null, _lastAutosaveTurn: 0,
            state: 'boot', defaultAttack: null,
            _log(m) { this.logs.push(m); }, _render() {},
            _resolveItemDef(id) { return id ? (DEFS[id] || null) : null; },
            async _loadMap(url, x, y) {
                this.map = { url: url || 'town-map.json', width: 20, height: 15, zoneName: 'Town',
                    isInBounds: () => true, isWalkable: () => true, _tileAt: () => 1, _setTileRaw() {} };
                this.playerX = x ?? 1; this.playerY = y ?? 1;
            },
            setTile() {},
        };
        g.questEngine = new QuestEngine(g);
        return g;
    }
    beforeEach(() => {
        const store = new Map();
        globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)),
                                    removeItem: k => store.delete(k), clear: () => store.clear() };
        globalThis.document = { createElement: () => ({ set textContent(v) {}, get innerHTML() { return ''; } }) };
    });

    test('a starred move survives serialize then loadInto', async () => {
        const src = fake();
        src.defaultAttack = { weaponId: 'wooden_sword', key: 'hit' };
        const blob = JSON.parse(JSON.stringify(serialize(src)));
        assert.deepEqual(blob.player.defaultAttack, { weaponId: 'wooden_sword', key: 'hit' });
        const dst = fake();
        await loadInto(dst, blob);
        assert.deepEqual(dst.defaultAttack, { weaponId: 'wooden_sword', key: 'hit' });
    });
    test('with no choice the save carries no new field, and a load leaves none', async () => {
        const src = fake();
        const blob = JSON.parse(JSON.stringify(serialize(src)));
        assert.equal('defaultAttack' in blob.player, false);
        const dst = fake(); dst.defaultAttack = { weaponId: 'x', key: 'hit' };
        await loadInto(dst, blob);
        assert.equal(dst.defaultAttack, null);
    });
    test('a malformed saved choice is dropped, not trusted', async () => {
        const blob = JSON.parse(JSON.stringify(serialize(fake())));
        blob.player.defaultAttack = { weaponId: 7, key: null };
        const dst = fake();
        await loadInto(dst, blob);
        assert.equal(dst.defaultAttack, null);
    });
});

describe('the gestures and the star are wired', () => {
    test('F on the open wheel stars the highlighted move', () => {
        assert.match(mainSrc, /e\.code === 'KeyF' && !e\.repeat && this\._setDefaultAttack\(\)/);
    });
    test('a held press on the dial\'s drill quadrant stars it; a quick tap still drills on release', () => {
        assert.match(mainSrc, /if \(starrableMove\(w\)\) this\._armWheelHold\(\); else this\._wheelDrill\(\);/);
        assert.match(mainSrc, /this\._endWheelHold\(e\);/);
        const hold = liveMethod('_armWheelHold', '', { setTimeout: (fn) => { hold.fn = fn; return 1; } });
        const g = { _setDefaultAttack() { this.starred = true; } };
        hold.call(g); hold.fn();
        assert.equal(g.starred, true);
    });
    test('a quick tap (release before the timer) drills and does not star', () => {
        let cleared = 0;
        const end = liveMethod('_endWheelHold', 'e', { clearTimeout: () => { cleared++; }, STATE });
        const g = { state: STATE.RADIAL_MENU, _wheelHold: { timer: 1 }, drilled: 0, _wheelDrill() { this.drilled++; } };
        end.call(g, { type: 'pointerup' });
        assert.equal(g.drilled, 1); assert.equal(cleared, 1); assert.equal(g._wheelHold, null);
    });
    test('the wheel marks the default with a star on the slice', () => {
        assert.match(rendererSrc, /'\[\*\] ' \+ node\.label/);
        assert.match(rendererSrc, /this\._starred\(node, game\)/);
    });
    test('a new run clears the choice', () => {
        assert.ok((mainSrc.match(/this\.defaultAttack = null;/g) || []).length >= 2);
    });
});
