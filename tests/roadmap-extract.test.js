// roadmap-extract.test.js — the roadmap markdown becomes the board's seed.
//
// The board is seeded from plans/roadmap-2026-09.md, not hand-typed, so the
// two cannot drift at seed time. This pins the parse: lanes map to sections,
// ruling ids survive verbatim, and every card has the fields the page needs.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { extractCards, LANE_FOR_SECTION } from '../tools/roadmap-board/extract-roadmap.mjs';

const SAMPLE = `
## 1. NOW — in flight on \`dev\`

| Item | State | Size | Doc |
|---|---|---|---|
| **Ship v0.22.0 to \`main\`** | held | S | \`plans/demo-readiness.md\` §0 |

## 2. RULINGS CAELAN OWES — cheap

| # | Ruling | What it gates | Source |
|---|---|---|---|
| **A1** | **The −15 armor band has no Law 4 row.** Is it 15–40? | Pike's kit, the boss line | A1 |
| **Z1** | **Vendor Interior Pack?** | Zone §1 | zone-identity |

## 3. READY TO BUILD — design settled

| Item | Size | Blocked by | Doc | Where |
|---|---|---|---|---|
| **B1 — first real boss** | L | **A1, A4** | Law 5 never ran. | dev |
| **B2 — enemies eat kits** | M | nothing | Diegetic. | dev |
| **T1 — Tag layer** on items / enemies / tiles | M | nothing | Not built. | audit |

## 5. POST-1.0 — big threads

| Thread | One line | Size | Blocked by |
|---|---|---|---|
| **Zone deep content / bosses** | Financier, Bigfoot. | L | B1 |

## 6. DONE — do NOT re-implement

| Parked as open in | Item | Shipped as |
|---|---|---|
| C2 | No modifier-key guard | checked in game/ |
`;

describe('extractCards', () => {
    test('maps each numbered section to a lane', () => {
        assert.equal(LANE_FOR_SECTION['1'], 'now');
        assert.equal(LANE_FOR_SECTION['2'], 'rulings');
        assert.equal(LANE_FOR_SECTION['3'], 'ready');
        assert.equal(LANE_FOR_SECTION['4'], 'design');
        assert.equal(LANE_FOR_SECTION['5'], 'later');
        assert.equal(LANE_FOR_SECTION['6'], 'done');
    });

    test('one card per table row, in the right lane', () => {
        const cards = extractCards(SAMPLE);
        assert.equal(cards.length, 8);
        assert.deepEqual(cards.map(c => c.lane), ['now', 'rulings', 'rulings', 'ready', 'ready', 'ready', 'later', 'done']);
    });

    test('ruling ids survive verbatim', () => {
        const ids = extractCards(SAMPLE).map(c => c.id);
        assert.ok(ids.includes('A1'));
        assert.ok(ids.includes('Z1'));
    });

    test('a leading code in the title becomes the id, so blockedBy can resolve to it', () => {
        const ids = extractCards(SAMPLE).map(c => c.id);
        assert.ok(ids.includes('B1'), `B1 missing from ${ids}`);
        assert.ok(ids.includes('B2'));
        assert.ok(ids.includes('T1'));
    });

    test('blockedBy parses the "Blocked by" column into ids, and "nothing" into []', () => {
        const cards = extractCards(SAMPLE);
        const b1 = cards.find(c => c.id === 'B1');
        const b2 = cards.find(c => c.id === 'B2');
        assert.deepEqual(b1.blockedBy, ['A1', 'A4']);
        assert.deepEqual(b2.blockedBy, []);
    });

    test('a Blocked-by column in the POST-1.0 table produces an edge to a coded READY row', () => {
        const cards = extractCards(SAMPLE);
        const bosses = cards.find(c => c.lane === 'later');
        assert.deepEqual(bosses.blockedBy, ['B1']);
        assert.ok(cards.some(c => c.id === 'B1'), 'the edge must resolve');
    });

    test('a coded title keeps the code in the title text too', () => {
        const b1 = extractCards(SAMPLE).find(c => c.id === 'B1');
        assert.ok(b1.title.startsWith('B1 — '), b1.title);
    });

    test('titles are stripped of markdown emphasis', () => {
        const ship = extractCards(SAMPLE).find(c => c.lane === 'now');
        assert.equal(ship.title, 'Ship v0.22.0 to `main`');
    });

    test('every card has every field the page needs', () => {
        for (const c of extractCards(SAMPLE)) {
            for (const k of ['id', 'title', 'lane', 'order', 'kind', 'size', 'blockedBy', 'doc', 'note']) {
                assert.ok(k in c, `${c.id ?? '?'} missing ${k}`);
            }
            assert.ok(Array.isArray(c.blockedBy));
        }
    });

    test('order is unique within a lane and increases in document order', () => {
        const cards = extractCards(SAMPLE);
        const ready = cards.filter(c => c.lane === 'ready');
        assert.ok(ready[0].order < ready[1].order);
    });
});
