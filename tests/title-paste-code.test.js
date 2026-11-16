// title-paste-code.test.js — TP1: a save code can be pasted from the title screen.
//
// As in title-space.test.js, the real _bindSplash is lifted out of main.js and bound
// onto a small game object; the tests click the real handlers through a stand-in
// document and read the real game/save.js against an in-memory localStorage.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
    writeSave, readSaveRaw, hasSave, loadInto, encodeSaveCode, importSaveCode, decodeSaveCode, CODE_REFUSALS,
} from '../game/save.js';

const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');

function liveMethod(name, params, freeVars) {
    const signature = `${name}(${params}) {`;
    const at = mainSrc.indexOf(signature);
    assert.ok(at > 0, `${name}(${params}) not found in main.js`);
    const closeAt = mainSrc.indexOf('\n    }', at);
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
const RESTART_LINE = 'Restart from the beginning? This erases your current save.';

function element(id, classes = []) {
    const el = new EventTarget();
    const cls = new Set(classes);
    el.id = id; el.value = ''; el.textContent = ''; el.focused = false;
    el.classList = { add: c => cls.add(c), remove: c => cls.delete(c), contains: c => cls.has(c) };
    el.setAttribute = () => {};
    el.focus = () => { el.focused = true; };
    el.click = () => el.dispatchEvent(new Event('click'));
    return el;
}

function makePage() {
    const els = {};
    for (const [id, cls] of [
        ['splash', []], ['game-wrapper', ['hidden']], ['splash-go', []], ['splash-continue', ['hidden']],
        ['splash-paste', []], ['splash-paste-panel', ['hidden']], ['splash-code', []],
        ['splash-code-go', []], ['splash-code-status', []],
    ]) els[id] = element(id, cls);
    const document = new EventTarget();
    document.getElementById = id => els[id] ?? null;
    return { document, window: new EventTarget(), els };
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

const ITEM_DEFS = { rock: { id: 'rock' } };
const fakeMap = url => ({ url, width: 20, height: 15, isInBounds: (x, y) => x >= 0 && y >= 0 && x < 20 && y < 15 });

function makeGame(page, asked = []) {
    const g = {
        state: STATE.SPLASH, map: fakeMap('town-map.json'),
        turn: 0, rng: null, _dayClock: 0,
        playerX: 1, playerY: 1, playerHp: 20, playerMaxHp: 20, playerMp: 10, playerMaxMp: 10,
        facing: 'down', gold: 0,
        equipment: { weapon: null, top: null, bottom: null, front: null, back: null, sides: null },
        tempEquips: [], buffs: [], inventory: [], selectedSlot: -1,
        groundItems: [], containers: [], enemies: [], _tileDiffs: [], _pendingTransition: null,
        questEngine: null, _sewerEscape: null,
        logs: [], fits: 0,
        _applyAudioSettings() {}, _fitCanvas() { this.fits++; }, _render() {},
        _log(m) { this.logs.push(m); }, _maybeShowFirstRunHint() {}, _startMainQuest() {},
        _resolveItemDef(id) { return id ? (ITEM_DEFS[id] || null) : null; },
        async _loadMap(url, x, y) { await Promise.resolve(); this.map = fakeMap(url); this.playerX = x; this.playerY = y; },
        setTile() {},
    };
    const audio = { init() {}, playMusic() {}, playSfx() {} };
    globalThis.confirm = (m) => { asked.push(m); return g._answer !== false; };
    g._bindSplash = liveMethod('_bindSplash', '', {
        document: page.document, window: page.window, audio, STATE,
        hasSave, readSaveRaw, loadInto, writeSave, importSaveCode, decodeSaveCode, CODE_REFUSALS,
    });
    g._bindSplash();
    return g;
}

function stageCode(gold, turn) {
    const src = makeGame(makePage());
    src.state = STATE.IDLE; src.gold = gold; src.turn = turn;
    src.inventory = [{ itemDef: ITEM_DEFS.rock, count: 3 }];
    return encodeSaveCode(src);
}

async function settle() { for (let i = 0; i < 20; i++) await new Promise(r => setImmediate(r)); }

async function submit(page, text) {
    page.els['splash-code'].value = text;
    page.els['splash-code-go'].click();
    await settle();
}

beforeEach(() => { installStorage(); });

describe('the title paste box', () => {
    test('the paste button opens the box and focuses it', () => {
        const page = makePage(); makeGame(page);
        assert.equal(page.els['splash-paste-panel'].classList.contains('hidden'), true);
        page.els['splash-paste'].click();
        assert.equal(page.els['splash-paste-panel'].classList.contains('hidden'), false);
        assert.equal(page.els['splash-code'].focused, true);
    });

    test('a valid code with no save loads, writes the save and enters the game', async () => {
        const code = stageCode(77, 42);
        installStorage();
        const asked = [];
        const page = makePage(); const g = makeGame(page, asked);
        await submit(page, code);
        assert.deepEqual(asked, [], 'no save on disk: nothing to confirm');
        assert.equal(g.state, STATE.IDLE);
        assert.equal(g.gold, 77); assert.equal(g.turn, 42);
        assert.equal(g.inventory[0].count, 3);
        assert.equal(hasSave(), true, 'written like the Options paste');
        assert.equal(readSaveRaw().player.gold, 77);
        assert.equal(page.els['splash'].classList.contains('gone'), true);
        assert.equal(page.els['game-wrapper'].classList.contains('hidden'), false);
        assert.equal(g.fits, 1);
    });

    test('with a save on disk it asks with RESTART\'s line, and Cancel changes nothing', async () => {
        const code = stageCode(77, 42);
        installStorage();
        const old = makeGame(makePage()); old.state = STATE.IDLE; old.gold = 5; writeSave(old);
        const asked = [];
        const page = makePage(); const g = makeGame(page, asked);
        g._answer = false;
        await submit(page, code);
        assert.deepEqual(asked, [RESTART_LINE]);
        assert.equal(readSaveRaw().player.gold, 5, 'the save is untouched');
        assert.equal(g.state, STATE.SPLASH);
        assert.equal(page.els['splash'].classList.contains('gone'), false);
        assert.ok(mainSrc.includes(`confirm('${RESTART_LINE}')`), 'the line is the one main.js already uses');
    });

    test('with a save on disk, OK replaces it', async () => {
        const code = stageCode(77, 42);
        installStorage();
        const old = makeGame(makePage()); old.state = STATE.IDLE; old.gold = 5; writeSave(old);
        const page = makePage(); const g = makeGame(page);
        await submit(page, code);
        assert.equal(readSaveRaw().player.gold, 77);
        assert.equal(g.state, STATE.IDLE);
    });

    test('a code that will not read stays on the title with a status line and the save untouched', async () => {
        installStorage();
        const old = makeGame(makePage()); old.state = STATE.IDLE; old.gold = 5; writeSave(old);
        const asked = [];
        const page = makePage(); const g = makeGame(page, asked);
        await submit(page, 'not a code');
        assert.equal(page.els['splash-code-status'].textContent, CODE_REFUSALS.format);
        assert.deepEqual(asked, [], 'a bad code is refused before it asks anything');
        assert.equal(readSaveRaw().player.gold, 5);
        assert.equal(g.state, STATE.SPLASH);
        assert.equal(page.els['splash'].classList.contains('gone'), false);

        const code = stageCode(1, 1);
        installStorage(); writeSave(old);
        await submit(page, code.slice(0, -3) + 'AAA');
        assert.equal(page.els['splash-code-status'].textContent, CODE_REFUSALS.garbled);
        assert.equal(readSaveRaw().player.gold, 5);
    });

    test('a code that reads but will not open leaves the title and the save', async () => {
        const code = stageCode(77, 42);
        installStorage();
        const old = makeGame(makePage()); old.state = STATE.IDLE; old.gold = 5; writeSave(old);
        const page = makePage(); const g = makeGame(page);
        g._loadMap = async () => { throw new Error('boom'); };
        const warn = console.warn, err = console.error; console.warn = () => {}; console.error = () => {};
        try { await submit(page, code); } finally { console.warn = warn; console.error = err; }
        assert.equal(page.els['splash-code-status'].textContent, CODE_REFUSALS.load);
        assert.equal(readSaveRaw().player.gold, 5);
        assert.equal(g.state, STATE.SPLASH);
        assert.equal(page.els['splash'].classList.contains('gone'), false);
    });

    test('Space in the box is not the title\'s (FX65 still holds)', () => {
        const page = makePage(); const g = makeGame(page);
        const e = new Event('keydown', { bubbles: true, cancelable: true });
        e.code = 'Space';
        Object.defineProperty(e, 'target', { value: { tagName: 'TEXTAREA' } });
        page.document.dispatchEvent(e);
        assert.equal(e.defaultPrevented, false);
        assert.equal(g.state, STATE.SPLASH);
    });
});
