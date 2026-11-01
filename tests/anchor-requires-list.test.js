// anchor-requires-list.test.js — fx32: a grapple anchor can ask for a LIST of items
// (plans/fx32-anchor-requires-list.md), the way the bank's vault door does.
//
// `requires` on an anchor used to be compared as a single id, so a list never matched. Now a
// list means "carry all of them"; a single id is unchanged.
//
// main.js touches `document` at import, so, as in canyon-climb-log.test.js, the real methods
// are lifted out of the source and bound onto a small game object. The climb is a real key:
// an ArrowUp keydown and keyup through the real listeners _bindInput registers, into the real
// _beginMoveOrTurn → _doMove → getAnchor → _interactGrapple. The map is the Canyon's real one;
// only its exit anchor's `requires` is rewritten per test. The world beat is a stand-in that
// carries out the queued transition.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GameMap, carriesAll } from '../game/map.js';
import { ITEMS } from '../game/items.js';

const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');

function liveMethod(name, params, freeVars = {}) {
    const at = mainSrc.indexOf(`${name}(${params}) {`);
    assert.ok(at > 0, `${name}(${params}) not found in main.js`);
    const closeAt = mainSrc.indexOf('\n    }', at);
    assert.ok(closeAt > at, `${name} body never closes`);
    const body = mainSrc.slice(at + name.length, closeAt + '\n    }'.length);
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
const carry = (...ids) => ids.map(id => ({ itemDef: ITEMS[id], qty: 1 }));

const GATE_MSG = '[Not enough to hold on with.]';   // test-only text

// A game standing in the Canyon; the exit anchor asks for `requires`; the bag holds `bag`.
async function makeGame({ requires, bag }) {
    const document = new EventTarget();
    const window = new EventTarget();
    const g = {
        state: STATE.IDLE, facing: 'up',
        playerX: 0, playerY: 0, inventory: bag, enemies: [], containers: [], examinables: [],
        _tileDiffs: [], _heldDirKeys: [], _physicalHeld: new Set(), _queuedMoveDir: null,
        _animating: false, _animDuration: 1, _TURN_MS: 70, _turnTimer: null, _paused: false,
        _pendingTransition: null, _ratFormTurns: 0, _swinging: false,
        logs: [], worldBeats: 0,
        _log(m) { this.logs.push(m); },
        _render() {}, _onStepSettled() {}, _tryPickup() {}, _stopAutoRepeat() {},
        hasBuff() { return false; },
        _flash() {}, _triggerScreenShake() {}, _zoneChange() {},
        emitGameEvent() {},
        _loadMap(url) {
            this.map = loadJson(url);
            this._mapUrl = url;
        },
        _advanceWorld() {
            this.worldBeats++;
            if (!this._pendingTransition) return;
            const t = this._pendingTransition;
            this._pendingTransition = null;
            this._log(t.label || '[Transitioning...]');
            this._loadMap(t.toMap);
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
        ['_doMove', 'dir'], ['_canEnter', 'x, y'], ['setTile', 'x, y, id'],
        ['_interactGrapple', 'anchor'],
    ]) g[n] = liveMethod(n, p, free);
    g._bindInput();
    g.press = async (code) => {
        document.dispatchEvent(new Key('keydown', code));
        document.dispatchEvent(new Key('keyup', code));
        await settle();
    };
    g._loadMap('canyon-map.json');
    const exit = g.map.anchors.find(a => a.toMap === 'downtown-map.json');
    assert.ok(exit, 'the Canyon has a way up to Downtown');
    exit.requires = requires;
    exit.requiresMsg = GATE_MSG;
    g.playerX = exit.x;
    g.playerY = exit.y + 1;      // one tile under the anchor, facing it
    g.exit = exit;
    return g;
}

describe('a grapple anchor whose requires is a list', () => {
    test('with every item in the bag, bumping it climbs out', async () => {
        const g = await makeGame({ requires: ['grappling_hook', 'rock'], bag: carry('grappling_hook', 'rock') });
        await g.press('ArrowUp');
        assert.equal(g._mapUrl, 'downtown-map.json');
        assert.ok(g.logs.includes(g.exit.label), 'the climb logs its own line');
        assert.ok(!g.logs.includes(GATE_MSG));
    });

    test('with only some of them it is sheer rock: its message, no swing, no turn', async () => {
        const g = await makeGame({ requires: ['grappling_hook', 'rock'], bag: carry('grappling_hook') });
        const spot = [g.playerX, g.playerY];
        await g.press('ArrowUp');
        assert.equal(g._mapUrl, 'canyon-map.json');
        assert.deepEqual(g.logs.filter(l => l === GATE_MSG), [GATE_MSG]);
        assert.deepEqual([g.playerX, g.playerY], spot, 'you did not move');
        assert.equal(g._swinging, false);
        assert.equal(g._pendingTransition, null);
        assert.equal(g.worldBeats, 0, 'a refused swing costs no turn');
    });

    test('the order of the list or the bag does not matter', async () => {
        const g = await makeGame({ requires: ['rock', 'grappling_hook'], bag: carry('grappling_hook', 'rock') });
        await g.press('ArrowUp');
        assert.equal(g._mapUrl, 'downtown-map.json');
    });

    test('with an empty bag it is sheer rock', async () => {
        const g = await makeGame({ requires: ['grappling_hook', 'rock'], bag: [] });
        await g.press('ArrowUp');
        assert.equal(g._mapUrl, 'canyon-map.json');
        assert.ok(g.logs.includes(GATE_MSG));
    });
});

describe('a grapple anchor whose requires is a single id (as before)', () => {
    test('with the item it climbs out', async () => {
        const g = await makeGame({ requires: 'grappling_hook', bag: carry('grappling_hook') });
        await g.press('ArrowUp');
        assert.equal(g._mapUrl, 'downtown-map.json');
    });

    test('without it, it is sheer rock', async () => {
        const g = await makeGame({ requires: 'grappling_hook', bag: carry('rock') });
        await g.press('ArrowUp');
        assert.equal(g._mapUrl, 'canyon-map.json');
        assert.ok(g.logs.includes(GATE_MSG));
        assert.equal(g.worldBeats, 0);
    });

    test('with no requires at all it is open', async () => {
        const g = await makeGame({ requires: undefined, bag: [] });
        await g.press('ArrowUp');
        assert.equal(g._mapUrl, 'downtown-map.json');
    });
});
