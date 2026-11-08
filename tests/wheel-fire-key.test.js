// wheel-fire-key.test.js — FX39: the key that fires a wheel action stops there.
//
// Found 2026-10-26: the Down press that fired Thieve on Praline also opened her Talk
// dialogue. The keydown handler logs every direction key as physically held before it
// looks at the game state; the wheel fires and closes; closing the wheel resumes a held
// walk; and the key that fired the action was still "held" (no keyup yet), so the player
// walked into Praline, which is a bump, which is Talk.
//
// This drives the game's own keydown listener (the real _bindInput, registered on a
// stand-in document) and the game's own wheel, fire, close and walk methods, lifted out
// of main.js as in thieve-wheel.test.js and title-space.test.js. The test only presses
// keys. The one stand-in below the keys is _doMove: it is where a step into a
// townsperson would become a bump / Talk, so it records the steps it is asked to take.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
    createWheelState, cycle, drill, back, compose, autoAimTile, needsFriendlyConfirm,
    selectedNode, verbApplies, restoreLastCategory, aimRange,
} from '../game/wheel-model.js';
import { perceives, spotters } from '../game/perception.js';
import { coinTake, kitTake, gearTake, coinWeight, itemWeight, gearWeight,
         noticeBuffer, isClean, stealLimit } from '../game/theft.js';
import { transferGold } from '../game/trade.js';
import { takeable } from '../game/fight-panels.js';
import { recordUse, skillPerks, mergePassives } from '../game/skills.js';
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

// A keyboard event as the game reads it (Node has no KeyboardEvent).
class Key extends Event {
    constructor(type, code, { repeat = false } = {}) {
        super(type, { bubbles: true, cancelable: true });
        this.code = code;
        this.key = code;
        this.repeat = repeat;
        this.ctrlKey = false; this.metaKey = false; this.altKey = false; this.shiftKey = false;
    }
}

const audio = { init() {}, playMusic() {}, playSfx() {} };
const Settings = { get: () => 'tap-toggle' };

let nextId = 0;
function townsperson(x, y, over = {}) {
    const e = new Enemy({ id: `ts_${nextId++}`, type: 'Violencian', x, y, behavior: ['IDLE', 'WANDER'], gold: 300, ...over });
    assert.equal(e.allegiance, 'neutral', 'the victim must be a townsperson, not a hostile');
    return e;
}

