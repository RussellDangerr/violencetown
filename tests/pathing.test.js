import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { findPath, stepEntity, getGreedyStep } from '../game/pathing.js';
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

// Pins: stepEntity stamps _lastDx/_lastDy (the backstab facing) via Math.sign
// of the move, read from the OLD position before x/y are overwritten.
describe('stepEntity — facing stamp (_lastDx/_lastDy)', () => {
  test('a diagonal step stamps its direction', () => {
    const e = { x: 5, y: 5 };
    stepEntity(e, 6, 6, 100);
    assert.equal(e._lastDx, 1);
    assert.equal(e._lastDy, 1);
    assert.equal(e.x, 6);
    assert.equal(e.y, 6);
  });
  test('the next step restamps from the new position', () => {
    const e = { x: 5, y: 5 };
    stepEntity(e, 6, 6, 100);   // (1,1)
    stepEntity(e, 6, 5, 100);   // north from (6,6) → (0,-1)
    assert.equal(e._lastDx, 0);
    assert.equal(e._lastDy, -1);
  });
});

// ── getGreedyStep rounds corners (plans/pathing-round-corners.md) ────────────

// Walk getGreedyStep from `from` until adjacent to `to` (or stuck / out of steps).
function chase(game, from, to, limit = 60) {
  let at = { ...from };
  for (let i = 0; i < limit; i++) {
    if (chebyshev(at.x, at.y, to.x, to.y) <= 1) return { at, steps: i, reached: true };
    const s = getGreedyStep(game, at, to);
    if (!s) return { at, steps: i, reached: false };
    assert.equal(chebyshev(at.x, at.y, s.x, s.y), 1, 'one tile per step');
    assert.ok(game.map.isWalkable(s.x, s.y), 'never onto a wall');
    at = s;
  }
  return { at, steps: limit, reached: false };
}

// The pre-change rule, for comparing open-ground steps.
function straightLine(game, from, to) {
  const NB = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
  let best = null, bestD = chebyshev(from.x, from.y, to.x, to.y);
  for (const [dx, dy] of NB) {
    const x = from.x + dx, y = from.y + dy;
    if (!game.map.isWalkable(x, y)) continue;
    if (dx && dy && (!game.map.isWalkable(x, from.y) || !game.map.isWalkable(from.x, y))) continue;
    const d = chebyshev(x, y, to.x, to.y);
    if (d < bestD) { bestD = d; best = { x, y }; }
  }
  return best;
}

describe('getGreedyStep — finds a way round', () => {
  test('round an L-shaped corner: the target is past the wall end', () => {
    const g = makeGame([
      '.......',
      '.#####.',
      '.....#.',
      '.....#.',
    ]);
    // Straight line says go up; the way is round the left end of the wall.
    assert.equal(straightLine(g, { x: 2, y: 2 }, { x: 2, y: 0 }), null, 'the old rule stood still');
    const r = chase(g, { x: 2, y: 2 }, { x: 2, y: 0 });
    assert.ok(r.reached, `stuck at ${JSON.stringify(r.at)}`);
  });

  test('out of a U-shaped pocket whose mouth faces away from the target', () => {
    const g = makeGame([
      '.........',
      '.#######.',
      '.#.....#.',
      '.#.....#.',
      '.........',
      '.........',
    ]);
    const from = { x: 4, y: 3 }, to = { x: 4, y: 0 };
    assert.deepEqual(straightLine(g, from, to), { x: 4, y: 2 });
    assert.equal(straightLine(g, { x: 4, y: 2 }, to), null, 'the old rule froze against the pocket wall');
    const r = chase(g, from, to);
    assert.ok(r.reached, `stuck at ${JSON.stringify(r.at)}`);
    assert.equal(r.steps, 11, 'the shortest way out and round');
  });

  test('round a corner to the player standing behind it', () => {
    const g = makeGame([
      '....#...',
      '....#...',
      '....#...',
      '........',
    ]);
    g.playerX = 6; g.playerY = 0;
    const r = chase(g, { x: 1, y: 0 }, { x: 6, y: 0 });
    assert.ok(r.reached, `stuck at ${JSON.stringify(r.at)}`);
    assert.ok(!(r.at.x === 6 && r.at.y === 0), 'never onto the player');
  });

  test('open ground: the same step the straight-line rule takes', () => {
    const g = makeGame(Array.from({ length: 9 }, () => '.........'));
    for (let fy = 0; fy < 9; fy++) for (let fx = 0; fx < 9; fx++) {
      const from = { x: fx, y: fy }, to = { x: 4, y: 4 };
      if (fx === 4 && fy === 4) continue;
      assert.deepEqual(getGreedyStep(g, from, to), straightLine(g, from, to), `from ${fx},${fy}`);
    }
  });

  test('another character in the only way forward: waits', () => {
    const g = makeGame([
      '#####',
      '.....',
      '#####',
    ]);
    g.enemies = [{ x: 2, y: 1, entity: { isAlive: () => true } }];
    assert.equal(getGreedyStep(g, { x: 1, y: 1 }, { x: 4, y: 1 }), null);
  });

  test('walled off entirely: still edges closer in a straight line', () => {
    const g = makeGame([
      '...#...',
      '...#...',
    ]);
    assert.deepEqual(getGreedyStep(g, { x: 0, y: 0 }, { x: 6, y: 0 }), { x: 1, y: 0 });
  });

  test('a container on the route is walked round', () => {
    const g = makeGame([
      '.....',
      '.....',
    ]);
    g.containers = [{ x: 2, y: 0 }];
    const r = chase(g, { x: 0, y: 0 }, { x: 4, y: 0 });
    assert.ok(r.reached);
  });
});
