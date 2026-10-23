// C3b — touch and mouse can aim attacks and turn in place (plans/c3b-pointer-aim-and-turn.md).
// The decisions are pure helpers in wheel-model.js; main.js only turns a point
// into a tile and acts on the answer, so its wiring is pinned by source checks.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  createWheelState, selectedNode, isLegalAimTile, clampReticle, aimTap, adjacentFacing,
} from '../game/wheel-model.js';

const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8').replace(/\r\n/g, '\n');

// Player at (5,5). `walls` is a set of "x,y" that are not walkable.
const stubGame = (over = {}, walls = []) => {
  const blocked = new Set(walls);
  return {
    playerX: 5, playerY: 5, playerMp: 99, facing: 'down',
    inventory: [], enemies: [], knownSpells: ['fireball'], grantedTricks: [], gold: 0,
    equipment: {}, map: { isWalkable: (x, y) => !blocked.has(`${x},${y}`) }, ...over,
  };
};
const aimingAt = (path, reticle = null) => {
  const w = createWheelState();
  w.path = path.slice(); w.aiming = true; w.reticle = reticle;
  return w;
};
const HIT = [0, 0, 0], CLEAVE = [0, 0, 1], RANGED = [0, 1], FIREBALL = [0, 2, 0];
const leafOf = (path) => selectedNode(aimingAt(path));

describe('pointer aim: what is a legal tile', () => {
  test('the paths name the leaves these tests mean', () => {
    assert.equal(leafOf(HIT).key, 'hit');
    assert.equal(leafOf(CLEAVE).key, 'cleave');
    assert.equal(leafOf(RANGED).key, 'ranged');
    assert.equal(leafOf(FIREBALL).key, 'fireball');
  });

  test('an adjacent verb is legal on any tile beside you, walkable or not, never on you', () => {
    const g = stubGame({}, ['6,5']);
    const hit = leafOf(HIT);
    assert.equal(isLegalAimTile(hit, g, { x: 6, y: 5 }), true, 'a wall beside you, as the arrow keys allow');
    assert.equal(isLegalAimTile(hit, g, { x: 6, y: 6 }), true, 'a diagonal neighbour');
    assert.equal(isLegalAimTile(hit, g, { x: 5, y: 5 }), false, 'your own tile');
    assert.equal(isLegalAimTile(hit, g, { x: 7, y: 5 }), false, 'two away');
  });

  test('a placed reticle must be walkable and within aimRange', () => {
    const g = stubGame({}, ['8,5']);
    const fb = leafOf(FIREBALL);   // range 6 (spells.js)
    assert.equal(isLegalAimTile(fb, g, { x: 11, y: 5 }), true);
    assert.equal(isLegalAimTile(fb, g, { x: 12, y: 5 }), false, 'past range');
    assert.equal(isLegalAimTile(fb, g, { x: 8, y: 5 }), false, 'not walkable');
  });

  test('a reach weapon turns Hit into a placed reticle', () => {
    const g = stubGame({ equipment: { weapon: { reach: 3 } } }, ['7,5']);
    const hit = leafOf(HIT);
    assert.equal(isLegalAimTile(hit, g, { x: 8, y: 5 }), true);
    assert.equal(isLegalAimTile(hit, g, { x: 7, y: 5 }), false, 'a placed reticle needs walkable ground');
  });
});

describe('pointer aim: a tap out of range snaps to the nearest legal tile', () => {
  test('a legal tap stays where it landed', () => {
    assert.deepEqual(clampReticle(leafOf(FIREBALL), stubGame(), { x: 9, y: 3 }), { x: 9, y: 3 });
  });

  test('far along a row snaps to the edge of the reach', () => {
    assert.deepEqual(clampReticle(leafOf(FIREBALL), stubGame(), { x: 20, y: 5 }), { x: 11, y: 5 });
    assert.deepEqual(clampReticle(leafOf(HIT), stubGame(), { x: 1, y: 5 }), { x: 4, y: 5 });
  });

  test('a far diagonal-ish tap snaps to the closest tile by straight-line distance', () => {
    // From (5,5) with reach 1, (10,6) is nearest to (6,6), not (6,5).
    assert.deepEqual(clampReticle(leafOf(HIT), stubGame(), { x: 10, y: 6 }), { x: 6, y: 6 });
  });

  test('an unwalkable tap in range snaps to a walkable neighbour', () => {
    const g = stubGame({}, ['8,5']);
    const t = clampReticle(leafOf(FIREBALL), g, { x: 8, y: 5 });
    assert.ok(t && !(t.x === 8 && t.y === 5));
    assert.equal(Math.hypot(t.x - 8, t.y - 5), 1, 'one step away');
    assert.deepEqual(t, { x: 8, y: 4 }, 'ties broken in reading order');
  });

  test('a tap on yourself with an adjacent verb does nothing', () => {
    assert.equal(clampReticle(leafOf(HIT), stubGame(), { x: 5, y: 5 }), null);
  });

  test('no legal tile at all answers null', () => {
    const walls = [];
    for (let x = -1; x <= 11; x++) for (let y = -1; y <= 11; y++) walls.push(`${x},${y}`);
    assert.equal(clampReticle(leafOf(FIREBALL), stubGame({}, walls), { x: 7, y: 7 }), null);
  });
});

