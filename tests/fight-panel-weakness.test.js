// fight-panel-weakness.test.js — WN1 (plans/wn1-weakness-on-fight-panel.md).
//
// The right fight panel names what a foe is weak to and resists only once you have hit that
// kind of foe with that type (WNR1 b). The hit goes through main.js's own combatAttack, lifted
// out and run on a stand-in game (as once-choices-saved.test.js does); the save goes through the
// real serialize / writeSave / readSaveRaw / loadInto; the panel is read through targetPanel and
// drawn through the real renderer method on a recording font.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { Enemy } from '../game/enemies.js';
import { targetPanel, learnFromHit, sanitizeKnown } from '../game/fight-panels.js';
import { attack, formatDamageNumber, computeHit, elementalMult, weaponHitKind, isBackstab, WEAKNESS_MULT, weaknessKinds, critOf, knockoutDamage } from '../game/combat.js';
import { isBoss } from '../game/defeat-scenarios.js';
import { emitNoise, NOISE } from '../game/perception.js';
import { writeSave, readSaveRaw, loadInto, serialize } from '../game/save.js';
import { Renderer } from '../game/renderer.js';

const mainSrc = readFileSync(new URL('../game/main.js', import.meta.url), 'utf8');
function liveMethod(signature, freeVars = {}) {
    const at = mainSrc.indexOf(signature, mainSrc.indexOf('class Game {'));
    assert.ok(at > 0, `${signature} not found in main.js`);
    const body = mainSrc.slice(at + signature.indexOf('('), mainSrc.indexOf('\n    }', at) + '\n    }'.length);
    const names = Object.keys(freeVars);
    return new Function(...names, `'use strict'; return function ${body}`)(...names.map(n => freeVars[n]));
}
const combatAttack = liveMethod('combatAttack(enemyObj, damage, opts = {}) {', {
    isBackstab, weaponHitKind, weaknessKinds, elementalMult, critOf, isBoss, computeHit, WEAKNESS_MULT,
    knockoutDamage, attack, emitNoise, NOISE, formatDamageNumber,
    performance: { now: () => 0 }, HEAVY_HIT_DAMAGE: 1e9, audio: { playSfx() {} }, RINGS: {},
});
const learnWeakness = liveMethod('_learnWeakness(enemyObj, damageType) {', { learnFromHit });

function installGlobals() {
    const store = new Map();
    globalThis.localStorage = {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => { store.set(k, String(v)); },
        removeItem: (k) => { store.delete(k); },
        clear: () => store.clear(),
    };
    globalThis.document = { createElement: () => ({ set textContent(v) {}, get innerHTML() { return ''; } }) };
}
beforeEach(() => { installGlobals(); });

function makeGame() {
    const map = { url: 'town-map.json', width: 20, height: 15, zoneName: 'Town',
        isInBounds: () => true, isWalkable: () => true };
    return {
        map, turn: 5, rng: { getState: () => 1, setState() {}, float: () => 1 },
        playerX: 3, playerY: 3, playerHp: 100, playerMaxHp: 100, playerMp: 10, playerMaxMp: 10,
        facing: 'down', gold: 20, ringMods: {}, ringSlots: {},
        equipment: { weapon: null, top: null, bottom: null, front: null, back: null, sides: null },
        tempEquips: [], buffs: [], inventory: [], selectedSlot: -1,
        groundItems: [], containers: [], enemies: [],
        _tileDiffs: [], _pendingTransition: null, _sewerEscape: null,
        _lastAutosaveTurn: 0, state: 'idle', log: [],
        _log(m) { this.log.push(m); }, _render() {},
        _finaleBlocksHit: () => false, _poitionMod: () => 0, _earshot: () => [],
        _revertAlly() {}, _onEntityHarmed() {}, _spawnHitSplat() {}, _ensureParticleLoop() {},
        _triggerScreenShake() {}, _handleEnemyDeath() {}, _spreadFireBlood() {},
        emitGameEvent() {}, _removeFromSlot() {}, _resolveItemDef: () => null,
        async _loadMap(url, x, y) { this.map = { ...map, url: url || map.url }; this.playerX = x ?? 1; this.playerY = y ?? 1; },
        setTile() {},
        combatAttack, _learnWeakness: learnWeakness,
    };
}
const foe = (over = {}) => new Enemy({ id: 'f1', type: 'wererat', x: 4, y: 3, hp: 500, armor: 0, damage: 1,
    weak: ['fire'], resist: ['cold'], ...over });
