// roadmap-board-model.test.js — the ticket board's logic, with no DOM.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    LANES, KINDS, WIP_CAP, byLane, blockerIndex, unblocked, nextSlice, answerRuling, newIdea,
    migrateCard, mermaidSource, moveCard,
} from '../tools/roadmap-board/board-model.js';

const cards = [
    { id: 'A1', title: 'The -15 band', lane: 'ruling', order: 10, kind: 'ruling', blockedBy: [],
      options: [{ id: 'a', label: 'Yes' }, { id: 'b', label: 'No' }] },
    { id: 'A4', title: 'Boss tag',     lane: 'ruling', order: 20, kind: 'ruling', blockedBy: [] },
    { id: 'B1', title: 'First boss',   lane: 'ready',  order: 10, kind: 'slice',  blockedBy: ['A1', 'A4'], acceptance: ['boss fights'] },
    { id: 'B2', title: 'Eat kits',     lane: 'ready',  order: 20, kind: 'slice',  blockedBy: [], touches: ['game/npc.js'], acceptance: ['enemies eat'] },
    { id: 'C2', title: 'Modifier keys',lane: 'done',   order: 10, kind: 'slice',  blockedBy: [] },
];

describe('LANES and KINDS', () => {
    test('seven lanes in board order', () => {
        assert.deepEqual(LANES.map(l => l.id), ['idea', 'ruling', 'ready', 'doing', 'review', 'done', 'someday']);
    });
    test('three kinds and a WIP cap of two', () => {
        assert.deepEqual(KINDS, ['idea', 'ruling', 'slice']);
        assert.equal(WIP_CAP, 2);
    });
});

describe('byLane', () => {
    test('groups and sorts by order', () => {
        const g = byLane(cards);
        assert.deepEqual(g.ruling.map(c => c.id), ['A1', 'A4']);
        assert.deepEqual(g.ready.map(c => c.id), ['B1', 'B2']);
        assert.deepEqual(g.doing, []);          // every lane present, even empty
    });
});

describe('hostile input — the store is org-writable, any card can carry anything', () => {
    test('a hostile lane or blocker id cannot blank the board', () => {
        const hostile = [
            ...cards,
            { id: 'H1', title: 'proto lane', lane: '__proto__', order: 1, kind: 'slice', blockedBy: [] },
            { id: 'H2', title: 'proto block', lane: 'ready', order: 40, kind: 'slice', blockedBy: ['__proto__'] },
            { id: 'H3', title: 'unknown lane', lane: 'banana', order: 1, kind: '__proto__', blockedBy: [] },
        ];
        const g = byLane(hostile);                       // must not throw
        const ix = blockerIndex(hostile);                // must not throw
        assert.ok(g.idea.some(c => c.id === 'H1'), 'an unknown lane lands in Ideas');
        assert.ok(g.idea.some(c => c.id === 'H3'), 'an unknown lane lands in Ideas');
        assert.ok(ix.openBlockedBy.H2.includes('__proto__'));
        assert.doesNotThrow(() => nextSlice(hostile));
        assert.doesNotThrow(() => mermaidSource(hostile));
        assert.ok(!mermaidSource(hostile).includes(':::__proto__'), 'an unknown kind never reaches the graph');
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
        const ix = blockerIndex([...cards, { id: 'X', title: 'x', lane: 'ready', order: 30, kind: 'slice', blockedBy: ['C2'] }]);
        assert.deepEqual(ix.openBlockedBy.X, []);       // C2 is done
        assert.deepEqual(ix.openBlockedBy.B1, ['A1', 'A4']);
    });

    test('an unknown blocker id keeps the card blocked, so a typo is visible', () => {
        const typo = [...cards, { id: 'X9', title: 'typo', lane: 'ready', order: 30, kind: 'slice', blockedBy: ['A9'] }];
        const ix = blockerIndex(typo);
        assert.deepEqual(ix.openBlockedBy.X9, ['A9'], 'A9 does not exist — it must still block');
        assert.ok(!unblocked(typo).some(c => c.id === 'X9'));
        assert.notEqual(nextSlice(typo).pick?.id, 'X9');
    });
});

describe('unblocked', () => {
    test('only Ready slices whose blockers are all done', () => {
        const extra = [
            ...cards,
            { id: 'I9', title: 'an idea', lane: 'idea',    order: 10, kind: 'idea',  blockedBy: [] },
            { id: 'S9', title: 'parked',  lane: 'someday', order: 10, kind: 'slice', blockedBy: [] },
            { id: 'R9', title: 'a ruling sitting in ready', lane: 'ready', order: 30, kind: 'ruling', blockedBy: [] },
        ];
        const ids = unblocked(extra).map(c => c.id);
        assert.deepEqual(ids, ['B2']);
    });
});

