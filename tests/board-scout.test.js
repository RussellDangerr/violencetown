// board-scout.test.js — a scout proposal lands as an idea card, once (plans/board-scout.md).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { newScoutIdea, byLane, claudesTurn, yourTurn } from '../tools/roadmap-board/board-model.js';

const proposal = {
    key: 'defect:tier-two-hander-undefined-dmg', kind: 'defect',
    title: 'Holding a tier two-hander shows "undefined DMG" on the HUD',
    note: 'renderer.js:2215 reads weapon.damage; tier weapons have none. Seen in two build reports.',
};
const board = [
    { id: 'I1', title: 'an idea', lane: 'idea', order: 30, kind: 'idea', blockedBy: [] },
    { id: 'S1', title: 'a slice', lane: 'ready', order: 10, kind: 'slice', blockedBy: [] },
];

describe('newScoutIdea', () => {
    test('a proposal becomes an idea card at the end of the Ideas lane', () => {
        const c = newScoutIdea(proposal, 1000, board);
        assert.equal(c.kind, 'idea');
        assert.equal(c.lane, 'idea');
        assert.equal(c.source, 'scout');
        assert.equal(c.scoutKey, proposal.key);
        assert.equal(c.scoutKind, 'defect');
        assert.equal(c.order, 40);
        assert.equal(c.id, 'scout-defect-tier-two-hander-undefined-dmg');
        assert.equal(c.note, proposal.note);
    });

    test('it waits on his triage, like his own ideas', () => {
        const c = newScoutIdea(proposal, 1000, board);
        assert.ok(yourTurn([c]).some(t => t.id === c.id && /tweak it or park it/.test(t.why)));
        assert.equal(claudesTurn([c]).length, 0, 'nothing for Claude until he presses Tweak it');
    });

    test('a key any card already carries is never written twice, in any lane', () => {
        for (const lane of ['idea', 'someday', 'done', 'ready']) {
            const held = [...board, { id: 'X', title: 'x', lane, order: 1, kind: 'idea', blockedBy: [], scoutKey: proposal.key }];
            assert.equal(newScoutIdea(proposal, 1000, held), null, `held in ${lane}`);
        }
    });

    test('the same proposal twice makes no twin, even with its key edited off', () => {
        const first = newScoutIdea(proposal, 1000, board);
        const { scoutKey, ...stripped } = first;
        assert.equal(newScoutIdea(proposal, 2000, [...board, stripped]), null);
    });

    test('a proposal with no key or no title is refused', () => {
        assert.equal(newScoutIdea({ ...proposal, key: ' ' }, 1, board), null);
        assert.equal(newScoutIdea({ ...proposal, title: '' }, 1, board), null);
        assert.equal(newScoutIdea(null, 1, board), null);
    });

    test('an unknown kind falls back to idea, and a long title is cut', () => {
        const c = newScoutIdea({ ...proposal, kind: 'rant', title: 'x'.repeat(120) }, 1, board);
        assert.equal(c.scoutKind, 'idea');
        assert.equal(c.title.length, 91);
    });

    test('it lands in the Ideas lane on the board', () => {
        const c = newScoutIdea(proposal, 1, board);
        assert.deepEqual(byLane([...board, c]).idea.map(x => x.id), ['I1', c.id]);
    });
});
