// combat-log.test.js — the fight face's feed (plans/combat-hud.md stage 3).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { combatLines } from '../game/combat-log.js';

const H = (...pairs) => pairs.map(([text, category]) => ({ text, category }));

describe('combatLines', () => {
    const history = H(
        ['[Entered the town]', 'transition'],
        ['[Hit the Wererat for 4]', 'combat'],
        ['[Picked up a Rock]', 'pickup'],
        ['[The Wererat hits you for 3]', 'combat'],
        ['[New quest: A Working Car]', 'quest'],
        ['[Hit the Wererat for 6]', 'combat'],
        ['[The Wererat dies]', 'combat'],
    );

    test('keeps only combat messages', () => {
        assert.deepEqual(combatLines(history, 10).map((m) => m.category), ['combat', 'combat', 'combat', 'combat']);
    });

    test('newest is last, so the feed reads top-to-bottom like the quest log', () => {
        assert.equal(combatLines(history, 10).at(-1).text, '[The Wererat dies]');
        assert.equal(combatLines(history, 10)[0].text, '[Hit the Wererat for 4]');
    });

    test('caps at n, keeping the NEWEST n', () => {
        const two = combatLines(history, 2);
        assert.equal(two.length, 2);
        assert.deepEqual(two.map((m) => m.text), ['[Hit the Wererat for 6]', '[The Wererat dies]']);
    });

    test('a history with no fighting in it yields nothing, not the other messages', () => {
        assert.deepEqual(combatLines(H(['[Picked up a Rock]', 'pickup']), 4), []);
    });

    test('tolerates an empty or missing history rather than throwing', () => {
        assert.deepEqual(combatLines([], 4), []);
        assert.deepEqual(combatLines(undefined, 4), []);
    });
});

// ── Where the category comes from (the 2026-09-20 tagging fix) ───────────────
//
// The combat log shipped empty in real play. The filter was right; the tagging
// under it was not. npc.js already tags its combat reports `category: 'combat'`
// and _routeWorldMessages already branches on that tag — and then called
// _log(m.text) without passing it on. The answer existed and was dropped one
// line before it was used.
//
// logCategory is now the single place a world message's category becomes a log
// category, so there is one rule to read and one rule to get wrong.

import { logCategory } from '../game/combat-log.js';

describe('logCategory', () => {
    test("a combat report keeps its category", () => {
        assert.equal(logCategory({ category: 'combat', text: '[Rat hits you for 3]' }), 'combat');
    });

    test('a plain string is system, as it always was', () => {
        assert.equal(logCategory('[Entered the town]'), 'system');
    });

    test('an untagged object falls back to system rather than guessing', () => {
        assert.equal(logCategory({ text: '[Something happened]' }), 'system');
    });

    test('an unknown category is passed through, not flattened', () => {
        // A future category should reach the log strip intact so it can be
        // styled, rather than being silently relabelled 'system'.
        assert.equal(logCategory({ category: 'weather', text: '[It rains]' }), 'weather');
    });

    test('the caller may set the fallback for a known-kind call site', () => {
        assert.equal(logCategory(null, 'combat'), 'combat');
        assert.equal(logCategory({ text: 'x' }, 'pickup'), 'pickup');
    });

    test('a tagged message beats the caller\'s fallback — the message knows best', () => {
        assert.equal(logCategory({ category: 'combat', text: 'x' }, 'pickup'), 'combat');
    });
});
