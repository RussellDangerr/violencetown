// examine-label.test.js — EX1: facing a note, sign or wreck puts an Examine label over it
// (plans/ex1-examine-label-props.md).
//
// The hero walks to the Town fuel note with the arrow keys (the game's own keydown listener,
// lifted out of main.js as in rest.test.js; only _doMove is a stand-in step). The label is read
// from what the real renderer method draws.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { defaultVerb } from '../game/wheel-model.js';
import { examineLabelAt } from '../game/examine.js';
import { Renderer } from '../game/renderer.js';
import { Enemy } from '../game/enemies.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');
const town = JSON.parse(readFileSync(fileURLToPath(new URL('../game/town-map.json', import.meta.url)), 'utf8'));
const NOTE = town.examinables.find(e => e.id === 'fuel_note');
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

// The hero three tiles above the fuel note, facing down.
function makeGame({ enemies = [] } = {}) {
    const document = new EventTarget();
    const window = new EventTarget();
    const free = { document, window, audio, STATE, DIRS, defaultVerb, doExamine() {} };
    const g = {
        state: STATE.IDLE, playerX: NOTE.x, playerY: NOTE.y - 3, facing: 'down',
        playerHp: 20, playerMaxHp: 20, buffs: [], map: { isWalkable: () => true, getTile: () => 0 },
        enemies, groundItems: [], containers: [], examinables: town.examinables.map(e => ({ ...e })),
        inventory: [], equipment: {}, turn: 0, logs: [],
        _physicalHeld: new Set(), _heldDirKeys: [], _queuedMoveDir: null, _pathQueue: [], _pathArrive: null,
        _animating: false, _paused: false, _TURN_MS: 70,
        _log(msg) { this.logs.push(msg); },
        _render() {}, _ensureParticleLoop() {}, _maybeShowHint() {}, _stopAutoRepeat() {},
        _closeCurrentMenu() { return false; }, _digitToSlot() { return -1; },
        _canRepeatLast() { return false; }, _autoRepeatShouldStop() { return false; },
        _advanceDayClock() {}, autosave() {},
        _doMove(dir) { this.playerX += dir.dx; this.playerY += dir.dy; },
    };
    Object.assign(g, {
        _bindInput: liveMethod('_bindInput() {', free),
        _inCombat: liveMethod('_inCombat() {', { isCombatActive: () => false }),
        _targetAt: liveMethod('_targetAt(x, y) {'),
        _actOnTarget: liveMethod('_actOnTarget(verb, t) {', { findPath() { return null; } }),
        _fireResolver: liveMethod('_fireResolver(verb, t) {', { STATE }),
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

// What the real renderer method draws for this game: the strip text, its fill colours.
function drawn(game) {
    const fills = [];
    const texts = [];
    const r = {
        font: { measure: t => t.length * 6, drawText: (_c, t, x, y, o) => texts.push({ t, color: o.color }) },
        ctx: { set fillStyle(v) { fills.push(v); }, fillRect() {} },
        _scrollX: 0, _scrollY: 0,
    };
    const vp = { origin: { x: 100, y: 100 } };
    Renderer.prototype._drawExamineLabel.call(r, game, vp);
    return { r, texts, fills };
}

describe('an Examine label over a faced note (EX1)', () => {
    test('the fuel note is on the Town map', () => {
        assert.ok(NOTE, 'fuel_note missing from town-map.json');
    });

    test('walking up to the fuel note, the label names it with the Examine verb', () => {
        const g = makeGame();
        assert.equal(drawn(g).texts.length, 0, 'a label three tiles away');
        g.tap('ArrowDown'); g.tap('ArrowDown');
        assert.deepEqual([g.playerX, g.playerY], [NOTE.x, NOTE.y - 1]);
        const { r, texts, fills } = drawn(g);
        assert.equal(texts.length, 1);
        assert.equal(texts[0].t, 'FUEL NOTE · EXAMINE');
        assert.equal(r._examineLabel, 'FUEL NOTE · EXAMINE');
        assert.equal(texts[0].color, '#9aa0a6', 'the Examine verb colour');
        assert.ok(fills.includes('#9aa0a6'));
        // The name is the one examine.js gives it, not new copy.
        assert.equal(examineLabelAt(g), 'fuel note');
    });

    test('turning away drops the label', () => {
        const g = makeGame();
        g.tap('ArrowDown'); g.tap('ArrowDown');
        g.tap('ArrowLeft');
        assert.equal(drawn(g).texts.length, 0);
    });

    test('a creature standing on the examinable keeps its own label, not this one', () => {
        const rat = new Enemy({ id: 'rat', type: 'Rat', x: NOTE.x, y: NOTE.y, behavior: ['IDLE'] });
        const g = makeGame({ enemies: [rat] });
        g.tap('ArrowDown'); g.tap('ArrowDown');
        assert.equal(drawn(g).texts.length, 0);
    });

    test('nothing is labelled while a dialogue is open', () => {
        const g = makeGame();
        g.tap('ArrowDown'); g.tap('ArrowDown');
        g.state = 'dialogue';
        assert.equal(drawn(g).texts.length, 0);
    });
});
