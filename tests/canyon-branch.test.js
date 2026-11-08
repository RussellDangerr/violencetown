// canyon-branch.test.js — CY1: the Canyon is a branch (plans/cy1-canyon-branch-bridge.md).
//
// The North bridge forks Chapter Two: a hot engine crashes you into the Canyon,
// a tank of alcohol ramps you over into Downtown. The Quests tab counts only the
// route you took, and the bridge plays its cutscene once; after that it is an
// ordinary walk into Downtown, whichever route you took the first time.
//
// main.js touches `document` at import, so, as in autosave-moments.test.js, the
// real methods are lifted out of the source and bound onto a small game object.
// Every step here is a real key: a keydown and keyup through the real listeners
// _bindInput registers, into the real _beginMoveOrTurn → _doMove → bridge check.
// The maps are the real JSON files; the quest engine and renderer are the real ones.
// Only the world beat is a stand-in, carrying out a queued transition the way
// _advanceWorldOnce's tail does.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GameMap, carriesAll } from '../game/map.js';
import { QuestEngine, QUESTS } from '../game/quests.js';
import { Renderer } from '../game/renderer.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');

function liveMethod(name, params, freeVars = {}) {
    const signature = `${name}(${params}) {`;
    const at = mainSrc.indexOf(signature);
    assert.ok(at > 0, `${name}(${params}) not found in main.js`);
    const closeAt = mainSrc.indexOf('\n    }', at);
    assert.ok(closeAt > at, `${name} body never closes`);
    const body = mainSrc.slice(at + name.length, closeAt + '\n    }'.length);
    const isAsync = mainSrc.slice(at - 6, at) === 'async ';
    const names = Object.keys(freeVars);
    const factory = new Function(...names, `'use strict'; return ${isAsync ? 'async ' : ''}function ${body}`);
    return factory(...names.map(n => freeVars[n]));
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
const audio = { playSfx() {}, playMusic() {} };

const loadJson = (url) => new GameMap(JSON.parse(readFileSync(fileURLToPath(new URL(`../game/${url}`, import.meta.url)), 'utf8')), url);

class Key extends Event {
    constructor(type, code) {
        super(type, { bubbles: true, cancelable: true });
        this.code = code;
        this.key = code;
        this.repeat = false;
        this.ctrlKey = false; this.metaKey = false; this.altKey = false; this.shiftKey = false;
    }
}

const settle = async () => { for (let i = 0; i < 8; i++) await new Promise(r => setImmediate(r)); };

// A game standing in the old town with the car fixed, bound to the real methods.
async function makeGame({ fuel = 'raw' } = {}) {
    const document = new EventTarget();
    const window = new EventTarget();
    const timers = [];   // the cutscene's beat before the map loads: flushed by hand
    const g = {
        state: STATE.IDLE, facing: 'up', carFuel: fuel,
        playerX: 0, playerY: 0, inventory: [], enemies: [], containers: [], examinables: [],
        _tileDiffs: [], _heldDirKeys: [], _physicalHeld: new Set(), _queuedMoveDir: null,
        _animating: false, _animDuration: 1, _TURN_MS: 70, _turnTimer: null, _paused: false,
        _pendingTransition: null, _ratFormTurns: 0,
        logs: [], shakes: 0, flashes: 0, beats: 0, zoneChanges: 0, timers,
        _log(m) { this.logs.push(m); },
        _render() {}, _onStepSettled() {}, _tryPickup() {}, _stopAutoRepeat() {},
        hasBuff() { return false; },
        _flash() { this.flashes++; },
        _triggerScreenShake() { this.shakes++; },
        _zoneChange() { this.zoneChanges++; },
        emitGameEvent(type, payload) { this.questEngine.emit(type, payload); },
        async _loadMap(url, spawnX, spawnY) {
            this.map = loadJson(url);
            this._mapUrl = url;
            this.playerX = spawnX ?? this.map.spawn.x;
            this.playerY = spawnY ?? this.map.spawn.y;
            this._tileDiffs = [];
            this.examinables = this.map.examinableSpawns.map(e => ({ ...e }));
            this._openBridgeIfCarFixed();
        },
        // Stand-in world beat: carries out a queued map change as _advanceWorldOnce's tail does.
        _advanceWorld() {
            this.beats++;
            if (!this._pendingTransition) return;
            const t = this._pendingTransition;
            this._pendingTransition = null;
            this._log(t.label || '[Transitioning...]');
            this.state = STATE.RESOLVING;
            this._zoneChange();
            this._loadMap(t.toMap, t.toX, t.toY).then(() => {
                this.state = STATE.IDLE;
                this.emitGameEvent('map_entered', { map: t.toMap });
            });
        },
    };
    const free = {
        STATE, DIRS, audio, carriesAll, document, window,
        requestAnimationFrame: (f) => queueMicrotask(() => f(Infinity)),
        performance: { now: () => 0 },
        setTimeout: (f) => { timers.push(f); return timers.length; },
    };
    for (const [n, p] of [
        ['_bindInput', ''], ['_noteHeld', 'code'], ['_faceOf', 'dir'], ['_clearTurnTimer', ''],
        ['_beginMoveOrTurn', 'dir'], ['_intendedWalkDir', ''], ['_resolveWalkStep', 'dir'],
        ['_animateMove', 'fromX, fromY, toX, toY, callback, duration = this._animDuration'],
        ['_doMove', 'dir'], ['_canEnter', 'x, y'], ['setTile', 'x, y, id'],
        ['_openBridgeIfCarFixed', ''], ['_playBridgeCutscene', ''], ['_crashToCanyon', ''],
        ['_rampToDowntown', ''], ['_startMainQuest2', ''],
    ]) g[n] = liveMethod(n, p, n === '_beginMoveOrTurn' ? { ...free, setTimeout: () => 0 } : free);
    g.questEngine = new QuestEngine(g);
    g._bindInput();
    g.press = async (code) => {
        document.dispatchEvent(new Key('keydown', code));
        document.dispatchEvent(new Key('keyup', code));
        await settle();
    };
    g.flushCutscene = async () => { while (timers.length) timers.shift()(); await settle(); };
    await g._loadMap('town-map.json');
    g.questEngine.forceComplete('fix_car');   // the car runs: carFixed, and the barricade opens
    return g;
}

// Walk north until the map changes or the cutscene starts. From the old town's
// spawn the street lamp at (16, 8) is in the way, so step one tile west first. A
// tap toward a new facing only turns you (the hold-to-walk timer is not run here),
// so each turn is two presses.
async function walkNorth(g) {
    const from = g._mapUrl;
    if (from === 'town-map.json' && g.playerX === 16) {
        await g.press('ArrowLeft'); await g.press('ArrowLeft');
        await g.press('ArrowUp');
        assert.equal(g.playerX, 15);
    }
    for (let i = 0; i < 30 && g._mapUrl === from && g.state === STATE.IDLE; i++) await g.press('ArrowUp');
}

// Downtown's south exit is x 11-13 on its bottom row; the street at row 12 runs
// the width of the map, so drop to it, line up with x 12, then walk out.
async function walkSouthToTown(g) {
    await g.press('ArrowDown');
    for (let i = 0; i < 10 && g.playerY < 12; i++) await g.press('ArrowDown');
    if (g.playerX !== 12) {
        const code = g.playerX < 12 ? 'ArrowRight' : 'ArrowLeft';
        await g.press(code);
        for (let i = 0; i < 30 && g.playerX !== 12; i++) await g.press(code);
        await g.press('ArrowDown');
    }
    for (let i = 0; i < 30 && g._mapUrl !== 'town-map.json'; i++) await g.press('ArrowDown');
    assert.equal(g._mapUrl, 'town-map.json', 'Downtown\'s south exit leads back to the old town');
}

// Climb out of the Canyon through its own grapple anchor (the hook is Pike's): the
// anchor queues its transition when the swing lands, as plans/grapple-swing.md has it.
async function climbOut(g) {
    const exit = g.map.anchors.find(t => t.toMap === 'downtown-map.json');
    assert.ok(exit, 'the Canyon has a way up to Downtown');
    g._pendingTransition = exit;
    g._advanceWorld();
    await settle();
    assert.equal(g._mapUrl, 'downtown-map.json');
}

function questsHeading(game) {
    const drawn = [];
    const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
    const r = Object.assign(Object.create(Renderer.prototype), {
        ctx, font: { drawText: (c, text) => drawn.push(text) },
    });
    r._drawJournalQuestsBody(game, { x: 0, y: 0, w: 600, h: 500 });
    return drawn.find(t => t.startsWith('COMPLETED'));
}

describe('the bridge plays its cutscene once', () => {
    test('the bridge mouth is open once the car runs, and walking up it from town spawn reaches it', async () => {
        const g = await makeGame();
        assert.equal(g.map.getTile(16, 0), 12, 'the barricade is down');
        assert.equal(g.questEngine.bridgeRoute(), null, 'no crossing yet');
    });

    test('ramp route: the first crossing plays the ramp, the second just walks into Downtown', async () => {
        const g = await makeGame({ fuel: 'alcohol' });
        await walkNorth(g);
        assert.equal(g.state, STATE.RESOLVING, 'the first crossing is the cutscene');
        assert.equal(g.shakes, 1);
        assert.equal(g.timers.length, 1, 'the cutscene waits a beat before landing you');
        await g.flushCutscene();
        assert.equal(g._mapUrl, 'downtown-map.json');
        assert.equal(g.questEngine.bridgeRoute(), 'ramp');
        assert.ok(g.questEngine.isActive('deliver_burger'));

        await walkSouthToTown(g);
        const logsBefore = g.logs.length;
        await walkNorth(g);
        assert.equal(g._mapUrl, 'downtown-map.json', 'the bridge took you to Downtown');
        assert.equal(g.state, STATE.IDLE);
        assert.equal(g.shakes, 1, 'no second shake');
        assert.equal(g.flashes, 1, 'no second flash');
        assert.equal(g.timers.length, 0, 'no cutscene beat was queued');
        assert.deepEqual([g.playerX, g.playerY], [g.map.spawn.x, g.map.spawn.y], 'you land where the ramp lands you');
        const said = g.logs.slice(logsBefore).join(' ');
        assert.doesNotMatch(said, /ramp|SAIL|STRAIGHT THROUGH|Converter/);
    });

    test('canyon route: the first crossing crashes, and after the climb out the bridge just walks into Downtown', async () => {
        const g = await makeGame({ fuel: 'raw' });
        await walkNorth(g);
        assert.equal(g.state, STATE.RESOLVING);
        await g.flushCutscene();
        assert.equal(g._mapUrl, 'canyon-map.json', 'the hot engine crashes you into the Canyon');
        assert.equal(g.questEngine.bridgeRoute(), 'canyon');
        assert.ok(g.questEngine.isActive('canyon_escape'));

        await climbOut(g);
        assert.ok(g.questEngine.isComplete('canyon_escape'));
        await walkSouthToTown(g);
        const crashes = g.shakes;
        await walkNorth(g);
        assert.equal(g._mapUrl, 'downtown-map.json', 'the bridge took you to Downtown, not the Canyon');
        assert.equal(g.shakes, crashes, 'the crash never replays');
        assert.equal(g.timers.length, 0);
        assert.equal(g.state, STATE.IDLE);
    });

    test('the walk crosses both ways, again and again', async () => {
        const g = await makeGame({ fuel: 'alcohol' });
        await walkNorth(g);
        await g.flushCutscene();
        for (let i = 0; i < 2; i++) {
            await walkSouthToTown(g);
            await walkNorth(g);
            assert.equal(g._mapUrl, 'downtown-map.json');
        }
        assert.equal(g.shakes, 1);
    });

    test('a save from before the route flag still walks: the delivery quest begun means you crossed', async () => {
        const g = await makeGame({ fuel: 'alcohol' });
        g.questEngine.restore({ completed: ['fix_car', 'deliver_burger'], flags: { carFixed: true } });
        await walkNorth(g);
        assert.equal(g._mapUrl, 'downtown-map.json');
        assert.equal(g.shakes, 0, 'no cutscene');
    });

    test('a step onto the bridge mouth while the car is still broken does nothing', async () => {
        const g = await makeGame();
        g.questEngine.restore({ completed: [], flags: {} });
        await g._loadMap('town-map.json');
        assert.equal(g.map.getTile(16, 1), 17, 'the barricade stands');
        await walkNorth(g);
        assert.equal(g._mapUrl, 'town-map.json');
        assert.equal(g.playerY, 2, 'stopped at the barricade');
    });
});

describe('the Quests tab counts only the route you took', () => {
    const ALL = Object.keys(QUESTS).length;

    test('there is exactly one branch quest, the Canyon one', () => {
        assert.deepEqual(Object.keys(QUESTS).filter(id => QUESTS[id].branch), ['canyon_escape']);
    });

    test('before the bridge, every quest counts, as today', async () => {
        const g = await makeGame();
        assert.deepEqual(g.questEngine.getCompletedCount(), { done: 1, total: ALL });
    });

    test('ramp route: the Canyon quest is left out, so the delivery done reads 2 / 2', async () => {
        const g = await makeGame({ fuel: 'alcohol' });
        await walkNorth(g);
        await g.flushCutscene();
        assert.deepEqual(g.questEngine.getCompletedCount(), { done: 1, total: ALL - 1 });
        g.questEngine.forceComplete('deliver_burger');
        assert.deepEqual(g.questEngine.getCompletedCount(), { done: 2, total: ALL - 1 });
        assert.match(questsHeading(g), new RegExp(`^COMPLETED\\s+2 / ${ALL - 1}$`));
    });

    test('canyon route: it counts as today', async () => {
        const g = await makeGame({ fuel: 'raw' });
        await walkNorth(g);
        await g.flushCutscene();
        assert.deepEqual(g.questEngine.getCompletedCount(), { done: 1, total: ALL });
        await climbOut(g);
        assert.deepEqual(g.questEngine.getCompletedCount(), { done: 2, total: ALL });
        g.questEngine.forceComplete('deliver_burger');
        assert.match(questsHeading(g), new RegExp(`^COMPLETED\\s+${ALL} / ${ALL}$`));
    });

    test('the route rides the save: it is a quest flag, read back on restore', async () => {
        const g = await makeGame({ fuel: 'alcohol' });
        await walkNorth(g);
        await g.flushCutscene();
        const saved = JSON.parse(JSON.stringify(g.questEngine.serialize()));
        assert.equal(saved.flags.bridgeRoute, 'ramp');
        const again = new QuestEngine({ _log() {}, _render() {} });
        again.restore(saved);
        assert.equal(again.bridgeRoute(), 'ramp');
        assert.equal(again.getCompletedCount().total, ALL - 1);
    });

    test('an older save with no flag reads the route from its quests', () => {
        const qe = new QuestEngine({ _log() {}, _render() {} });
        qe.restore({ completed: ['fix_car', 'deliver_burger'] });
        assert.equal(qe.bridgeRoute(), 'ramp');
        qe.restore({ completed: ['fix_car'], activeId: 'canyon_escape' });
        assert.equal(qe.bridgeRoute(), 'canyon');
        qe.restore({ completed: ['fix_car'] });
        assert.equal(qe.bridgeRoute(), null);
    });
});
