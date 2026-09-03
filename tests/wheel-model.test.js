import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ROOT, createWheelState, cycle, drill, back,
  selectedNode, isOffensiveLeaf, verbApplies,
  isCombatActive, flapperDeflection,
} from '../game/wheel-model.js';

const catKeys = () => ROOT.children.map(c => c.key);
const kidKeys = (node) => (node.children || []).map(c => c.key);

// A minimal game stub — enough for the pure walkers/predicates below.
const stubGame = (over = {}) => ({
  playerX: 5, playerY: 5, playerMp: 0, facing: 'down',
  inventory: [], enemies: [], knownSpells: [], grantedTricks: [], gold: 0,
  equipment: {}, map: { isWalkable: () => true }, ...over,
});

// ── Tree shape (the live sunburst ROOT) ──────────────────────────────────────

test('ROOT is Fight / Trick / Treat, in order', () => {
  assert.deepEqual(catKeys(), ['fight', 'trick', 'treat']);
});

test('Fight → Melee/Ranged/Magic; Melee → Hit/Cleave/Spin', () => {
  const fight = ROOT.children[0];
  assert.deepEqual(kidKeys(fight), ['melee', 'ranged', 'magic']);
  assert.deepEqual(kidKeys(fight.children[0]), ['hit', 'cleave', 'spin']);
});

test('Flight nests under Trick (not a top-level category); Armory tricks are Trick siblings', () => {
  assert.ok(!catKeys().includes('flight'));
  const trick = ROOT.children[1];
  assert.ok(kidKeys(trick).includes('flight'));
  assert.ok(kidKeys(trick).includes('rayblast'));
  assert.ok(kidKeys(trick).includes('hirelion'));
});

test('Treat → Eat/Cleanse (self-use)', () => {
  const treat = ROOT.children[2];
  assert.deepEqual(kidKeys(treat), ['eat', 'cleanse']);
});

// ── cycle / drill / back grammar ─────────────────────────────────────────────

test('a fresh wheel opens on the root ring at Fight', () => {
  const w = createWheelState();
  assert.deepEqual(w.path, [0]);
  assert.equal(selectedNode(w).key, 'fight');
});

test('cycle wraps the active ring', () => {
  const w = createWheelState();
  cycle(w, -1);
  assert.equal(selectedNode(w).key, 'treat');   // wrapped back to last
  cycle(w, 1);
  assert.equal(selectedNode(w).key, 'fight');
});

test('drill descends a category', () => {
  const w = createWheelState();
  assert.equal(drill(w, stubGame()), 'push');
  assert.equal(selectedNode(w).key, 'melee');
});

test('drill aims an adjacent leaf (Hit)', () => {
  const w = createWheelState();
  w.path = [0, 0, 0];                            // Fight → Melee → Hit
  assert.equal(selectedNode(w).key, 'hit');
  assert.equal(drill(w, stubGame()), 'aim');
});

test('drill fires a self leaf (Spin)', () => {
  const w = createWheelState();
  w.path = [0, 0, 0];                            // Fight → Melee → Hit
  cycle(w, 1); cycle(w, 1);                      // Hit → Cleave → Spin
  assert.equal(selectedNode(w).key, 'spin');
  assert.equal(drill(w, stubGame()), 'fire');
});

test('back pops a level, then closes at the root', () => {
  const w = createWheelState();
  w.path = [0, 0];
  assert.notEqual(back(w), 'close');             // → [0]
  assert.equal(back(w), 'close');                // at root
});

// ── verbApplies / isOffensiveLeaf ────────────────────────────────────────────

test('isOffensiveLeaf flags attack verbs, not social ones', () => {
  const hit = ROOT.children[0].children[0].children[0];
  assert.equal(isOffensiveLeaf(hit), true);
  const trade = ROOT.children[1].children.find(c => c.key === 'trade');
  assert.equal(isOffensiveLeaf(trade), false);
});

test('verbApplies: a category always applies; an adjacent verb needs a live neighbour', () => {
  const fight = ROOT.children[0];
  assert.equal(verbApplies(fight, stubGame()), true);
  const hit = fight.children[0].children[0];
  assert.equal(verbApplies(hit, stubGame()), false);             // nobody adjacent
  // `allegiance`, not the authored `behavior` array — isHostile() reads allegiance
  // (ai.js) and a bare stub never runs the Enemy ctor that derives it.
  const foe = { x: 6, y: 5, allegiance: 'hostile', entity: { isAlive: () => true } };
  assert.equal(verbApplies(hit, stubGame({ enemies: [foe] })), true);
});

// ── §12.5 isCombatActive ─────────────────────────────────────────────────────

