// one-clock.test.js — game state moves when you act, never on wall time
// (plans/trim.md stage 3).
//
// Before: out of a fight a 500 ms timer wound the day clock, ambient wander and
// mood fade, so standing still — or thinking — changed the world, and the
// wander's draws shared game.rng with every fight and theft. After: the day and
// moods count committed actions, the timer only moves townsfolk (and not while
// paused or in a fight), wander draws its own stream, a held or clicked walk
// stops at a fight, and a buyback lasts until you leave the zone.
//
// main.js touches `document` at import, so the methods are lifted from its
// source and run for real (the technique of offer-wiring.test.js).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { RNG } from '../game/rng.js';
import { Enemy, resolveAmbientTurns } from '../game/enemies.js';

const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');

function liveMethod(signature, freeVars = {}) {
    const at = mainSrc.indexOf(signature, mainSrc.indexOf('class Game {'));
    assert.ok(at > 0, `${signature} not found in main.js`);
    const body = mainSrc.slice(at + signature.indexOf('('), mainSrc.indexOf('\n    }', at) + '\n    }'.length);
    const names = Object.keys(freeVars);
    return new Function(...names, `'use strict'; return function ${body}`)(...names.map(n => freeVars[n]));
}

function liveConst(name) {
    const m = new RegExp(`\\nconst ${name}\\s*=\\s*([^;]+);`).exec(mainSrc);
    assert.ok(m, `const ${name} not found in main.js`);
    return new Function(`'use strict'; return ${m[1]}`)();
}

const DAY_LENGTH_ACTIONS = liveConst('DAY_LENGTH_ACTIONS');
const NIGHT_MAX = liveConst('NIGHT_MAX');
const DISPOSITION_DECAY_TURNS = liveConst('DISPOSITION_DECAY_TURNS');
const AWARE_STATES = liveConst('AWARE_STATES');
const STATE = { SPLASH: 'splash', IDLE: 'idle' };

const advanceDayClock = liveMethod('_advanceDayClock(steps = 1) {', { DAY_LENGTH_ACTIONS, NIGHT_MAX });
const worldBeat = liveMethod('_worldBeat({ ambient }) {', { DISPOSITION_DECAY_TURNS });
const timeOfDay = liveMethod('_timeOfDay() {', { DAY_LENGTH_ACTIONS });
const walkHalted = liveMethod('_walkHalted() {');
const alertCount = liveMethod('_alertCount() {', { AWARE_STATES });

describe('the constants', () => {
    test('a day is 600 actions (provisional) and moods fade every 40', () => {
        assert.equal(DAY_LENGTH_ACTIONS, 600);
        assert.equal(DISPOSITION_DECAY_TURNS, 40);
    });
    test('no wall-clock cadence is left for the day or moods', () => {
        for (const gone of ['DAY_LENGTH_MS', 'DISPOSITION_DECAY_MS', 'BUYBACK_MS', '_dayClockMs',
                            '_dispositionDecayAccMs', '_startTradeTimer', '_buybackRemainingMs', '_buybackEntry']) {
            assert.equal(mainSrc.includes(gone), false, `${gone} is still in main.js`);
        }
    });
});

