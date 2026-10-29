// between-quests.test.js — NO1: after the car runs, the objective points at the
// bridge (plans/no1-objective-points-at-bridge.md).
//
// Installing the converter finishes fix_car, and nothing starts until you cross
// the North bridge. In that gap the HUD and the Map fall back to a between-quests
// row: "Drive north across the bridge", Town ringed. Crossing either way starts
// that route's quest, whose own stage takes over.
//
// As in canyon-branch.test.js, the real main.js methods are lifted out of the
// source and bound onto a small game object, and every step is a real key through
// the listeners _bindInput registers. The HUD is read from what the real
// _drawQuestLog draws, and the Map from the real _drawWorldMapBody.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GameMap, carriesAll } from '../game/map.js';
import { QuestEngine, QUESTS, BETWEEN_QUESTS } from '../game/quests.js';
import { Renderer } from '../game/renderer.js';
import { WORLD_ZONES } from '../game/world-map.js';
import { hudLayout, DOCK } from '../game/layout.js';
import { computeViewport } from '../game/viewport.js';

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

const OBJECTIVE = BETWEEN_QUESTS.find(r => r.id === 'to_bridge').objective;

// A game standing in the old town, bound to the real methods. fix_car is left as
// the caller sets it up.
async function makeGame({ fuel = 'raw' } = {}) {
    const document = new EventTarget();
    const window = new EventTarget();
    const timers = [];   // the cutscene's beat before the map loads: flushed by hand
    const g = {
        state: STATE.IDLE, facing: 'up', carFuel: fuel,
        playerX: 0, playerY: 0, inventory: [], enemies: [], containers: [], examinables: [],
        _tileDiffs: [], _heldDirKeys: [], _physicalHeld: new Set(), _queuedMoveDir: null,
        _animating: false, _animDuration: 1, _TURN_MS: 70, _turnTimer: null, _paused: false,
        _pendingTransition: null, _ratFormTurns: 0, _sewerEscape: null,
        logs: [], timers,
        _log(m) { this.logs.push(m); },
        _render() {}, _onStepSettled() {}, _tryPickup() {}, _stopAutoRepeat() {},
        hasBuff() { return false; },
        _flash() {}, _triggerScreenShake() {}, _zoneChange() {},
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
            if (!this._pendingTransition) return;
            const t = this._pendingTransition;
            this._pendingTransition = null;
            this.state = STATE.RESOLVING;
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
        ['_interactCar', ''], ['_removeFromSlot', 'slot'],
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
    return g;
}

// Back at the car with the converter: fix_car on its last stage, the converter
// in the bag, standing just west of the car facing it.
async function atTheCar(opts) {
    const g = await makeGame(opts);
    g.questEngine.start('fix_car');
    g.questEngine.state.stageIndex = QUESTS.fix_car.stages.findIndex(s => s.id === 'return_to_car');
    g.inventory = [{ itemDef: { id: 'catalytic_converter', name: 'Cataclysmic Converter' }, count: 1 }];
    g.playerX = 23; g.playerY = 7; g.facing = 'right';
    assert.equal(g.map.getTile(24, 7), 19, 'the car is just east');
    return g;
}

// Walk north from the old town's spawn until the map changes or the cutscene
// starts (as canyon-branch.test.js: the street lamp at x 16 is in the way, so
// step one tile west first; a tap toward a new facing only turns you).
async function walkNorth(g) {
    const from = g._mapUrl;
    g.playerX = g.map.spawn.x; g.playerY = g.map.spawn.y; g.facing = 'up';
    await g.press('ArrowLeft'); await g.press('ArrowLeft');
    await g.press('ArrowUp');
    for (let i = 0; i < 30 && g._mapUrl === from && g.state === STATE.IDLE; i++) await g.press('ArrowUp');
}

// The dock's objective line, as the real _drawQuestLog draws it (town face).
const VP = computeViewport({ cssW: 1920, cssH: 1080, dpr: 1, dock: DOCK });
function hudObjective(game) {
    const drawn = [];
    const ctx = new Proxy({ globalAlpha: 1 }, {
        get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })),
        set: (t, k, v) => { t[k] = v; return true; },
    });
    const r = Object.assign(Object.create(Renderer.prototype), {
        ctx, canvas: { width: VP.backingW, height: VP.backingH },
        viewport: VP, sprites: { uiPanel: null },
        font: { drawText: (c, text, x, y, o = {}) => drawn.push({ text, color: o.color }) },
        _fightFace: false, _hudFor: null, _hudFaceFor: null, _hudCache: null,
    });
    r._drawQuestLog({
        map: game.map, _timeOfDay: () => '12:05', questEngine: game.questEngine,
        _logHistory: [], _logStripMessages: [],
    });
    const gold = drawn.filter(d => d.text !== game.map.zoneName && d.text !== '12:05');
    return gold.length ? gold[0].text : null;
}

