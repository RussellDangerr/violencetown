// tw1-tap-destination-taken.test.js - TW1: a tap on a tile takes you onto it.
//
// A click-to-walk path runs the held-walk halt gate (_autoRepeatShouldStop) on each step.
// The last step is the tile you aimed at, so a hazard there no longer stops it; every step
// before it still does, and a wall, a hostile or a container still stops the last step.
// Held-key walking is untouched.
//
// This runs the game's own _walkPath, _onStepSettled, _autoRepeatShouldStop and
// _hazardIsOnlyThingStopping (lifted out of main.js as in double-tap-repeat.test.js), the
// real findPath, and the real Town map. Only _doMove is a stand-in: it takes the step and
// settles, the way the animation callback does.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { GameMap } from '../game/map.js';
import { findPath } from '../game/pathing.js';
import { puddleAt } from '../game/puddles.js';

const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');
const classAt = mainSrc.indexOf('class Game {');

function liveMethod(signature, freeVars = {}) {
    const start = mainSrc.indexOf(signature, classAt);
    assert.ok(start > 0, `${signature} not found in main.js`);
    const end = mainSrc.indexOf('\n    }', start) + '\n    }'.length;
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

// A flat open map, with optional hazard tiles, for the hazard cases.
function flatMap(hazards = []) {
    const hz = new Set(hazards.map(([x, y]) => `${x},${y}`));
    return {
        isWalkable: (x, y) => x >= 0 && y >= 0 && x < 20 && y < 5,
        getTileDef: (x, y) => (hz.has(`${x},${y}`) ? { hazard: 'sludge' } : { }),
        getTransition: () => null,
    };
}

function makeGame(map, at, extras = {}) {
    const g = {
        state: STATE.IDLE, map, playerX: at.x, playerY: at.y, playerHp: 20,
        enemies: [], containers: [], _puddles: [], steps: [], exited: null,
        _heldDirKeys: [], _queuedMoveDir: null, _pathQueue: [], _pathArrive: null,
        _physicalHeld: new Set(), _animating: false,
        _maybeShowHint() {}, _clearTurnTimer() {}, _isHostileToPlayer: () => true,
        // The step lands, then the world settles the way the animation callback does.
        _doMove(dir) {
            this.playerX += dir.dx; this.playerY += dir.dy;
            this.steps.push([this.playerX, this.playerY]);
            const t = this.map.getTransition(this.playerX, this.playerY);
            if (t) { this.exited = t; this._pathQueue = []; this._pathArrive = null; return; }
            this._onStepSettled();
        },
        ...extras,
    };
    Object.assign(g, {
        _walkPath: liveMethod('_walkPath(path, onArrive = null) {'),
        _stopAutoRepeat: liveMethod('_stopAutoRepeat() {'),
        _onStepSettled: liveMethod('_onStepSettled() {', { STATE }),
        _intendedWalkDir: liveMethod('_intendedWalkDir() {', { DIRS }),
        _resolveWalkStep: liveMethod('_resolveWalkStep(dir) {'),
        _autoRepeatShouldStop: liveMethod('_autoRepeatShouldStop(dir) {', { puddleAt }),
        _hazardIsOnlyThingStopping: liveMethod('_hazardIsOnlyThingStopping(dir) {', { puddleAt }),
    });
    return g;
}

const tap = (g, to) => { const p = findPath(g, { x: g.playerX, y: g.playerY }, to); g._walkPath(p); return p; };

describe('tapping an exit on the real Town map', () => {
    const town = () => new GameMap(JSON.parse(readFileSync(fileURLToPath(new URL('../game/town-map.json', import.meta.url)), 'utf8')), 'town-map.json');

    test('the east exit is not a hazard or a wall, so nothing can stop it', () => {
        const m = town();
        const t = m.getTransition(33, 12);
        assert.equal(t?.toMap, 'sewer-map.json');
        assert.ok(m.isWalkable(33, 12));
        assert.ok(!m.getTileDef(33, 12).hazard);
    });
    test('tapping the exit one tile away takes it', () => {
        const g = makeGame(town(), { x: 32, y: 12 });
        tap(g, { x: 33, y: 12 });
        assert.deepEqual(g.steps, [[33, 12]]);
        assert.equal(g.exited?.toMap, 'sewer-map.json');
    });
    test('tapping the exit five tiles away walks there and takes it', () => {
        const g = makeGame(town(), { x: 28, y: 12 });
        tap(g, { x: 33, y: 12 });
        assert.equal(g.steps.length, 5);
        assert.deepEqual(g.steps.at(-1), [33, 12]);
        assert.equal(g.exited?.toMap, 'sewer-map.json');
    });
});

describe('the aimed tile is taken, the steps before it are gated', () => {
    test('a hazard you tap right beside you takes you onto it', () => {
        const g = makeGame(flatMap([[6, 2]]), { x: 5, y: 2 });
        tap(g, { x: 6, y: 2 });
        assert.deepEqual(g.steps, [[6, 2]]);
    });
    test('a hazard five tiles away: you walk there and step onto it', () => {
        const g = makeGame(flatMap([[10, 2]]), { x: 5, y: 2 });
        tap(g, { x: 10, y: 2 });
        assert.deepEqual(g.steps.at(-1), [10, 2]);
    });
    test('a puddle you tap is taken too', () => {
        const g = makeGame(flatMap(), { x: 5, y: 2 }, { _puddles: [{ x: 6, y: 2, kind: 'sludge', turns: 5 }] });
        assert.ok(puddleAt(g._puddles, 6, 2), 'the puddle stand-in is not read as a puddle');
        tap(g, { x: 6, y: 2 });
        assert.deepEqual(g.steps, [[6, 2]]);
    });
    test('a hazard in the middle of the way still stops the walk before it', () => {
        const g = makeGame(flatMap([[7, 2]]), { x: 5, y: 2 });
        g._walkPath([{ x: 6, y: 2 }, { x: 7, y: 2 }, { x: 8, y: 2 }]);
        assert.deepEqual(g.steps, [[6, 2]]);
        assert.equal(g._pathQueue.length, 0);
        assert.deepEqual([g.playerX, g.playerY], [6, 2]);
    });
    test('a container on the last tile still stops it', () => {
        const g = makeGame(flatMap(), { x: 5, y: 2 }, { containers: [{ x: 6, y: 2 }] });
        g._walkPath([{ x: 6, y: 2 }]);
        assert.deepEqual(g.steps, []);
    });
    test('a hostile on the last tile still stops it', () => {
        const g = makeGame(flatMap(), { x: 5, y: 2 }, { enemies: [{ x: 6, y: 2 }] });
        g._walkPath([{ x: 6, y: 2 }]);
        assert.deepEqual(g.steps, []);
    });
    test('a wall on the last tile still stops it', () => {
        const g = makeGame(flatMap(), { x: 19, y: 2 });
        g._walkPath([{ x: 20, y: 2 }]);
        assert.deepEqual(g.steps, []);
    });
});

describe('held-key walking is unchanged', () => {
    test('a held direction still halts before a hazard', () => {
        const g = makeGame(flatMap([[7, 2]]), { x: 5, y: 2 });
        g._heldDirKeys = ['ArrowRight'];
        g._onStepSettled();
        assert.deepEqual(g.steps, [[6, 2]]);
        assert.deepEqual([g.playerX, g.playerY], [6, 2]);
    });
    test('the held-walk gate itself still reads hazards and puddles', () => {
        const at = mainSrc.indexOf('    _autoRepeatShouldStop(dir) {');
        const src = mainSrc.slice(at, mainSrc.indexOf('\n    }', at));
        assert.match(src, /td\.hazard\) return true/);
        assert.match(src, /puddleAt\(this\._puddles, nx, ny\)\) return true/);
    });
    test('only the path branch asks whether the aimed tile may be taken', () => {
        const uses = mainSrc.split('_hazardIsOnlyThingStopping(').length - 1;
        assert.equal(uses, 2, 'one definition and one call, in _onStepSettled');
    });
});
