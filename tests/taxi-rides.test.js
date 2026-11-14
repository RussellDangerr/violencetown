// taxi-rides.test.js — TX4: every crossing is a taxi ride, back and forth
// (plans/tx4-taxi-rides-both-ways.md).
//
// The bridge cutscene plays once. After it, the bridge mouth in the Town and Downtown's
// three south exits are a ride beat, not a walkway; it costs nothing (TX4R1 a). The
// harness is canyon-branch.test.js's: real methods lifted out of main.js, real keys,
// real map JSON.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GameMap, carriesAll } from '../game/map.js';
import { QuestEngine } from '../game/quests.js';

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

const rawJson = (url) => JSON.parse(readFileSync(fileURLToPath(new URL(`../game/${url}`, import.meta.url)), 'utf8'));
const loadJson = (url) => new GameMap(rawJson(url), url);

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
    const timers = [];   // the ride's beat before the map loads: flushed by hand
    const g = {
        state: STATE.IDLE, facing: 'up', carFuel: fuel, gold: 0,
        playerX: 0, playerY: 0, inventory: [], enemies: [], containers: [], examinables: [],
        _tileDiffs: [], _heldDirKeys: [], _physicalHeld: new Set(), _queuedMoveDir: null,
        _animating: false, _animDuration: 1, _TURN_MS: 70, _turnTimer: null, _paused: false,
        _pendingTransition: null, _ratFormTurns: 0,
        logs: [], shakes: 0, flashes: 0, zoneChanges: 0, timers,
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
        _advanceWorld() {
            if (!this._pendingTransition) return;
            const t = this._pendingTransition;
            this._pendingTransition = null;
            this.state = STATE.RESOLVING;
            this._loadMap(t.toMap, t.toX, t.toY).then(() => { this.state = STATE.IDLE; });
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
        ['_rampToDowntown', ''], ['_startMainQuest2', ''], ['_rideTo', 'toMap, toX, toY'],
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

// Walk north from the Town spawn until the map changes or a beat starts.
async function walkNorth(g) {
    await g.press('ArrowLeft'); await g.press('ArrowLeft');   // round the street lamp at (16, 8)
    await g.press('ArrowUp');
    for (let i = 0; i < 30 && g._mapUrl === 'town-map.json' && g.state === STATE.IDLE; i++) await g.press('ArrowUp');
}

// Downtown's south exit: drop to the street, line up with x 12, walk out.
async function walkSouth(g) {
    await g.press('ArrowDown');
    for (let i = 0; i < 10 && g.playerY < 12; i++) await g.press('ArrowDown');
    if (g.playerX !== 12) {
        const code = g.playerX < 12 ? 'ArrowRight' : 'ArrowLeft';
        await g.press(code);
        for (let i = 0; i < 30 && g.playerX !== 12; i++) await g.press(code);
        await g.press('ArrowDown');
    }
    for (let i = 0; i < 30 && g._mapUrl === 'downtown-map.json' && g.state === STATE.IDLE; i++) await g.press('ArrowDown');
}

describe("the map: Downtown's south exits are rides", () => {
    const downtown = loadJson('downtown-map.json');
    const town = loadJson('town-map.json');
    const south = downtown.transitions.filter(t => t.toMap === 'town-map.json');

    test('all three south exits are marked as rides', () => {
        assert.equal(south.length, 3);
        for (const t of south) assert.equal(t.ride, true, `${t.x},${t.y}`);
    });

    test('they land on walkable ground beside the Town driver, not at the old spot', () => {
        const driver = rawJson('town-map.json').enemies.find(e => e.id === 'townie-driver');
        for (const t of south) {
            assert.ok(town.isWalkable(t.toX, t.toY), 'the stand is open ground');
            assert.notDeepEqual([t.toX, t.toY], [16, 12], 'not the old landing');
            assert.equal(Math.abs(t.toX - driver.x) + Math.abs(t.toY - driver.y), 1, 'next to the driver');
        }
    });

    test('the Downtown driver stands beside the landing and talks with taxi_driver', () => {
        const driver = rawJson('downtown-map.json').enemies.find(e => e.id === 'dt-driver');
        assert.ok(driver, 'a driver is placed');
        assert.equal(driver.dialogueId, 'taxi_driver');
        assert.deepEqual(driver.behavior, ['IDLE'], 'he stands still');
        assert.equal(Math.abs(driver.x - downtown.spawn.x) + Math.abs(driver.y - downtown.spawn.y), 1, 'next to the landing');
        assert.ok(downtown.isWalkable(driver.x, driver.y));
    });

    test('Downtown has a taxi standing by the landing', () => {
        const cars = [];
        for (let y = 0; y < downtown.height; y++) for (let x = 0; x < downtown.width; x++) if (downtown.getTile(x, y) === 19) cars.push([x, y]);
        assert.equal(cars.length, 4);
        for (const [x, y] of cars) assert.ok(Math.abs(x - downtown.spawn.x) <= 3 && Math.abs(y - downtown.spawn.y) <= 1);
    });
});

describe('after the first crossing, the bridge is a ride in both directions', () => {
    test('there and back on real keys, twice, free of charge', async () => {
        const g = await makeGame({ fuel: 'alcohol' });
        await walkNorth(g);
        await g.flushCutscene();
        assert.equal(g._mapUrl, 'downtown-map.json', 'the first crossing');
        const shakes = g.shakes;
        for (let i = 1; i <= 2; i++) {
            await walkSouth(g);
            assert.equal(g.state, STATE.RESOLVING, 'a ride beat, not a silent walk');
            assert.equal(g._mapUrl, 'downtown-map.json', 'you are still on the road until the beat ends');
            await g.flushCutscene();
            assert.equal(g._mapUrl, 'town-map.json', 'the ride lands in the Town');
            assert.deepEqual([g.playerX, g.playerY], [15, 4], 'at the stand beside the driver');
            assert.equal(g.state, STATE.IDLE);

            // From the stand, north up the road to the bridge mouth: the same ride the other way.
            await g.press('ArrowUp'); await g.press('ArrowUp');
            for (let k = 0; k < 6 && g._mapUrl === 'town-map.json' && g.state === STATE.IDLE; k++) await g.press('ArrowUp');
            assert.equal(g.state, STATE.RESOLVING, 'the mouth is a ride beat too');
            await g.flushCutscene();
            assert.equal(g._mapUrl, 'downtown-map.json');
            assert.deepEqual([g.playerX, g.playerY], [g.map.spawn.x, g.map.spawn.y]);
            assert.equal(g.shakes, shakes + 2 * i, 'each ride shakes');
        }
        assert.equal(g.gold, 0, 'no fare');
        assert.equal(g.questEngine.bridgeRoute(), 'ramp', 'the route flag is untouched');
    });

    test('a hot engine still crashes on the first crossing; no ride replaces it', async () => {
        const g = await makeGame({ fuel: 'raw' });
        await walkNorth(g);
        await g.flushCutscene();
        assert.equal(g._mapUrl, 'canyon-map.json');
        assert.equal(g.questEngine.bridgeRoute(), 'canyon');
    });
});
