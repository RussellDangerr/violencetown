// title-space-modal.test.js — FX72: Space on the title waits while the help or Options window is open.
// Lifts the real _bindSplash from main.js and drives its Space listener through a fake document.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { hasSave, readSaveRaw, loadInto } from '../game/save.js';

const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');

function liveMethod(name, params, freeVars) {
    const at = mainSrc.indexOf(`${name}(${params}) {`);
    assert.ok(at > 0, `${name} not found`);
    const closeAt = mainSrc.indexOf('\n    }', at);
    const body = mainSrc.slice(at + name.length, closeAt + '\n    }'.length);
    const names = Object.keys(freeVars);
    return new Function(...names, `'use strict'; return function ${body}`)(...names.map(n => freeVars[n]));
}
const stateSrc = /\nconst STATE\s*=\s*/.exec(mainSrc);
const STATE = new Function(`'use strict'; return ${mainSrc.slice(stateSrc.index + stateSrc[0].length, mainSrc.indexOf('\n};', stateSrc.index) + 2)}`)();

function element(id, classes = []) {
    const el = new EventTarget();
    const cls = new Set(classes);
    el.id = id;
    el.classList = { add: c => cls.add(c), remove: c => cls.delete(c), contains: c => cls.has(c) };
    return el;
}
class Key extends Event {
    constructor(code) {
        super('keydown', { bubbles: true, cancelable: true });
        this.code = code; this.key = ' ';
        this.ctrlKey = this.metaKey = this.altKey = this.shiftKey = false;
    }
}

function setup(open = []) {
    const els = {
        'splash': element('splash'),
        'game-wrapper': element('game-wrapper', ['hidden']),
        'splash-go': element('splash-go'),
        'splash-continue': element('splash-continue', ['hidden']),
        'options-modal': element('options-modal', open.includes('options-modal') ? [] : ['hidden']),
        'help-modal': element('help-modal', open.includes('help-modal') ? [] : ['hidden']),
    };
    const document = new EventTarget();
    document.getElementById = id => els[id] ?? null;
    const g = {
        state: STATE.SPLASH, newRuns: 0,
        _applyAudioSettings() {}, _fitCanvas() {}, _render() {}, _log() {},
        _maybeShowFirstRunHint() {}, _startMainQuest() { this.newRuns++; },
    };
    const audio = { init() {}, playMusic() {}, playSfx() {} };
    g._bindSplash = liveMethod('_bindSplash', '', { document, window: new EventTarget(), audio, STATE, hasSave, readSaveRaw, loadInto });
    g._bindSplash();
    return { document, g, els };
}

beforeEach(() => {
    const store = new Map();
    globalThis.localStorage = {
        getItem: k => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => { store.set(k, String(v)); },
        removeItem: k => { store.delete(k); },
        clear: () => store.clear(),
    };
});

describe('FX72 title Space with a window open', () => {
    for (const id of ['help-modal', 'options-modal']) {
        test(`${id} open: Space leaves the title as it is`, () => {
            const { document, g, els } = setup([id]);
            const ev = new Key('Space');
            document.dispatchEvent(ev);
            assert.equal(g.state, STATE.SPLASH);
            assert.equal(g.newRuns, 0);
            assert.equal(els.splash.classList.contains('gone'), false);
            assert.equal(ev.defaultPrevented, false);
        });
    }

    test('no window open: Space still starts a run', () => {
        const { document, g, els } = setup();
        const ev = new Key('Space');
        document.dispatchEvent(ev);
        assert.equal(ev.defaultPrevented, true);
        assert.equal(els.splash.classList.contains('gone'), true);
        assert.equal(g.newRuns, 1);
    });
});
