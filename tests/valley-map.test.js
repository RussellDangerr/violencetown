// valley-map.test.js — GV2: up from the Canyon into the Valley, and on to the Wilderness
// (plans/gv2-canyon-to-valley.md).
//
// A jutting rock in the Canyon's top right is a hook climb up to the Valley, and the Valley has one
// back down (GV1R1: the way up needs the hook, from either side). The Valley's west wall has a
// door into the Wilderness (GV2R1: the Forest is the Wilderness), and the Wilderness's east fence
// has a door back. Canyon, Valley, Wilderness is one walkable line, and the Map tab joins it.
//
// main.js touches `document` at import, so, as in canyon-climb-log.test.js, the real movement
// methods are lifted out of the source and bound onto a small game object. Every step is a real
// key: a keydown and keyup through the real listeners _bindInput registers, into the real
// _beginMoveOrTurn -> _doMove -> (getAnchor -> _interactGrapple | transition check). The maps are
// the real JSON files. Only the world beat is a stand-in, carrying out a queued transition the way
// _advanceWorldOnce's tail does.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GameMap, carriesAll } from '../game/map.js';
import { Renderer } from '../game/renderer.js';
import { WORLD_ZONES, zoneByName, overworldZone, connectorPairs } from '../game/world-map.js';

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

const readJson = (url) => JSON.parse(readFileSync(fileURLToPath(new URL(`../game/${url}`, import.meta.url)), 'utf8'));
const loadMap = (url) => new GameMap(readJson(url), url);

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

const HOOK = { itemDef: { id: 'grappling_hook' } };

// A game standing on `map` at (x, y), bound to the real movement methods.
async function makeGame({ map = 'canyon-map.json', x = 26, y = 3, inventory = [] } = {}) {
    const document = new EventTarget();
    const window = new EventTarget();
    const g = {
        state: STATE.IDLE, facing: 'up',
        playerX: 0, playerY: 0, inventory, enemies: [], containers: [], examinables: [],
        _tileDiffs: [], _heldDirKeys: [], _physicalHeld: new Set(), _queuedMoveDir: null,
        _animating: false, _animDuration: 1, _TURN_MS: 70, _turnTimer: null, _paused: false,
        _pendingTransition: null, _ratFormTurns: 0, _swinging: false,
        logs: [], loads: [],
        _log(m) { this.logs.push(m); },
        _render() {}, _onStepSettled() {}, _tryPickup() {}, _stopAutoRepeat() {},
        hasBuff() { return false; },
        _zoneChange() {},
        emitGameEvent() {},
        async _loadMap(url, spawnX, spawnY) {
            this.map = loadMap(url);
            this._mapUrl = url;
            this.loads.push(url);
            this.playerX = spawnX ?? this.map.spawn.x;
            this.playerY = spawnY ?? this.map.spawn.y;
            this._tileDiffs = [];
        },
        // Stand-in world beat: carries out a queued map change as _advanceWorldOnce's tail does.
        _advanceWorld() {
            if (!this._pendingTransition) return;
            const t = this._pendingTransition;
            this._pendingTransition = null;
            this._log(t.label || '[Transitioning...]');
            this.state = STATE.RESOLVING;
            this._loadMap(t.toMap, t.toX, t.toY).then(() => { this.state = STATE.IDLE; });
        },
    };
    const free = {
        STATE, DIRS, audio, carriesAll, document, window,
        requestAnimationFrame: (f) => queueMicrotask(() => f(Infinity)),
        performance: { now: () => 0 },
        setTimeout: () => 0,
    };
    for (const [n, p] of [
        ['_bindInput', ''], ['_noteHeld', 'code'], ['_faceOf', 'dir'], ['_clearTurnTimer', ''],
        ['_beginMoveOrTurn', 'dir'], ['_intendedWalkDir', ''], ['_resolveWalkStep', 'dir'],
        ['_animateMove', 'fromX, fromY, toX, toY, callback, duration = this._animDuration'],
        ['_doMove', 'dir'], ['_canEnter', 'x, y'], ['_interactGrapple', 'anchor'],
    ]) g[n] = liveMethod(n, p, free);
    g._bindInput();
    g.press = async (code) => {
        document.dispatchEvent(new Key('keydown', code));
        document.dispatchEvent(new Key('keyup', code));
        await settle();
    };
    await g._loadMap(map, x, y);
    return g;
}

