// examine-touch.test.js — EX2: on touch, a long-press on a prop (tree, grave, sign) offers
// Examine (plans/ex2-examine-props-on-touch.md).
//
// Drives the REAL game: its own pointer listeners (_bindCanvasTap) on a stand-in canvas, fed
// pointerdown / pointerup events with pointerType 'touch'. Only _render, _log and the audio
// are stubbed. The result is read from what the game did: its state, its log and its inspect
// panel, compared with resolveExamine, the ladder the E key uses.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { setMaxListeners } from 'node:events';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const { Game } = await import('../game/main.js');
const { resolveExamine, propNameAt } = await import('../game/examine.js');
const { computeViewport } = await import('../game/viewport.js');
const { DOCK, hudLayout } = await import('../game/layout.js');
const { TILE_PX } = await import('../game/data.js');

globalThis.window = new EventTarget();
setMaxListeners(200, globalThis.window);

const VP = computeViewport({ cssW: 375, cssH: 812, dpr: 1, dock: DOCK });
const PX = 20, PY = 20;
const TREE = { x: PX + 3, y: PY, type: 'tree1' };
const NEAR_TREE = { x: PX + 1, y: PY, type: 'tree1' };
const SIGN = { x: PX, y: PY + 3, type: 'unknownProp' };   // a prop with no plain name: not examinable by touch
const wait = (ms) => new Promise(r => setTimeout(r, ms));

function makeCanvas() {
    const handlers = {};
    return {
        addEventListener(type, fn) { (handlers[type] ||= []).push(fn); },
        getBoundingClientRect: () => ({ left: 0, top: 0, width: VP.cssW, height: VP.cssH }),
        fire(type, init = {}) {
            const e = { type, button: 0, clientX: 0, clientY: 0, pointerType: 'touch',
                        currentTarget: this, preventDefault() {}, ...init };
            for (const fn of handlers[type] || []) fn(e);
            return e;
        },
    };
}
const client = (pt) => ({ clientX: pt.x * (VP.cssW / VP.w), clientY: pt.y * (VP.cssH / VP.h) });
const tilePt = (tx, ty) => ({ x: VP.origin.x + (tx - PX) * TILE_PX + TILE_PX / 2, y: VP.origin.y + (ty - PY) * TILE_PX + TILE_PX / 2 });

function makeGame(props) {
    const g = new Game();
    const canvas = makeCanvas();
    const blocked = new Set(props.map(p => `${p.x},${p.y}`));
    Object.assign(g, {
        state: 'idle', playerX: PX, playerY: PY, playerHp: 100, playerMaxHp: 100, playerMp: 100, gold: 0,
        enemies: [], groundItems: [], containers: [], examinables: [], inventory: [], facing: 'down',
        equipment: {},
        renderer: { _menuPanelRect: null, _closeBtnRect: null, _view: () => VP, _hud: () => hudLayout(VP) },
        map: { getTile: () => 0, isWalkable: (x, y) => !blocked.has(`${x},${y}`), isInBounds: () => true, propSpawns: props },
    });
    g._animating = false;
    g.logs = [];
    g._hud = () => hudLayout(VP);
    g._render = () => {};
    g._log = (m) => { g.logs.push(m); };
    g._skipLootReel = () => {};
    g._maybeShowHint = () => {};
    g._ensureParticleLoop = () => {};
    g._advanceWorld = () => {};
    g.walks = [];
    g._walkPath = (path) => { g.walks.push(path); };
    g._bindCanvasTap(canvas);
    g.canvas = canvas;
    g.touch = (tx, ty) => canvas.fire('pointerdown', client(tilePt(tx, ty)));
    g.lift = (tx, ty) => canvas.fire('pointerup', client(tilePt(tx, ty)));
    return g;
}

const LONG = 520;

describe('EX2: a long-press on a prop offers Examine', () => {
    test('the list holds Examine (and Cancel), and choosing it gives E\'s panel and log line', async () => {
        const g = makeGame([TREE]);
        g.touch(TREE.x, TREE.y);
        await wait(LONG);
        assert.equal(g.state, 'target_list');
        assert.deepEqual(g.targetList.verbs.map(v => v.key), ['examine', 'cancel']);
        g.lift(TREE.x, TREE.y);
        g._fireTargetVerb(g.targetList.verbs[0]);
        const want = resolveExamine(g, TREE.x, TREE.y);
        assert.equal(want.title, 'Tree');
        assert.deepEqual(g.logs, [want.body]);
        assert.equal(g.state, 'inspect');
        assert.equal(g.inspect.title, want.title);
        assert.equal(g.inspect.body, want.panelBody.replace(/[\[\]]/g, '').trim());
    });

    test('a quick tap on a prop opens nothing and walks you to the nearest tile you can reach (TW2)', async () => {
        const g = makeGame([TREE]);
        g.touch(TREE.x, TREE.y);
        g.lift(TREE.x, TREE.y);
        await wait(LONG);
        assert.equal(g.state, 'idle');
        assert.equal(g.walks.length, 1);
        // The tree is 3 tiles east; the tile beside it on your side is the nearest, and the closest to you.
        assert.deepEqual(g.walks[0].at(-1), { x: TREE.x - 1, y: TREE.y });
    });

    test('a long-press on bare ground opens nothing', async () => {
        const g = makeGame([TREE]);
        g.touch(PX, PY + 4);
        await wait(LONG);
        assert.equal(g.state, 'idle');
    });

    test('a prop with no plain name has nothing to offer', async () => {
        assert.equal(propNameAt(makeGame([SIGN]), SIGN.x, SIGN.y), null);
        const g = makeGame([SIGN]);
        g.touch(SIGN.x, SIGN.y);
        await wait(LONG);
        assert.equal(g.state, 'idle');
    });

    test('a quick tap on bare ground still walks, and a long-press on it still opens nothing', async () => {
        const g = makeGame([TREE]);
        g.touch(PX, PY + 4);
        g.lift(PX, PY + 4);
        assert.equal(g.walks.length, 1);
    });

    test('a prop beside you: the long-press turns to face it and offers Examine', async () => {
        const g = makeGame([NEAR_TREE]);
        g.touch(NEAR_TREE.x, NEAR_TREE.y);
        await wait(LONG);
        assert.equal(g.facing, 'right');
        assert.equal(g.state, 'target_list');
        assert.deepEqual(g.targetList.verbs.map(v => v.key), ['examine', 'cancel']);
    });

    test('bare ground beside you: the long-press still only turns, no list', async () => {
        const g = makeGame([NEAR_TREE]);
        g.touch(PX - 1, PY);
        await wait(LONG);
        assert.equal(g.facing, 'left');
        assert.equal(g.state, 'idle');
    });

    test('a quick tap on bare ground beside you still steps', async () => {
        const g = makeGame([NEAR_TREE]);
        g.touch(PX - 1, PY);
        g.lift(PX - 1, PY);
        assert.equal(g.walks.length, 1);
    });

    test('the F key and a bare tap do not treat a prop as a target', () => {
        const g = makeGame([TREE]);
        assert.equal(g._targetAt(TREE.x, TREE.y), null);
        g.facing = 'right'; g.playerX = TREE.x - 1;
        assert.equal(g._openTargetListFaced(), false);
    });
});
