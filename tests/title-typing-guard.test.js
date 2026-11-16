// title-typing-guard.test.js — FX65: typing on the title is not a game input.
// Harness copied from title-space.test.js (FX23): Space on the title continues your save, and the
// key that leaves the title never reaches the game.
//
// Two bugs, both reproduced in headless Chrome before this was written:
//   - with a save on disk, Space started a NEW game (gold 0, turn 0, empty bag),
//     and the new run's first autosave would then overwrite the old save;
//   - the same Space carried on to the game's own keydown listener, which by
//     then saw IDLE and opened the action wheel.
//
// main.js touches `document` at import, so, as in device-keys.test.js, the real
// _bindSplash and _bindInput are lifted out of the source and bound onto a small
// game object. They register on a real EventTarget standing in for `document`,
// in the order the game registers them, and the tests dispatch key events
// through it: nothing here calls start() or continueGame() directly. The save
// is written and read by the real game/save.js against an in-memory
// localStorage.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { writeSave, readSaveRaw, hasSave, loadInto } from '../game/save.js';

const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');

function liveMethod(name, params, freeVars) {
    const signature = `${name}(${params}) {`;
    const at = mainSrc.indexOf(signature);
    assert.ok(at > 0, `${name}(${params}) not found in main.js`);
    const closeAt = mainSrc.indexOf('\n    }', at);
    assert.ok(closeAt > at, `${name} body never closes`);
    const body = mainSrc.slice(at + name.length, closeAt + '\n    }'.length);
    const names = Object.keys(freeVars);
    const factory = new Function(...names, `'use strict'; return function ${body}`);
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
const SAVE_KEY = 'violencetown.save';

// ── The page: document, window and the splash's elements ─────────────────────

function element(id, classes = []) {
    const el = new EventTarget();
    const cls = new Set(classes);
    el.id = id;
    el.classList = { add: c => cls.add(c), remove: c => cls.delete(c), contains: c => cls.has(c) };
    el.click = () => el.dispatchEvent(new Event('click'));
    return el;
}

// A keyboard event as the game reads it. Node has no KeyboardEvent; an Event
// carrying the same fields goes through the same EventTarget dispatch, so
// preventDefault and stopImmediatePropagation behave as in a browser.
class Key extends Event {
    constructor(type, code, { repeat = false } = {}) {
        super(type, { bubbles: true, cancelable: true });
        this.code = code;
        this.key = code === 'Space' ? ' ' : code;
        this.repeat = repeat;
        this.ctrlKey = false; this.metaKey = false; this.altKey = false; this.shiftKey = false;
    }
}

function makePage() {
    const els = {
        'splash': element('splash'),
        'game-wrapper': element('game-wrapper', ['hidden']),
        'splash-go': element('splash-go'),
        'splash-continue': element('splash-continue', ['hidden']),
    };
    const document = new EventTarget();
    document.getElementById = id => els[id] ?? null;
    const window = new EventTarget();
    return { document, window, els };
}

function installStorage() {
    const store = new Map();
    globalThis.localStorage = {
        getItem: k => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => { store.set(k, String(v)); },
        removeItem: k => { store.delete(k); },
        clear: () => store.clear(),
    };
}

// ── The game ─────────────────────────────────────────────────────────────────

const ITEM_DEFS = { rock: { id: 'rock' }, soap: { id: 'soap' } };

function fakeMap(url) {
    return {
        url, width: 20, height: 15,
        isInBounds: (x, y) => x >= 0 && y >= 0 && x < 20 && y < 15,
    };
}

// The fields save.js reads and writes, the methods the splash's start() calls,
// and the ones _bindInput's Space path reaches. _wheelOpenerDown is a spy: the
// tests assert it is never reached by the key that leaves the title.
function makeGame(page) {
    const g = {
        state: STATE.SPLASH,
        map: fakeMap('town-map.json'),
        turn: 0, rng: null, _dayClock: 0,
        playerX: 1, playerY: 1, playerHp: 20, playerMaxHp: 20, playerMp: 10, playerMaxMp: 10,
        facing: 'down', gold: 0,
        equipment: { weapon: null, top: null, bottom: null, front: null, back: null, sides: null },
        tempEquips: [], buffs: [], inventory: [], selectedSlot: -1,
        groundItems: [], containers: [], enemies: [], _tileDiffs: [], _pendingTransition: null,
        questEngine: null, _sewerEscape: null,
        _physicalHeld: new Set(), _heldDirKeys: [], _animating: false, _paused: false,
        newRuns: 0, wheelOpens: 0, logs: [], hints: 0,
        _applyAudioSettings() {}, _fitCanvas() {}, _render() {},
        _log(m) { this.logs.push(m); },
        _maybeShowFirstRunHint() { this.hints++; },
        _startMainQuest() { this.newRuns++; },
        _resolveItemDef(id) { return id ? (ITEM_DEFS[id] || null) : null; },
        async _loadMap(url, x, y) {
            await Promise.resolve();
            this.map = fakeMap(url);
            this.playerX = x; this.playerY = y;
        },
        setTile() {},
        _closeCurrentMenu() { return false; },
        _digitToSlot() { return -1; },
        _canRepeatLast() { return false; },
        _wheelOpenerDown() { this.wheelOpens++; this.state = STATE.RADIAL_MENU; },
        _wheelOpenerUp() {},
    };
    const audio = { init() {}, playMusic() {}, playSfx() {} };
    const free = {
        document: page.document, window: page.window, audio, STATE, DIRS,
        hasSave, readSaveRaw, loadInto,
    };
    g._bindSplash = liveMethod('_bindSplash', '', free);
    g._bindInput = liveMethod('_bindInput', '', free);
    // The order the game binds them in (main.js init).
    g._bindSplash();
    g._bindInput();
    return g;
}

// A save with something in it to prove: 77 gold, turn 42, three rocks.
function stageSave() {
    const src = makeGame(makePage());
    src.state = STATE.IDLE;
    src.gold = 77;
    src.turn = 42;
    src.playerX = 7; src.playerY = 9;
    src.inventory = [{ itemDef: ITEM_DEFS.rock, count: 3 }, null, { itemDef: ITEM_DEFS.soap, count: 1 }];
    assert.equal(writeSave(src), true, 'the staged save was written');
    assert.equal(hasSave(), true);
}

function press(page, code, opts) {
    const down = new Key('keydown', code, opts);
    page.document.dispatchEvent(down);
    page.document.dispatchEvent(new Key('keyup', code, opts));
    return down;
}

// Let an async load (loadInto awaits _loadMap) finish.
async function settle() {
    for (let i = 0; i < 20; i++) await new Promise(r => setImmediate(r));
}

const bag = g => g.inventory.map(s => (s ? `${s.itemDef.id}x${s.count}` : null));

beforeEach(() => { installStorage(); });


const withTarget = (page, tag, code = 'Space') => {
    const ev = new Key('keydown', code);
    Object.defineProperty(ev, 'target', { value: { tagName: tag }, configurable: true });
    page.document.dispatchEvent(ev);
    return ev;
};

describe('FX65 typing on the title', () => {
    for (const tag of ['INPUT', 'TEXTAREA', 'BUTTON']) {
        test(`Space in a focused ${tag} does not start the game or get swallowed`, async () => {
            const page = makePage();
            const g = makeGame(page);
            const ev = withTarget(page, tag);
            await settle();
            assert.equal(g.state, STATE.SPLASH);
            assert.equal(g.newRuns, 0);
            assert.equal(ev.defaultPrevented, false, 'the box still types / the button still presses');
        });
    }

    test('Space with nothing focused still starts the game', async () => {
        const page = makePage();
        const g = makeGame(page);
        const ev = withTarget(page, 'BODY');
        await settle();
        assert.equal(ev.defaultPrevented, true);
        assert.equal(g.state, STATE.IDLE);
    });

    test('the intro skip ignores keys typed into a text box, not the page', () => {
        const page = makePage();
        let ended = 0;
        const g = {
            renderer: { renderSplash() {} }, _endTvIntro: null,
        };
        const free = {
            document: { getElementById: id => (id === 'splash' ? Object.assign(new EventTarget(), { classList: { contains: () => false } }) : { style: {} }) },
            window: page.window, Settings: { get: () => false }, performance: { now: () => 0 },
            requestAnimationFrame: () => 1, cancelAnimationFrame() {},
            introAt: () => ({ done: false }), isSkipKey: () => true,
        };
        const start = liveMethod('_startTvIntro', 'splashCanvas', free);
        start.call(g, {});
        const typed = new Key('keydown', 'KeyA');
        Object.defineProperty(typed, 'target', { value: { tagName: 'INPUT' } });
        page.window.dispatchEvent(typed);
        assert.equal(typed.defaultPrevented, false);
        const bare = new Key('keydown', 'KeyA');
        Object.defineProperty(bare, 'target', { value: { tagName: 'BODY' } });
        page.window.dispatchEvent(bare);
        assert.equal(bare.defaultPrevented, true, 'a key on the page skips the intro');
    });
});
