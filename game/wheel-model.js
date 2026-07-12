// wheel-model.js — pure state model for the radial "sunburst" combat wheel.
// A node tree (MENU → categories → verbs → leaves) walked by one grammar:
//   cycle (rotate the active ring), drill (push a child / aim / fire), back (pop).
// State is a `path` of indices into ROOT.children. No DOM/canvas; main.js drives
// it and routes compose().

import { SPELLS } from './spells.js';
import { TRICKS } from './tricks.js';
import { hasItemDef } from './items.js';
import { isHostile } from './ai.js';

const always = () => true;

// A node is { key, label, available?, children?, resolver?, aimType?, needsItem?, needsSpell? }.
//   children → sub-wheel; no children → leaf.
//   aimType: 'reticle' (free placement) | 'adjacent' (range-1 direction) | 'none' (self)
//   needsItem → the action uses inventory slot 0 (a throwable-item sub-wheel is a
//   later pass). Magic is a sub-wheel whose children are the castable spells.
// Ranged is a leaf that throws slot 0; Magic drills a spell ring (each child
// carries its own spellId + castSpell resolver).
// (Phase 0 colour language) Category + Fight-method nodes carry their own
// `color`/`text`; the renderer paints each wedge from these (falling back to a
// hue map). Fight red; Melee red (base), Magic purple (red+mana-blue), Ranged
// amber (red+warm). Trick gold. Treat green. Flight now nests under Trick.
export const ROOT = { key: 'menu', label: 'MENU', children: [
  { key: 'fight', label: 'Fight', color: '#c8443a', text: '#fff3d0', children: [
    { key: 'melee', label: 'Melee', color: '#c8443a', text: '#fff3d0', children: [
      { key: 'hit',    label: 'Hit',    aimType: 'adjacent', resolver: 'combatAttack', available: always },
      // Cleave: a fixed 3-tile frontal ARC (the aimed tile + its two flanks). You
      // commit to all three — no sub-selecting — so it can clip an ally on the
      // far square (the Plus-Ultra confirm guards that). 2/3 weapon damage each.
      { key: 'cleave', label: 'Cleave', aimType: 'adjacent', resolver: 'cleaveAttack', available: always },
      // Spin: no aim — sweeps all 8 tiles around you for 2/5 damage to everything.
      { key: 'spin',   label: 'Spin',   aimType: 'none',     resolver: 'spinAttack',   available: always },
    ]},
    // Ranged: throw a rock/potion at range (duplicate of TRICK → Throw, by design
    // — you throw things, so it lives under both).
    { key: 'ranged', label: 'Ranged', color: '#e08a2a', text: '#2a1400', needsItem: true, aimType: 'reticle', resolver: 'resolveThrow', available: always },
    { key: 'magic',  label: 'Magic',  color: '#8250c4', text: '#f0e6ff',
      available: (g) => (g.playerMp || 0) > 0 && ((g.knownSpells && g.knownSpells.length) || 0) > 0,
      children: [
        { key: 'fireball', label: 'Fireball', spellId: 'fireball', color: '#e0552a', text: '#fff0e0', aimType: 'reticle', resolver: 'castSpell',
          available: (g) => (g.hasSpell ? g.hasSpell('fireball') : (g.knownSpells || []).includes('fireball')) && (g.playerMp || 0) >= (SPELLS.fireball ? SPELLS.fireball.mpCost : 0) },
        { key: 'coneofcold', label: 'Cone of Cold', spellId: 'coneOfCold', color: '#4aa6dc', text: '#eaf6ff', aimType: 'reticle', resolver: 'castSpell',
          available: (g) => (g.hasSpell ? g.hasSpell('coneOfCold') : (g.knownSpells || []).includes('coneOfCold')) && (g.playerMp || 0) >= (SPELLS.coneOfCold ? SPELLS.coneOfCold.mpCost : 0) },
        // Boo! — self-centred fear burst, no aim (fires around you). Granted by
        // the Fearmur (grantsSpells → knownSpells), so it only appears when worn.
        { key: 'boo', label: 'Boo!', spellId: 'boo', aimType: 'none', resolver: 'castBoo',
          available: (g) => (g.hasSpell ? g.hasSpell('boo') : (g.knownSpells || []).includes('boo')) && (g.playerMp || 0) >= (SPELLS.boo ? SPELLS.boo.mpCost : 0) },
      ] },
  ]},
  // Trick — the gold "situational GP" category. Flight (evasion) nests here now (spec §6).
  // (Phase 6a) GIVE was removed from the wheel — handing an item to any NPC now
  // happens inside the widened Trade window (offer mode). The give-action.js math
  // (applyGive/applyDispositionDelta/applyFlip) stays; only the verb/node died.
  { key: 'trick', label: 'Trick', color: '#cba43c', text: '#2a1f06', children: [
    { key: 'throw',  label: 'Throw',  needsItem: true,  aimType: 'reticle',  resolver: 'resolveThrow', available: always },
    { key: 'defend', label: 'Defend', aimType: 'none',                       resolver: 'guard',        available: always },
    { key: 'bribe',  label: 'Bribe',  aimType: 'adjacent',                   resolver: 'bribe',        available: always },
    { key: 'trade',  label: 'Trade',  aimType: 'adjacent',                   resolver: 'trade',        available: always },
    // (Armory reconciliation) GP-costed tricks granted by equipped tech gear —
    // siblings of Bribe/Trade, gated on grantedTricks + gold; castTrick spends GP.
    { key: 'rayblast', label: 'Ray Blast', trickId: 'ray_blast', aimType: 'reticle', resolver: 'castTrick',
      available: (g) => (g.hasTrick ? g.hasTrick('ray_blast') : (g.grantedTricks || []).includes('ray_blast')) && (g.gold || 0) >= (TRICKS.ray_blast ? TRICKS.ray_blast.gpCost : 0) },
    // Hire a Lion — a self-target summon (no aim); granted by the Lion Whip.
    { key: 'hirelion', label: 'Hire Lire', trickId: 'hire_lion', aimType: 'none', resolver: 'castTrick',
      available: (g) => (g.hasTrick ? g.hasTrick('hire_lion') : (g.grantedTricks || []).includes('hire_lion')) && (g.gold || 0) >= (TRICKS.hire_lion ? TRICKS.hire_lion.gpCost : 0) },
    // Flight (evasion) sub-wheel — kept from dev's two-wheels layout (spec §6).
    { key: 'flight', label: 'Flight', color: '#cba43c', text: '#2a1f06', children: [
      { key: 'run',  label: 'Run',  aimType: 'adjacent', resolver: 'run',  available: always },
      { key: 'hide', label: 'Hide', aimType: 'none',     resolver: 'hide', available: always },
      { key: 'wait', label: 'Wait', aimType: 'none',     resolver: 'wait', available: always },
    ]},
  ]},
  { key: 'treat', label: 'Treat', color: '#4f9b4a', text: '#effbe9', children: [
    { key: 'eat',     label: 'Eat',     needsItem: true, aimType: 'none', resolver: 'resolveUse', available: always },
    { key: 'cleanse', label: 'Cleanse', needsItem: true, aimType: 'none', resolver: 'resolveUse', available: always },
  ]},
]};