describe('nextSlice — what the loop builds next', () => {
    test('picks the first Ready slice in order with no open blockers', () => {
        const r = nextSlice(cards);
        assert.equal(r.reason, 'ok');
        assert.equal(r.pick.id, 'B2');
        assert.deepEqual(r.skipped.map(s => s.id), ['B1'], 'B1 is blocked and reported as skipped');
        assert.match(r.skipped[0].why, /blocked by A1, A4/);
    });

    test('answering the rulings unblocks the slice they gate', () => {
        let next = answerRuling(cards, 'A1', { option: 'a', at: 1 });
        next = next.map(c => c.id === 'A4' ? { ...c, lane: 'done' } : c);
        assert.equal(nextSlice(next).pick.id, 'B1', 'B1 comes first in Ready order once free');
    });

    test('stops at the WIP cap: doing + review hold two slices', () => {
        const full = [...cards,
            { id: 'D1', title: 'd', lane: 'doing',  order: 10, kind: 'slice', blockedBy: [] },
            { id: 'V1', title: 'v', lane: 'review', order: 10, kind: 'slice', blockedBy: [] },
        ];
        const r = nextSlice(full);
        assert.equal(r.reason, 'wip-cap');
        assert.equal(r.pick, null);
        assert.equal(r.wip, 2);
        assert.equal(nextSlice(full, { wipCap: 3 }).pick.id, 'B2', 'the cap is a parameter');
    });

    test('skips a slice whose files an unmerged branch already touches', () => {
        const clash = [...cards,
            { id: 'V1', title: 'v', lane: 'review', order: 10, kind: 'slice', blockedBy: [], touches: ['.\\game\\npc.js'] },
        ];
        const r = nextSlice(clash);
        assert.equal(r.reason, 'nothing-pickable');
        assert.match(r.skipped.find(s => s.id === 'B2').why, /touches unmerged game\/npc\.js/, 'paths compare normalised');
    });

    test('never picks a slice with no acceptance checks — it is not groomed', () => {
        const raw = [{ id: 'RC', title: 'old roadmap row', lane: 'ready', order: 1, kind: 'slice', blockedBy: [] }];
        const r = nextSlice(raw);
        assert.equal(r.pick, null);
        assert.match(r.skipped[0].why, /not groomed/);
        assert.equal(nextSlice([{ ...raw[0], acceptance: [] }]).pick, null, 'an empty list is not groomed either');
    });

    test('skips a claimed slice', () => {
        const claimed = cards.map(c => c.id === 'B2' ? { ...c, claim: { by: 'run', at: 1 } } : c);
        assert.equal(nextSlice(claimed).reason, 'nothing-pickable');
    });

    test('works on frozen input', () => {
        const frozen = Object.freeze(cards.map(c => Object.freeze({ ...c })));
        assert.equal(nextSlice(frozen).pick.id, 'B2');
    });
});

describe('answerRuling', () => {
    test('stores the pick and moves the ruling to Done', () => {
        const next = answerRuling(cards, 'A1', { option: 'b', note: 'keep it simple', at: 123 });
        const a1 = next.find(c => c.id === 'A1');
        assert.equal(a1.lane, 'done');
        assert.deepEqual(a1.pick, { option: 'b', note: 'keep it simple', at: 123 });
        assert.ok(a1.order > 10, 'lands at the end of Done');
    });

    test('refuses an option the card does not offer, and non-rulings', () => {
        assert.equal(answerRuling(cards, 'A1', { option: 'zzz', at: 1 }), cards);
        assert.equal(answerRuling(cards, 'B2', { option: 'a', at: 1 }), cards);
        assert.equal(answerRuling(cards, 'nope', { option: 'a', at: 1 }), cards);
    });

    test('does not mutate its input', () => {
        const before = JSON.stringify(cards);
        answerRuling(cards, 'A1', { option: 'a', at: 1 });
        assert.equal(JSON.stringify(cards), before);
    });
});

describe('newIdea', () => {
    test('keeps his full words as the note and the first line as the title', () => {
        const c = newIdea('Masks in the head slot\nthe delivery hat gives tips', 1_000_000, cards);
        assert.equal(c.kind, 'idea');
        assert.equal(c.lane, 'idea');
        assert.equal(c.title, 'Masks in the head slot');
        assert.equal(c.note, 'Masks in the head slot\nthe delivery hat gives tips');
        assert.equal(c.id, `idea-${(1_000_000).toString(36)}`);
    });
    test('a long first line is cut, an empty box makes nothing', () => {
        assert.ok(newIdea('x'.repeat(200), 1).title.length <= 91);
        assert.equal(newIdea('   ', 1), null);
    });
});

