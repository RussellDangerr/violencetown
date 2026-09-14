// fight-area.test.js — who is in a fight, and what they can see (plans/fight-fog.md §1).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fighters, fightArea, areaAt } from '../game/fight-area.js';

const alive = () => ({ isAlive: () => true });
const dead = () => ({ isAlive: () => false });
// An enemy at (10,10) facing south, with sight 8.
const foe = (state, over = {}) => ({ state, entity: alive(), sightRange: 8, x: 10, y: 10, _lastDx: 0, _lastDy: 1, ...over });

describe('fighters', () => {
    test('an enemy hunting you is in the fight, chasing or searching', () => {
        assert.equal(fighters([foe('chasing')]).length, 1);
        assert.equal(fighters([foe('searching')]).length, 1);
    });

    test('nobody calm, suspicious or walking home is', () => {
        for (const s of ['idle', 'suspicious', 'returning', undefined]) {
            assert.equal(fighters([foe(s)]).length, 0, `${s} should not be a fighter`);
        }
    });

    test('nor the dead, the ambient, allies or the eyeless', () => {
        assert.equal(fighters([foe('chasing', { entity: dead() })]).length, 0);
        assert.equal(fighters([foe('chasing', { ambient: true })]).length, 0);
        assert.equal(fighters([foe('chasing', { _ally: true })]).length, 0);
        assert.equal(fighters([foe('chasing', { sightRange: 0 })]).length, 0);
    });

    test('no enemies at all is an empty fight, not a crash', () => {
        assert.deepEqual(fighters(undefined), []);
        assert.deepEqual(fighters([null]), []);
    });
});

// Open floor everywhere, or a '#' grid (as tests/perception.test.js builds them).
const openMap = () => ({ isWalkable: () => true });
function gridMap(rows) {
    const H = rows.length, W = rows[0].length;
    return { isWalkable: (x, y) => x >= 0 && y >= 0 && x < W && y < H && rows[y][x] !== '#' };
}
const around = (x, y, r) => ({ x0: x - r, y0: y - r, x1: x + r, y1: y + r });
const seen = (area, x, y) => areaAt(area, x, y).seen;

describe('fightArea', () => {
    test('the three tiles behind a fighter are fog; its own tile and the ground ahead are not', () => {
        const a = fightArea(openMap(), [foe('chasing')], around(10, 10, 12));   // at (10,10), facing south
        for (const [x, y] of [[9, 9], [10, 9], [11, 9]]) assert.equal(seen(a, x, y), false, `(${x},${y}) is behind it`);
        assert.equal(seen(a, 10, 10), true, 'a fighter never stands in its own fog');
        assert.equal(seen(a, 10, 14), true, 'straight ahead, in range');
    });

    test('PERIPHERAL counts as seen', () => {
        const a = fightArea(openMap(), [foe('chasing')], around(10, 10, 12));
        assert.equal(seen(a, 14, 10), true, 'the flank, within ceil(8 / 2)');
        assert.equal(seen(a, 15, 10), false, 'the flank, beyond it');
    });

    test('a wall casts fog', () => {
        const rows = ['.....', '.....', '..#..', '.....', '.....'];
        const a = fightArea(gridMap(rows), [foe('chasing', { x: 2, y: 0 })], { x0: 0, y0: 0, x1: 4, y1: 4 });
        assert.equal(seen(a, 2, 1), true);
        assert.equal(seen(a, 2, 3), false, 'behind the wall');
    });

    test("two fighters' sight combines", () => {
        const south = foe('chasing');
        const north = foe('chasing', { x: 10, y: 6, _lastDx: 0, _lastDy: -1 });
        const alone = fightArea(openMap(), [south], around(10, 10, 12));
        const both = fightArea(openMap(), [south, north], around(10, 10, 12));
        assert.equal(seen(alone, 10, 3), false, 'behind the first one');
        assert.equal(seen(both, 10, 3), true, 'the second one sees it');
    });

    test('night shrinks the area', () => {
        const day = fightArea(openMap(), [foe('chasing')], around(10, 10, 12));
        const night = fightArea(openMap(), [foe('chasing', { _nightLevel: 1 })], around(10, 10, 12));
        assert.equal(seen(day, 10, 17), true, 'sight 8 by day');
        assert.equal(seen(night, 10, 17), false, '40% less at full dark: sight 5');
        assert.equal(seen(night, 10, 15), true);
    });

    test('each fogged tile knows its Chebyshev steps from their sight', () => {
        const a = fightArea(openMap(), [foe('chasing')], around(10, 10, 12));
        assert.equal(areaAt(a, 10, 10).dist, 0);
        assert.equal(areaAt(a, 10, 9).dist, 1, 'right behind it');
        assert.equal(areaAt(a, 10, 7).dist, 3);
        assert.equal(areaAt(a, 4, 7).dist, 3, 'three king-moves from (6,10), though five by Manhattan');
    });

    test('it is kept in world coordinates', () => {
        const b = around(10, 10, 12);
        const a = fightArea(openMap(), [foe('chasing')], b);
        assert.deepEqual([a.x0, a.y0, a.w, a.h], [b.x0, b.y0, 25, 25]);
        assert.equal(areaAt(a, 100, 100).inside, false);
    });

    test('with nobody to see, nothing is seen and nothing has a distance', () => {
        const a = fightArea(openMap(), [], around(10, 10, 2));
        assert.equal(areaAt(a, 10, 10).seen, false);
        assert.equal(areaAt(a, 10, 10).dist, -1);
    });
});