const plain = () => new Enemy({ id: 'p1', type: 'townsperson', x: 4, y: 3, hp: 500, armor: 0, damage: 1 });

async function saveAndContinue(src) {
    assert.equal(writeSave(src), true);
    const dst = makeGame();
    assert.equal(await loadInto(dst, readSaveRaw()), true);
    return dst;
}

describe('the panel names only what you have learned', () => {
    test('nothing learned: no weak or resist entries, even though the foe has both', () => {
        const p = targetPanel(foe(), {});
        assert.deepEqual([p.weak, p.resist], [[], []]);
        assert.deepEqual(targetPanel(foe()).weak, [], 'no known list at all is the same as empty');
    });

    test('a foe with neither list never shows a line', () => {
        const g = makeGame();
        const t = plain();
        g.combatAttack(t, 5, { type: 'fire' });
        const p = targetPanel(t, g._knownWeak);
        assert.deepEqual([p.weak, p.resist], [[], []]);
    });

    test('a real fire hit teaches the weakness, and the cold resistance stays unknown', () => {
        const g = makeGame();
        const t = foe();
        const hit = g.combatAttack(t, 5, { type: 'fire' });
        assert.ok(hit, 'the hit landed');
        assert.deepEqual(g._knownWeak, { wererat: ['fire'] });
        const p = targetPanel(t, g._knownWeak);
        assert.deepEqual(p.weak, ['fire']);
        assert.deepEqual(p.resist, []);
        g.combatAttack(t, 5, { type: 'cold' });
        assert.deepEqual(targetPanel(t, g._knownWeak).resist, ['cold']);
    });

    test('it is known for the KIND: a second foe of the same type shows it unhit', () => {
        const g = makeGame();
        g.combatAttack(foe(), 5, { type: 'fire' });
        assert.deepEqual(targetPanel(foe({ id: 'f2' }), g._knownWeak).weak, ['fire']);
        assert.deepEqual(targetPanel(new Enemy({ id: 'x', type: 'ratling', x: 1, y: 1, hp: 9, armor: 0, damage: 1, weak: ['fire'] }), g._knownWeak).weak, []);
    });

    test('a hit of an ordinary type teaches nothing', () => {
        const g = makeGame();
        g.combatAttack(foe(), 5, { type: 'energy' });
        assert.deepEqual(g._knownWeak, {});
    });
});

describe('what is learned is saved', () => {
    test('survives a real save and continue', async () => {
        const g = makeGame();
        g.combatAttack(foe(), 5, { type: 'fire' });
        const dst = await saveAndContinue(g);
        assert.deepEqual(dst._knownWeak, { wererat: ['fire'] });
        assert.deepEqual(targetPanel(foe(), dst._knownWeak).weak, ['fire']);
    });

    test('left out of the save while empty, so a save with nothing learned is unchanged', () => {
        const g = makeGame();
        assert.ok(!JSON.stringify(serialize(g)).includes('knownWeak'));
        g._knownWeak = {};
        assert.ok(!JSON.stringify(serialize(g)).includes('knownWeak'));
    });

    test('malformed saved data is dropped', () => {
        assert.deepEqual(sanitizeKnown({ a: 'fire', b: [1, 'cold', 'cold'], c: [] }), { b: ['cold'] });
        assert.deepEqual(sanitizeKnown([]), {});
        assert.deepEqual(sanitizeKnown(undefined), {});
    });
});

describe('the panel draws the line', () => {
    function draw(panel) {
        const drawn = [];
        const r = Object.assign(Object.create(Renderer.prototype), {
            ctx: new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })), set(t, k, v) { t[k] = v; return true; } }),
            sprites: { uiPanel: null },
            font: { drawText: (ctx, text) => drawn.push(text) },
            _measurer: () => (s) => s.length * 8,
        });
        r._drawTargetPanel({ x: 0, y: 0, w: 300, h: 500 }, panel);
        return drawn;
    }
    const base = { name: 'Wererat', hp: 5, maxHp: 9, armor: 1, gold: 0, worn: [], kit: [],
        takeable: { coin: false, kit: false, gear: false } };

    test('a plain line per known kind; none when nothing is known', () => {
        const none = draw({ ...base, weak: [], resist: [] });
        const some = draw({ ...base, weak: ['fire'], resist: ['cold'] });
        assert.ok(!none.some(t => /FIRE|COLD/.test(t)));
        assert.ok(some.includes('Weak: FIRE'), `drawn: ${some.join(' | ')}`);
        assert.ok(some.includes('Resists: COLD'));
    });
});
