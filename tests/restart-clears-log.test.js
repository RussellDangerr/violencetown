// restart-clears-log.test.js — RESTART starts a clean log and fresh hint pacing.
//
// Drives the real ☰ sheet handler (_bindMenuSheet) with confirm accepting, which
// calls the real _fullReset; _log and _maybeShowHint are the real methods too.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { combatLines } from '../game/combat-log.js';
import { unnestBrackets } from '../game/enemies.js';

const mainSrc = readFileSync(new URL('../game/main.js', import.meta.url), 'utf8');

function liveMethod(signature, freeVars = {}, { async = false } = {}) {
    const at = mainSrc.indexOf(signature, mainSrc.indexOf('class Game {'));
    assert.ok(at > 0, `${signature} not found in main.js`);
    const body = mainSrc.slice(at + signature.indexOf('('), mainSrc.indexOf('\n    }', at) + '\n    }'.length);
    const names = Object.keys(freeVars);
    return new Function(...names, `'use strict'; return ${async ? 'async ' : ''}function ${body}`)(...names.map(n => freeVars[n]));
}

// A hint store the test controls; hintsSeen must survive RESTART.
const seenStore = new Set();
const HINTS = [{ id: 'h1', text: '[HINT ONE]' }, { id: 'h2', text: '[HINT TWO]' }];
const nextHint = (_g, isSeen) => HINTS.find(h => !isSeen(h.id)) || null;

const log = liveMethod("_log(msg, category = 'system') {", { unnestBrackets });
const maybeShowHint = liveMethod('_maybeShowHint() {', {
    HINT_COOLDOWN_TURNS: 8,
    readSeenHints: () => new Set(seenStore),
    writeSeenHints: (s) => { seenStore.clear(); for (const id of s) seenStore.add(id); },
    nextHint,
});
const fullReset = liveMethod('_fullReset({ seed } = {}) {', {
    STATE: { IDLE: 'idle' }, PLAYER_MAX_HP: 10, PLAYER_MAX_MP: 10, WEAPONS: { wooden_sword: {} },
    INVENTORY_SIZE: 4, RNG: class {}, QuestEngine: class {}, clearSave: () => {},
    randomSeed: () => 1, pickSlots: () => ({}),
}, { async: true });
const bindMenuSheet = liveMethod('_bindMenuSheet() {', { STATE: { IDLE: 'idle' } });

function fakeDom() {
    const restartBtn = {
        dataset: { action: 'restart' }, handler: null,
        addEventListener(ev, fn) { if (ev === 'click') this.handler = fn; },
    };
    const els = {
        'menu-btn': { addEventListener() {} },
        'menu-sheet': { classList: { add() {}, remove() {}, contains: () => true }, querySelectorAll: () => [restartBtn] },
        'menu-sheet-backdrop': { addEventListener() {} },
    };
    return { restartBtn, document: { getElementById: (id) => els[id], addEventListener() {} } };
}

function newGame() {
    return {
        _logStripMessages: [], _STRIP_MAX: 3, _logHistory: [], _LOG_HISTORY_MAX: 300, _logModalScroll: 0,
        turn: 0, state: 'idle',
        _log: log, _maybeShowHint: maybeShowHint, _fullReset: fullReset, _bindMenuSheet: bindMenuSheet,
        _closeOffer() {}, _refreshGrantedSkills() {}, _startMainQuest() {},
        async _loadMap() { this.loaded = true; },
    };
}

async function restartViaMenu(g, accept = true) {
    const dom = fakeDom();
    globalThis.document = dom.document;
    globalThis.confirm = () => accept;
    g._bindMenuSheet();
    dom.restartBtn.handler();
    await new Promise(r => setImmediate(r));
}

describe('RESTART clears the log and the hint pacing', () => {
    test('history, strip, combat feed and scroll hold only the new game', async () => {
        const g = newGame();
        for (let i = 0; i < 5; i++) g._log(`[OLD ${i}]`, i % 2 ? 'combat' : 'system');
        g._log('[OLD FIGHT]', 'combat');
        g._logModalScroll = 12;
        assert.ok(combatLines(g._logHistory).length > 0, 'fixture has combat lines');
        assert.ok(g._logStripMessages.length > 0);

        await restartViaMenu(g);

        assert.deepEqual(g._logHistory.map(m => m.text), ['[New game]']);
        assert.deepEqual(g._logStripMessages.map(m => m.text), ['[New game]']);
        assert.deepEqual(combatLines(g._logHistory), []);
        assert.equal(g._logModalScroll, 0);
    });

    test('a declined confirm leaves the run alone', async () => {
        const g = newGame();
        g._log('[OLD]');
        await restartViaMenu(g, false);
        assert.deepEqual(g._logHistory.map(m => m.text), ['[OLD]']);
    });

    test('after a late hint turn, the first unseen hint shows on the new schedule', async () => {
        seenStore.clear();
        const g = newGame();
        g.turn = 900;
        g._maybeShowHint();
        assert.ok(seenStore.has('h1'));
        assert.equal(g._lastHintTurn, 900);

        await restartViaMenu(g);
        g.turn = 3;
        g._maybeShowHint();
        assert.ok(g._logHistory.some(m => m.text === '[HINT TWO]'), 'hint two shows on the new game');
        assert.ok(seenStore.has('h1'), 'hintsSeen survives RESTART');
    });
});
