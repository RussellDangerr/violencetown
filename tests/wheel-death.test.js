// wheel-death.test.js — a wheel action that gets you killed leaves you dead.
//
// _fireWheel resolves the action, whose world turn can end in _die (DEAD, and
// the defeat queued for half a second later) — then closes the wheel. Closing
// it set IDLE unconditionally, so the dead player stood back up at 0 HP and
// took input until the defeat resolved. Acting in that window and taking a
// second blow queued a second defeat: one death, resolved twice (a boss retry,
// then a defeat scenario on top). Found by the quest-1 autoplay, which acts
// the moment the game reads idle (plans/quest1-autoplay.md, Q1-10).
//
// These run the real methods, lifted out of main.js.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const mainSrc = readFileSync(new URL('../game/main.js', import.meta.url), 'utf8');
const STATE = { IDLE: 'idle', DEAD: 'dead', RADIAL_MENU: 'radial_menu' };

function liveMethod(signature, freeVars = {}) {
    const at = mainSrc.indexOf(signature, mainSrc.indexOf('class Game {'));
    assert.ok(at > 0, `${signature} not found in main.js`);
    const body = mainSrc.slice(at + signature.indexOf('('), mainSrc.indexOf('\n    }', at) + '\n    }'.length);
    const names = Object.keys(freeVars);
    return new Function(...names, `'use strict'; return function ${body}`)(...names.map((n) => freeVars[n]));
}

const audio = { playSfx() {} };
function game(state) {
    const timers = [];
    const g = {
        state,
        wheel: { reticle: { x: 1, y: 1 }, aiming: true, confirming: false },
        _wheelOpenedByHold: false,
        _heldDirKeys: [], _physicalHeld: new Set(),
        resumed: 0, defeats: 0,
        _render() {}, _flash() {}, _log() {}, _stopAutoRepeat() {},
        _resumeHeldWalk() { this.resumed++; },
        _resolveDefeat() { this.defeats++; },
        timers,
    };
    g._closeWheel = liveMethod('_closeWheel() {', { STATE, audio });
    g._die = liveMethod('_die() {', { STATE, audio, setTimeout: (fn) => timers.push(fn) });
    return g;
}

describe('closing the wheel after an action that killed you', () => {
    test('a player who died during the action stays dead', () => {
        const g = game(STATE.RADIAL_MENU);
        g._die();                     // the action's world turn kills you
        g._closeWheel();              // then _fireWheel closes the wheel
        assert.equal(g.state, STATE.DEAD);
        assert.equal(g.resumed, 0, 'a dead player does not resume a held walk');
        assert.equal(g.wheel.aiming, false, 'the wheel still closes');
    });

    test('a second blow before the defeat resolves queues no second defeat', () => {
        const g = game(STATE.RADIAL_MENU);
        g._die();
        g._closeWheel();
        g._die();                     // hit again while down
        assert.equal(g.timers.length, 1);
        g.timers.forEach((fn) => fn());
        assert.equal(g.defeats, 1, 'one death, resolved once');
    });

    test('a living player is returned to idle, as before', () => {
        const g = game(STATE.RADIAL_MENU);
        g._closeWheel();
        assert.equal(g.state, STATE.IDLE);
        assert.equal(g.resumed, 1);
    });
});