const OFFENSIVE_RESOLVERS = new Set(['combatAttack', 'cleaveAttack', 'spinAttack', 'resolveThrow', 'castSpell', 'castTrick']);
export const isOffensiveLeaf = (node) => OFFENSIVE_RESOLVERS.has(node.resolver);

// ── Geometry (the single source of truth for what an action hits) ────────────
const cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
// 8 neighbours, clockwise from N.
const RING8 = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];

function dirIndex(px, py, t) {
  const dx = Math.sign(t.x - px), dy = Math.sign(t.y - py);
  return RING8.findIndex(([rx, ry]) => rx === dx && ry === dy);
}
// Cleave's 3-tile frontal arc: the aimed adjacent tile + its two ring neighbours.
function cleaveArc(px, py, t) {
  let i = dirIndex(px, py, t);
  if (i < 0) i = 4; // reticle on the player → default facing down
  return [RING8[(i + 7) % 8], RING8[i], RING8[(i + 1) % 8]].map(([dx, dy]) => ({ x: px + dx, y: py + dy }));
}
// 3×3 (radius r) burst around a centre tile.
function burstTiles(c, r) {
  const out = [];
  for (let x = c.x - r; x <= c.x + r; x++) for (let y = c.y - r; y <= c.y + r; y++) out.push({ x, y });
  return out;
}
// A cardinal cone of `depth` from the player toward the reticle: widths 1,3,5…
// (a 45° triangle). The aim is cardinalised to the dominant axis.
function coneTiles(px, py, t, depth) {
  let dx = t.x - px, dy = t.y - py;
  if (Math.abs(dx) >= Math.abs(dy)) { dx = Math.sign(dx) || 0; dy = 0; } else { dx = 0; dy = Math.sign(dy); }
  if (dx === 0 && dy === 0) dy = 1;
  const perpx = dy, perpy = dx; // unit perpendicular
  const out = [];
  for (let k = 1; k <= depth; k++) {
    const cx = px + dx * k, cy = py + dy * k;
    for (let w = -(k - 1); w <= (k - 1); w++) out.push({ x: cx + perpx * w, y: cy + perpy * w });
  }
  return out;
}

