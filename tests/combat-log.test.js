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