describe('pointer aim: tap to place, tap it again to fire', () => {
  test('a tap off the reticle places it there', () => {
    const w = aimingAt(FIREBALL, { x: 6, y: 5 });
    assert.deepEqual(aimTap(w, stubGame(), { x: 8, y: 7 }), { action: 'place', reticle: { x: 8, y: 7 } });
  });

  test('a tap on the reticle fires', () => {
    const w = aimingAt(FIREBALL, { x: 8, y: 7 });
    assert.deepEqual(aimTap(w, stubGame(), { x: 8, y: 7 }), { action: 'fire' });
  });

  test('picking between two targets: tap the other one, then tap it again', () => {
    const g = stubGame();
    const w = aimingAt(HIT, { x: 6, y: 5 });   // auto-aim chose the east enemy
    const r1 = aimTap(w, g, { x: 4, y: 5 });   // the west one
    assert.deepEqual(r1, { action: 'place', reticle: { x: 4, y: 5 } });
    w.reticle = r1.reticle;
    assert.deepEqual(aimTap(w, g, { x: 4, y: 5 }), { action: 'fire' });
  });

  test('an out-of-range tap snaps, and does not fire even if it snaps onto the reticle', () => {
    const g = stubGame();
    const w = aimingAt(FIREBALL, null);
    const r1 = aimTap(w, g, { x: 30, y: 5 });
    assert.deepEqual(r1, { action: 'place', reticle: { x: 11, y: 5 } });
    w.reticle = r1.reticle;
    assert.deepEqual(aimTap(w, g, { x: 30, y: 5 }), { action: 'none' }, 'only a tap on the reticle itself fires');
  });

  test('a tap with nowhere legal changes nothing', () => {
    const w = aimingAt(HIT, { x: 6, y: 5 });
    assert.deepEqual(aimTap(w, stubGame(), { x: 5, y: 5 }), { action: 'none' });
  });
});

describe('pointer turn: which facing a long-press asks for', () => {
  test('the four tiles straight beside you name their facing', () => {
    assert.equal(adjacentFacing(5, 5, { x: 5, y: 4 }), 'up');
    assert.equal(adjacentFacing(5, 5, { x: 5, y: 6 }), 'down');
    assert.equal(adjacentFacing(5, 5, { x: 4, y: 5 }), 'left');
    assert.equal(adjacentFacing(5, 5, { x: 6, y: 5 }), 'right');
  });

  test('diagonals, your own tile and anything further answer null', () => {
    assert.equal(adjacentFacing(5, 5, { x: 6, y: 6 }), null);
    assert.equal(adjacentFacing(5, 5, { x: 5, y: 5 }), null);
    assert.equal(adjacentFacing(5, 5, { x: 7, y: 5 }), null);
    assert.equal(adjacentFacing(5, 5, null), null);
  });
});

describe('main.js wiring', () => {
  const body = (name) => {
    const i = mainSrc.indexOf(`\n    ${name}(`);
    assert.ok(i >= 0, `${name} not found`);
    const j = mainSrc.indexOf('\n    }\n', i);
    return mainSrc.slice(i, j);
  };

  test('the dial cull is skipped while aiming, so a world tap does not close the wheel', () => {
    assert.match(body('_onCanvasPointerDown'), /state === STATE\.RADIAL_MENU && !this\.wheel\.aiming\)/);
  });

  test('an aiming tap that misses the hub goes to _aimTapAt, which asks aimTap', () => {
    const tap = body('_tapRadialMenu');
    assert.match(tap, /if \(w\.aiming\) \{ this\._aimTapAt\(pt\); return; \}/);
    assert.ok(tap.indexOf('WHEEL_HUB_R') < tap.indexOf('_aimTapAt'), 'the hub still cancels first');
    const aim = body('_aimTapAt');
    assert.match(aim, /aimTap\(w, this, this\._screenToTile\(pt\)\)/);
    assert.match(aim, /'fire'\) \{ this\._wheelCommit\(\)/, 'fires through the confirm-guarded commit');
    assert.match(aim, /hitHud\(/, 'the dock is not the world');
  });

  test('an empty tile beside you arms the turn-press instead of walking on press', () => {
    const down = body('_onCanvasPointerDown');
    const arm = down.indexOf('_armTurnPress(tile, face, e)');
    assert.ok(arm > 0);
    assert.ok(arm < down.indexOf('_tapWalkTo(tile)'), 'checked before click-to-move');
    assert.match(down, /const face = !target && adjacentFacing\(this\.playerX, this\.playerY, tile\)/);
  });

  test('a long-press turns without stepping; a quick release walks the step', () => {
    const arm = body('_armTurnPress');
    assert.match(arm, /this\.facing = face;/);
    assert.doesNotMatch(arm, /_doMove|_walkPath|_advanceWorld/, 'turning in place is free');
    assert.match(arm, /, 450\);/, 'the same long-press time as the Target List');
    const rel = body('_releaseTurnPress');
    assert.match(rel, /e\.type !== 'pointerup'/, 'a cancelled pointer walks nowhere');
    assert.match(rel, /this\._tapWalkTo\(tp\.tile\)/);
    assert.match(mainSrc, /cancelPress\(\);\s*\n\s*this\._releaseTurnPress\(e\);/, 'endPress resolves it');
  });

  test('click-to-move further away still walks on the press', () => {
    const walk = body('_tapWalkTo');
    assert.match(walk, /findPath\(this, \{ x: this\.playerX, y: this\.playerY \}, tile\)/);
    assert.match(walk, /this\._walkPath\(path\)/);
  });
});
