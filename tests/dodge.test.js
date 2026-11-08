// dodge.test.js — RR1: evasion dodges blows, and the Hands tab shows each worn ring's passive.
// main.js touches `document` at import, so the real methods are lifted out of its source
// (as cascade.test.js and device-keys.test.js do) and bound onto a small game object.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RNG } from '../game/rng.js';
import { computeHit } from '../game/combat.js';
import { RINGS } from '../game/ring-data.js';
import { aggregatePassives } from '../game/rings.js';
import { dodgeChance, DODGE_PER_POINT, DODGE_WORD } from '../game/hit-splat.js';
import { deviceRingsLayout, deviceBodyRect, ringPassiveRows, RING_PASSIVE_LABEL } from '../game/layout.js';

const mainSrc = readFileSync(new URL('../game/main.js', import.meta.url), 'utf8');
const rendererSrc = readFileSync(new URL('../game/renderer.js', import.meta.url), 'utf8');
function liveMethod(signature, freeVars) {
    const at = mainSrc.indexOf(signature, mainSrc.indexOf('class Game {'));
    assert.ok(at > 0, `${signature} not found in main.js`);
    const body = mainSrc.slice(at + signature.indexOf('('), mainSrc.indexOf('\n    }', at) + '\n    }'.length);
    const names = Object.keys(freeVars);
    return new Function(...names, `'use strict'; return function ${body}`)(...names.map(n => freeVars[n]));
}
const applyDamageToPlayer = liveMethod('    applyDamageToPlayer(', { computeHit, audio: { playSfx() {} }, DODGE_WORD });
const rollDodge = liveMethod('    _rollDodge(', { dodgeChance });
const deviceKey = liveMethod('    _deviceKey(', {});

function hitGame(seed, ringMods) {
    const g = {
        playerHp: 1e9, playerX: 5, playerY: 5, rng: new RNG(seed), _cascade: null, _cascadeActor: null,
        ringMods, splats: [],
        hasBuff: () => false, _playerArmor: () => 0, _spreadFireBlood() {},
        _spawnHitSplat(...a) { g.splats.push(a); },
        _ensureParticleLoop() {}, _triggerScreenShake() {}, _spawnEventWord() {},
    };
    g.hit = applyDamageToPlayer.bind(g);
    g._rollDodge = rollDodge.bind(g);
    return g;
}

describe('dodge rate', () => {
    test('2% a point, so the Rat Ring is 10%', () => {
        assert.equal(DODGE_PER_POINT, 0.02);
        assert.ok(Math.abs(dodgeChance(RINGS.rat_ring.passive.evasion) - 0.10) < 1e-9);
        assert.equal(dodgeChance(0), 0);
        assert.equal(dodgeChance(undefined), 0);
    });

    test('wearing the Rat Ring, about 1 blow in 10 is dodged, and a dodge deals nothing', () => {
        const mods = aggregatePassives({ 'left:index': 'rat_ring' }, (id) => RINGS[id]);
        assert.equal(mods.evasion, 5);
        const g = hitGame(7, mods);
        const N = 5000;
        let dodged = 0, hpLost = 0;
        for (let i = 0; i < N; i++) {
            const before = g.playerHp;
            const dealt = g.hit(8, { x: 6, y: 5 });
            if (dealt === 0) { dodged++; assert.equal(g.playerHp, before, 'a dodge costs no HP'); }
            else hpLost += before - g.playerHp;
        }
        const rate = dodged / N;
        assert.ok(rate > 0.08 && rate < 0.12, `dodge rate ${rate}`);
        assert.equal(hpLost, (N - dodged) * 8);
        assert.equal(g.splats.filter(s => s[2] === DODGE_WORD && s[3] === 'dodge').length, dodged);
    });

    test('a dodge does not stagger', () => {
        const g = hitGame(3, { evasion: 50 });   // 100%
        g.hit(8, null);
        assert.equal(g._playerStaggerUntil, undefined);
        assert.equal(g.splats.length, 1);
    });
});

describe('without evasion nothing changes', () => {
    for (const mods of [{}, undefined, { armor: 2 }]) {
        test(`the RNG hands out the same draws (${JSON.stringify(mods)})`, () => {
            const g = hitGame(11, mods);
            const ref = new RNG(11);
            const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
            for (let i = 0; i < 20; i++) {
                assert.equal(g.hit(5, null), 5);
                ref.pick(dirs);   // the stagger direction: the only draw a plain hit makes
            }
            assert.equal(g.rng.float(), ref.float());
        });
    }
});

describe('the Hands tab', () => {
    function handsGame() {
        const g = {
            state: 'device', _deviceTab: 'items', _deviceSel: null, _renders: 0,
            ringTier: 1, ringSlots: {}, ownedRings: new Set(['rat_ring', 'fire_ring']),
            _render() { this._renders++; },
        };
        g._deviceKey = deviceKey.bind(g);
        return g;
    }

    test('the R key opens the Hands tab', () => {
        const g = handsGame();
        g._deviceKey('KeyR');
        assert.equal(g._deviceTab, 'rings');
        assert.equal(g._renders, 1);
    });

    test('each worn ring lists its passive: a label and its number (Fire Ring too)', () => {
        const g = handsGame();
        g._deviceKey('KeyR');
        const sockets = deviceRingsLayout(deviceBodyRect(), { ringTier: 1, ringSlots: {} }).sockets;
        assert.ok(sockets.length >= 2, 'tier 1 opens two sockets');
        g.ringSlots = { [sockets[0].key]: 'rat_ring', [sockets[1].key]: 'fire_ring' };
        const worn = deviceRingsLayout(deviceBodyRect(), g).sockets.filter(s => s.ringId);
        assert.equal(worn.length, 2);
        const rows = worn.map(s => ringPassiveRows(RINGS[s.ringId]));
        assert.deepEqual(rows[0], [{ key: 'evasion', label: RING_PASSIVE_LABEL, value: 5 }]);
        assert.deepEqual(rows[1], [{ key: 'fireDamage', label: RING_PASSIVE_LABEL, value: 10 }]);
        assert.deepEqual(ringPassiveRows(null), []);
    });

    test('the renderer draws those rows under a worn socket', () => {
        assert.match(rendererSrc, /ringPassiveRows\(RINGS\[f\.ringId\]\)/);
    });
});
