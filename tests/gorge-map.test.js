// gorge-map.test.js — GV1: walk left out of the Canyon, down into the Gorge
// (plans/gv1-canyon-to-gorge.md).
//
// The Canyon's left wall has one door into the Gorge, open at any time (GV1R1): no hook needed.
// The Gorge is empty and its one way out is the door back, which lands you beside the door you
// left by. The Map tab shows a Gorge box joined to the Canyon, with "YOU" on it while you stand
// there.
//
// main.js touches `document` at import, so, as in canyon-branch.test.js, the real movement methods
// are lifted out of the source and bound onto a small game object. Every step is a real key: a
// keydown and keyup through the real listeners _bindInput registers, into the real
// _beginMoveOrTurn -> _doMove -> transition check. The maps are the real JSON files. Only the
// world beat is a stand-in, carrying out a queued transition the way _advanceWorldOnce's tail does.

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

// A game standing in the Canyon at (x, y), bound to the real movement methods.
async function makeGame({ x = 3, y = 4, inventory = [] } = {}) {
    const document = new EventTarget();
    const window = new EventTarget();
    const g = {
        state: STATE.IDLE, facing: 'left',
        playerX: 0, playerY: 0, inventory, enemies: [], containers: [], examinables: [],
        _tileDiffs: [], _heldDirKeys: [], _physicalHeld: new Set(), _queuedMoveDir: null,
        _animating: false, _animDuration: 1, _TURN_MS: 70, _turnTimer: null, _paused: false,
        _pendingTransition: null, _ratFormTurns: 0,
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
        ['_doMove', 'dir'], ['_canEnter', 'x, y'],
    ]) g[n] = liveMethod(n, p, free);
    g._bindInput();
    g.press = async (code) => {
        document.dispatchEvent(new Key('keydown', code));
        document.dispatchEvent(new Key('keyup', code));
        await settle();
    };
    await g._loadMap('canyon-map.json', x, y);
    return g;
}

// Press one direction until the map changes (or `max` presses), turning first if need be.
async function walk(g, code, max = 40) {
    const from = g._mapUrl;
    for (let i = 0; i < max && g._mapUrl === from; i++) await g.press(code);
}

describe('the Canyon\'s left wall has a door into the Gorge', () => {
    for (const [what, inventory] of [['without the hook', []], ['with the hook', [HOOK]]]) {
        test(`walking left along the door's row lands in the Gorge, ${what}`, async () => {
            const g = await makeGame({ inventory });
            await walk(g, 'ArrowLeft');
            assert.equal(g._mapUrl, 'gorge-map.json');
            assert.equal(g.state, STATE.IDLE);
            assert.deepEqual([g.playerX, g.playerY], [22, 9], 'you land just inside the Gorge\'s door');
            assert.ok(g.map.isWalkable(g.playerX, g.playerY));
        });

        test(`walking back lands where you left, ${what}`, async () => {
            const g = await makeGame({ inventory });
            await walk(g, 'ArrowLeft');
            assert.equal(g._mapUrl, 'gorge-map.json');
            await walk(g, 'ArrowRight');
            assert.equal(g._mapUrl, 'canyon-map.json');
            assert.deepEqual([g.playerX, g.playerY], [1, 4], 'beside the door you went out by');
            assert.deepEqual(g.loads, ['canyon-map.json', 'gorge-map.json', 'canyon-map.json']);
        });
    }

    test('the whole trip again and again: out, across the Gorge\'s floor, and back', async () => {
        const g = await makeGame();
        for (let i = 0; i < 2; i++) {
            await walk(g, 'ArrowLeft');
            assert.equal(g._mapUrl, 'gorge-map.json');
            await g.press('ArrowLeft'); await g.press('ArrowLeft');   // a few steps in, still in the Gorge
            assert.equal(g._mapUrl, 'gorge-map.json');
            await walk(g, 'ArrowRight');
            assert.equal(g._mapUrl, 'canyon-map.json');
            assert.deepEqual([g.playerX, g.playerY], [1, 4]);
        }
        await walk(g, 'ArrowLeft');
        assert.equal(g._mapUrl, 'gorge-map.json', 'and out once more');
    });

    test('the door is open: no item asked of you, and the Canyon\'s hook climb is untouched', () => {
        const canyon = loadMap('canyon-map.json');
        const door = canyon.transitions.filter(t => t.toMap === 'gorge-map.json');
        assert.ok(door.length >= 1, 'the Canyon has a door to the Gorge');
        for (const t of door) {
            assert.equal(t.requires, undefined, 'the Gorge door asks for nothing');
            assert.equal(t.x, 0, 'it is in the left wall');
        }
        assert.equal(canyon.transitions.length, door.length, 'the only door in the Canyon is the Gorge\'s');
        assert.ok(canyon.anchors.some(a => a.requires === 'grappling_hook' && a.toMap === 'downtown-map.json'));
    });
});