// Press one direction until the map changes (or `max` presses), turning first if need be.
async function walk(g, code, max = 40) {
    const from = g._mapUrl;
    for (let i = 0; i < max && g._mapUrl === from; i++) await g.press(code);
}

// Press one direction until `done(g)` holds (or `max` presses).
async function walkUntil(g, code, done, max = 40) {
    for (let i = 0; i < max && !done(g); i++) await g.press(code);
}

// From the Valley's landing, down to the west door's row, then left through the door.
async function crossValleyToWilderness(g) {
    await walkUntil(g, 'ArrowDown', (q) => q.playerY >= 9);
    assert.equal(g.playerY, 9);
    assert.equal(g._mapUrl, 'valley-map.json');
    await walk(g, 'ArrowLeft');
}

describe('the hook climb from the Canyon up to the Valley', () => {
    test('without the hook the rock refuses with a [TEXT] line, and you stay in the Canyon', async () => {
        const g = await makeGame();
        for (let i = 0; i < 4; i++) await g.press('ArrowUp');   // up to (26, 2), then bump the rock at (26, 1)
        assert.equal(g._mapUrl, 'canyon-map.json');
        assert.deepEqual([g.playerX, g.playerY], [26, 2]);
        assert.ok(g.logs.includes('[TEXT]'), `no refusal line in ${JSON.stringify(g.logs)}`);
        assert.deepEqual(g.loads, ['canyon-map.json']);
    });

    test('with the hook you go up, and land inside the Valley', async () => {
        const g = await makeGame({ inventory: [HOOK] });
        await walk(g, 'ArrowUp');
        assert.equal(g._mapUrl, 'valley-map.json');
        assert.equal(g.state, STATE.IDLE);
        assert.deepEqual([g.playerX, g.playerY], [20, 2]);
        assert.ok(g.map.isWalkable(g.playerX, g.playerY));
    });

    test('and the way back down needs the hook too: refused without it', async () => {
        const g = await makeGame({ map: 'valley-map.json', x: 20, y: 2 });
        for (let i = 0; i < 3; i++) await g.press('ArrowUp');
        assert.equal(g._mapUrl, 'valley-map.json');
        assert.deepEqual([g.playerX, g.playerY], [20, 2]);
        assert.ok(g.logs.includes('[TEXT]'));
        assert.deepEqual(g.loads, ['valley-map.json']);
    });

    test('with the hook you go back down and land beside the rock you climbed', async () => {
        const g = await makeGame({ inventory: [HOOK] });
        await walk(g, 'ArrowUp');
        assert.equal(g._mapUrl, 'valley-map.json');
        await walk(g, 'ArrowUp');
        assert.equal(g._mapUrl, 'canyon-map.json');
        assert.deepEqual([g.playerX, g.playerY], [26, 2]);
        assert.deepEqual(g.loads, ['canyon-map.json', 'valley-map.json', 'canyon-map.json']);
    });

    test('the Canyon\'s other climb, up to Downtown, still works', async () => {
        const g = await makeGame({ x: 15, y: 3, inventory: [HOOK] });
        await walk(g, 'ArrowUp');
        assert.equal(g._mapUrl, 'downtown-map.json');
        assert.deepEqual([g.playerX, g.playerY], [8, 10]);
    });

    test('and the Gorge door in the Canyon\'s left wall still works', async () => {
        const g = await makeGame({ x: 3, y: 4 });
        await walk(g, 'ArrowLeft');
        assert.equal(g._mapUrl, 'gorge-map.json');
    });
});

