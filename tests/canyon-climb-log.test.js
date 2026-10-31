// canyon-climb-log.test.js — cc1: climbing out of the Canyon logs ONE line, not two
// (plans/cc1-canyon-climb-one-line.md).
//
// The climb used to log the exit's own "sink the hook" line and then the canyon_escape
// quest's finishing line over the top of it. Caelan kept the climb's line (ruling CCR1).
//
// main.js touches `document` at import, so, as in canyon-branch.test.js, the real methods
// are lifted out of the source and bound onto a small game object. The climb itself is a
// real key: an ArrowUp keydown and keyup through the real listeners _bindInput registers,
// into the real _beginMoveOrTurn → _doMove → getAnchor → _interactGrapple, whose swing
// queues the Canyon's real exit anchor. The maps and the quest engine are the real ones;
// only the world beat is a stand-in, carrying out the queued transition the way
// _advanceWorldOnce's tail does (it logs the anchor's label, loads the map, fires
// map_entered).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GameMap, carriesAll } from '../game/map.js';
import { QuestEngine } from '../game/quests.js';
import { ITEMS } from '../game/items.js';

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

// A game standing in the Canyon with the climb quest running, bound to the real methods.
async function makeCanyonGame({ hook = true } = {}) {
    const document = new EventTarget();
    const window = new EventTarget();
    const g = {
        state: STATE.IDLE, facing: 'up',
        playerX: 0, playerY: 0, inventory: [], enemies: [], containers: [], examinables: [],
        _tileDiffs: [], _heldDirKeys: [], _physicalHeld: new Set(), _queuedMoveDir: null,
        _animating: false, _animDuration: 1, _TURN_MS: 70, _turnTimer: null, _paused: false,
        _pendingTransition: null, _ratFormTurns: 0, _swinging: false,
        logs: [],
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
        },
        // Stand-in world beat: carries out a queued map change as _advanceWorldOnce's tail does.
        _advanceWorld() {
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
        setTimeout: () => 0,
    };
    for (const [n, p] of [
        ['_bindInput', ''], ['_noteHeld', 'code'], ['_faceOf', 'dir'], ['_clearTurnTimer', ''],
        ['_beginMoveOrTurn', 'dir'], ['_intendedWalkDir', ''], ['_resolveWalkStep', 'dir'],
        ['_animateMove', 'fromX, fromY, toX, toY, callback, duration = this._animDuration'],
        ['_doMove', 'dir'], ['_canEnter', 'x, y'], ['setTile', 'x, y, id'],
        ['_interactGrapple', 'anchor'], ['_startMainQuest2', ''],
    ]) g[n] = liveMethod(n, p, free);
    g.questEngine = new QuestEngine(g);
    g._bindInput();
    g.press = async (code) => {
        document.dispatchEvent(new Key('keydown', code));
        document.dispatchEvent(new Key('keyup', code));
        await settle();
    };
    await g._loadMap('canyon-map.json');
    g.questEngine.start('canyon_escape');
    if (hook) g.inventory.push({ itemDef: ITEMS.grappling_hook, qty: 1 });
    return g;
}

// Stand one tile below the Canyon's exit anchor, facing it.
function standUnderTheClimb(g) {
    const exit = g.map.anchors.find(a => a.toMap === 'downtown-map.json');
    assert.ok(exit, 'the Canyon has a way up to Downtown');
    g.playerX = exit.x;
    g.playerY = exit.y + 1;
    g.facing = 'up';
    return exit;
}

describe('climbing out of the Canyon', () => {
    test('one key press up the rockface logs one "sink the hook" line', async () => {
        const g = await makeCanyonGame();
        const exit = standUnderTheClimb(g);
        const before = g.logs.length;

        await g.press('ArrowUp');

        assert.equal(g._mapUrl, 'downtown-map.json', 'the climb lands you in Downtown');
        const said = g.logs.slice(before);
        assert.equal(said.filter(l => /sink the hook/i.test(l)).length, 1, `one hook line, got: ${JSON.stringify(said)}`);
        assert.ok(said.includes(exit.label), 'the line is the climb\'s own label');
    });

    test('the delivery quest still starts on arrival', async () => {
        const g = await makeCanyonGame();
        standUnderTheClimb(g);
        assert.ok(g.questEngine.isActive('canyon_escape'));

        await g.press('ArrowUp');

        assert.ok(g.questEngine.isComplete('canyon_escape'), 'the escape quest finishes');
        assert.ok(g.questEngine.isActive('deliver_burger'), 'Special Delivery begins');
    });

    test('without the hook the rockface is sheer: no climb, no hook line', async () => {
        const g = await makeCanyonGame({ hook: false });
        const exit = standUnderTheClimb(g);

        await g.press('ArrowUp');

        assert.equal(g._mapUrl, 'canyon-map.json');
        assert.ok(g.questEngine.isActive('canyon_escape'));
        assert.deepEqual(g.logs.filter(l => /sink the hook/i.test(l)), []);
        assert.ok(g.logs.includes(exit.requiresMsg), 'it says why you cannot climb');
    });
});