// The game, on a flat street, the player at (5,4) facing the townsperson at (5,5).
function makeGame(enemies) {
    const document = new EventTarget();
    const window = new EventTarget();
    const free = { document, window, audio, STATE, DIRS };
    const g = {
        state: STATE.IDLE, wheel: createWheelState(),
        map: { isWalkable: () => true }, playerX: 5, playerY: 4, playerHp: 20, facing: 'down',
        enemies, gold: 0, inventory: [], equipment: { weapon: { damage: 10 } },
        skills: {}, ringMods: {}, _robbed: {}, _hot: {}, logs: [],
        _physicalHeld: new Set(), _heldDirKeys: [], _queuedMoveDir: null, _pathQueue: [], _pathArrive: null,
        _animating: false, _paused: false, _TURN_MS: 70,
        steps: [],
        _log(msg) { this.logs.push(msg); },
        _render() {}, _advanceWorld() {}, _ensureParticleLoop() {}, _maybeShowHint() {},
        _addToInventory() { return true; }, _resolveItemDef() { return null; },
        _closeCurrentMenu() { return false; }, _digitToSlot() { return -1; },
        _canRepeatLast() { return false; }, _autoRepeatShouldStop() { return false; },
        // Where a step into a townsperson becomes a bump, and the bump becomes Talk.
        _doMove(dir) { this.steps.push(dir); },
    };
    Object.assign(g, {
        _bindInput: liveMethod('_bindInput() {', free),
        _openWheel: liveMethod('_openWheel() {', { STATE, audio, restoreLastCategory }),
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
        _fireWheel: liveMethod('_fireWheel() {', {
            compose, audio, STATE, perceives,
            coinTake, kitTake, gearTake, coinWeight, itemWeight, gearWeight, noticeBuffer, isClean, stealLimit,
            transferGold, reactToTransaction() {},
        }),
        _thieveTarget: liveMethod('_thieveTarget(aimTile) {'),
        canThieve: liveMethod('canThieve(branch) {', { cheb, takeable }),
        isHidden: liveMethod('isHidden() {', { spotters }),
        _theftPassives: liveMethod('_theftPassives() {', { mergePassives, skillPerks }),
        _countCleanLift: liveMethod('_countCleanLift() {', { recordUse }),
        // The walk: held-key resume, the step chooser, and the press-from-idle path.
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
    // The page's keys: a press is a keydown, then (a moment later) a keyup.
    g.down = (code, opts) => { const e = new Key('keydown', code, opts); document.dispatchEvent(e); return e; };
    g.up = (code) => document.dispatchEvent(new Key('keyup', code));
    g.tap = (code) => { g.down(code); g.up(code); };
    return g;
}

// Open the wheel with Space and drill to Trick > Thieve > Coin with keys alone. Ring
// positions are looked up, never hard-coded.
function openToThieveCoin(g) {
    g.tap('Space');
    assert.equal(g.state, STATE.RADIAL_MENU, 'Space did not open the wheel');
    const spinTo = (key) => {
        for (let n = 0; n < 12 && selectedNode(g.wheel).key !== key; n++) g.tap('ArrowRight');
        assert.equal(selectedNode(g.wheel).key, key, `could not spin the wheel to ${key}`);
    };
    spinTo('trick');  g.tap('Space');
    spinTo('thieve'); g.tap('Space');
    spinTo('coin');   g.tap('Space');
    assert.equal(g.wheel.aiming, true, 'Coin did not enter the aim');
}

describe('the key that fires a wheel action', () => {
    test('Down fires Thieve on the townsperson and does not also bump them', () => {
        const victim = townsperson(5, 5);
        const g = makeGame([victim]);
        openToThieveCoin(g);
        assert.deepEqual(g.steps, [], 'staging walked');

        const e = g.down('ArrowDown');      // the press that points at Praline and fires
        assert.ok(g.gold > 0, `nothing was lifted; log: ${g.logs.join(' | ')}`);
        assert.equal(g.state, STATE.IDLE, 'the wheel should have closed');
        assert.deepEqual(g.steps, [], 'the firing key also walked into the townsperson (Talk)');
        assert.equal(e.defaultPrevented, true);
        g.up('ArrowDown');                  // releasing it does nothing either
        assert.deepEqual(g.steps, []);
    });

    test('Space fires the lift and does not bump either', () => {
        const g = makeGame([townsperson(5, 5)]);
        openToThieveCoin(g);
        g.tap('Space');
        assert.ok(g.gold > 0);
        assert.deepEqual(g.steps, []);
    });

    test('a later, separate press of the same key still bumps the townsperson', () => {
        const g = makeGame([townsperson(5, 5)]);
        openToThieveCoin(g);
        g.tap('ArrowDown');
        assert.deepEqual(g.steps, []);
        g.tap('ArrowDown');                 // a fresh press, wheel shut
        assert.deepEqual(g.steps, [{ dx: 0, dy: 1 }], 'the next Down press should step toward them as before');
    });

    test('a direction held through the wheel still walks when the wheel closes', () => {
        const g = makeGame([townsperson(9, 9)]);
        g.down('ArrowLeft');                // walking left...
        g.steps.length = 0;
        g.tap('Space');                     // ...the wheel opens over it
        assert.equal(g.state, STATE.RADIAL_MENU);
        g.tap('Escape');                    // Esc backs out of the wheel (closes the top ring)
        assert.equal(g.state, STATE.IDLE);
        assert.deepEqual(g.steps, [{ dx: -1, dy: 0 }], 'the held walk should resume, as designed');
    });
});
