// hint-strip.test.js — FX12: the first-run controls hint steps aside while a
// menu is open and comes back when the menu closes.
//
// The hint is a page element (#first-run-hint) drawn over the canvas, so
// nothing stopped it covering a menu's frame and footer. main.js touches
// `document` at import, so — as in device-keys.test.js — the real methods are
// lifted out of the source and bound onto a small game object, with a fake
// element, document and clock.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');
const cssSrc = readFileSync(fileURLToPath(new URL('../game/style.css', import.meta.url)), 'utf8');

// The real STATE table, read from main.js so a renamed state fails here.
const STATE = (() => {
    const m = mainSrc.match(/\nconst STATE = (\{[\s\S]*?\n\});/);
    assert.ok(m, 'STATE table not found in main.js');
    return new Function(`return ${m[1]};`)();
})();

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

function fakeClassList(initial) {
    const set = new Set(initial);
    return {
        set,
        add: (c) => set.add(c),
        remove: (c) => set.delete(c),
        contains: (c) => set.has(c),
        toggle: (c, on) => { if (on) set.add(c); else set.delete(c); return on; },
    };
}

// A world with one #first-run-hint, a document that records capture listeners,
// a Settings store and a hand-cranked clock.
function makeWorld({ seen = false } = {}) {
    const el = { classList: fakeClassList(['hidden']) };
    const listeners = { keydown: new Set(), pointerdown: new Set() };
    const document = {
        getElementById: (id) => (id === 'first-run-hint' ? el : null),
        addEventListener: (type, fn) => listeners[type].add(fn),
        removeEventListener: (type, fn) => listeners[type].delete(fn),
    };
    const store = { firstRunHintSeen: seen };
    const Settings = { get: (k) => store[k], set: (k, v) => { store[k] = v; } };
    const clock = { now: 0, timers: new Map(), nextId: 1 };
    const setTimeout = (fn, ms) => { const id = clock.nextId++; clock.timers.set(id, { fn, at: clock.now + ms }); return id; };
    const clearTimeout = (id) => { clock.timers.delete(id); };
    const advance = (ms) => {
        clock.now += ms;
        for (const [id, t] of [...clock.timers]) if (t.at <= clock.now) { clock.timers.delete(id); t.fn(); }
    };
    const free = { document, Settings, STATE, setTimeout, clearTimeout };
    const game = { state: STATE.IDLE, _paused: false };
    game._maybeShowFirstRunHint = liveMethod('_maybeShowFirstRunHint', '', free);
    game._firstRunHintAside = liveMethod('_firstRunHintAside', '', free);
    game._syncFirstRunHint = liveMethod('_syncFirstRunHint', '', free);
    const input = (type) => { for (const fn of [...listeners[type]]) fn({}); };
    const shown = () => !el.classList.contains('hidden') && !el.classList.contains('aside');
    return { game, el, store, listeners, advance, input, shown };
}

// What a menu opening or closing does in the game: the state moves, then _render.
function setState(w, state) { w.game.state = state; w.game._syncFirstRunHint(); }

const MENUS = ['RADIAL_MENU', 'TARGET_LIST', 'ITEM_OVERLAY', 'ITEM_THROW_DIR', 'LOG_MODAL',
    'TRADE', 'DIALOGUE', 'INSPECT', 'DEVICE', 'DEAD'];

describe('FX12: the first-run hint steps aside for menus', () => {
    test('every menu state exists in the real STATE table', () => {
        for (const m of MENUS) assert.ok(STATE[m], `STATE.${m} missing`);
    });

    test('shown on a first run in the world, never again', () => {
        const w = makeWorld();
        w.game._maybeShowFirstRunHint();
        assert.equal(w.shown(), true);
        assert.equal(w.store.firstRunHintSeen, true);
        const again = makeWorld({ seen: true });
        again.game._maybeShowFirstRunHint();
        assert.equal(again.shown(), false);
    });

    for (const m of MENUS) {
        test(`hidden while ${m} is open, back when it closes`, () => {
            const w = makeWorld();
            w.game._maybeShowFirstRunHint();
            setState(w, STATE[m]);
            assert.equal(w.shown(), false, `hint still drawn over ${m}`);
            setState(w, STATE.IDLE);
            assert.equal(w.shown(), true, `hint did not return after ${m} closed`);
        });
    }

    test('the pause overlay counts as a menu', () => {
        const w = makeWorld();
        w.game._maybeShowFirstRunHint();
        w.game._paused = true; w.game._syncFirstRunHint();
        assert.equal(w.shown(), false);
        w.game._paused = false; w.game._syncFirstRunHint();
        assert.equal(w.shown(), true);
    });

    test('a menu already open when the hint first appears hides it at once', () => {
        // The Space that starts a fresh game also opens the wheel.
        const w = makeWorld();
        w.game.state = STATE.RADIAL_MENU;
        w.game._maybeShowFirstRunHint();
        assert.equal(w.shown(), false);
        assert.equal(w.el.classList.contains('aside'), true);
        setState(w, STATE.IDLE);
        assert.equal(w.shown(), true);
    });

    test('non-menu states leave it on screen', () => {
        for (const s of ['IDLE', 'RESOLVING', 'ITEM_SELECTED']) {
            const w = makeWorld();
            w.game._maybeShowFirstRunHint();
            setState(w, STATE[s]);
            assert.equal(w.shown(), true, `hidden in ${s}`);
        }
    });

    test('the first input while it is shown dismisses it for good', () => {
        for (const type of ['keydown', 'pointerdown']) {
            const w = makeWorld();
            w.game._maybeShowFirstRunHint();
            w.input(type);
            assert.equal(w.shown(), false);
            assert.equal(w.listeners.keydown.size + w.listeners.pointerdown.size, 0, 'listeners left behind');
            setState(w, STATE.DEVICE); setState(w, STATE.IDLE);
            assert.equal(w.shown(), false, 'a dismissed hint came back');
        }
    });

    test('input while it is aside does not dismiss it', () => {
        // The Esc that closes the wheel lands while the hint is aside.
        const w = makeWorld();
        w.game.state = STATE.RADIAL_MENU;
        w.game._maybeShowFirstRunHint();
        w.input('keydown');
        w.input('pointerdown');
        setState(w, STATE.IDLE);
        assert.equal(w.shown(), true);
    });

    test('its 6s clock runs only while it is shown', () => {
        const w = makeWorld();
        w.game._maybeShowFirstRunHint();
        w.advance(4000);
        setState(w, STATE.DEVICE);
        w.advance(60000);
        assert.equal(w.el.classList.contains('hidden'), false, 'timed out while aside');
        setState(w, STATE.IDLE);
        w.advance(5999);
        assert.equal(w.shown(), true);
        w.advance(1);
        assert.equal(w.shown(), false);
        assert.equal(w.listeners.keydown.size + w.listeners.pointerdown.size, 0);
    });

    test('_render and _setPaused both sync the hint', () => {
        const body = (sig) => { const at = mainSrc.indexOf(sig); return mainSrc.slice(at, mainSrc.indexOf('\n    }', at)); };
        assert.match(body('    _render() {'), /this\._syncFirstRunHint\(\)/);
        assert.match(body('    _setPaused(paused) {'), /this\._syncFirstRunHint\(\)/);
    });

    test('the stylesheet hides an aside hint', () => {
        assert.match(cssSrc, /#first-run-hint\.aside\s*\{\s*display:\s*none;?\s*\}/);
    });
});