describe('the Valley\'s far side opens into the Wilderness', () => {
    test('the whole way with real keys: Canyon, up, across the Valley, into the Wilderness, and back', async () => {
        const g = await makeGame({ inventory: [HOOK] });
        await walk(g, 'ArrowUp');
        assert.equal(g._mapUrl, 'valley-map.json');
        await crossValleyToWilderness(g);
        assert.equal(g._mapUrl, 'wilderness-map.json');
        assert.deepEqual([g.playerX, g.playerY], [16, 6], 'just inside the Wilderness\'s east fence');
        assert.ok(g.map.isWalkable(g.playerX, g.playerY));
        await walk(g, 'ArrowRight');
        assert.equal(g._mapUrl, 'valley-map.json', 'walking back returns to the Valley');
        assert.deepEqual([g.playerX, g.playerY], [1, 9], 'beside the door you went out by');
        await walk(g, 'ArrowLeft');
        assert.equal(g._mapUrl, 'wilderness-map.json', 'and out once more');
    });

    test('the Wilderness door needs no hook', async () => {
        const g = await makeGame({ map: 'wilderness-map.json', x: 15, y: 6 });
        await walk(g, 'ArrowRight');
        assert.equal(g._mapUrl, 'valley-map.json');
        for (const m of ['valley-map.json', 'wilderness-map.json']) {
            for (const t of loadMap(m).transitions) assert.equal(t.requires, undefined, `${m} door asks for nothing`);
        }
    });

    test('the Wilderness\'s other doors are untouched: Graveyard to the north, the frozen area to the west', () => {
        const w = loadMap('wilderness-map.json');
        assert.ok(w.transitions.some(t => t.toMap === 'graveyard-map.json'));
        assert.ok(w.transitions.some(t => t.toMap === 'frozen-map.json'));
        assert.ok(w.transitions.filter(t => t.toMap === 'valley-map.json').every(t => t.x === 17));
    });
});

describe('the Valley', () => {
    const raw = readJson('valley-map.json');
    const valley = loadMap('valley-map.json');

    test('is named VALLEY and holds nothing yet', () => {
        assert.equal(raw.zoneName, 'VALLEY');
        for (const k of ['enemies', 'items', 'examinables']) assert.deepEqual(raw[k], [], k);
    });

    test('has two ways out: the hook climb to the Canyon and the door to the Wilderness', () => {
        assert.equal(valley.anchors.length, 1);
        assert.equal(valley.anchors[0].toMap, 'canyon-map.json');
        assert.equal(valley.anchors[0].requires, 'grappling_hook');
        assert.deepEqual(valley.transitions.map(t => t.toMap), ['wilderness-map.json']);
        // Every walkable tile you can reach from the landing, and every edge tile among them:
        // the only open edge tiles are the door's.
        const seen = new Set();
        const todo = [[valley.spawn.x, valley.spawn.y]];
        while (todo.length) {
            const [x, y] = todo.pop();
            const k = `${x},${y}`;
            if (seen.has(k) || !valley.isWalkable(x, y)) continue;
            seen.add(k);
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) todo.push([x + dx, y + dy]);
        }
        assert.ok(seen.size > 100, 'there is real floor to walk on');
        const onEdge = [...seen].map(k => k.split(',').map(Number))
            .filter(([x, y]) => x === 0 || y === 0 || x === valley.width - 1 || y === valley.height - 1);
        assert.ok(onEdge.length >= 1);
        for (const [x, y] of onEdge) assert.ok(valley.getTransition(x, y), `open edge tile (${x}, ${y}) is not a door`);
    });

    test('every landing into and out of it is walkable ground', () => {
        const canyon = loadMap('canyon-map.json'), wild = loadMap('wilderness-map.json');
        const up = canyon.anchors.find(a => a.toMap === 'valley-map.json');
        assert.ok(valley.isWalkable(up.toX, up.toY));
        assert.ok(!canyon.isWalkable(up.x, up.y), 'the rock is something you bump');
        const down = valley.anchors[0];
        assert.ok(canyon.isWalkable(down.toX, down.toY));
        assert.ok(!valley.isWalkable(down.x, down.y), 'the rock is something you bump');
        for (const t of wild.transitions.filter(o => o.toMap === 'valley-map.json')) assert.ok(valley.isWalkable(t.toX, t.toY));
        for (const t of valley.transitions) assert.ok(wild.isWalkable(t.toX, t.toY));
    });
});

