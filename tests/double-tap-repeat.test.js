// double-tap-repeat.test.js - FX59: tapping Space twice repeats your last wheel action,
// in the default tap mode as well as hold mode.
//
// Before: in tap mode the first Space opened the wheel and left it up, so the second Space
// drilled into Fight and the enemy was never hit. In hold mode the first Space's release
// closed the wheel, so the second one repeated the hit.
//
// This drives the game's own keydown / keyup listener (the real _bindInput, on a stand-in
// document) and the game's own wheel, fire and repeat methods, lifted out of main.js as in
// wheel-fire-key.test.js. The test only presses keys. Stand-ins below the keys: the clock
// (so a "fast" and a "slow" second tap are exact), combatAttack (it lowers the foe's hp,
// which is how the test sees the hit land) and _advanceWorld / _render.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
    createWheelState, cycle, drill, back, compose, autoAimTile, needsFriendlyConfirm,
    selectedNode, verbApplies, restoreLastCategory, aimRange,
} from '../game/wheel-model.js';
import { perceives } from '../game/perception.js';
import { coinTake, kitTake, gearTake, coinWeight, itemWeight, gearWeight,
         noticeBuffer, isClean, stealLimit } from '../game/theft.js';
import { transferGold } from '../game/trade.js';
import { Enemy } from '../game/enemies.js';

const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');
const classAt = mainSrc.indexOf('class Game {');

function liveMethod(signature, freeVars = {}) {
    const start = mainSrc.indexOf(signature, classAt);
    assert.ok(start > 0, `${signature} not found in main.js`);
    const lineEnd = mainSrc.indexOf('\n', start);
    const oneLiner = mainSrc.slice(start, lineEnd).trimEnd().endsWith('}');
    const end = oneLiner ? lineEnd : mainSrc.indexOf('\n    }', start) + '\n    }'.length;
    const body = mainSrc.slice(start + signature.indexOf('('), end);
    const names = Object.keys(freeVars);
    return new Function(...names, `'use strict'; return function ${body}`)(...names.map(n => freeVars[n]));
}

function liveConst(name) {
    const m = new RegExp(`\\nconst ${name}\\s*=\\s*`).exec(mainSrc);
    assert.ok(m, `const ${name} not found in main.js`);
    const from = m.index + m[0].length;
    const end = mainSrc.indexOf('\n};', from);
    return new Function(`'use strict'; return ${mainSrc.slice(from, end + 2)}`)();
}

const STATE = liveConst('STATE');
const DIRS = liveConst('DIRS');
const cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));

class Key extends Event {
    constructor(type, code) {
        super(type, { bubbles: true, cancelable: true });
        this.code = code; this.key = code; this.repeat = false;
        this.ctrlKey = false; this.metaKey = false; this.altKey = false; this.shiftKey = false;
    }
}

const audio = { init() {}, playMusic() {}, playSfx() {} };

function makeGame(mode) {
    const document = new EventTarget();
    const window = new EventTarget();
    const clock = { t: 10000, now() { return this.t; } };
    const Settings = { get: (k) => (k === 'wheelOpenMode' ? mode : undefined) };
    const free = { document, window, audio, STATE, DIRS, performance: clock };
    const foe = new Enemy({ id: 'foe', type: 'Violencian', x: 5, y: 5, behavior: ['IDLE'], hp: 100, gold: 0 });
    foe.allegiance = 'hostile';
    const g = {
        state: STATE.IDLE, wheel: createWheelState(), clock,
        map: { isWalkable: () => true }, playerX: 5, playerY: 4, playerHp: 20, playerMaxHp: 20, facing: 'down',
        enemies: [foe], foe, gold: 0, inventory: [], equipment: { weapon: { damage: 10 } },
        skills: {}, ringMods: {}, logs: [], hits: 0, world: 0, _lastActKeyAt: 0, _spaceOpenedWheelAt: 0,
        _physicalHeld: new Set(), _heldDirKeys: [], _queuedMoveDir: null, _pathQueue: [], _pathArrive: null,
        _animating: false, _paused: false, _TURN_MS: 70,
        _log(msg) { this.logs.push(msg); },
        _render() {}, _advanceWorld() { this.world++; }, _ensureParticleLoop() {}, _maybeShowHint() {},
        _closeCurrentMenu() { return false; }, _digitToSlot() { return -1; },
        _autoRepeatShouldStop() { return false; }, _doMove() {},
        // The hit landing: it costs the foe the weapon's damage.
        combatAttack(e, dmg) { this.hits++; e.entity.hp -= dmg; return true; },
    };
    Object.assign(g, {
        _bindInput: liveMethod('_bindInput() {', free),
        _openWheel: liveMethod('_openWheel() {', { STATE, audio, restoreLastCategory, performance: clock }),
        _closeWheel: liveMethod('_closeWheel() {', { STATE, audio }),
        _wheelOpenerDown: liveMethod('_wheelOpenerDown() {', { STATE, Settings }),
        _wheelOpenerUp: liveMethod('_wheelOpenerUp() {', { STATE }),
        _wheelTakesKey: liveMethod('_wheelTakesKey(code) {'),
        _wheelCycle: liveMethod('_wheelCycle(dir) {', { cycle, audio }),
        _wheelBack: liveMethod('_wheelBack() {', { back, audio }),
        _wheelDrill: liveMethod('_wheelDrill() {', { selectedNode, verbApplies, drill, autoAimTile, audio }),
        _wheelCommit: liveMethod('_wheelCommit() {', { needsFriendlyConfirm }),
        _aimRange: liveMethod('_aimRange(leaf) {', { aimRange }),
        _reticleKey: liveMethod('_reticleKey(code) {', { selectedNode, autoAimTile, cheb, audio }),
        _canRepeatLast: liveMethod('_canRepeatLast() {'),
        _repeatLastAction: liveMethod('_repeatLastAction() {', { selectedNode, autoAimTile, aimRange, needsFriendlyConfirm, STATE, audio }),
        _fireWheel: liveMethod('_fireWheel() {', {
            compose, audio, STATE, perceives,
            coinTake, kitTake, gearTake, coinWeight, itemWeight, gearWeight, noticeBuffer, isClean, stealLimit,
            transferGold, reactToTransaction() {},
        }),
        _resumeHeldWalk: liveMethod('_resumeHeldWalk() {', { STATE, DIRS }),
        _stopAutoRepeat: liveMethod('_stopAutoRepeat() {'),
        _onStepSettled: liveMethod('_onStepSettled() {', { STATE }),
        _intendedWalkDir: liveMethod('_intendedWalkDir() {', { DIRS }),
        _resolveWalkStep: liveMethod('_resolveWalkStep(dir) {'),
        _noteHeld: liveMethod('_noteHeld(code) {'),
        _faceOf: liveMethod('_faceOf(dir) {'),
        _clearTurnTimer: liveMethod('_clearTurnTimer() {'),
        _beginMoveOrTurn: liveMethod('_beginMoveOrTurn(dir) {', { STATE }),
    });
    g._bindInput();
    g.down = (code) => document.dispatchEvent(new Key('keydown', code));
    g.up = (code) => document.dispatchEvent(new Key('keyup', code));
    g.tap = (code) => { g.down(code); g.up(code); };
    return g;
}

