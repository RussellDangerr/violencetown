// enemy-backstab.test.js — ZB2: an enemy on the tile behind you backstabs you.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as combat from '../game/combat.js';

const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');

function liveMethod(name, params, freeVars = {}) {
    const at = mainSrc.indexOf(`${name}(${params}) {`);
    assert.ok(at > 0, `${name} not found in main.js`);
    const closeAt = mainSrc.indexOf('\n    }', at);
    const body = mainSrc.slice(at + name.length, closeAt + '\n    }'.length);
    const names = Object.keys(freeVars);
    return new Function(...names, `'use strict'; return function ${body}`)(...names.map(n => freeVars[n]));
}

const isBackstabbed = liveMethod('_isBackstabbed', 'attacker', combat);
const applyDamageToPlayer = liveMethod('applyDamageToPlayer', 'rawDamage, attacker = null', {
    ...combat,
    audio: { playSfx() {} },
    DODGE_WORD: 'dodge',
});

function makeGame(facing) {
    const logs = [];
    return {
        playerX: 5, playerY: 5, facing, playerHp: 100, logs,
        hasBuff: () => false, _shieldCut: () => 1, _rollDodge: () => false,
        _spreadFireBlood() {}, _playerArmor: () => 0,
        rng: { pick: (a) => a[0], float: () => 0.5 },
        _cascade: null, _spawnHitSplat() {}, _ensureParticleLoop() {}, _triggerScreenShake() {},
        _spawnEventWord() {},
        _log(t) { logs.push(t); },
        _isBackstabbed: isBackstabbed,
    };
}

describe('enemies backstab you (ZB2)', () => {
    const FACES = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    for (const [facing, [dx, dy]] of Object.entries(FACES)) {
        test(`facing ${facing}: only the tile behind is a backstab`, () => {
            let behindSeen = 0;
            for (let ax = 4; ax <= 6; ax++) for (let ay = 4; ay <= 6; ay++) {
                if (ax === 5 && ay === 5) continue;
                const g = makeGame(facing);
                const behind = ax === 5 - dx && ay === 5 - dy;
                if (behind) behindSeen++;
                assert.equal(g._isBackstabbed({ x: ax, y: ay }), behind, `${ax},${ay}`);
            }
            assert.equal(behindSeen, 1);
        });
    }

    test('a hit from behind lands at the multiplier and logs [Backstab!]', () => {
        const g = makeGame('down');
        const dmg = applyDamageToPlayer.call(g, 10, { x: 5, y: 4 });
        assert.equal(dmg, Math.round(10 * combat.WEAKNESS_MULT));
        assert.ok(dmg > 10);
        assert.deepEqual(g.logs, ['[Backstab!]']);
    });

    test('a hit from the front or side is unchanged and silent', () => {
        for (const at of [{ x: 5, y: 6 }, { x: 4, y: 5 }, { x: 6, y: 6 }, { x: 4, y: 4 }]) {
            const g = makeGame('down');
            assert.equal(applyDamageToPlayer.call(g, 10, at), 10);
            assert.deepEqual(g.logs, []);
        }
    });

    test('no attacker position, no backstab', () => {
        const g = makeGame('down');
        assert.equal(applyDamageToPlayer.call(g, 10, null), 10);
    });

    test('a dodged blow logs nothing', () => {
        const g = makeGame('down');
        g._rollDodge = () => true;
        assert.equal(applyDamageToPlayer.call(g, 10, { x: 5, y: 4 }), 0);
        assert.deepEqual(g.logs, []);
    });
});
