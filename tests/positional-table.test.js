// positional-table.test.js — Law 2's positional table, tile by tile
// (plans/zb1-positional-table.md; plans/balancing-bible.md Law 2).
//
// Ruled 2026-10-23: the one tile behind a target hits for x1.5, every other
// tile for x1. "Behind" is opposite the target's last step. Pinned twice:
// on isBackstab, and on the `positional` the player's real swing
// (main.js combatAttack) hands to computeHit.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as combat from '../game/combat.js';
import { isBoss } from '../game/defeat-scenarios.js';

const { isBackstab } = combat;

const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');

// Lift a Game method out of main.js and run it against a stand-in `this`, as
// tests/fight-start.test.js does.
function liveMethod(name, params, freeVars = {}) {
    const signature = `${name}(${params}) {`;
    const at = mainSrc.indexOf(signature);
    assert.ok(at > 0, `${name}(${params}) not found in main.js`);
    const closeAt = mainSrc.indexOf('\n    }', at);
    const body = mainSrc.slice(at + name.length, closeAt + '\n    }'.length);
    const names = Object.keys(freeVars);
    return new Function(...names, `'use strict'; return function ${body}`)(...names.map(n => freeVars[n]));
}

// combatAttack with a spy computeHit: it records the buckets the swing passes
// and answers 0, so the swing takes its immune exit and stops there.
const seen = [];
const combatAttack = liveMethod('combatAttack', 'enemyObj, damage, opts = {}', {
    ...combat,
    isBoss,
    computeHit: (buckets) => { seen.push(buckets); return 0; },
});

function positionalOfSwing(px, py, target) {
    seen.length = 0;
    const game = { playerX: px, playerY: py, ringMods: {}, _poitionMod: () => 0, _log() {} };
    const out = combatAttack.call(game, target, 20, {});
    assert.equal(out, null, 'the spy answers 0, so the swing exits as immune');
    assert.equal(seen.length, 1, 'one computeHit per swing (round once)');
    return seen[0].positional ?? 1;
}

const CX = 5, CY = 5;
const NEIGHBOURS = [
    ['N', 0, -1], ['NE', 1, -1], ['E', 1, 0], ['SE', 1, 1],
    ['S', 0, 1], ['SW', -1, 1], ['W', -1, 0], ['NW', -1, -1],
];

// The ruled table: for each facing, the one compass point that is the back.
const TABLE = [
    { facing: 'a straight step east', dx: 1, dy: 0, back: 'W' },
    { facing: 'a diagonal step south-east', dx: 1, dy: 1, back: 'NW' },
];

for (const { facing, dx, dy, back } of TABLE) {
    describe(`positional table — ${facing}`, () => {
        const target = () => ({ x: CX, y: CY, _lastDx: dx, _lastDy: dy, type: 'stand-in', entity: {} });

        test('exactly one of the eight neighbours is the back', () => {
            const backs = NEIGHBOURS.filter(([, ox, oy]) => isBackstab(CX + ox, CY + oy, target()));
            assert.deepEqual(backs.map(([n]) => n), [back]);
        });

        for (const [name, ox, oy] of NEIGHBOURS) {
            const want = name === back ? 1.5 : 1;
            test(`${name} hits for x${want}`, () => {
                assert.equal(isBackstab(CX + ox, CY + oy, target()), name === back);
                assert.equal(positionalOfSwing(CX + ox, CY + oy, target()), want);
            });
        }
    });
}

describe('positional table — a target with no facing', () => {
    test('all eight neighbours hit for x1', () => {
        for (const [name, ox, oy] of NEIGHBOURS) {
            const t = { x: CX, y: CY, type: 'stand-in', entity: {} };
            assert.equal(isBackstab(CX + ox, CY + oy, t), false, name);
            assert.equal(positionalOfSwing(CX + ox, CY + oy, t), 1, name);
        }
    });
});
