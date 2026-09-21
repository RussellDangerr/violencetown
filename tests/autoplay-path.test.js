// autoplay-path.test.js — how the autoplay gets from here to there.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathTo, cheapestPath, DIR_CODES } from '../game/autoplay/path.js';

const grid = (rows) => (x, y) => rows[y] !== undefined && rows[y][x] === '.';
const STEP = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
function walk(from, dirs) {
    const tiles = [];
    let { x, y } = from;
    for (const d of dirs) { x += STEP[d][0]; y += STEP[d][1]; tiles.push([x, y]); }
    return tiles;
}

describe('the autoplay path', () => {
    test('already there is an empty path', () => {
        assert.deepEqual(pathTo(grid(['.']), { x: 0, y: 0 }, { x: 0, y: 0 }), []);
    });

    test('a straight corridor', () => {
        assert.deepEqual(pathTo(grid(['....']), { x: 0, y: 0 }, { x: 3, y: 0 }), ['right', 'right', 'right']);
    });

    test('it goes around a wall, on open tiles only, and ends at the goal', () => {
        const rows = ['...', '.#.', '...'];
        const dirs = pathTo(grid(rows), { x: 0, y: 1 }, { x: 2, y: 1 });
        assert.equal(dirs.length, 4);
        const tiles = walk({ x: 0, y: 1 }, dirs);
        for (const [x, y] of tiles) assert.equal(rows[y][x], '.', `stepped onto ${x},${y}`);
        assert.deepEqual(tiles.at(-1), [2, 1]);
    });

    test('unreachable is null', () => {
        assert.equal(pathTo(grid(['.#.']), { x: 0, y: 0 }, { x: 2, y: 0 }), null);
    });

    test('a closed goal is unreachable, not stepped onto', () => {
        assert.equal(pathTo(grid(['.#']), { x: 0, y: 0 }, { x: 1, y: 0 }), null);
    });

    test('ties break the same way every time: up, down, left, right', () => {
        assert.deepEqual(pathTo(grid(['..', '..']), { x: 0, y: 0 }, { x: 1, y: 1 }), ['down', 'right']);
    });

    test('the cheapest path, with every tile costing 1, is the shortest one', () => {
        const cost = (x, y) => (grid(['....'])(x, y) ? 1 : Infinity);
        assert.deepEqual(cheapestPath(cost, { x: 0, y: 0 }, { x: 3, y: 0 }).dirs, ['right', 'right', 'right']);
    });

    test('it goes the long way round a costly tile, and says what the route cost', () => {
        const rows = ['.....', '.###.', '.....'];
        const cost = (x, y) => (!grid(rows)(x, y) ? Infinity : x === 2 && y === 0 ? 40 : 1);
        const p = cheapestPath(cost, { x: 0, y: 0 }, { x: 4, y: 0 });
        assert.equal(p.dirs[0], 'down');
        assert.equal(p.cost, 8);
        assert.deepEqual(p.tiles.at(-1), { x: 4, y: 0 });
    });

    test('it takes a costly tile when there is no other way', () => {
        const cost = (x, y) => (!grid(['.....'])(x, y) ? Infinity : x === 2 ? 40 : 1);
        assert.equal(cheapestPath(cost, { x: 0, y: 0 }, { x: 4, y: 0 }).cost, 43);
    });

    test('unreachable is null, already there is empty', () => {
        const cost = (x, y) => (grid(['.#.'])(x, y) ? 1 : Infinity);
        assert.equal(cheapestPath(cost, { x: 0, y: 0 }, { x: 2, y: 0 }), null);
        assert.deepEqual(cheapestPath(cost, { x: 0, y: 0 }, { x: 0, y: 0 }), { dirs: [], tiles: [], cost: 0 });
    });

    test('every direction is a key the game walks on', () => {
        const mainSrc = readFileSync(new URL('../game/main.js', import.meta.url), 'utf8');
        for (const code of Object.values(DIR_CODES)) {
            assert.match(mainSrc, new RegExp(`'${code}':\\s*\\{ dx`), `${code} is not in main.js DIRS`);
        }
    });
});
