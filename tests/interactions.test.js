// interactions.test.js — the carry-this-here rule table (IN1).
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { INTERACTIONS, matchingRows, fireRows, sanitizeNoteIds, seenNotes } from '../game/interactions.js';
import { serialize, migrate, loadInto } from '../game/save.js';
import { DEVICE_TABS, DEVICE_TAB_LABELS } from '../game/layout.js';

const ROW = { id: 'test_row', carry: 'test_item', zone: 'test-map.json', note: '[TEXT]' };

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
const { Game } = await import('../game/main.js');

// The real method, bound to a stand-in game (a real Game needs a canvas and a page).
function checkInteractionsOf(game) {
    return Game.prototype._checkInteractions.bind(game);
}

function standIn(mapUrl, carry) {
    const log = [];
    const game = {
        _mapUrl: mapUrl,
        inventory: carry.map(id => ({ itemDef: { id } })),
        equipment: {},
        interactionNotes: [],
        _log: (msg, cat) => log.push([msg, cat]),
    };
    game.check = checkInteractionsOf(game);
    return { game, log };
}

describe('the table', () => {
    test('ships the two Mola Cola rows (FD1, FD2)', () => {
        assert.deepEqual(INTERACTIONS.map(r => r.id), ['mola_cola_frozen', 'mola_cola_wilderness']);
    });
    test('the Mola Cola row carries a placeholder note and the frozen zone', () => {
        assert.equal(INTERACTIONS[0].note, '[TEXT]');
        assert.equal(INTERACTIONS[0].zone, 'frozen-map.json');
    });
    test('the notes tab exists with a placeholder label', () => {
        assert.ok(DEVICE_TABS.includes('notes'));
        assert.equal(DEVICE_TAB_LABELS.notes, '[TEXT]');
    });
});

describe('firing', () => {
    test('a row fires when its item is carried in its zone, and its note shows once', () => {
        let fired = 0;
        const row = { ...ROW, effect: () => { fired++; } };
        const { game, log } = standIn('test-map.json', ['test_item']);
        game.check([row]);
        game.check([row]);
        assert.equal(fired, 2, 'the effect happens every time');
        assert.deepEqual(log, [['[TEXT]', 'note']], 'the note shows only the first time');
        assert.deepEqual(game.interactionNotes, ['test_row']);
    });

    test('a row never fires in a zone it does not name', () => {
        let fired = 0;
        const row = { ...ROW, effect: () => { fired++; } };
        const { game, log } = standIn('other-map.json', ['test_item']);
        game.check([row]);
        assert.equal(fired, 0);
        assert.equal(log.length, 0);
        assert.deepEqual(game.interactionNotes, []);
        assert.deepEqual(matchingRows([row], ['test_item'], 'other-map.json'), []);
    });

    test('a row does not fire without its item', () => {
        const { game, log } = standIn('test-map.json', ['rock']);
        game.check([ROW]);
        assert.equal(log.length, 0);
    });

    test('an equipped item counts as carried', () => {
        const { game, log } = standIn('test-map.json', []);
        game.equipment = { weapon: { id: 'test_item' } };
        game.check([ROW]);
        assert.equal(log.length, 1);
    });
});

describe('the save', () => {
    beforeEach(() => {
        const store = new Map();
        globalThis.localStorage = {
            getItem: k => (store.has(k) ? store.get(k) : null),
            setItem: (k, v) => store.set(k, String(v)),
            removeItem: k => store.delete(k),
        };
    });

    test('sanitizing keeps strings once each and drops the rest', () => {
        assert.deepEqual(sanitizeNoteIds(['a', 'a', 3, null, '', 'b']), ['a', 'b']);
        assert.deepEqual(sanitizeNoteIds('nope'), []);
        assert.deepEqual(sanitizeNoteIds(undefined), []);
    });

    test('a seen note is kept in the save and not shown again after a reload', () => {
        const src = readFileSync(new URL('../game/save.js', import.meta.url), 'utf8');
        assert.match(src, /interactionNotesEntry\(game\)/);
        assert.match(src, /game\.interactionNotes\s*=\s*\[\.\.\.p\.interactionNotes\]/);
        // A saved blob carries the ids; loading cleans them.
        const raw = migrate({ version: 2, player: { interactionNotes: ['test_row', 'test_row', 7] } });
        // After a reload the stand-in holds the id, so the same row logs nothing.
        const { game, log } = standIn('test-map.json', ['test_item']);
        game.interactionNotes = sanitizeNoteIds(raw.player.interactionNotes);
        game.check([ROW]);
        assert.equal(log.length, 0);
        assert.deepEqual(game.interactionNotes, ['test_row']);
    });

    test('the field stays out of the save while empty', () => {
        const src = readFileSync(new URL('../game/save.js', import.meta.url), 'utf8');
        assert.match(src, /interactionNotes\.length \? \{ interactionNotes \} : \{\}/);
    });
});

describe('the notes list', () => {
    test('lists seen notes in the order first seen, skipping ids the table lost', () => {
        const rows = [ROW, { id: 'b', carry: 'x', zone: 'z', note: '[TEXT 2]' }];
        assert.deepEqual(seenNotes(rows, ['b', 'gone', 'test_row']).map(n => n.id), ['b', 'test_row']);
        assert.deepEqual(seenNotes(rows, []), []);
    });
});