// Tiles the current action would hit — drives the preview, the friendly-confirm,
// and damage resolution, so the highlight and the hit are guaranteed identical.
export function affectedTiles(w, game) {
  const leaf = selectedNode(w);
  const px = game.playerX, py = game.playerY;
  if (leaf.resolver === 'spinAttack') return RING8.map(([dx, dy]) => ({ x: px + dx, y: py + dy }));
  // (fear) Boo! — a self-centred burst around the player; no reticle needed.
  if (leaf.resolver === 'castBoo') {
    const sp = SPELLS[leaf.spellId];
    return burstTiles({ x: px, y: py }, (sp && sp.aoe && sp.aoe.radius) || 2);
  }
  const ret = w.reticle;
  if (!ret) return [];
  if (leaf.resolver === 'cleaveAttack') return cleaveArc(px, py, ret);
  if (leaf.resolver === 'castSpell') {
    const sp = SPELLS[leaf.spellId];
    if (sp && sp.aoe && sp.aoe.shape === 'cone')  return coneTiles(px, py, ret, sp.aoe.depth || 3);
    if (sp && sp.aoe && sp.aoe.shape === 'burst') return burstTiles(ret, sp.aoe.radius || 1);
    return [ret];
  }
  if (leaf.resolver === 'castTrick') {
    const tr = TRICKS[leaf.trickId];
    if (tr && tr.aoe && tr.aoe.shape === 'cone')  return coneTiles(px, py, ret, tr.aoe.depth || 3);
    if (tr && tr.aoe && tr.aoe.shape === 'burst') return burstTiles(ret, tr.aoe.radius || 1);
    return [ret];
  }
  if (leaf.resolver === 'resolveThrow') return burstTiles(ret, 1); // throw bursts 3×3
  return [ret]; // single-target (melee, etc.)
}

// True when firing the current (offensive) action would strike a FRIENDLY — a
// live non-hostile entity (ally, vendor, idle/dialogue NPC) on ANY affected tile.
// Spin has no aim layer, so it isn't gated (it sweeps everything by design).
export function needsFriendlyConfirm(w, game) {
  const leaf = selectedNode(w);
  if (!isOffensiveLeaf(leaf) || leaf.aimType === 'none') return false;
  const tiles = affectedTiles(w, game);
  if (!tiles.length) return false;
  return (game.enemies || []).some(e => {
    if (!e.entity.isAlive()) return false;
    if (!tiles.some(t => t.x === e.x && t.y === e.y)) return false;
    const hostile = isHostile(e);
    return !hostile;
  });
}

export function createWheelState() {
  return {
    path: [0],       // indices into ROOT.children; path[last] = selection in the active ring
    itemIndex: 0,
    reticle: null,   // {x,y} when aiming
    lastFired: null, // {path, nodeKey, itemSlot, spellId, aimTile} — written by main.js on fire
    aiming: false,
    _memory: {},     // ring path-key → remembered selection index
    // (Phase 3 juice) animation timestamps — written by main.js, read by the renderer.
    _spinAt: 0, _spinDir: 0, _drillAt: 0, _drillDir: 0,
  };
}

const wrap = (i, n) => ((i % n) + n) % n;

// ── Tree-walk helpers (pure) ─────────────────────────────────────────────────
// nodeAt / decisionPath walk the REAL unpadded children for locked parent levels
// (a parent is always real — drilling a placeholder is a no-op, see drill()).
function nodeAt(indices) { let n = ROOT; for (const i of indices) n = n.children[i]; return n; }
export function activeRing(w)   { return paddedRing(nodeAt(w.path.slice(0, -1)).children); }
export function activeIndex(w)  { return w.path[w.path.length - 1]; }
export function selectedNode(w) { return activeRing(w)[activeIndex(w)]; }
export function isLeaf(node)    { return !node.children || node.children.length === 0; }
export function decisionPath(w) {
  const out = [ROOT.label];
  let n = ROOT;
  for (let d = 0; d < w.path.length - 1; d++) { n = n.children[w.path[d]]; out.push(n.label); }
  return out;
}
export function previewChildren(w) { const s = selectedNode(w); return (s.children || []); }

