// examine-bare-floor.test.js — FX42: E on bare ground logs one line and opens no
// panel (plans/fx42-bare-floor-one-line.md).
//
// As in taxi-at-bridge.test.js, the real main.js methods are lifted out of the
// source and bound onto a small game object, and every E is a real keydown
// through the listener _bindInput registers.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GameMap, carriesAll } from '../game/map.js';
import { QuestEngine } from '../game/quests.js';
import { getDialogue } from '../game/dialogue.js';
import { defaultVerb } from '../game/wheel-model.js';
import { doExamine, resolveExamine } from '../game/examine.js';
import { findPath } from '../game/pathing.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');
const townJson = JSON.parse(readFileSync(fileURLToPath(new URL('../game/town-map.json', import.meta.url)), 'utf8'));

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

function makeGame() {
    const document = new EventTarget();
    const window = new EventTarget();
    const map = new GameMap(townJson, 'town-map.json');
    const g = {
        state: STATE.IDLE, facing: 'up', map,
        playerX: map.spawn.x, playerY: map.spawn.y,
        inventory: [], enemies: [], containers: [], examinables: [], groundItems: [],
        _tileDiffs: [], _heldDirKeys: [], _physicalHeld: new Set(), _queuedMoveDir: null,
        _animating: false, _animDuration: 1, _TURN_MS: 70, _turnTimer: null, _paused: false,
        _pendingTransition: null, _ratFormTurns: 0, _sewerEscape: null,
        logs: [], panels: [],
        _log(m) { this.logs.push(m); },
        _render() {}, _onStepSettled() {}, _tryPickup() {}, _stopAutoRepeat() {}, _advanceWorld() {},
        _openInspect(d) { this.panels.push(d); },
        _resumeHeldWalk() {}, _digitToSlot: () => -1, renderer: {},
        hasBuff() { return false; },
        _flash() {}, _triggerScreenShake() {}, _zoneChange() {},
        emitGameEvent(type, payload) { this.questEngine.emit(type, payload); },
    };
    const free = {
        STATE, DIRS, audio, carriesAll, document, window, defaultVerb, doExamine, resolveExamine, findPath, getDialogue,
        requestAnimationFrame: (f) => queueMicrotask(() => f(Infinity)),
        performance: { now: () => 0 },
        setTimeout: () => 0,
    };
    for (const [n, p] of [
        ['_bindInput', ''], ['_noteHeld', 'code'], ['_faceOf', 'dir'], ['_clearTurnTimer', ''],
        ['_beginMoveOrTurn', 'dir'], ['_intendedWalkDir', ''], ['_resolveWalkStep', 'dir'],
        ['_canEnter', 'x, y'], ['_targetAt', 'x, y'], ['_actOnTarget', 'verb, t'], ['_fireResolver', 'verb, t'],
    ]) g[n] = liveMethod(n, p, free);
    g.questEngine = new QuestEngine(g);
    g._bindInput();
    g.pressE = async () => {
        document.dispatchEvent(new Key('keydown', 'KeyE'));
        document.dispatchEvent(new Key('keyup', 'KeyE'));
        await settle();
    };
    return g;
}

// A spot on the town map whose faced tile is plain ground: nothing on it, no
// prop, nothing authored, and the tile resolves as the bare rung of the ladder.
function standOnBareGround(g) {
    const { width, height } = g.map;
    for (let y = 2; y < height - 2; y++) for (let x = 2; x < width - 2; x++) {
        g.playerX = x; g.playerY = y; g.facing = 'up';
        const res = resolveExamine(g, x, y - 1);
        const nearProp = (g.map.propSpawns || []).some(p => Math.abs(p.x - x) <= 1 && Math.abs(p.y - y) <= 2);
        if (res.bare && !nearProp) return { x, y: y - 1, line: res.body };
    }
    assert.fail('no bare ground found on the town map');
}

describe('E on bare ground (FX42)', () => {
    test('logs the tile line and opens no panel', async () => {
        const g = makeGame();
        const at = standOnBareGround(g);
        assert.match(at.line, /^\[.+\.\]$/, 'the line is the existing tile-name text');
        await g.pressE();
        assert.deepEqual(g.logs, [at.line]);
        assert.deepEqual(g.panels, []);
    });

    test('off the map is bare too: one line, no panel', async () => {
        const g = makeGame();
        g.playerX = 0; g.playerY = 0; g.facing = 'up';
        await g.pressE();
        assert.deepEqual(g.logs, ['[Nothing here worth examining.]']);
        assert.deepEqual(g.panels, []);
    });

    test('bare ground with a quest hint appended still opens the panel', async () => {
        const g = makeGame();
        const at = standOnBareGround(g);
        g.examinables = [{ id: 'car', x: at.x + 6, y: at.y, text: '[TEXT]' }];
        g.questEngine.start('fix_car');
        g.logs.length = 0;                       // starting the quest logs its own line
        await g.pressE();
        assert.equal(g.logs.length, 1);
        assert.match(g.logs[0], /walk over and try E/);
        assert.equal(g.panels.length, 1);
    });
});

describe('E on anything else behaves as today (FX42)', () => {
    test('an authored examinable logs its text and opens its panel', async () => {
        const g = makeGame();
        const at = standOnBareGround(g);
        g.examinables = [{ id: 'sign', x: at.x, y: at.y, text: '[TEXT]' }];
        await g.pressE();
        assert.deepEqual(g.logs, ['[TEXT]']);
        assert.equal(g.panels.length, 1);
        assert.equal(g.panels[0].body, '[TEXT]');
    });

    test('a named prop logs its line and opens its panel', async () => {
        const g = makeGame();
        const at = standOnBareGround(g);
        g.map.propSpawns = [{ type: 'gravestoneWideArch', x: at.x, y: at.y }];
        await g.pressE();
        assert.deepEqual(g.logs, ['[Gravestone.]']);
        assert.equal(g.panels.length, 1);
    });
});
