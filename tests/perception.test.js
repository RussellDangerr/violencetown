// perception.test.js — the three-zone perception verdict.
//
// The load-bearing property is the 3/2/3 adjacent split: for every one of the
// eight facings, cardinal AND diagonal, an enemy's eight neighbouring tiles
// divide into exactly 3 cone / 2 peripheral / 3 blind. The whole design rests on
// "the three tiles behind them are the blind spot" having no exceptions, so that
// property is asserted for all eight facings rather than spot-checked.
//
// It also guards a one-ULP float trap: cos for a diagonal offset computes to
// 0.7071067811865475 while Math.cos(PI/4) is 0.7071067811865476. Without an
// epsilon the two diagonal front tiles silently fall out of the cone and the
// blind spot quietly becomes five tiles wide.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { VERDICT, FACING_VECTORS, facingOf, perceives, spotters } from '../game/perception.js';

// Open floor everywhere, or a '#' grid (mirrors tests/pathing.test.js).
function openMap() {
    return { isWalkable: () => true };
}
function gridMap(rows) {
    const H = rows.length, W = rows[0].length;
    return { isWalkable: (x, y) => x >= 0 && y >= 0 && x < W && y < H && rows[y][x] !== '#' };
}
function watcher(x, y, fx, fy, sightRange = 8) {
    return { x, y, _lastDx: fx, _lastDy: fy, sightRange };
}

// 8 neighbours, clockwise from N (same order as wheel-model.js's RING8).
const RING8 = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];

describe('the 3/2/3 adjacent split', () => {
    for (const [name, [fx, fy]] of Object.entries(FACING_VECTORS)) {
        test(`facing ${name} → 3 DIRECT, 2 PERIPHERAL, 3 NONE`, () => {
            const map = openMap();
            const w = watcher(10, 10, fx, fy);
            const counts = { DIRECT: 0, PERIPHERAL: 0, NONE: 0 };
            for (const [dx, dy] of RING8) counts[perceives(map, w, 10 + dx, 10 + dy)]++;
            assert.deepEqual(counts, { DIRECT: 3, PERIPHERAL: 2, NONE: 3 },
                `facing ${name} split was ${JSON.stringify(counts)}`);
        });
    }
});

test('the tile directly behind is blind at range 1 AND at range 5', () => {
    const map = openMap();
    const w = watcher(10, 10, 0, 1);              // facing south
    assert.equal(perceives(map, w, 10, 9), VERDICT.NONE);
    assert.equal(perceives(map, w, 10, 5), VERDICT.NONE);
});

test('peripheral is SHORTER range than the cone', () => {
    const map = openMap();
    const w = watcher(0, 0, 0, 1, 8);             // facing south, sight 8 → periphery 4
    assert.equal(perceives(map, w, 0, 8), VERDICT.DIRECT);      // straight ahead, at range
    assert.equal(perceives(map, w, 4, 0), VERDICT.PERIPHERAL);  // flank, within ceil(8/2)
    assert.equal(perceives(map, w, 5, 0), VERDICT.NONE);        // flank, beyond it
});

test('beyond sightRange is NONE even dead ahead', () => {
    const map = openMap();
    const w = watcher(0, 0, 0, 1, 3);
    assert.equal(perceives(map, w, 0, 3), VERDICT.DIRECT);
    assert.equal(perceives(map, w, 0, 4), VERDICT.NONE);
});

test('a wall blocks the cone', () => {
    const map = gridMap(['.....', '..#..', '.....']);
    const w = watcher(2, 0, 0, 1, 8);             // facing south through the wall at (2,1)
    assert.equal(perceives(map, w, 2, 2), VERDICT.NONE);
});

test('sightRange 0 perceives nothing but its own tile', () => {
    const map = openMap();
    const w = watcher(5, 5, 0, 1, 0);
    assert.equal(perceives(map, w, 5, 6), VERDICT.NONE);
    assert.equal(perceives(map, w, 5, 5), VERDICT.DIRECT);
});

test('facingOf falls back to south when the enemy has never moved', () => {
    assert.deepEqual(facingOf({ _lastDx: 0, _lastDy: 0 }), { fx: 0, fy: 1 });
    assert.deepEqual(facingOf({}), { fx: 0, fy: 1 });
    assert.deepEqual(facingOf(null), { fx: 0, fy: 1 });
    assert.deepEqual(facingOf({ _lastDx: -1, _lastDy: 0 }), { fx: -1, fy: 0 });
});

