// factory-goo.test.js - dt2: the Factory's goo sludges you, like the sewer river.
//
// Presses a real ArrowRight through the game's own keydown listener (_bindInput) and its own
// step (_doMove), lifted out of main.js as in double-tap-repeat.test.js. Only the slide
// animation is stood in for (it settles at once); the tile table, the hazard check, the
// Shoe Bags check and the buff list are the real ones.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TILES } from '../game/data.js';
import { ITEMS } from '../game/items.js';
import { resolveExamine } from '../game/examine.js';

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
const SLUDGE_DURATION = Number(/\nconst SLUDGE_DURATION = (\d+);/.exec(mainSrc)[1]);

class Key extends Event {
    constructor(type, code) {
        super(type, { bubbles: true, cancelable: true });
        this.code = code; this.key = code; this.repeat = false;
        this.ctrlKey = false; this.metaKey = false; this.altKey = false; this.shiftKey = false;
    }
}

// A one-row map: floor at x=0, then the given tile at x=1.
function makeGame(tileId, equipment = {}) {
    const document = new EventTarget();
    const window = new EventTarget();
    const audio = { init() {}, playMusic() {}, playSfx() {} };
    const byId = Object.values(TILES).reduce((m, t) => (m[t.id] = t, m), {});
    const tileAt = (x) => (x === 1 ? tileId : TILES.FLOOR.id);
    const g = {
        state: STATE.IDLE, facing: 'right', playerX: 0, playerY: 0, buffs: [], logs: [], world: 0, equipment,
        enemies: [], containers: [], _stepIndex: 0, _animating: false, _paused: false,
        _physicalHeld: new Set(), _heldDirKeys: [], _queuedMoveDir: null, _pathQueue: [], _pathArrive: null,
        _TURN_MS: 70, _puddles: [], _ratFormTurns: 0,
        map: {
            getTile: (x) => tileAt(x), getTileDef: (x) => byId[tileAt(x)], isWalkable: (x) => byId[tileAt(x)].walkable,
            getAnchor: () => null, getTransition: () => null,
        },
        _log(msg) { this.logs.push(msg); },
        _render() {}, _advanceWorld() { this.world++; }, _tryPickup() {}, _ensureParticleLoop() {}, _maybeShowHint() {},
        _closeCurrentMenu() { return false; }, _digitToSlot() { return -1; }, _autoRepeatShouldStop() { return false; },
        _animateMove(fx, fy, tx, ty, done) { this._settle = done; },
        questEngine: { getFlag: () => false },
    };
    Object.assign(g, {
        _bindInput: liveMethod('_bindInput() {', { document, window, audio, STATE, DIRS, performance: { now: () => 0 } }),
        _doMove: liveMethod('_doMove(dir) {', { audio, SLUDGE_DURATION, defaultVerb() {}, hitBarricade() {} }),
        addBuff: liveMethod('addBuff(id, name, turns, type = \'buff\', extra = {}) {'),
        hasBuff: liveMethod('hasBuff(id) {'),
        _hasSludgeImmunity: liveMethod('_hasSludgeImmunity() {'),
        _canEnter: liveMethod('_canEnter(x, y) {'),
        _faceOf: liveMethod('_faceOf(dir) {'),
        _clearTurnTimer: liveMethod('_clearTurnTimer() {'),
        _noteHeld: liveMethod('_noteHeld(code) {'),
        _intendedWalkDir: liveMethod('_intendedWalkDir() {', { DIRS }),
        _resolveWalkStep: liveMethod('_resolveWalkStep(dir) {'),
        _beginMoveOrTurn: liveMethod('_beginMoveOrTurn(dir) {', { STATE }),
        _onStepSettled: liveMethod('_onStepSettled() {', { STATE }),
        _stopAutoRepeat: liveMethod('_stopAutoRepeat() {'),
    });
    g._bindInput();
    g.press = (code) => { document.dispatchEvent(new Key('keydown', code)); document.dispatchEvent(new Key('keyup', code)); const s = g._settle; g._settle = null; if (s) s(); };
    return g;
}

describe('Factory goo sludges you', () => {
    test('the goo tile carries the same hazard as the sewer river', () => {
        assert.equal(TILES.GOO_VISUAL.hazard, 'sludge');
        assert.equal(TILES.GOO_VISUAL.hazard, TILES.SLUDGE.hazard);
        assert.equal(TILES.GOO_VISUAL.walkable, true);
    });

    test('stepping onto goo with ArrowRight applies Sludge, as the river does', () => {
        const goo = makeGame(TILES.GOO_VISUAL.id);
        const river = makeGame(TILES.SLUDGE.id);
        goo.press('ArrowRight'); river.press('ArrowRight');
        assert.equal(goo.playerX, 1, 'the step did not happen');
        assert.ok(goo.hasBuff('sludge'), 'no Sludge after stepping on goo');
        assert.equal(goo.buffs.find(b => b.id === 'sludge').turns, SLUDGE_DURATION);
        assert.deepEqual(goo.buffs, river.buffs, 'goo and river give different Sludge');
        assert.deepEqual(goo.logs, river.logs, 'goo and river log differently');
        assert.ok(goo.logs.length > 0, 'no log line');
    });

    test('plain floor does not sludge (the check can fail)', () => {
        const floor = makeGame(TILES.FLOOR.id);
        floor.press('ArrowRight');
        assert.equal(floor.playerX, 1);
        assert.equal(floor.hasBuff('sludge'), false);
    });

    test('Shoe Bags keep the goo off, as they do the river', () => {
        const bags = ITEMS.shoe_bags || Object.values(ITEMS).find(i => i.sludgeImmune);
        assert.ok(bags && bags.sludgeImmune, 'no sludge-proof item found');
        const g = makeGame(TILES.GOO_VISUAL.id, { bottom: bags });
        g.press('ArrowRight');
        assert.equal(g.playerX, 1);
        assert.equal(g.hasBuff('sludge'), false);
        assert.match(g.logs.join(' '), /slides right off/);
    });

    test('examining goo still reads Goo', () => {
        const g = { examinables: [], enemies: [], containers: [], groundItems: [], playerX: 0, playerY: 0, facing: 'down',
            map: { getTile: () => TILES.GOO_VISUAL.id, isInBounds: () => true, propSpawns: [] } };
        assert.equal(resolveExamine(g, 0, 0).body, '[Goo.]');
    });
});
