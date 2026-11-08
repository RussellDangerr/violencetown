// map-visited.test.js — MP2: the Map dims the zones you haven't been to
// (plans/mp2-map-dims-unvisited.md).
//
// As in between-quests.test.js, the real main.js methods are lifted out of the source and
// bound onto a small game object; every step is a real key through the listener _bindInput
// registers on `document` (walk east into the Sewer, then M for the Map). _loadMap is a
// stand-in here (the real one is too big to lift), so a source check pins that the real one
// notes the zone it loads. The Map is read from what the real _drawWorldMapBody draws.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GameMap, carriesAll } from '../game/map.js';
import { QuestEngine } from '../game/quests.js';
import { Renderer } from '../game/renderer.js';
import { WORLD_ZONES, overworldZone } from '../game/world-map.js';
import { UI } from '../game/ui-sprites.js';
import { serialize, migrate, loadInto } from '../game/save.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');

function liveMethod(name, params, freeVars = {}) {
    const signature = `${name}(${params}) {`;
    const at = mainSrc.indexOf(signature);
    assert.ok(at > 0, `${name}(${params}) not found in main.js`);
    // A one-line method closes on its own line; a longer one on the first "    }" line.
    const eol = mainSrc.indexOf('\n', at);
    const oneLine = mainSrc.slice(at, eol).trimEnd().endsWith('}');
    const closeAt = oneLine ? eol : mainSrc.indexOf('\n    }', at);
    assert.ok(closeAt > at, `${name} body never closes`);
    const body = mainSrc.slice(at + name.length, oneLine ? eol : closeAt + '\n    }'.length);
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
const DEVICE_TABS = ['items', 'gear', 'quests', 'map', 'rings'];
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

async function makeGame() {
    const document = new EventTarget();
    const window = new EventTarget();
    const g = {
        state: STATE.IDLE, facing: 'right', carFuel: 'raw',
        playerX: 0, playerY: 0, inventory: [], enemies: [], containers: [], examinables: [],
        _tileDiffs: [], _heldDirKeys: [], _physicalHeld: new Set(), _queuedMoveDir: null,
        _animating: false, _animDuration: 1, _TURN_MS: 70, _turnTimer: null, _paused: false,
        _pendingTransition: null, _ratFormTurns: 0, _sewerEscape: null,
        _visitedZones: new Set(), _deviceTab: 'items', _deviceSel: null, _journalScroll: 0,
        logs: [],
        _log(m) { this.logs.push(m); },
        _digitToSlot: () => -1, _render() {}, _onStepSettled() {}, _tryPickup() {}, _stopAutoRepeat() {},
        hasBuff() { return false; },
        _flash() {}, _triggerScreenShake() {}, _zoneChange() {},
        emitGameEvent(type, payload) { this.questEngine.emit(type, payload); },
        async _loadMap(url, spawnX, spawnY) {
            this.map = loadJson(url);
            this._mapUrl = url;
            this._noteZoneVisited?.();
            this.playerX = spawnX ?? this.map.spawn.x;
            this.playerY = spawnY ?? this.map.spawn.y;
            this._tileDiffs = [];
            this.examinables = this.map.examinableSpawns.map(e => ({ ...e }));
        },
        // Stand-in world beat: carries out a queued map change as _advanceWorldOnce's tail does.
        _advanceWorld() {
            if (!this._pendingTransition) return;
            const t = this._pendingTransition;
            this._pendingTransition = null;
            this.state = STATE.RESOLVING;
            this._loadMap(t.toMap, t.toX, t.toY).then(() => { this.state = STATE.IDLE; });
        },
    };
    const free = {
        STATE, DIRS, audio, carriesAll, document, window, DEVICE_TABS,
        overworldZone,
        requestAnimationFrame: (f) => queueMicrotask(() => f(Infinity)),
        performance: { now: () => 0 },
        setTimeout: () => 0,
    };
    for (const [n, p] of [
        ['_bindInput', ''], ['_noteHeld', 'code'], ['_faceOf', 'dir'], ['_clearTurnTimer', ''],
        ['_beginMoveOrTurn', 'dir'], ['_intendedWalkDir', ''], ['_resolveWalkStep', 'dir'],
        ['_animateMove', 'fromX, fromY, toX, toY, callback, duration = this._animDuration'],
        ['_doMove', 'dir'], ['_canEnter', 'x, y'], ['setTile', 'x, y, id'],
        ['_noteZoneVisited', ''], ['_openWorldMap', ''], ['_openDevice', "tab = 'items'"],
    ]) g[n] = liveMethod(n, p, free);
    g.questEngine = new QuestEngine(g);
    g._bindInput();
    g.press = async (code) => {
        document.dispatchEvent(new Key('keydown', code));
        document.dispatchEvent(new Key('keyup', code));
        await settle();
    };
    await g._loadMap('town-map.json');
    return g;
}

// Walk east along the street into the Sewer's door: real arrow keys until the map changes.
async function walkIntoSewer(g) {
    g.playerX = g.map.spawn.x; g.playerY = 12; g.facing = 'right';
    for (let i = 0; i < 40 && g._mapUrl === 'town-map.json'; i++) await g.press('ArrowRight');
    await settle();
}

// What the real _drawWorldMapBody draws for each box: outline colour and label colour.
function drawMap(game) {
    const rects = [], words = [];
    const ctx = new Proxy({}, {
        get: (t, k) => {
            if (k === 'strokeRect') return (x, y, w, h) => rects.push({ x, y, w, h, stroke: t.strokeStyle });
            return k in t ? t[k] : () => {};
        },
        set: (t, k, v) => { t[k] = v; return true; },
    });
    const r = Object.assign(Object.create(Renderer.prototype), {
        ctx, font: { drawText: (c, text, x, y, o = {}) => words.push({ text, x, y, color: o.color }) },
    });
    r._drawWorldMapBody(game, { x: 0, y: 0, w: 608, h: 608 }, 40);
    const inside = (b, p) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
    const out = {};
    for (const z of WORLD_ZONES) {
        const label = words.find(w => w.text === z.label);
        const box = rects.find(b => inside(b, label));
        out[z.zoneName] = { stroke: box.stroke, text: label.color };
    }
    return out;
}
const isDim = (z) => z.stroke === UI.dim && z.text === UI.dim;
const dimmedZones = (game) => Object.entries(drawMap(game)).filter(([, z]) => isDim(z)).map(([n]) => n).sort();
const ALL = WORLD_ZONES.map(z => z.zoneName);

describe('the Map dims the zones you have not been to', () => {
    test('a new game: Town is bright, every other zone dim; the Sewer brightens after walking in (real keys)', async () => {
        const g = await makeGame();
        await g.press('KeyM');
        assert.equal(g.state, STATE.DEVICE);
        assert.equal(g._deviceTab, 'map');
        assert.deepEqual(dimmedZones(g), ALL.filter(n => n !== 'TOWN').sort());
        assert.ok(!isDim(drawMap(g).TOWN), 'Town is bright');

        g.state = STATE.IDLE;   // closing the Remoticon is not under test
        await walkIntoSewer(g);
        assert.equal(g._mapUrl, 'sewer-map.json', 'the street led into the Sewer');
        await g.press('KeyM');
        assert.equal(g._deviceTab, 'map');
        assert.deepEqual([...g._visitedZones].sort(), ['SEWER', 'TOWN']);
        assert.deepEqual(dimmedZones(g), ALL.filter(n => n !== 'TOWN' && n !== 'SEWER').sort());
        assert.ok(!isDim(drawMap(g).SEWER), 'the Sewer is bright');
    });

    test('a zone the quest points at keeps its red ring and its label while unvisited', async () => {
        const g = await makeGame();
        g.questEngine.forceComplete?.('fix_car');
        g.questEngine.start('canyon_escape');
        const canyon = drawMap(g).CANYON;
        assert.equal(canyon.stroke, '#e8462f');
        assert.notEqual(canyon.text, UI.dim);
    });

    test('an old record of null dims nothing', async () => {
        const g = await makeGame();
        g._visitedZones = null;
        assert.deepEqual(dimmedZones(g), []);
    });

    test('an interior counts for its parent zone', async () => {
        const g = await makeGame();
        await g._loadMap('borgir-map.json');
        assert.deepEqual([...g._visitedZones].sort(), ['TOWN']);
    });
});

describe('the record is kept', () => {
    // A fake game with just what save.js reads and writes.
    const blank = () => ({
        logs: [], map: null, turn: 0, playerX: 0, playerY: 0, equipment: {}, inventory: [],
        tempEquips: [], buffs: [], groundItems: [], containers: [], enemies: [], _tileDiffs: [],
        rng: { getState: () => 0, setState() {} },
        questEngine: new QuestEngine({}),
        _log() {}, _render() {},
        _resolveItemDef: () => null,
        async _loadMap(url) { this.map = { url, width: 40, height: 40, zoneName: 'TOWN', isInBounds: () => true }; },
        setTile() {},
    });

    test('visited zones survive serialize, JSON and loadInto', async () => {
        const src = blank();
        src.map = { url: 'town-map.json', width: 40, height: 40 };
        src._visitedZones = new Set(['TOWN', 'SEWER']);
        const blob = JSON.parse(JSON.stringify(serialize(src)));
        assert.deepEqual(blob.world.visitedZones, ['SEWER', 'TOWN']);

        const dst = blank();
        await loadInto(dst, migrate(blob));
        assert.deepEqual([...dst._visitedZones].sort(), ['SEWER', 'TOWN']);
    });

    test('an old save with no record loads as null, and every zone then draws bright', async () => {
        const src = blank();
        src.map = { url: 'town-map.json', width: 40, height: 40 };
        src._visitedZones = new Set(['TOWN']);
        const blob = JSON.parse(JSON.stringify(serialize(src)));
        delete blob.world.visitedZones;

        const dst = blank();
        await loadInto(dst, migrate(blob));
        assert.equal(dst._visitedZones, null);
        assert.equal(serialize(dst).world.visitedZones, undefined, 'a null record is not written back');
        const g = await makeGame();
        g._visitedZones = dst._visitedZones;
        assert.deepEqual(dimmedZones(g), []);
    });

    test('malformed records are dropped, not trusted', () => {
        for (const bad of ['SEWER', { a: 1 }, 7]) {
            const blob = JSON.parse(JSON.stringify(serialize(Object.assign(blank(), { map: { url: 'town-map.json' } }))));
            blob.world.visitedZones = bad;
            assert.equal(migrate(blob).world.visitedZones, undefined);
        }
    });
});

describe('the real code notes and resets the record', () => {
    test('_loadMap notes the zone it loads', () => {
        const at = mainSrc.indexOf('async _loadMap(url, spawnX, spawnY) {');
        const body = mainSrc.slice(at, mainSrc.indexOf('\n    }', at));
        assert.match(body, /this\._noteZoneVisited\?\.\(\)/);
    });

    test('a new Game and RESTART both start from an empty record', () => {
        const ctor = mainSrc.indexOf('constructor() {');
        assert.match(mainSrc.slice(ctor, mainSrc.indexOf('\n    }', ctor)), /this\._visitedZones = new Set\(\)/);
        const reset = mainSrc.indexOf('_fullReset({ seed } = {}) {');
        assert.match(mainSrc.slice(reset, mainSrc.indexOf('\n    }', reset)), /this\._visitedZones = new Set\(\)/);
    });
});
