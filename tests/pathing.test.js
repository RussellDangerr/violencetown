import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findPath } from '../game/pathing.js';
import { chebyshev } from '../game/utils.js';

// A fake game whose walkability reads a string grid ('#' = wall, else floor).
// No enemies/containers; player parked off-grid so it never blocks a tile.
function makeGame(rows) {
  const H = rows.length, W = rows[0].length;
  const walk = (x, y) => x >= 0 && y >= 0 && x < W && y < H && rows[y][x] !== '#';
  return { playerX: -99, playerY: -99, enemies: [], containers: [], map: { isWalkable: walk } };
}

// Every returned step is a single 8-way move from the previous tile, on floor.
function assertContiguous(game, from, path) {
  let cur = from;
  for (const step of path) {
    assert.ok(chebyshev(cur.x, cur.y, step.x, step.y) === 1, `step ${JSON.stringify(step)} not adjacent to ${JSON.stringify(cur)}`);
    assert.ok(game.map.isWalkable(step.x, step.y), `step ${JSON.stringify(step)} is a wall`);
    cur = step;
  }
}

test('straight corridor: returns the steps, excludes start, ends on target', () => {
  const g = makeGame(['.....']);
  const from = { x: 0, y: 0 }, to = { x: 4, y: 0 };
  const path = findPath(g, from, to);
  assert.ok(path && path.length === 4);
  assert.deepEqual(path[path.length - 1], { x: 4, y: 0 });
  assert.ok(!(path[0].x === 0 && path[0].y === 0));   // start excluded
  assertContiguous(g, from, path);
});

test('wall in the way: routes AROUND it (longer than Chebyshev)', () => {
  const g = makeGame([
    '.....',
    '..#..',
    '..#..',
    '..#..',
    '.....',
  ]);
  const from = { x: 1, y: 2 }, to = { x: 3, y: 2 };
  const path = findPath(g, from, to);
  assert.ok(path, 'path should exist around the wall');
  assert.deepEqual(path[path.length - 1], to);
  assert.ok(path.length > chebyshev(from.x, from.y, to.x, to.y), 'must detour');
  assertContiguous(g, from, path);
});

test('adjacent mode: ends next to the target, never ON it', () => {
  const g = makeGame(['.....']);
  const from = { x: 0, y: 0 }, to = { x: 4, y: 0 };
  const path = findPath(g, from, to, { adjacent: true });
  assert.ok(path && path.length === 3);
  const last = path[path.length - 1];
  assert.ok(chebyshev(last.x, last.y, to.x, to.y) <= 1);
  assert.ok(!(last.x === to.x && last.y === to.y), 'must stop adjacent, not on the target');
});

test('unreachable target → null', () => {
  const g = makeGame([
    '...#.',
    '...#.',
    '...#.',
  ]);
  const path = findPath(g, { x: 0, y: 0 }, { x: 4, y: 0 });
  assert.equal(path, null);
});

test('already there / already adjacent → []', () => {
  const g = makeGame(['.....']);
  assert.deepEqual(findPath(g, { x: 2, y: 0 }, { x: 2, y: 0 }), []);
  assert.deepEqual(findPath(g, { x: 3, y: 0 }, { x: 4, y: 0 }, { adjacent: true }), []);
});