describe('3b — the day counts actions', () => {
    const dayGame = () => ({ _dayClock: 0, _nightLevel: 0, enemies: [{}, {}] });

    test('noon is full day; the light only turns after enough actions', () => {
        const g = dayGame();
        advanceDayClock.call(g, 0);
        assert.equal(g._nightLevel, 0);
        assert.equal(timeOfDay.call(g), '12:00');
        for (let i = 0; i < 150; i++) advanceDayClock.call(g);
        assert.equal(g._dayClock, 150);
        assert.equal(g._nightLevel, 0, 'still day a quarter of the way round');
        for (let i = 0; i < 50; i++) advanceDayClock.call(g);   // 200 actions: a quest-1 run's length
        assert.ok(g._nightLevel > 0, 'dusk by the end of quest 1');
        advanceDayClock.call(g, 100);                          // 300: midnight
        assert.equal(timeOfDay.call(g), '00:00');
        assert.ok(Math.abs(g._nightLevel - NIGHT_MAX) < 1e-9, 'deepest night at the half-way point');
    });

    test('the day wraps, and a step of 0 only re-derives', () => {
        const g = dayGame();
        advanceDayClock.call(g, DAY_LENGTH_ACTIONS + 5);
        assert.equal(g._dayClock, 5);
        advanceDayClock.call(g, 0);
        assert.equal(g._dayClock, 5);
    });

    test('every watcher is stamped with the light', () => {
        const g = dayGame();
        advanceDayClock.call(g, 300);
        assert.ok(g.enemies.every(e => e._nightLevel === g._nightLevel && e._nightLevel > 0));
    });

    test('one world beat steps the day once; the ambient step only when asked', () => {
        let ambient = 0;
        const g = { ...dayGame(), _dispositionDecayTurns: 0, _advanceDayClock: advanceDayClock,
                    _ambientTick() { ambient++; }, _tickDispositionDecay() {} };
        worldBeat.call(g, { ambient: false });
        assert.equal(g._dayClock, 1);
        assert.equal(ambient, 0);
        worldBeat.call(g, { ambient: true });
        assert.equal(g._dayClock, 2);
        assert.equal(ambient, 1);
    });

    test('_advanceWorldOnce winds the beat on every action, in a fight or not', () => {
        const at = mainSrc.indexOf('    _advanceWorldOnce() {');
        const body = mainSrc.slice(at, mainSrc.indexOf('\n    }', at));
        assert.match(body, /this\._worldBeat\(\{ ambient: this\._inCombat\(\) \}\);/);
        assert.equal(/if \(this\._inCombat\(\)\) \{\s*const decayDue/.test(body), false, 'the beat is still gated on a fight');
    });
});

describe('3c — moods fade per action', () => {
    test('one nudge every DISPOSITION_DECAY_TURNS beats', () => {
        let decays = 0;
        const g = { _dayClock: 0, enemies: [], _dispositionDecayTurns: 0, _advanceDayClock: advanceDayClock,
                    _ambientTick() {}, _tickDispositionDecay() { decays++; } };
        for (let i = 0; i < DISPOSITION_DECAY_TURNS - 1; i++) worldBeat.call(g, { ambient: false });
        assert.equal(decays, 0);
        worldBeat.call(g, { ambient: false });
        assert.equal(decays, 1);
        for (let i = 0; i < DISPOSITION_DECAY_TURNS; i++) worldBeat.call(g, { ambient: false });
        assert.equal(decays, 2);
    });
});

describe('3a — the heartbeat moves only townsfolk, and pause pauses', () => {
    // The heartbeat is an arrow inside the init method; lift its body.
    const at = mainSrc.indexOf('setInterval(() => {', mainSrc.indexOf('// Town heartbeat (feature/town-clock)'));
    assert.ok(at > 0, 'the heartbeat was not found');
    const end = mainSrc.indexOf('}, WORLD_TICK_MS);', at);
    const body = mainSrc.slice(mainSrc.indexOf('{', at) + 1, end);
    const heartbeat = new Function('STATE', `'use strict'; return function () {${body}}`)(STATE);
    const g = (over = {}) => ({ state: STATE.IDLE, _paused: false, _animating: false, ticks: 0, _dayClock: 7,
                                _inCombat: () => false, _ambientTick() { this.ticks++; }, ...over });

    test('idle in town: one ambient step, and the day does not move', () => {
        const x = g();
        heartbeat.call(x);
        assert.equal(x.ticks, 1);
        assert.equal(x._dayClock, 7);
    });
    test('paused: nothing moves', () => {
        const x = g({ _paused: true });
        heartbeat.call(x);
        assert.equal(x.ticks, 0);
    });
    test('in a fight, on the splash, or mid-slide: nothing moves', () => {
        for (const over of [{ _inCombat: () => true }, { state: STATE.SPLASH }, { _animating: true }, { state: 'trade' }]) {
            const x = g(over);
            heartbeat.call(x);
            assert.equal(x.ticks, 0, JSON.stringify(Object.keys(over)));
        }
    });
});

describe('3d — wander draws its own dice', () => {
    const room = (W, H) => ({
        isWalkable: (x, y) => x >= 0 && y >= 0 && x < W && y < H,
        getRegion: () => null,
        isInBounds: (x, y) => x >= 0 && y >= 0 && x < W && y < H,
    });
    const wanderer = () => new Enemy({ id: 'w1', type: 'Violencian', x: 4, y: 4, hp: 10, damage: 0,
        behavior: ['WANDER'], wanderRadius: 2, wanderEveryTurns: 1, sightRange: 0, ambient: true });

    test('an ambient wander never touches game.rng', () => {
        const game = {
            playerX: -9, playerY: -9, turn: 0, worldTick: 0, _MOVE_MS: 150, containers: [],
            map: room(9, 9),
            rng: { pick() { throw new Error('wander drew from game.rng'); }, float() { throw new Error('wander drew from game.rng'); }, int() { throw new Error('wander drew from game.rng'); } },
            ambientRng: new RNG(7),
        };
        const w = wanderer();
        w.fsmState = 'WANDER';
        game.enemies = [w];
        const before = game.ambientRng.getState();
        for (let i = 0; i < 6; i++) { game.worldTick++; resolveAmbientTurns(game); }
        assert.notEqual(game.ambientRng.getState(), before, 'the wander drew nothing at all — the test checked nothing');
    });

    test('the same seed gives the same wander, and the fight stream is untouched', () => {
        const run = () => {
            const game = { playerX: -9, playerY: -9, turn: 0, worldTick: 0, _MOVE_MS: 150, containers: [],
                           map: room(9, 9), rng: new RNG(1), ambientRng: new RNG(99) };
            const w = wanderer(); w.fsmState = 'WANDER'; game.enemies = [w];
            const trail = [];
            for (let i = 0; i < 8; i++) { game.worldTick++; resolveAmbientTurns(game); trail.push(`${w.x},${w.y}`); }
            return { trail, rng: game.rng.getState() };
        };
        const a = run(), b = run();
        assert.deepEqual(a.trail, b.trail);
        assert.equal(a.rng, new RNG(1).getState(), 'game.rng moved during ambient wander');
        assert.ok(new Set(a.trail).size > 1, 'the wanderer never moved — the test checked nothing');
    });

    test('RESTART seeds the wander stream from the run seed, apart from game.rng', () => {
        const at = mainSrc.indexOf('async _fullReset({ seed } = {}) {');
        const body = mainSrc.slice(at, mainSrc.indexOf('\n    }', at));
        assert.match(body, /this\.ambientRng = new RNG\(seed == null \? undefined : \(seed \^ 0x9E3779B9\) >>> 0\);/);
    });
});

describe('3e — a held or clicked walk stops at a fight', () => {
    const onStepSettled = liveMethod('_onStepSettled() {', { STATE });
    const watcher = (state) => ({ state, _ally: false, entity: { isAlive: () => true } });
    const walker = (over = {}) => {
        const g = {
            state: STATE.IDLE, playerX: 5, playerY: 5, enemies: [], moves: [],
            _queuedMoveDir: null, _heldDirKeys: ['KeyD'], _pathQueue: [], _pathArrive: null,
            _walkAlertBase: 0, fight: false,
            _maybeShowHint() {},
            _inCombat() { return this.fight; },
            _walkHalted: walkHalted, _alertCount: alertCount,
            _intendedWalkDir() {
                if (this._queuedMoveDir) return this._queuedMoveDir;
                return this._heldDirKeys.length ? { dx: 1, dy: 0 } : null;
            },
            _resolveWalkStep: (d) => d,
            _autoRepeatShouldStop: () => false,
            _doMove(step) { this.moves.push(step); this._walkAlertBase = this._alertCount(); },
            ...over,
        };
        return g;
    };

    test('out of a fight a held key keeps walking', () => {
        const g = walker();
        onStepSettled.call(g);
        assert.equal(g.moves.length, 1);
    });

    test('in a fight a held key does not take another step', () => {
        const g = walker({ fight: true });
        onStepSettled.call(g);
        assert.equal(g.moves.length, 0);
    });

    test('in a fight a fresh press made during the slide still steps (the one-deep buffer, TM-6)', () => {
        const g = walker({ fight: true, _queuedMoveDir: { dx: 0, dy: 1 } });
        onStepSettled.call(g);
        assert.deepEqual(g.moves, [{ dx: 0, dy: 1 }]);
        assert.equal(g._queuedMoveDir, null);
    });

    test('the step on which someone noticed you ends the walk', () => {
        const g = walker();
        g.enemies = [watcher('idle')];
        g._walkAlertBase = alertCount.call(g);
        g.enemies[0].state = 'suspicious';
        onStepSettled.call(g);
        assert.equal(g.moves.length, 0);
    });

    test('someone already aware before the step does not stop it', () => {
        const g = walker();
        g.enemies = [watcher('searching')];
        g._walkAlertBase = alertCount.call(g);
        assert.equal(g._walkAlertBase, 1);
        onStepSettled.call(g);
        assert.equal(g.moves.length, 1);
    });

    test('allies and the dead are never counted', () => {
        const g = { enemies: [
            { state: 'chasing', _ally: true, entity: { isAlive: () => true } },
            { state: 'chasing', _ally: false, entity: { isAlive: () => false } },
            watcher('idle'), watcher('chasing'),
        ] };
        assert.equal(alertCount.call(g), 1);
    });

    test('a click-to-walk path is dropped, with its pending action, when a fight starts', () => {
        let arrived = 0;
        const g = walker({ fight: true, _heldDirKeys: [], _pathQueue: [{ x: 6, y: 5 }, { x: 7, y: 5 }],
                           _pathArrive: () => { arrived++; } });
        onStepSettled.call(g);
        assert.equal(g.moves.length, 0);
        assert.deepEqual(g._pathQueue, []);
        assert.equal(g._pathArrive, null);
        assert.equal(arrived, 0);
    });

    test('out of a fight the click-to-walk path carries on', () => {
        const g = walker({ _heldDirKeys: [], _pathQueue: [{ x: 6, y: 5 }] });
        onStepSettled.call(g);
        assert.deepEqual(g.moves, [{ dx: 1, dy: 0 }]);
    });

    test('_doMove takes the awareness baseline before each step', () => {
        const at = mainSrc.indexOf('    _doMove(dir) {');
        assert.match(mainSrc.slice(at, at + 300), /this\._walkAlertBase = this\._alertCount\(\);/);
    });
});
