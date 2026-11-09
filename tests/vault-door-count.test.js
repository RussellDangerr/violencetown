// vault-door-count.test.js — vd1: the bank's locked vault door logs how many of its three
// items you carry. Real keys, real _doMove, the bank's real map.
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

const DOOR_ITEMS = ['act2_item_a', 'act2_item_b', 'act2_item_c'];

async function makeGame(bag) {
    const document = new EventTarget();
    const window = new EventTarget();
    const g = {
        state: STATE.IDLE, facing: 'up',
        playerX: 0, playerY: 0, inventory: bag, enemies: [], containers: [], examinables: [],
        _tileDiffs: [], _heldDirKeys: [], _physicalHeld: new Set(), _queuedMoveDir: null,
        _animating: false, _animDuration: 1, _TURN_MS: 70, _turnTimer: null, _paused: false,
        _pendingTransition: null, _ratFormTurns: 0, _swinging: false,
        logs: [],
        _log(m) { this.logs.push(m); },
        _render() {}, _onStepSettled() {}, _tryPickup() {}, _stopAutoRepeat() {},
        hasBuff() { return false; },
        _flash() {}, _triggerScreenShake() {}, _zoneChange() {},
        emitGameEvent() {},
        _advanceWorld() {},
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
    ]) g[n] = liveMethod(n, p, free);
    g._bindInput();
    g.press = async (code) => {
        document.dispatchEvent(new Key('keydown', code));
        document.dispatchEvent(new Key('keyup', code));
        await settle();
    };
    g.map = loadJson('bank-map.json');
    const door = g.map.transitions.find(t => t.toMap === 'vault-map.json');
    assert.ok(door, 'the bank has a vault door');
    assert.deepEqual(door.requires, DOOR_ITEMS);
    g.playerX = door.x;
    g.playerY = door.y + 1;
    g.door = door;
    return g;
}

describe('the bank vault door', () => {
    for (const n of [0, 1, 2]) {
        test(`holding ${n} of 3 it refuses and says (${n}/3)`, async () => {
            const g = await makeGame(carry(...DOOR_ITEMS.slice(0, n)));
            await g.press('ArrowUp');
            assert.equal(g._pendingTransition, null);
            assert.deepEqual(g.logs, [`${g.door.requiresMsg} (${n}/3)`]);
        });
    }

    test('which items you hold decides the count, not their order', async () => {
        const g = await makeGame(carry('act2_item_c'));
        await g.press('ArrowUp');
        assert.deepEqual(g.logs, [`${g.door.requiresMsg} (1/3)`]);
    });

    test('with all three it opens, with no count logged', async () => {
        const g = await makeGame(carry(...DOOR_ITEMS));
        await g.press('ArrowUp');
        assert.equal(g._pendingTransition, g.door);
        assert.deepEqual(g.logs, []);
    });

    test('the locked door still shows no exit marker (FIN1b)', () => {
        assert.ok(!/arrow|marker/i.test(JSON.stringify(Object.keys(loadJson('bank-map.json').transitions.find(t => t.toMap === 'vault-map.json')))));
    });
});