// The zone boxes the real _drawWorldMapBody rings in red.
const RED = '#e8462f';
function ringedOnMap(game) {
    const rects = [], words = [];
    const ctx = new Proxy({}, {
        get: (t, k) => {
            if (k === 'strokeRect') return (x, y, w, h) => rects.push({ x, y, w, h, stroke: t.strokeStyle });
            return k in t ? t[k] : () => {};
        },
        set: (t, k, v) => { t[k] = v; return true; },
    });
    const r = Object.assign(Object.create(Renderer.prototype), {
        ctx, font: { drawText: (c, text, x, y) => words.push({ text, x, y }) },
    });
    r._drawWorldMapBody(game, { x: 0, y: 0, w: 608, h: 608 }, 40);
    const inside = (b, p) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
    return WORLD_ZONES.filter(z => {
        const label = words.find(w => w.text === z.label);
        return label && rects.some(b => b.stroke === RED && inside(b, label));
    }).map(z => z.zoneName);
}

describe('the between-quests table', () => {
    test('every row names zones on the Map and an objective', () => {
        for (const row of BETWEEN_QUESTS) {
            assert.ok(Array.isArray(row.targetZones) && row.targetZones.length, `${row.id} names no zones`);
            for (const zone of row.targetZones) {
                assert.ok(WORLD_ZONES.some(z => z.zoneName === zone), `${row.id}: '${zone}' has no box on the Map`);
            }
            assert.ok(row.objective && typeof row.when === 'function', row.id);
        }
    });

    test('an active quest\'s own stage always wins over a row', () => {
        const qe = new QuestEngine({});
        qe.state.flags.carFixed = true;
        assert.equal(qe.getHudText(), OBJECTIVE);
        qe.start('canyon_escape');
        assert.equal(qe.getHudText(), QUESTS.canyon_escape.stages[0].objective);
        assert.equal(qe.getTargetZone(), 'CANYON');
    });

    test('a new game, before the car runs, has no row', () => {
        const qe = new QuestEngine({});
        assert.equal(qe.getHudText(), null);
        assert.equal(qe.getTargetZone(), null);
    });
});

describe('after the car runs, the objective points at the bridge', () => {
    test('bumping the car with the converter (real keys) leaves the HUD on the bridge and Town ringed', async () => {
        const g = await atTheCar();
        assert.equal(hudObjective(g), QUESTS.fix_car.stages[3].objective.toUpperCase(), 'before: install the converter');

        await g.press('ArrowRight');
        assert.ok(g.logs.some(m => /converter back into place/.test(m)), `the car took the converter: ${g.logs.join(' | ')}`);
        assert.ok(g.questEngine.isComplete('fix_car'));
        assert.equal(g.questEngine.state.activeId, null, 'no quest is active in the gap');
        assert.equal(g.inventory[0], null, 'the converter left the bag');

        assert.equal(hudObjective(g), OBJECTIVE.toUpperCase());
        assert.deepEqual(ringedOnMap(g), ['TOWN']);
    });

    test('a save made in the gap reloads with the objective showing', async () => {
        const g = await atTheCar();
        await g.press('ArrowRight');
        const saved = JSON.parse(JSON.stringify(g.questEngine.serialize()));

        const reloaded = new QuestEngine({});
        reloaded.restore(saved);
        assert.equal(reloaded.getHudText(), OBJECTIVE);
        assert.equal(reloaded.getTargetZone(), 'TOWN');
    });

    test('the crash hands over to the Canyon quest', async () => {
        const g = await makeGame({ fuel: 'raw' });
        g.questEngine.forceComplete('fix_car');
        assert.equal(hudObjective(g), OBJECTIVE.toUpperCase());

        await walkNorth(g);
        await g.flushCutscene();
        assert.equal(g._mapUrl, 'canyon-map.json');
        assert.equal(g.questEngine.bridgeRoute(), 'canyon');
        assert.equal(hudObjective(g), QUESTS.canyon_escape.stages[0].objective.toUpperCase());
        assert.deepEqual(ringedOnMap(g), ['CANYON']);
    });

    test('the ramp hands over to the delivery quest', async () => {
        const g = await makeGame({ fuel: 'alcohol' });
        g.questEngine.forceComplete('fix_car');

        await walkNorth(g);
        await g.flushCutscene();
        assert.equal(g._mapUrl, 'downtown-map.json');
        assert.equal(g.questEngine.bridgeRoute(), 'ramp');
        assert.equal(hudObjective(g), QUESTS.deliver_burger.stages[0].objective.toUpperCase());
        assert.notEqual(g.questEngine.getHudText(), OBJECTIVE);
    });

    test('once the bridge is crossed, finishing that quest doesn\'t bring the row back', async () => {
        const qe = new QuestEngine({});
        qe.state.flags.carFixed = true;
        qe.state.flags.bridgeRoute = 'canyon';
        assert.equal(qe.getHudText(), null);
        assert.equal(qe.getTargetZone(), null);
    });
});