// ── Placeholder padding ──────────────────────────────────────────────────────
// A ring needs ≥2 tiles to spin. Thin rings get non-selectable placeholders
// appended; cycle may land on one (fine), drill on one is a no-op ('bump').
export function paddedRing(ring) {
  if (!ring || ring.length >= 2) return ring;            // already spinnable
  // Disposable placeholders, regenerated each call — a thin ring still spins.
  const pads = [{ key: 'placeholder1', label: '…', placeholder: true },
                { key: 'placeholder2', label: '…', placeholder: true }];
  return ring.concat(pads).slice(0, 2);                  // 1 real + 1 pad, or 2 pads
}

// ── Cursor memory ────────────────────────────────────────────────────────────
// pathKey = the CURRENT ring's key (parent path). childKey = the ring we drill
// INTO (parent path + current selection). cycle/drill record the active index so
// re-entering a ring restores it; drill-push opens the child on its remembered index.
const pathKey  = (w) => w.path.slice(0, -1).join('.');
const childKey = (w) => w.path.join('.');

// If the root ring has a remembered selection, reopen the wheel on it.
export function restoreLastCategory(w) {
  const i = w._memory[''];
  if (i == null) return;
  w.path = [Math.max(0, Math.min(i, ROOT.children.length - 1))];
}

// ── cycle / drill / back ─────────────────────────────────────────────────────
export function cycle(w, dir) {
  const ring = activeRing(w);
  w.path[w.path.length - 1] = wrap(activeIndex(w) + dir, ring.length);
  w._memory[pathKey(w)] = activeIndex(w);
}

// Returns 'bump' (placeholder no-op) | 'fire' (resolve now) | 'aim' (enter reticle) | 'push' (descended into a sub-wheel).
export function drill(w, game) {
  const s = selectedNode(w);
  if (s.placeholder) return 'bump';
  if (isLeaf(s) && !s.needsItem && !s.needsSpell && s.aimType === 'none') return 'fire'; // self leaf (Spin/Defend/Wait)
  if (isLeaf(s)) { w.aiming = (s.aimType !== 'none'); return w.aiming ? 'aim' : 'fire'; }
  w._memory[pathKey(w)] = activeIndex(w);
  w.path.push(w._memory[childKey(w)] ?? 0);
  return 'push';
}

// Returns 'close' when already at the top ring.
export function back(w) {
  if (w.path.length <= 1) return 'close';
  w.path.pop();
  w.reticle = null;
  w.aiming = false;
}

export function compose(w, game) {
  const node = selectedNode(w);
  return {
    node,
    itemSlot: node.needsItem ? w.itemIndex : -1,
    spellId:  node.spellId || null,
    aimTile:  node.aimType === 'none' ? null : (w.reticle || null),
  };
}

const FACING_DELTA = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
function facingTile(g) { const [dx, dy] = FACING_DELTA[g.facing] || [0, 1]; return { x: g.playerX + dx, y: g.playerY + dy }; }
function safeFacing(g) {
  const f = facingTile(g);
  return (g.map && g.map.isWalkable(f.x, f.y)) ? f : { x: g.playerX, y: g.playerY };
}

// Reticle reach: adjacent verbs lock to 1, Throw uses the item's range (else 5),
// Magic uses the selected spell's range, everything else 1.
export function aimRange(leaf, game) {
  // Melee Hit reaches as far as the equipped weapon allows (Lion Whip = 3);
  // every other adjacent verb (Cleave/Bribe/Give/Trade/Run) stays range 1.
  if (leaf.resolver === 'combatAttack') {
    const w = game && game.equipment && game.equipment.weapon;
    return (w && w.reach) || 1;
  }
  if (leaf.aimType === 'adjacent') return 1;
  if (leaf.resolver === 'resolveThrow') {
    const s = (game.inventory || [])[game.wheel ? game.wheel.itemIndex : -1];
    return (s && s.itemDef && s.itemDef.range) || 5;
  }
  if (leaf.resolver === 'castSpell') {
    const sp = SPELLS[leaf.spellId];
    return (sp && sp.range) || 6;
  }
  if (leaf.resolver === 'castTrick') {
    const tr = TRICKS[leaf.trickId];
    return (tr && tr.range) || 6;
  }
  return 1;
}

