// drops.test.js — the pure per-zone runtime dropped-items helpers (drops.js).
//
// Covers the record-dedup guard and the collected-skip re-inject filter that the
// REAL _recordDrop / _loadMap delegate to. main.js is browser-coupled and can't
// be constructed under node, so this logic was extracted into drops.js precisely
// so it can be exercised here instead of only through a save round-trip (which
// never touched the re-inject path). Run in CI: `node --test tests/drops.test.js`.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { recordDrop, pendingDrops } from '../game/drops.js';

describe('recordDrop', () => {
    test('records a new drop into the per-map bucket', () => {
        const dropped = {};
        assert.equal(recordDrop(dropped, 'sewer', 'converter', 4, 9), true);
        assert.deepEqual(dropped.sewer, [{ type: 'converter', x: 4, y: 9 }]);
    });

    test('dedups an identical {type,x,y} — a re-killed respawning boss cannot farm records', () => {
        const dropped = {};
        recordDrop(dropped, 'sewer', 'converter', 4, 9);
        // Re-enter, boss respawns, dies again on the same tile: no new record.
        assert.equal(recordDrop(dropped, 'sewer', 'converter', 4, 9), false);
        assert.equal(dropped.sewer.length, 1);   // no accumulation across re-kills
    });

    test('the same type at a different tile is a distinct drop', () => {
        const dropped = {};
        recordDrop(dropped, 'sewer', 'converter', 4, 9);
        assert.equal(recordDrop(dropped, 'sewer', 'converter', 5, 9), true);
        assert.equal(dropped.sewer.length, 2);
    });

    test('drops are bucketed per map url', () => {
        const dropped = {};
        recordDrop(dropped, 'sewer', 'converter', 4, 9);
        recordDrop(dropped, 'town', 'converter', 4, 9);
        assert.equal(dropped.sewer.length, 1);
        assert.equal(dropped.town.length, 1);
    });
});

describe('pendingDrops', () => {
    test('returns every recorded drop the player has not picked up', () => {
        const dropped = { sewer: [{ type: 'converter', x: 4, y: 9 }, { type: 'cape', x: 2, y: 2 }] };
        assert.deepEqual(
            pendingDrops(dropped, new Set(), 'sewer'),
            [{ type: 'converter', x: 4, y: 9 }, { type: 'cape', x: 2, y: 2 }],
        );
    });

    test('skips a drop whose "url|x|y|type" key is already collected', () => {
        const dropped = { sewer: [{ type: 'converter', x: 4, y: 9 }, { type: 'cape', x: 2, y: 2 }] };
        const collected = new Set(['sewer|4|9|converter']);
        assert.deepEqual(pendingDrops(dropped, collected, 'sewer'), [{ type: 'cape', x: 2, y: 2 }]);
    });

    test('a re-injected drop is placed exactly once — taking it stops the re-inject', () => {
        const dropped = { sewer: [{ type: 'converter', x: 4, y: 9 }] };
        const collected = new Set();
        assert.equal(pendingDrops(dropped, collected, 'sewer').length, 1); // first re-entry: placed
        collected.add('sewer|4|9|converter');                              // player takes it
        assert.deepEqual(pendingDrops(dropped, collected, 'sewer'), []);   // next re-entry: skipped
    });

    test('an unknown map url yields no drops', () => {
        assert.deepEqual(pendingDrops({}, new Set(), 'nowhere'), []);
    });
});