// Draw the Map onto a canvas that remembers every outline, every line and every word.
function drawMap(game) {
    const rects = [], words = [], lines = [];
    const state = {};
    const ctx = new Proxy(state, {
        get: (t, k) => {
            if (k === 'strokeRect') return (x, y, w, h) => rects.push({ x, y, w, h });
            if (k === 'moveTo') return (x, y) => { t._from = { x, y }; };
            if (k === 'lineTo') return (x, y) => lines.push({ a: t._from, b: { x, y } });
            return k in t ? t[k] : () => {};
        },
        set: (t, k, v) => { t[k] = v; return true; },
    });
    const r = Object.assign(Object.create(Renderer.prototype), {
        ctx, font: { drawText: (c, text, x, y) => words.push({ text, x, y }) },
    });
    r._drawWorldMapBody(game, { x: 0, y: 0, w: 608, h: 608 }, 40);
    const inside = (b, p) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
    const boxes = {};
    for (const w of words) {
        const b = rects.find(rc => inside(rc, w));
        if (!b) continue;
        const label = words.find(o => inside(b, o) && WORLD_ZONES.some(z => z.label === o.text));
        if (!label) continue;
        const box = (boxes[label.text] ||= { rect: b, words: [] });
        if (w !== label) box.words.push(w.text);
    }
    return { boxes, lines };
}

const joined = (drawn, a, b) => {
    const mid = (z) => ({ x: drawn.boxes[z].rect.x + drawn.boxes[z].rect.w / 2, y: drawn.boxes[z].rect.y + drawn.boxes[z].rect.h / 2 });
    const [p, q] = [mid(a), mid(b)];
    return drawn.lines.some(l => (l.a.x === p.x && l.a.y === p.y && l.b.x === q.x && l.b.y === q.y)
        || (l.a.x === q.x && l.a.y === q.y && l.b.x === p.x && l.b.y === p.y));
};

describe('the Map tab', () => {
    test('the Valley has a box of its own, joined to the Canyon and the Wilderness', () => {
        const z = zoneByName('VALLEY');
        assert.ok(z, 'a VALLEY box');
        assert.equal(WORLD_ZONES.filter(o => o.col === z.col && o.row === z.row).length, 1, 'no box shares its cell');
        const pairs = connectorPairs();
        assert.ok(pairs.some(p => p.includes('VALLEY') && p.includes('CANYON')));
        assert.ok(pairs.some(p => p.includes('VALLEY') && p.includes('WILDERNESS')));
        assert.equal(overworldZone('Valley'), 'VALLEY');
    });

    test('"you are here" is right in the Canyon, the Valley and the Wilderness, all the way along', async () => {
        const g = await makeGame({ inventory: [HOOK] });
        let drawn = drawMap(g);
        assert.equal(Object.keys(drawn.boxes).length, WORLD_ZONES.length, 'every zone box was drawn');
        assert.deepEqual(drawn.boxes.CANYON.words, ['YOU']);
        assert.deepEqual(drawn.boxes.VALLEY.words, []);

        await walk(g, 'ArrowUp');
        assert.equal(g._mapUrl, 'valley-map.json');
        drawn = drawMap(g);
        assert.deepEqual(drawn.boxes.VALLEY.words, ['YOU']);
        assert.deepEqual(drawn.boxes.CANYON.words, []);
        assert.deepEqual(drawn.boxes.WILDERNESS.words, []);
        assert.ok(joined(drawn, 'CANYON', 'VALLEY'), 'a connector joins the Canyon and the Valley');
        assert.ok(joined(drawn, 'VALLEY', 'WILDERNESS'), 'a connector joins the Valley and the Wilderness');

        await crossValleyToWilderness(g);
        assert.equal(g._mapUrl, 'wilderness-map.json');
        drawn = drawMap(g);
        assert.deepEqual(drawn.boxes.WILDERNESS.words, ['YOU']);
        assert.deepEqual(drawn.boxes.VALLEY.words, []);

        await walk(g, 'ArrowRight');
        drawn = drawMap(g);
        assert.deepEqual(drawn.boxes.VALLEY.words, ['YOU']);
    });

    test('the Gorge and every old connection are still on the Map', async () => {
        const g = await makeGame({ x: 3, y: 4 });
        await walk(g, 'ArrowLeft');
        const drawn = drawMap(g);
        assert.deepEqual(drawn.boxes.GORGE.words, ['YOU']);
        assert.ok(joined(drawn, 'CANYON', 'GORGE'));
        assert.ok(joined(drawn, 'GRAVEYARD', 'WILDERNESS'));
        assert.ok(joined(drawn, 'DOWNTOWN', 'CANYON'));
    });
});