// Reticle seed: nearest IN-RANGE hostile for offence, adjacent character for
// Trade, safest walkable adjacent for Run, else a safe facing tile.
export function autoAimTile(leaf, game) {
  if (leaf.aimType === 'none') return null;
  const alive = (game.enemies || []).filter(e => e.entity.isAlive());
  const range = aimRange(leaf, game);
  if (leaf.resolver === 'run') {
    const cands = Object.values(FACING_DELTA)
      .map(([dx, dy]) => ({ x: game.playerX + dx, y: game.playerY + dy }))
      .filter(t => game.map.isWalkable(t.x, t.y));
    if (!cands.length) return safeFacing(game);
    const distTo = t => alive.length ? Math.min(...alive.map(e => cheb(t.x, t.y, e.x, e.y))) : 99;
    return cands.sort((a, b) => distTo(b) - distTo(a))[0];
  }
  const social = leaf.resolver === 'trade' || leaf.resolver === 'bribe';
  const pool = (social
    ? alive
    : alive.filter(e => isHostile(e)))
    .filter(e => cheb(game.playerX, game.playerY, e.x, e.y) <= range);
  if (!pool.length) return safeFacing(game);
  return pool
    .map(e => ({ x: e.x, y: e.y, d: cheb(game.playerX, game.playerY, e.x, e.y) }))
    .sort((a, b) => a.d - b.d)
    .map(({ x, y }) => ({ x, y }))[0];
}

// (Phase 1 — appliesTo) Does this verb have a valid TARGET in range right now?
// Categories + self-verbs + free-placement (reticle) verbs always apply; only an
// ADJACENT-target verb (Hit/Cleave/Bribe/Trade) or Run needs a real neighbour.
// Drives the wheel's gray-out (tileEnabled) + the fire-gate (_wheelDrill).
// Item/MP presence is a separate axis, handled by `available`.
export function verbApplies(node, game) {
  if (!node || node.placeholder) return false;
  if (node.children && node.children.length) return true;   // a category — always navigable
  if (node.aimType === 'none') return true;                 // self verb — no target
  if (node.aimType === 'reticle') return true;              // free tile placement — always aimable
  if (node.resolver === 'run') {
    return Object.values(FACING_DELTA).some(([dx, dy]) =>
      game.map && game.map.isWalkable(game.playerX + dx, game.playerY + dy));
  }
  const alive = (game.enemies || []).filter(e => e.entity.isAlive());
  const social = node.resolver === 'trade' || node.resolver === 'bribe';
  const pool = social ? alive : alive.filter(e => isHostile(e));
  return pool.some(e => cheb(game.playerX, game.playerY, e.x, e.y) <= 1);
}

// ── Combat state (§12.5 aggro re-skin) ───────────────────────────────────────
// True when the player is in an active fight: any non-ambient, still-alive enemy
// is CHASING (the same signal that locks the world in main._inCombat, which now
// delegates here). Drives the wheel's combat re-skin. Pure — game in, bool out.
export function isCombatActive(game) {
  return (game && game.enemies || []).some(e =>
    !e.ambient && e.state === 'chasing' && e.entity && e.entity.isAlive());
}

// ── Flapper (§12.4) ──────────────────────────────────────────────────────────
// A wheel-of-fortune "clicker": it kicks in the spin direction the instant a
// slice cycles, then springs back past rest and settles. `p` is the spin
// animation progress in [0,1] (0 = just cycled, 1 = settled); `dir` is the cycle
// direction (±1, 0 = at rest). Returns a deflection in radians (rest = 0).
// reduce-motion callers hold it at 0 rather than calling this. Pure/testable:
//   flapperDeflection(0, 1) ≈ +0.5 · flapperDeflection(1, dir) = 0 · (*, 0) = 0.
export function flapperDeflection(p, dir) {
  if (!dir) return 0;
  const t = Math.max(0, Math.min(1, p));
  const MAX = 0.5;                          // ~28° peak kick
  const decay = (1 - t) * (1 - t);          // eased fall back toward rest
  const spring = Math.sin(t * Math.PI) * 0.18; // brief counter-wobble past 0
  return dir * (MAX * decay - spring);
}