describe('the Gorge', () => {
    const gorge = loadMap('gorge-map.json');

    test('is named GORGE and holds nothing yet', () => {
        assert.equal(readJson('gorge-map.json').zoneName, 'GORGE');
        for (const k of ['enemies', 'items', 'examinables', 'props']) assert.deepEqual(readJson('gorge-map.json')[k], [], k);
    });

    test('has no way out but the door back to the Canyon', () => {
        assert.deepEqual(gorge.anchors, [], 'no grapple anchors');
        assert.ok(gorge.transitions.length >= 1);
        assert.ok(gorge.transitions.every(t => t.toMap === 'canyon-map.json' && t.requires === undefined));
        // Every walkable tile you can reach from the landing, and every edge tile among them:
        // the only open edge tiles are the door's.
        const seen = new Set();
        const todo = [[gorge.spawn.x, gorge.spawn.y]];
        while (todo.length) {
            const [x, y] = todo.pop();
            const k = `${x},${y}`;
            if (seen.has(k) || !gorge.isWalkable(x, y)) continue;
            seen.add(k);
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) todo.push([x + dx, y + dy]);
        }
        assert.ok(seen.size > 40, 'there is real floor to walk on');
        const onEdge = [...seen].map(k => k.split(',').map(Number))
            .filter(([x, y]) => x === 0 || y === 0 || x === gorge.width - 1 || y === gorge.height - 1);
        for (const [x, y] of onEdge) assert.ok(gorge.getTransition(x, y), `open edge tile (${x}, ${y}) is not a door`);
        assert.ok(onEdge.length >= 1);
    });

    test('the door back lands on walkable Canyon ground, next to the door out', () => {
        const canyon = loadMap('canyon-map.json');
        for (const t of gorge.transitions) {
            assert.ok(canyon.isWalkable(t.toX, t.toY));
            assert.ok(canyon.getTransition(t.toX - 1, t.toY), 'the tile beside the landing is the Canyon\'s door');
        }
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

describe('the Map tab', () => {
    test('the Gorge has a box of its own, joined to the Canyon', () => {
        const z = zoneByName('GORGE');
        assert.ok(z, 'a GORGE box');
        assert.equal(WORLD_ZONES.filter(o => o.col === z.col && o.row === z.row).length, 1, 'no box shares its cell');
        assert.ok(connectorPairs().some(p => p.includes('GORGE') && p.includes('CANYON')));
        assert.equal(overworldZone('Gorge'), 'GORGE');
    });

    test('standing in the Gorge, its box says YOU; the line runs from the Canyon\'s box to it', async () => {
        const g = await makeGame();
        await walk(g, 'ArrowLeft');
        assert.equal(g._mapUrl, 'gorge-map.json');
        const { boxes, lines } = drawMap(g);
        assert.equal(Object.keys(boxes).length, WORLD_ZONES.length, 'every zone box was drawn');
        assert.deepEqual(boxes.GORGE.words, ['YOU']);
        assert.deepEqual(boxes.CANYON.words, []);
        const mid = (b) => ({ x: b.rect.x + b.rect.w / 2, y: b.rect.y + b.rect.h / 2 });
        const [a, b] = [mid(boxes.CANYON), mid(boxes.GORGE)];
        assert.ok(lines.some(l => (l.a.x === a.x && l.a.y === a.y && l.b.x === b.x && l.b.y === b.y)
            || (l.a.x === b.x && l.a.y === b.y && l.b.x === a.x && l.b.y === a.y)), 'a connector joins the two boxes');
    });

    test('back in the Canyon, YOU moves to the Canyon\'s box', async () => {
        const g = await makeGame();
        await walk(g, 'ArrowLeft');
        await walk(g, 'ArrowRight');
        const { boxes } = drawMap(g);
        assert.deepEqual(boxes.CANYON.words, ['YOU']);
        assert.deepEqual(boxes.GORGE.words, []);
    });
});
