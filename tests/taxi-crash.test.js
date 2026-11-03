// taxi-crash.test.js — TX3: the driver takes you across, and goes down with you if the
// taxi crashes (plans/tx3-taxi-crash-driver.md).
//
// The first crossing is the same trigger it always was: a step onto the opened bridge
// mouth, with the fuel deciding it. Here the crossing is walked with real arrow keys
// under both fuels on the same stand-in game as canyon-branch.test.js (the real
// _doMove, cutscene and landing methods lifted out of main.js, the real maps and quest
// engine). The crash lands the driver in the Canyon beside you; the ramp leaves him
// at the bridge. Every line a player reads that changed is the placeholder [TEXT].

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GameMap, carriesAll } from '../game/map.js';
import { QuestEngine, QUESTS } from '../game/quests.js';
import { DIALOGUES, getDialogue } from '../game/dialogue.js';

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


// From the old town's spawn the street lamp at (16, 8) is in the way, so step one
// tile west first. A tap toward a new facing only turns you, so each turn is two presses.
async function walkNorth(g) {
    if (g.playerX === 16) {
        await g.press('ArrowLeft'); await g.press('ArrowLeft');
        await g.press('ArrowUp');
        assert.equal(g.playerX, 15);
    }
    for (let i = 0; i < 30 && g._mapUrl === 'town-map.json' && g.state === STATE.IDLE; i++) await g.press('ArrowUp');
}

const readJson = (rel) => JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8'));
const canyon = readJson('../game/canyon-map.json');
const town = readJson('../game/town-map.json');
const wreck = readJson('../game/radicals/canyon/wreck.json');
const driverOf = (map) => map.enemies.find(e => e.id === 'townie-driver');

describe('alcohol poured: the driver ramps you into Downtown', () => {
    test('the first crossing plays the ride lines and lands in Downtown', async () => {
        const g = await makeGame({ fuel: 'alcohol' });
        const before = g.logs.length;
        await walkNorth(g);
        assert.equal(g.state, STATE.RESOLVING, 'the crossing is the cutscene');
        assert.deepEqual(g.logs.slice(-2), ['[TEXT]', '[TEXT]'], 'two ride lines, placeholders');
        assert.equal(g.shakes, 1);
        await g.flushCutscene();
        assert.equal(g._mapUrl, 'downtown-map.json');
        assert.equal(g.questEngine.bridgeRoute(), 'ramp');
        assert.equal(g.logs.slice(before).filter(l => l === '[TEXT]').length, 3, 'two ride lines and the landing line, all placeholders');
        assert.ok(g.questEngine.isActive('deliver_burger'));
        assert.equal(g.questEngine.isActive('canyon_escape'), false);
    });
});

describe('raw fuel: the driver goes down with you', () => {
    test('the first crossing plays the crash lines and lands in the Canyon', async () => {
        const g = await makeGame({ fuel: 'raw' });
        const before = g.logs.length;
        await walkNorth(g);
        assert.equal(g.state, STATE.RESOLVING);
        assert.deepEqual(g.logs.slice(-2), ['[TEXT]', '[TEXT]']);
        assert.equal(g.shakes, 1);
        assert.equal(g.flashes, 1);
        await g.flushCutscene();
        assert.equal(g._mapUrl, 'canyon-map.json');
        assert.equal(g.questEngine.bridgeRoute(), 'canyon');
        assert.equal(g.logs.slice(before).filter(l => l === '[TEXT]').length, 3, 'two crash lines and the landing line');
        assert.deepEqual([g.playerX, g.playerY], [canyon.spawn.x, canyon.spawn.y]);
        assert.ok(g.questEngine.isActive('canyon_escape'));
    });

    test('no line of either crossing says "your car" or keeps the old wording', async () => {
        for (const fuel of ['alcohol', 'raw']) {
            const g = await makeGame({ fuel });
            const before = g.logs.length;
            await walkNorth(g);
            await g.flushCutscene();
            assert.ok(g.logs.length - before >= 3, 'the crossing logged its lines');
            for (const line of g.logs.slice(before)) assert.doesNotMatch(line, /your car|write-off/i);
        }
    });

    test('the driver stands beside the landing, on open ground, under his Town id', () => {
        const d = driverOf(canyon);
        assert.ok(d, 'the Canyon places the driver');
        assert.equal(Math.max(Math.abs(d.x - canyon.spawn.x), Math.abs(d.y - canyon.spawn.y)), 1, 'beside the landing tile');
        assert.equal(canyon.tiles[d.y * canyon.width + d.x], 60, 'he stands on open canyon floor');
        assert.equal(d.type, driverOf(town).type, 'the same look as at the bridge');
        assert.equal(d.id, driverOf(town).id, 'same id, so the same sprite pick');
        assert.equal(d.damage, 0, 'he is no fight');
        assert.equal(canyon.enemies.filter(e => e.id === d.id).length, 1);
    });

    test('he talks: his Canyon dialogue resolves and is placeholder text', () => {
        assert.equal(driverOf(canyon).dialogueId, 'taxi_driver_canyon');
        const d = getDialogue('taxi_driver_canyon');
        assert.ok(d, 'the dialogue id resolves');
        assert.equal(d.greeting, '[TEXT]');
        assert.ok(d.choices.length >= 1);
        for (const c of d.choices) { assert.equal(c.label, '[TEXT]'); assert.equal(c.reply, '[TEXT]'); }
        assert.ok(DIALOGUES.taxi_driver, 'the bridge driver keeps his own entry');
        assert.notEqual(DIALOGUES.taxi_driver, d);
    });

    test('climbing out with the hook still lands in Downtown', async () => {
        const g = await makeGame({ fuel: 'raw' });
        await walkNorth(g);
        await g.flushCutscene();
        const exit = g.map.anchors.find(t => t.toMap === 'downtown-map.json');
        assert.ok(exit, 'the Canyon keeps its way up');
        assert.equal(exit.requires, 'grappling_hook', 'still gated on Pike\'s hook');
        g._pendingTransition = exit;
        g._advanceWorld();
        await settle();
        assert.equal(g._mapUrl, 'downtown-map.json');
        assert.ok(g.questEngine.isComplete('canyon_escape'));
    });
});

describe('the wreck is the taxi, said once', () => {
    test('the map examinable and its radical piece are one text, at the offset the map records', () => {
        const piece = wreck.examinables.find(e => e.id === 'canyon_wreck');
        const placed = canyon.examinables.find(e => e.id === 'canyon_wreck');
        assert.ok(piece && placed);
        assert.equal(placed.text, piece.text);
        const at = canyon._radicals.find(r => r.name === 'canyon/wreck');
        assert.deepEqual([placed.x, placed.y], [at.x + piece.x, at.y + piece.y]);
    });

    test('neither the text nor the piece\'s note says "your car"', () => {
        const all = [
            canyon.examinables.find(e => e.id === 'canyon_wreck').text,
            wreck.examinables[0].text, wreck.note,
        ];
        for (const t of all) assert.doesNotMatch(t, /your car/i);
        assert.equal(wreck.examinables[0].text, '[TEXT]');
    });
});