// Land the first Hit with keys alone. In hold mode the wheel is only up while Space is down,
// so the drilling presses are held-down Spaces with the arrows pressed over them. Each
// press is a second apart: nothing here is a double-tap. Leaves the game idle with the Hit
// as the last action.
function landFirstHit(g) {
    g.down('Space');
    assert.equal(g.state, STATE.RADIAL_MENU, 'Space did not open the wheel');
    g.clock.t += 1000;
    const spinTo = (key) => {
        for (let n = 0; n < 14 && selectedNode(g.wheel).key !== key; n++) { g.tap('ArrowRight'); g.clock.t += 1000; }
        assert.equal(selectedNode(g.wheel).key, key, `could not spin the wheel to ${key}`);
    };
    // Enter drills like Space does, and lets hold mode keep Space down throughout.
    for (const key of ['fight', 'melee', 'hit']) { spinTo(key); g.tap('Enter'); g.clock.t += 1000; }
    g.tap('Enter'); g.clock.t += 1000;   // the aim, confirmed: the Hit lands
    g.up('Space');
    assert.equal(g.hits, 1, 'the first Hit did not land');
    assert.equal(g.state, STATE.IDLE, 'the wheel should have closed after the first Hit');
    assert.equal(g.foe.entity.hp, 90);
    g.clock.t += 5000;
}

for (const mode of ['tap-toggle', 'hold']) {
    describe(`${mode} mode`, () => {
        test('Space, Space inside the window repeats the Hit and the foe takes it', () => {
            const g = makeGame(mode);
            landFirstHit(g);
            g.tap('Space'); g.clock.t += 100; g.tap('Space');
            assert.equal(g.hits, 2, 'the double-tap did not repeat the Hit');
            assert.equal(g.foe.entity.hp, 80, 'the foe did not take the repeated hit');
            assert.equal(g.state, STATE.IDLE, 'the wheel should be closed after the repeat');
        });

        test('a second Space after the window is not a repeat', () => {
            const g = makeGame(mode);
            landFirstHit(g);
            g.tap('Space'); g.clock.t += 400; g.tap('Space');
            assert.equal(g.hits, 1, 'a slow second tap must not repeat');
            assert.equal(g.foe.entity.hp, 90);
        });
    });
}

describe('a single Space still opens the wheel', () => {
    test('tap mode: it opens and stays up, and nothing is hit', () => {
        const g = makeGame('tap-toggle');
        landFirstHit(g);
        g.tap('Space');
        assert.equal(g.state, STATE.RADIAL_MENU);
        assert.equal(g.hits, 1);
    });

    test('hold mode: it is up while Space is down, and nothing is hit', () => {
        const g = makeGame('hold');
        landFirstHit(g);
        g.down('Space');
        assert.equal(g.state, STATE.RADIAL_MENU);
        g.up('Space');
        assert.equal(g.state, STATE.IDLE);
        assert.equal(g.hits, 1);
    });
});

describe('tap mode: what is not a double-tap', () => {
    test('Space, another key, then Space fast is not a repeat', () => {
        const g = makeGame('tap-toggle');
        landFirstHit(g);
        g.tap('Space'); g.clock.t += 50; g.tap('ArrowRight'); g.clock.t += 50; g.tap('Space');
        assert.equal(g.hits, 1, 'a key between the two Spaces cancels the repeat');
    });

    test('with nothing fired yet, a fast Space, Space just drills the wheel', () => {
        const g = makeGame('tap-toggle');
        g.tap('Space'); g.clock.t += 100; g.tap('Space');
        assert.equal(g.hits, 0);
        assert.equal(g.state, STATE.RADIAL_MENU);
        assert.equal(g.wheel.path.length, 2, 'the second Space should have drilled one level');
    });
});
