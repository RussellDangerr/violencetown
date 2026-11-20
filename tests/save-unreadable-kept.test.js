// FX66: a save that won't open is copied under its own key, and later writes leave it be.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { keepUnreadableSave, writeSave, clearSave, UNREADABLE_KEY, hasSave } from '../game/save.js';

let store;
beforeEach(() => {
    store = new Map();
    globalThis.localStorage = {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => { store.set(k, String(v)); },
        removeItem: (k) => { store.delete(k); },
    };
});

test('an unparseable live save is copied byte for byte', () => {
    store.set('violencetown.save', '{not json');
    assert.equal(keepUnreadableSave(), true);
    assert.equal(store.get(UNREADABLE_KEY), '{not json');
});

test('with nothing on disk no copy is kept', () => {
    assert.equal(keepUnreadableSave(), false);
    assert.equal(store.has(UNREADABLE_KEY), false);
});

test('autosaves and clearSave leave the kept copy alone', () => {
    store.set('violencetown.save', '{not json');
    keepUnreadableSave();
    const game = { turn: 1, equipment: {}, inventory: [], _log() {} };
    for (let i = 0; i < 4; i++) { game.turn += 6; writeSave(game); }
    assert.equal(store.get(UNREADABLE_KEY), '{not json');
    clearSave();
    assert.equal(store.get(UNREADABLE_KEY), '{not json');
    assert.equal(hasSave(), false);
});

test('continueGame keeps the copy on both bad-save paths and no longer claims the save is left on disk', () => {
    const main = readFileSync(new URL('../game/main.js', import.meta.url), 'utf8');
    assert.equal((main.match(/this\._keepUnreadable\?\.\(\)/g) || []).length, 2);
    assert.ok(!/left on disk/.test(main));
    assert.ok(main.includes('That save would not open. Starting a new run.'));
});