test('isCombatActive: only a non-ambient, alive, chasing enemy counts', () => {
  const chasing = { state: 'chasing', entity: { isAlive: () => true } };
  const idle    = { state: 'idle',    entity: { isAlive: () => true } };
  const dead    = { state: 'chasing', entity: { isAlive: () => false } };
  const ambient = { state: 'chasing', ambient: true, entity: { isAlive: () => true } };
  assert.equal(isCombatActive(stubGame({ enemies: [] })), false);
  assert.equal(isCombatActive(stubGame({ enemies: [idle] })), false);
  assert.equal(isCombatActive(stubGame({ enemies: [dead] })), false);
  assert.equal(isCombatActive(stubGame({ enemies: [ambient] })), false);
  assert.equal(isCombatActive(stubGame({ enemies: [idle, chasing] })), true);
});

// ── §12.4 flapperDeflection ──────────────────────────────────────────────────

test('flapperDeflection: rests at 0, kicks in the cycle direction, settles', () => {
  assert.equal(flapperDeflection(0, 0), 0);          // no direction → exact early-return
  // "Fully settled" is |x| < epsilon, not === 0: the spring term is
  // Math.sin(t*PI)*0.18, and Math.sin(Math.PI) is 1.2246e-16 in IEEE-754 (pi
  // isn't exactly representable), so t=1 leaves ~2e-17 behind. That is ~2e-14 px
  // of deflection on a 1000px wheel — invisible, and inherent to float math.
  assert.ok(Math.abs(flapperDeflection(1, 1)) < 1e-9, 'settled deflection should be ~0');
  assert.ok(Math.abs(flapperDeflection(1, -1)) < 1e-9, 'settled deflection should be ~0');
  assert.ok(flapperDeflection(0, 1) > 0.4);          // fresh kick, positive
  assert.ok(flapperDeflection(0, -1) < -0.4);        // mirrored for the other dir
  // p clamps into [0,1], so p=5 must land exactly on the p=1 result (comparing
  // the two identical computations is exact — no epsilon needed to prove clamping).
  assert.equal(flapperDeflection(5, 1), flapperDeflection(1, 1));
});

// ── Thieve (perception/theft) ────────────────────────────────────────────────
//
// A transaction with the sign flipped, so it belongs beside Trade under Trick
// rather than under Fight. (The spec said "beside Bribe and Trade"; Bribe was
// folded into the offer screen on 2026-09-02, so Trade is what is left.)
//
// Availability is ASKED OF THE GAME rather than computed here, so wheel-model
// stays pure and never imports perception.
describe('Thieve on the wheel', () => {
  const thieveNode = () => ROOT.children.find(c => c.key === 'trick')
                               .children.find(c => c.key === 'thieve');

  test('sits under Trick with three children', () => {
    const thieve = thieveNode();
    assert.ok(thieve, 'Thieve must exist under Trick');
    assert.deepEqual(thieve.children.map(c => c.key), ['coin', 'kit', 'gear']);
  });

  test('greys out entirely unless you are hidden', () => {
    const thieve = thieveNode();
    assert.equal(thieve.available({ isHidden: () => false }), false);
    assert.equal(thieve.available({ isHidden: () => true }), true);
  });

  test('a game with no isHidden at all refuses rather than throwing', () => {
    assert.equal(thieveNode().available({}), false);
  });

  test('each child asks the game what the victim actually carries', () => {
    const asked = [];
    const g = { canThieve: (k) => { asked.push(k); return k === 'coin'; } };
    const kids = thieveNode().children;
    assert.deepEqual(kids.map(c => c.available(g)), [true, false, false]);
    assert.deepEqual(asked, ['coin', 'kit', 'gear']);
  });

  test('a game with no canThieve greys every child rather than throwing', () => {
    assert.deepEqual(thieveNode().children.map(c => c.available({})), [false, false, false]);
  });

  test('the three takes carry distinct resolvers and aim at a neighbour', () => {
    for (const c of thieveNode().children) {
      assert.equal(c.aimType, 'adjacent', `${c.key} must aim at someone beside you`);
      assert.match(c.resolver, /^thieve/, `${c.key} needs its own resolver`);
    }
    const resolvers = thieveNode().children.map(c => c.resolver);
    assert.equal(new Set(resolvers).size, 3, 'three takes, three resolvers');
  });

  test('Thieve is not an offensive leaf — it is a transaction', () => {
    assert.equal(isOffensiveLeaf(thieveNode()), false);
    for (const c of thieveNode().children) assert.equal(isOffensiveLeaf(c), false);
  });
});
