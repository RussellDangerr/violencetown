// roadmap-board-model.test.js — the board's logic, with no DOM.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { LANES, byLane, blockerIndex, unblocked, mermaidSource, moveCard } from '../tools/roadmap-board/board-model.js';

const cards = [
    { id: 'A1', title: 'The -15 band', lane: 'rulings', order: 10, kind: 'ruling', blockedBy: [] },
    { id: 'A4', title: 'Boss tag',     lane: 'rulings', order: 20, kind: 'ruling', blockedBy: [] },
    { id: 'B1', title: 'First boss',   lane: 'ready',   order: 10, kind: 'build',  blockedBy: ['A1', 'A4'] },
    { id: 'B2', title: 'Eat kits',     lane: 'ready',   order: 20, kind: 'build',  blockedBy: [] },
    { id: 'C2', title: 'Modifier keys',lane: 'done',    order: 10, kind: 'done',   blockedBy: [] },
];

describe('LANES', () => {
    test('six lanes in board order', () => {
        assert.deepEqual(LANES.map(l => l.id), ['now', 'rulings', 'ready', 'design', 'later', 'done']);
    });
});

describe('byLane', () => {
    test('groups and sorts by order', () => {
        const g = byLane(cards);
        assert.deepEqual(g.rulings.map(c => c.id), ['A1', 'A4']);
        assert.deepEqual(g.ready.map(c => c.id), ['B1', 'B2']);
        assert.deepEqual(g.now, []);            // every lane present, even empty
    });
});

describe('blockerIndex', () => {
    test('derives blocks as the inverse of blockedBy', () => {
        const ix = blockerIndex(cards);
        assert.deepEqual(ix.blocks.A1, ['B1']);
        assert.deepEqual(ix.blocks.A4, ['B1']);
        assert.deepEqual(ix.blockedBy.B1, ['A1', 'A4']);
        assert.deepEqual(ix.blocks.B2 ?? [], []);
    });

    test('a blocker that is done no longer counts as blocking', () => {
        const ix = blockerIndex([...cards, { id: 'X', title: 'x', lane: 'ready', order: 30, kind: 'build', blockedBy: ['C2'] }]);
        assert.deepEqual(ix.openBlockedBy.X, []);       // C2 is done
        assert.deepEqual(ix.openBlockedBy.B1, ['A1', 'A4']);
    });
});

describe('unblocked', () => {
    test('returns buildable cards whose open blockers are all done', () => {
        const ids = unblocked(cards).map(c => c.id);
        assert.ok(ids.includes('B2'));
        assert.ok(!ids.includes('B1'));
        assert.ok(!ids.includes('C2'));          // done is not "unblocked", it is finished
        assert.ok(!ids.includes('A1'));          // rulings are decisions, not builds
    });
});

describe('mermaidSource', () => {
    test('emits one node per card with an edge, and one edge per blockedBy', () => {
        const src = mermaidSource(cards);
        assert.match(src, /^flowchart LR/);
        assert.match(src, /A1 --> B1/);
        assert.match(src, /A4 --> B1/);
        assert.ok(!src.includes('C2'), 'done cards with no edges are omitted');
    });

    test('escapes quotes in titles', () => {
        const src = mermaidSource([{ id: 'Q', title: 'say "hi"', lane: 'ready', order: 1, kind: 'build', blockedBy: ['A1'] }, cards[0]]);
        assert.ok(!src.includes('say "hi"'));
    });
});

describe('moveCard', () => {
    test('moves to a new lane at the end when no target given', () => {
        const next = moveCard(cards, 'B2', { lane: 'now' });
        const b2 = next.find(c => c.id === 'B2');
        assert.equal(b2.lane, 'now');
        assert.ok(b2.order > 0);
    });

    test('inserts before a target card by halving the gap, so nothing else renumbers', () => {
        const next = moveCard(cards, 'B2', { lane: 'rulings', before: 'A4' });
        const b2 = next.find(c => c.id === 'B2');
        assert.equal(b2.lane, 'rulings');
        assert.ok(b2.order > 10 && b2.order < 20);
        assert.equal(next.find(c => c.id === 'A1').order, 10);
        assert.equal(next.find(c => c.id === 'A4').order, 20);
    });

    test('does not mutate its input', () => {
        const before = JSON.stringify(cards);
        moveCard(cards, 'B2', { lane: 'now' });
        assert.equal(JSON.stringify(cards), before);
    });

    test('works on frozen input, because the db delivers frozen snapshots', () => {
        const frozen = Object.freeze(cards.map(c => Object.freeze({ ...c, blockedBy: Object.freeze([...c.blockedBy]) })));
        const next = moveCard(frozen, 'B2', { lane: 'now' });
        assert.equal(next.find(c => c.id === 'B2').lane, 'now');
    });
});
