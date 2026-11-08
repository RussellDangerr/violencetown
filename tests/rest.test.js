// rest.test.js — HP1: face a bench, press E, rest to full (plans/hp1-rest-to-heal.md).
//
// Drives the game's own keydown listener (the real _bindInput on a stand-in document) and the
// game's own _targetAt / _actOnTarget / _fireResolver / _restHere / _skipTime, lifted out of
// main.js as in wheel-fire-key.test.js. The test only presses keys. The one stand-in below the
// keys is _doMove, which moves the hero one tile on a small street with a bench on it.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { defaultVerb, targetVerbs, orderedTargetVerbs, isCombatActive } from '../game/wheel-model.js';
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

class Key extends Event {
    constructor(type, code) {
        super(type, { bubbles: true, cancelable: true });
        this.code = code; this.key = code; this.repeat = false;
        this.ctrlKey = false; this.metaKey = false; this.altKey = false; this.shiftKey = false;
    }
}
const audio = { init() {}, playMusic() {}, playSfx() {} };
const BENCH = 20;

// A street: the hero at (5,3) facing down, the bench at (5,6).
function makeGame({ hostile = null } = {}) {
    const document = new EventTarget();
    const window = new EventTarget();
    const free = { document, window, audio, STATE, DIRS, defaultVerb, doExamine() {} };
    const g = {
        state: STATE.IDLE, playerX: 5, playerY: 3, facing: 'down',
        playerHp: 3, playerMaxHp: 20, playerMp: 1, playerMaxMp: 10, buffs: [],
        map: { isWalkable: (x, y) => !(x === 5 && y === 6), getTile: (x, y) => (x === 5 && y === 6 ? BENCH : 0) },
        enemies: hostile ? [hostile] : [], groundItems: [], containers: [], examinables: [],
        inventory: [], equipment: { weapon: { damage: 1 } }, turn: 0, clock: 0, saves: 0, logs: [],
        _physicalHeld: new Set(), _heldDirKeys: [], _queuedMoveDir: null, _pathQueue: [], _pathArrive: null,
        _animating: false, _paused: false, _TURN_MS: 70, steps: [],
        _log(msg) { this.logs.push(msg); },
        _render() {}, _ensureParticleLoop() {}, _maybeShowHint() {}, _stopAutoRepeat() {},
        _closeCurrentMenu() { return false; }, _digitToSlot() { return -1; },
        _canRepeatLast() { return false; }, _autoRepeatShouldStop() { return false; },
        _advanceDayClock(n) { this.clock += n; },
        autosave() { this.saves++; },
        _doMove(dir) { this.steps.push(dir); this.playerX += dir.dx; this.playerY += dir.dy; },
    };
    Object.assign(g, {
        _bindInput: liveMethod('_bindInput() {', free),
        _inCombat: liveMethod('_inCombat() {', { isCombatActive }),
        _targetAt: liveMethod('_targetAt(x, y) {'),
        _actOnTarget: liveMethod('_actOnTarget(verb, t) {', { findPath() { return null; } }),
        _fireResolver: liveMethod('_fireResolver(verb, t) {', { STATE }),
        _restHere: liveMethod('_restHere() {'),
        _skipTime: liveMethod('_skipTime(kind) {'),
        _resumeHeldWalk: liveMethod('_resumeHeldWalk() {', { STATE, DIRS }),
        _onStepSettled: liveMethod('_onStepSettled() {', { STATE }),
        _intendedWalkDir: liveMethod('_intendedWalkDir() {', { DIRS }),
        _resolveWalkStep: liveMethod('_resolveWalkStep(dir) {'),
        _noteHeld: liveMethod('_noteHeld(code) {'),
        _faceOf: liveMethod('_faceOf(dir) {'),
        _clearTurnTimer: liveMethod('_clearTurnTimer() {'),
        _beginMoveOrTurn: liveMethod('_beginMoveOrTurn(dir) {', { STATE }),
    });
    g._bindInput();
    g.tap = (code) => { document.dispatchEvent(new Key('keydown', code)); document.dispatchEvent(new Key('keyup', code)); };
    return g;
}

describe('resting on a bench (HP1)', () => {
    test('a bench is a target whose default verb is rest, so the label can telegraph it', () => {
        const g = makeGame();
        const t = g._targetAt(5, 6);
        assert.ok(t && t.rest, 'the bench is not a target');
        assert.equal(defaultVerb(t, g).key, 'rest');
        assert.ok(targetVerbs(t, g).some(v => v.key === 'examine'), 'Examine stays on the list');
        assert.equal(orderedTargetVerbs(t, g)[0].key, 'rest');
        assert.equal(g._targetAt(5, 5), null, 'bare ground is not a rest spot');
    });

    test('walk to the bench with the arrow keys, press E: HP and MP full, hours pass, saved', () => {
        const g = makeGame();
        g.tap('ArrowDown'); g.tap('ArrowDown');
        assert.deepEqual([g.playerX, g.playerY], [5, 5], 'the hero did not walk to the bench');
        assert.equal(g.facing, 'down');
        const hpBefore = g.playerHp;
        g.tap('KeyE');
        assert.equal(g.playerHp, g.playerMaxHp);
        assert.equal(g.playerMp, g.playerMaxMp);
        assert.ok(g.playerHp > hpBefore);
        assert.equal(g.clock, 20, 'the defeat path\'s hours skip');
        assert.equal(g.turn, 20);
        assert.equal(g.saves, 1);
    });

    test('E facing bare ground rests nothing', () => {
        const g = makeGame();
        g.tap('ArrowDown');
        g.tap('KeyE');
        assert.equal(g.playerHp, 3);
        assert.equal(g.saves, 0);
    });

    test('in a fight, E on the bench refuses and nothing heals', () => {
        const rat = new Enemy({ id: 'rat', type: 'Rat', x: 5, y: 1, behavior: ['CHASE'] });
        rat.state = 'chasing';
        const g = makeGame({ hostile: rat });
        assert.ok(g._inCombat(), 'the stand-in fight is not a fight');
        g.tap('ArrowDown'); g.tap('ArrowDown');
        g.tap('KeyE');
        assert.equal(g.playerHp, 3);
        assert.equal(g.playerMp, 1);
        assert.equal(g.clock, 0);
        assert.equal(g.saves, 0);
        assert.ok(g.logs.some(l => /cannot rest/.test(l)), g.logs.join(' | '));
    });
});

describe('the rest label', () => {
    test('the renderer labels the faced bench with the default verb', () => {
        const rendererSrc = readFileSync(fileURLToPath(new URL('../game/renderer.js', import.meta.url)), 'utf8');
        assert.match(rendererSrc, /_drawRestLabel\(game, vp\)/);
        assert.match(rendererSrc, /defaultVerb\(tgt, game\)/);
    });
});