describe('migrateCard — the one-time move off the roadmap seed', () => {
    test('maps old lanes and kinds onto the new model', () => {
        const m = (lane, kind) => { const c = migrateCard({ id: 'x', lane, kind }); return `${c.lane}/${c.kind}`; };
        assert.equal(m('now', 'build'), 'ready/slice');
        assert.equal(m('rulings', 'ruling'), 'ruling/ruling');
        assert.equal(m('ready', 'build'), 'ready/slice');
        assert.equal(m('design', 'design'), 'idea/idea');
        assert.equal(m('later', 'later'), 'someday/idea');
        assert.equal(m('done', 'done'), 'done/slice');
        assert.equal(m('done', 'ruling'), 'done/ruling', 'a struck ruling stays a ruling');
    });
    test('is idempotent — a migrated card passes through unchanged', () => {
        for (const lane of LANES.map(l => l.id)) for (const kind of KINDS) {
            const c = { id: 'x', lane, kind };
            assert.deepEqual(migrateCard(migrateCard(c)), migrateCard(c), `${lane}/${kind}`);
            assert.deepEqual(migrateCard(c), c, `${lane}/${kind} is already new`);
        }
    });
    test('a hostile lane or kind cannot reach the prototype', () => {
        const c = migrateCard({ id: 'x', lane: 'constructor', kind: '__proto__' });
        assert.equal(c.lane, 'idea');
        assert.equal(c.kind, 'slice');
    });
    test('keeps every other field', () => {
        const c = migrateCard({ id: 'Q1', title: 't', lane: 'design', kind: 'design', blockedBy: ['A1'], doc: 'd', note: 'n', order: 30 });
        assert.deepEqual({ ...c, lane: undefined, kind: undefined },
            { id: 'Q1', title: 't', lane: undefined, kind: undefined, blockedBy: ['A1'], doc: 'd', note: 'n', order: 30 });
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
        const src = mermaidSource([{ id: 'Q', title: 'say "hi"', lane: 'ready', order: 1, kind: 'slice', blockedBy: ['A1'] }, cards[0]]);
        assert.ok(!src.includes('say "hi"'));
    });

    test('a short code labels as just the code; a long title truncates', () => {
        const src = mermaidSource([
            { id: 'A1', title: 'x'.repeat(180), lane: 'ruling', order: 1, kind: 'ruling', blockedBy: [] },
            { id: 'some-slug-card', title: 'y'.repeat(180), lane: 'ready', order: 1, kind: 'slice', blockedBy: ['A1'] },
        ]);
        assert.match(src, /A1\["A1"\]/, 'a coded id is its own label');
        assert.ok(!/.{60,}\]/.test(src), 'no node label runs long');
    });

    test('a three-letter code and a suffixed code label as just the code', () => {
        const src = mermaidSource([
            { id: 'ENT', title: 'x'.repeat(80), lane: 'ruling', order: 1, kind: 'ruling', blockedBy: [] },
            { id: 'F2b', title: 'y'.repeat(80), lane: 'idea', order: 1, kind: 'idea', blockedBy: ['ENT'] },
        ]);
        assert.match(src, /ENT\["ENT"\]/);
        assert.match(src, /F2b\["F2b"\]/);
    });

    test('done cards class as done, whatever their kind', () => {
        const src = mermaidSource([
            { id: 'A1', title: 'a', lane: 'done', order: 1, kind: 'ruling', blockedBy: [] },
            { id: 'B1', title: 'b', lane: 'ready', order: 1, kind: 'slice', blockedBy: ['A1'] },
        ]);
        assert.match(src, /A1\["A1"\]:::done/);
        assert.match(src, /B1\["B1"\]:::slice/);
    });

    test('cards that are free to start appear even with no edges', () => {
        const src = mermaidSource(cards);
        assert.match(src, /subgraph free/);
        assert.match(src, /B2\[/, 'B2 has no edges but is startable, so it must be visible');
    });
});

describe('moveCard', () => {
    test('moves to a new lane at the end when no target given', () => {
        const next = moveCard(cards, 'B2', { lane: 'doing' });
        const b2 = next.find(c => c.id === 'B2');
        assert.equal(b2.lane, 'doing');
        assert.ok(b2.order > 0);
    });

    test('inserts before a target card by halving the gap, so nothing else renumbers', () => {
        const next = moveCard(cards, 'B2', { lane: 'ruling', before: 'A4' });
        const b2 = next.find(c => c.id === 'B2');
        assert.equal(b2.lane, 'ruling');
        assert.ok(b2.order > 10 && b2.order < 20);
        assert.equal(next.find(c => c.id === 'A1').order, 10);
        assert.equal(next.find(c => c.id === 'A4').order, 20);
    });

    test('does not mutate its input', () => {
        const before = JSON.stringify(cards);
        moveCard(cards, 'B2', { lane: 'doing' });
        assert.equal(JSON.stringify(cards), before);
    });

    test('works on frozen input, because the db delivers frozen snapshots', () => {
        const frozen = Object.freeze(cards.map(c => Object.freeze({ ...c, blockedBy: Object.freeze([...c.blockedBy]) })));
        const next = moveCard(frozen, 'B2', { lane: 'doing' });
        assert.equal(next.find(c => c.id === 'B2').lane, 'doing');
    });

    test('dropping a card on its immediate neighbour actually reorders', () => {
        const next = moveCard(cards, 'B1', { lane: 'ready', before: 'B2' });
        const g = byLane(next);
        assert.deepEqual(g.ready.map(c => c.id), ['B2', 'B1'], 'B1 moved past B2');
    });
});
