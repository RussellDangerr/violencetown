// burning-cure.test.js - fb1: stepping onto snow or ice puts Burning out.
//
// Presses a real ArrowRight through the game's own keydown listener (_bindInput) and its own
// step (_doMove), lifted out of main.js as in double-tap-repeat.test.js. Only the slide
// animation is stood in for (it settles at once); the tile table, the hazard check, the
// Shoe Bags check and the buff list are the real ones.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TILES, FIRE_QUENCHING_TILES } from '../game/data.js';
import { buffBarChips } from '../game/renderer.js';

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
        _doMove: liveMethod('_doMove(dir) {', { audio, SLUDGE_DURATION, FIRE_QUENCHING_TILES, defaultVerb() {}, hitBarricade() {} }),
        addBuff: liveMethod('addBuff(id, name, turns, type = \'buff\', extra = {}) {'),
        removeBuff: liveMethod('removeBuff(id) {'),
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

const burn = g => g.addBuff('fire', 'Burning', 5, 'debuff');
const chipIds = g => buffBarChips(g).map(c => c.id);

describe('Snow and ice put Burning out', () => {
    test('the quenching list names snow and ice', () => {
        assert.deepEqual([...FIRE_QUENCHING_TILES].sort(), [TILES.SNOW.id, TILES.ICE.id].sort());
    });

    for (const [name, tile] of [['snow', TILES.SNOW], ['ice', TILES.ICE]]) {
        test(`Burning, ArrowRight onto ${name}: the buff ends and the chip goes`, () => {
            const g = makeGame(tile.id);
            burn(g);
            assert.deepEqual(chipIds(g), ['fire'], 'no Burning chip before the step');
            g.press('ArrowRight');
            assert.equal(g.playerX, 1, 'the step did not happen');
            assert.equal(g.hasBuff('fire'), false);
            assert.deepEqual(chipIds(g), [], 'the chip is still showing');
            assert.equal(g.logs.length, 1);
        });
    }

    test('not Burning: snow and ice change nothing', () => {
        for (const tile of [TILES.SNOW, TILES.ICE]) {
            const g = makeGame(tile.id);
            g.press('ArrowRight');
            assert.equal(g.playerX, 1);
            assert.deepEqual(g.buffs, []);
            assert.deepEqual(g.logs, []);
        }
    });

    test('plain floor leaves Burning alone (the check can fail)', () => {
        const g = makeGame(TILES.FLOOR.id);
        burn(g);
        g.press('ArrowRight');
        assert.equal(g.playerX, 1);
        assert.ok(g.hasBuff('fire'));
        assert.deepEqual(chipIds(g), ['fire']);
    });

    test('other damage over time survives a step onto snow or ice', () => {
        for (const tile of [TILES.SNOW, TILES.ICE]) {
            const g = makeGame(tile.id);
            g.addBuff('poison', 'Poison', 3, 'debuff');
            g.addBuff('sludge', 'Sludge', 3, 'debuff');
            burn(g);
            g.press('ArrowRight');
            assert.deepEqual(g.buffs.map(b => b.id).sort(), ['poison', 'sludge']);
        }
    });
});