test('a null watcher perceives nothing', () => {
    assert.equal(perceives(openMap(), null, 1, 1), VERDICT.NONE);
});

describe('spotters — the "am I hidden" predicate', () => {
    test('returns only the watchers holding DIRECT', () => {
        const map = openMap();
        const sees = watcher(0, 5, 0, -1);         // facing north, player at (0,0) dead ahead
        const blind = watcher(0, -5, 0, -1);       // facing north, player behind it
        const found = spotters(map, [sees, blind], 0, 0);
        assert.equal(found.length, 1);
        assert.equal(found[0], sees);
    });

    test('peripheral alone does NOT count as spotted', () => {
        const map = openMap();
        const flank = watcher(0, 0, 0, 1, 8);      // facing south; player at (2,0) is its flank
        assert.equal(perceives(map, flank, 2, 0), VERDICT.PERIPHERAL);
        assert.deepEqual(spotters(map, [flank], 2, 0), []);
    });

    test('an empty or missing watcher list is nobody', () => {
        assert.deepEqual(spotters(openMap(), [], 0, 0), []);
        assert.deepEqual(spotters(openMap(), null, 0, 0), []);
    });
});

// ── Authored spawn facing on the Enemy class ────────────────────────────────
//
// An enemy that has never taken a step has no facing to read, so map JSON can
// declare one. The subtle requirement is that it must NOT win over a restored
// one: save.js reconstructs via `new Enemy(s)` carrying the persisted
// _lastDx/_lastDy, so an unconditional assignment would silently re-point every
// enemy that had turned, on every reload.

import { Enemy } from '../game/enemies.js';

describe('authored spawn facing', () => {
    test('seeds the facing stamp for an enemy that has never moved', () => {
        const e = new Enemy({ id: 'e1', type: 'guard', x: 3, y: 3, facing: 'W' });
        assert.deepEqual(facingOf(e), { fx: -1, fy: 0 });
    });

    test('every compass point resolves', () => {
        for (const [name, [fx, fy]] of Object.entries(FACING_VECTORS)) {
            const e = new Enemy({ id: 'e', type: 'guard', x: 0, y: 0, facing: name });
            assert.deepEqual(facingOf(e), { fx, fy }, `facing ${name}`);
        }
    });

    test('a RESTORED live facing wins over the authored one', () => {
        const e = new Enemy({ id: 'e1', type: 'guard', x: 3, y: 3, facing: 'W', _lastDx: 0, _lastDy: -1 });
        assert.deepEqual(facingOf(e), { fx: 0, fy: -1 });
    });

    test('an unknown facing string is ignored rather than crashing', () => {
        const e = new Enemy({ id: 'e1', type: 'guard', x: 3, y: 3, facing: 'NORTHWESTISH' });
        assert.deepEqual(facingOf(e), { fx: 0, fy: 1 });
    });

    test('no authored facing and no movement → south', () => {
        const e = new Enemy({ id: 'e1', type: 'guard', x: 3, y: 3 });
        assert.deepEqual(facingOf(e), { fx: 0, fy: 1 });
    });
});

describe('the new Enemy fields round-trip through toSave', () => {
    test('hearingRange, equipped and thievable survive a save', () => {
        const e = new Enemy({
            id: 'e1', type: 'guard', x: 1, y: 1,
            hearingRange: 3, equipped: ['crowbar'], thievable: false,
        });
        const s = e.toSave();
        assert.equal(s.hearingRange, 3);
        assert.deepEqual(s.equipped, ['crowbar']);
        assert.equal(s.thievable, false);

        const back = new Enemy(s);
        assert.equal(back.hearingRange, 3);
        assert.deepEqual(back.equipped, ['crowbar']);
        assert.equal(back.thievable, false);
    });

    test('the ladder counters survive a save taken mid-hunt', () => {
        const e = new Enemy({ id: 'e1', type: 'guard', x: 1, y: 1 });
        e._awareBeats = 1;
        e._sweepBeats = 4;
        const back = new Enemy(e.toSave());
        assert.equal(back._awareBeats, 1);
        assert.equal(back._sweepBeats, 4);
    });

    test('the defaults are absent/zero, not undefined arithmetic', () => {
        const e = new Enemy({ id: 'e1', type: 'guard', x: 1, y: 1 });
        assert.equal(e.hearingRange, null);
        assert.equal(e.equipped, null);
        assert.equal(e.thievable, null);
        assert.equal(e._awareBeats, 0);
        assert.equal(e._sweepBeats, 0);
    });
});