// ── Target List verbs ────────────────────────────────────────────────────────
// The verbs valid for a tapped TARGET, alphabetical. A target descriptor is
// { x, y, npc?, item?, examinable? }. Colours ride the shared language: Examine
// steel, social/economic gold, Hit red, Throw amber, Take green. Adjacent-only
// verbs (Talk/Trade/Bribe/Hit) gate on range 1; Examine + ranged Throw don't.
// (Phase 6a) Trade now shows for ANY adjacent NPC (not just vendors) — the
// widened trade window is where you hand an item to a non-vendor (offer mode),
// so Give folded into it. Bandit/townsfolk/boss all become "trade-able".
export function targetVerbs(target, game) {
  if (!target) return [];
  const haveThrow = hasItemDef(game, d => d && d.useType && String(d.useType).includes('throw'));
  const V = [];
  V.push({ key: 'examine', label: 'Examine', color: '#9aa0a6', text: '#23262b', icon: '?', resolver: 'examine' });
  if (target.npc) {
    const e = target.npc;
    const hostile = isHostile(e);
    if (e.dialogueId)          V.push({ key: 'talk',  label: 'Talk',  color: '#3f9aa0', text: '#eafafa', resolver: 'talk',  needsAdjacent: true });
    V.push({ key: 'trade', label: 'Trade', color: '#cba43c', text: '#2a1f06', icon: '⇄', resolver: 'trade', needsAdjacent: true });
    if (e.bribeable !== false) V.push({ key: 'bribe', label: 'Bribe', color: '#cba43c', text: '#2a1f06', icon: '¤', resolver: 'bribe', needsAdjacent: true });
    if (hostile)               V.push({ key: 'hit',   label: 'Hit',   color: '#c8443a', text: '#fff3d0', icon: '⚔', resolver: 'hit',   needsAdjacent: true });
    if (hostile && haveThrow)  V.push({ key: 'throw', label: 'Throw', color: '#e08a2a', text: '#2a1400', icon: '➹', resolver: 'throw' });
  }
  // Verbs are offered regardless of range; the adjacency-requiring ones carry
  // needsAdjacent and the fire path walks the Hero adjacent FIRST (path-then-act,
  // pointer-model slice). Examine + Throw are rangeless. (Supersedes the old
  // offer-time adjacency gate — walking now prevents the reach-across-map grab.)
  if (target.item) V.push({ key: 'take', label: 'Take', color: '#4f9b4a', text: '#effbe9', resolver: 'take', needsAdjacent: true });
  return V.sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
}

// ── Target List (RuneScape-style menu) ───────────────────────────────────────
// The interact-with-a-target menu is a vertical LIST, not a ring (only the ACTION
// wheel is radial — so the two never get confused). Same verb set as targetVerbs,
// re-ordered by CONVENTION: the natural default action on top, then other verbs,
// then Examine, then a Cancel row at the bottom. (`Walk here` + path-then-act
// arrive with the pointer-model slice; not present yet.)
const TARGET_VERB_RANK = { hit: 0, talk: 0, take: 0, trade: 20, bribe: 30, throw: 40, examine: 90 };

// The default verb for a target — the top-of-list / bare-tap action, chosen by
// TYPE independent of range: item→Take, hostile NPC→Hit, friendly-with-dialogue
// →Talk, else Examine. Returns the full verb object (or null).
export function defaultVerb(target, game) {
  if (!target) return null;
  const verbs = targetVerbs(target, game);
  const npc = target.npc;
  const hostile = isHostile(npc);
  const key = target.item ? 'take'
    : npc ? (hostile ? 'hit' : (npc.dialogueId ? 'talk' : 'examine'))
    : 'examine';
  return verbs.find(v => v.key === key) || verbs.find(v => v.key === 'examine') || verbs[0] || null;
}

export function orderedTargetVerbs(target, game) {
  const verbs = targetVerbs(target, game).slice();
  const defaultKey = (defaultVerb(target, game) || {}).key;
  const rank = (v) => (v.key === defaultKey ? -1 : (TARGET_VERB_RANK[v.key] ?? 50));
  verbs.sort((a, b) => rank(a) - rank(b) || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
  verbs.push({ key: 'cancel', label: 'Cancel', resolver: 'cancel', color: '#4a3c2a', text: '#b0a184' });
  return verbs;
}
