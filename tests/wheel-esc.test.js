// wheel-esc.test.js — FX50: Esc on the wheel's first ring closes it; in a sub-ring it
// steps back one ring and the hint says so. Reopening starts at the first ring.
//
// Real keys through the game's own keydown listener (as wheel-fire-key.test.js), and the
// real _drawWheel for the hint text.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createWheelState, cycle, drill, back, selectedNode, restoreLastCategory } from '../game/wheel-model.js';
import { Renderer } from '../game/renderer.js';
import { BitmapFont } from '../game/bitmap-font.js';
import { DOCK } from '../game/layout.js';
import { computeViewport } from '../game/viewport.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

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
const Settings = { get: () => 'tap-toggle' };

function makeGame() {
    const document = new EventTarget();
    const window = new EventTarget();
    const free = { document, window, audio, STATE, DIRS };
    const g = {
        state: STATE.IDLE, wheel: createWheelState(), enemies: [], playerX: 5, playerY: 4,
        map: { isWalkable: () => true },
        _physicalHeld: new Set(), _heldDirKeys: [], _queuedMoveDir: null, _pathQueue: [], _pathArrive: null,
        _animating: false, _paused: false,
        _log() {}, _render() {}, _advanceWorld() {}, _ensureParticleLoop() {}, _maybeShowHint() {},
        _closeCurrentMenu() { return false; }, _digitToSlot() { return -1; },
        _canRepeatLast() { return false; }, _autoRepeatShouldStop() { return false; },
        _doMove() {},
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
        _resumeHeldWalk: liveMethod('_resumeHeldWalk() {', { STATE, DIRS }),
        _stopAutoRepeat: liveMethod('_stopAutoRepeat() {'),
        _noteHeld: liveMethod('_noteHeld(code) {'),
        _onStepSettled: liveMethod('_onStepSettled() {', { STATE }),
        _intendedWalkDir: liveMethod('_intendedWalkDir() {', { DIRS }),
        _resolveWalkStep: liveMethod('_resolveWalkStep(dir) {'),
        _faceOf: liveMethod('_faceOf(dir) {'),
        _clearTurnTimer: liveMethod('_clearTurnTimer() {'),
        _beginMoveOrTurn: liveMethod('_beginMoveOrTurn(dir) {', { STATE }),
    });
    // Space drills the highlighted node: the real drill, no staging beyond it.
    g._wheelDrill = function () { const n = selectedNode(this.wheel); if (n.children && n.children.length) drill(this.wheel, this); this._render(); };
    g._bindInput();
    g.tap = (code) => { document.dispatchEvent(new Key('keydown', code)); document.dispatchEvent(new Key('keyup', code)); };
    return g;
}

const HINT_FIRST = 'WHEEL OPEN  ·  MOVE KEYS STEER IT  ·  ESC TO CLOSE';

function hintOf(game) {
    const VP = computeViewport({ cssW: 3440, cssH: 1440, dpr: 1, dock: DOCK });
    const st = { globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: null, strokeStyle: null, filter: 'none' };
    const ctx = new Proxy(st, {
        get(t, k) { if (k in t) return t[k]; return () => { if (/Gradient$/.test(k)) return { addColorStop() {} }; }; },
        set(t, k, v) { t[k] = v; return true; },
    });
    const font = new BitmapFont();
    const drawn = [];
    const real = font.drawText.bind(font);
    font.drawText = (c, text, x, y, o = {}) => { drawn.push(text); real(c, text, x, y, o); };
    const r = Object.assign(Object.create(Renderer.prototype), {
        ctx, canvas: { width: VP.backingW, height: VP.backingH }, viewport: VP, sprites: { uiPanel: null }, font,
        _fightFace: false, _hudFor: null, _hudFaceFor: null, _hudCache: null,
    });
    r._drawWheel({ enemies: [], playerX: 5, playerY: 5, wheel: game.wheel, state: 'radial_menu' });
    return drawn.find(t => t.startsWith('WHEEL OPEN'));
}

function drillIntoSubRing(g) {
    for (let n = 0; n < 12 && g.wheel.path.length === 1; n++) {
        g.tap('Space');
        if (g.wheel.path.length === 1) g.tap('ArrowRight');
    }
    assert.ok(g.wheel.path.length > 1, 'could not drill into a sub-ring');
}

describe('Esc on the wheel', () => {
    test('at the first ring Esc closes the wheel, and the hint says so', () => {
        const g = makeGame();
        g.tap('Space');
        assert.equal(g.state, STATE.RADIAL_MENU);
        assert.equal(g.wheel.path.length, 1);
        assert.equal(hintOf(g), HINT_FIRST);
        g.tap('Escape');
        assert.equal(g.state, STATE.IDLE);
    });

    test('in a sub-ring Esc goes back one ring, the hint stops saying it closes, and a second Esc closes', () => {
        const g = makeGame();
        g.tap('Space');
        drillIntoSubRing(g);
        assert.equal(g.state, STATE.RADIAL_MENU);
        const hint = hintOf(g);
        assert.notEqual(hint, HINT_FIRST);
        assert.ok(!hint.includes('TO CLOSE'), hint);
        g.tap('Escape');
        assert.equal(g.state, STATE.RADIAL_MENU, 'Esc in a sub-ring must not close the wheel');
        assert.equal(g.wheel.path.length, 1);
        assert.equal(hintOf(g), HINT_FIRST);
        g.tap('Escape');
        assert.equal(g.state, STATE.IDLE);
    });

    test('reopening after leaving from a sub-ring starts at the first ring', () => {
        const g = makeGame();
        g.tap('Space');
        drillIntoSubRing(g);
        g.state = STATE.IDLE;   // left by any path other than backing out (e.g. a tap outside)
        g.tap('Space');
        assert.equal(g.state, STATE.RADIAL_MENU);
        assert.equal(g.wheel.path.length, 1);
        assert.equal(hintOf(g), HINT_FIRST);
    });
});
