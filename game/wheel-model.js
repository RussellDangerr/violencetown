// wheel-model.js — pure state model for the circular-XMB combat wheel.
// Verb tree (Fight/Trick/Treat/Flight) → item/spell → aim, navigated by one
// grammar (forward/back/cycle). No DOM/canvas; main.js drives it and routes
// compose(). See plans/combat-wheel-rework.md.

import { SPELLS } from './spells.js';

const always = () => true;

// Leaf: { key, label, needsItem?, needsSpell?, aimType, resolver, dep?, available(game) }
//   aimType: 'reticle' (free placement) | 'adjacent' (range-1 direction) | 'none' (self)
//   needsSpell: true → Magic; drills a SPELL ring (pick Fireball / Cone of Cold) before aim.
export const VERB_TREE = {
  FIGHT: { label: 'FIGHT', subverbs: [
    { key: 'melee',  label: 'Melee',  needsItem: false, aimType: 'adjacent', resolver: 'combatAttack', available: always },
    // Cleave: a fixed 3-tile frontal ARC (the aimed tile + its two flanks). You
    // commit to all three — no sub-selecting — so it can clip an ally on the
    // far square (the Plus-Ultra confirm guards that). 2/3 weapon damage each.
    { key: 'cleave', label: 'Cleave', needsItem: false, aimType: 'adjacent', resolver: 'cleaveAttack', available: always },
    // Spin: no aim — sweeps all 8 tiles around you for 2/5 damage to everything.
    { key: 'spin',   label: 'Spin',   needsItem: false, aimType: 'none',     resolver: 'spinAttack',   available: always },
    // Ranged: throw a rock/potion at range (duplicate of TRICK → Throw, by design
    // — you throw things, so it lives under both).
    { key: 'ranged', label: 'Ranged', needsItem: true,  aimType: 'reticle',  resolver: 'resolveThrow', available: always },
    { key: 'magic',  label: 'Magic',  needsItem: false, needsSpell: true, aimType: 'reticle', resolver: 'castSpell',
      available: (g) => (g.playerMp || 0) > 0 && ((g.knownSpells && g.knownSpells.length) || 0) > 0 },
  ]},
  TRICK: { label: 'TRICK', subverbs: [
    { key: 'throw', label: 'Throw', needsItem: true,  aimType: 'reticle',  resolver: 'resolveThrow', available: always },
    { key: 'trade', label: 'Trade', needsItem: false, aimType: 'adjacent', resolver: 'trade',        available: always },
  ]},
  TREAT: { label: 'TREAT', subverbs: [
    { key: 'eat',     label: 'Eat',     needsItem: true, aimType: 'none', resolver: 'resolveUse', available: always },
    { key: 'cleanse', label: 'Cleanse', needsItem: true, aimType: 'none', resolver: 'resolveUse', available: always },
  ]},
  FLIGHT: { label: 'FLIGHT', subverbs: [
    { key: 'defend', label: 'Defend', needsItem: false, aimType: 'none',     resolver: 'guard', available: always },
    { key: 'hide',   label: 'Hide',   needsItem: false, aimType: 'none',     resolver: 'hide',  dep: true, available: always },
    { key: 'wait',   label: 'Wait',   needsItem: false, aimType: 'none',     resolver: 'wait',  available: always },
    { key: 'run',    label: 'Run',    needsItem: false, aimType: 'adjacent', resolver: 'run',   available: always },
  ]},
};

export const categoryKeys = () => Object.keys(VERB_TREE);
export const leafAt = (catKey, i) => VERB_TREE[catKey].subverbs[i];

// SPELL sits between SUBVERB and AIM (parallel to ITEM): Magic drills it to pick
// which spell before aiming. CONFIRM is the "Plus Ultra" friendly-hit guard.
export const LAYER = { CATEGORY: 0, SUBVERB: 1, ITEM: 2, SPELL: 3, AIM: 4, CONFIRM: 5 };

const OFFENSIVE_RESOLVERS = new Set(['combatAttack', 'cleaveAttack', 'spinAttack', 'resolveThrow', 'castSpell']);
export const isOffensiveLeaf = (leaf) => OFFENSIVE_RESOLVERS.has(leaf.resolver);

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
  const leaf = currentLeaf(w);
  const px = game.playerX, py = game.playerY;
  if (leaf.resolver === 'spinAttack') return RING8.map(([dx, dy]) => ({ x: px + dx, y: py + dy }));
  const ret = w.reticle;
  if (!ret) return [];
  if (leaf.resolver === 'cleaveAttack') return cleaveArc(px, py, ret);
  if (leaf.key === 'magic') {
    const sp = selectedSpell(w, game);
    if (sp && sp.aoe && sp.aoe.shape === 'cone')  return coneTiles(px, py, ret, sp.aoe.depth || 3);
    if (sp && sp.aoe && sp.aoe.shape === 'burst') return burstTiles(ret, sp.aoe.radius || 1);
    return [ret];
  }
  if (leaf.resolver === 'resolveThrow') return burstTiles(ret, 1); // throw bursts 3×3
  return [ret]; // single-target (melee, etc.)
}

// True when firing the current (offensive) action would strike a FRIENDLY — a
// live non-hostile entity (ally, vendor, idle/dialogue NPC) on ANY affected tile.
// Spin has no aim layer, so it isn't gated (it sweeps everything by design).
export function needsFriendlyConfirm(w, game) {
  const leaf = currentLeaf(w);
  if (!isOffensiveLeaf(leaf) || leaf.aimType === 'none') return false;
  const tiles = affectedTiles(w, game);
  if (!tiles.length) return false;
  return (game.enemies || []).some(e => {
    if (!e.entity.isAlive()) return false;
    if (!tiles.some(t => t.x === e.x && t.y === e.y)) return false;
    const hostile = (e.behavior == null) || e.behavior.includes('HOSTILE');
    return !hostile;
  });
}

export function createWheelState() {
  return {
    layer: LAYER.CATEGORY,
    categoryIndex: 0,
    subVerbIndex: 0,
    itemIndex: 0,
    spellIndex: 0,
    reticle: null,   // {x,y} when in AIM
    lastFired: null, // {catKey, subKey, itemSlot, spellId, aimTile}
  };
}

export const currentCategory = (w) => VERB_TREE[categoryKeys()[w.categoryIndex]];
export const currentLeaf = (w) => currentCategory(w).subverbs[w.subVerbIndex];

const wrap = (i, n) => ((i % n) + n) % n;

// ── Spell ring (Magic) ───────────────────────────────────────────────────────
export const knownSpellIds = (game) => (game.knownSpells || []);
export const selectedSpellId = (w, game) => knownSpellIds(game)[wrap(w.spellIndex, Math.max(1, knownSpellIds(game).length))];
export const selectedSpell = (w, game) => SPELLS[selectedSpellId(w, game)];

function itemAllowedForLeaf(def, leaf) {
  if (leaf.resolver === 'resolveThrow') return def.useType ? def.useType.includes('throw') : true;
  if (leaf.resolver === 'resolveUse')  return def.useType ? (def.useType.includes('self') || def.useType.includes('use')) : true;
  return true;
}

export function validItemSlots(w, game) {
  const leaf = currentLeaf(w);
  if (!leaf.needsItem) return [];
  return (game.inventory || [])
    .map((slot, i) => ({ slot, i }))
    .filter(({ slot }) => slot && itemAllowedForLeaf(slot.itemDef, leaf))
    .map(({ i }) => i);
}

export function cycle(w, dir, game) {
  if (w.layer === LAYER.CATEGORY) {
    w.categoryIndex = wrap(w.categoryIndex + dir, categoryKeys().length);
    w.subVerbIndex = 0;
  } else if (w.layer === LAYER.SUBVERB) {
    w.subVerbIndex = wrap(w.subVerbIndex + dir, currentCategory(w).subverbs.length);
  } else if (w.layer === LAYER.ITEM) {
    const slots = validItemSlots(w, game);
    if (slots.length) {
      const at = Math.max(0, slots.indexOf(w.itemIndex));
      w.itemIndex = slots[wrap(at + dir, slots.length)];
    }
  } else if (w.layer === LAYER.SPELL) {
    const n = knownSpellIds(game).length;
    if (n) w.spellIndex = wrap(w.spellIndex + dir, n);
  }
  // AIM is the reticle (handled in main.js), not a carousel here.
}

// Returns 'fire' when the action is fully composed and should resolve; else undefined.
export function forward(w, game) {
  const leaf = currentLeaf(w);
  switch (w.layer) {
    case LAYER.CATEGORY:
      w.layer = LAYER.SUBVERB; return;
    case LAYER.SUBVERB:
      if (leaf.needsItem) {
        const slots = validItemSlots(w, game);
        if (!slots.length) return;               // empty item ring → can't advance
        if (!slots.includes(w.itemIndex)) w.itemIndex = slots[0];
        w.layer = LAYER.ITEM; return;
      }
      if (leaf.needsSpell) {
        if (!knownSpellIds(game).length) return; // no spells → can't advance
        w.layer = LAYER.SPELL; return;
      }
      if (leaf.aimType !== 'none') { w.layer = LAYER.AIM; return; }
      return 'fire';
    case LAYER.ITEM:
      if (leaf.aimType !== 'none') { w.layer = LAYER.AIM; return; }
      return 'fire';
    case LAYER.SPELL:
      if (leaf.aimType !== 'none') { w.layer = LAYER.AIM; return; }
      return 'fire';
    case LAYER.AIM:
      if (needsFriendlyConfirm(w, game)) { w.layer = LAYER.CONFIRM; return; }
      return 'fire';
    case LAYER.CONFIRM:
      return 'fire';
  }
}

// Returns 'close' when already at the top. Leaf-aware: AIM steps back to whichever
// of SPELL / ITEM / SUBVERB the leaf actually used.
export function back(w) {
  const leaf = currentLeaf(w);
  switch (w.layer) {
    case LAYER.CATEGORY: return 'close';
    case LAYER.SUBVERB:  w.layer = LAYER.CATEGORY; break;
    case LAYER.ITEM:
    case LAYER.SPELL:    w.layer = LAYER.SUBVERB; break;
    case LAYER.AIM:
      w.layer = leaf.needsSpell ? LAYER.SPELL : (leaf.needsItem ? LAYER.ITEM : LAYER.SUBVERB);
      break;
    case LAYER.CONFIRM:  w.layer = LAYER.AIM; break;
  }
  if (w.layer !== LAYER.AIM && w.layer !== LAYER.CONFIRM) w.reticle = null;
  return;
}

export function leafEnabled(leaf, game) {
  if (!leaf.available(game)) return false;
  if (leaf.needsItem) {
    const slots = (game.inventory || []).filter(s => s && itemAllowedForLeaf(s.itemDef, leaf));
    if (!slots.length) return false;
  }
  return true;
}

export function compose(w, game) {
  const leaf = currentLeaf(w);
  return {
    leaf,
    itemSlot: leaf.needsItem ? w.itemIndex : -1,
    spellId: leaf.needsSpell ? selectedSpellId(w, game) : null,
    aimTile: leaf.aimType === 'none' ? null : (w.reticle || null),
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
  if (leaf.aimType === 'adjacent') return 1;
  if (leaf.resolver === 'resolveThrow') {
    const s = (game.inventory || [])[game.wheel ? game.wheel.itemIndex : -1];
    return (s && s.itemDef && s.itemDef.range) || 5;
  }
  if (leaf.key === 'magic') {
    const sp = game.wheel ? selectedSpell(game.wheel, game) : null;
    return (sp && sp.range) || 6;
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
  const pool = (leaf.resolver === 'trade'
    ? alive
    : alive.filter(e => !e.behavior || e.behavior.includes('HOSTILE')))
    .filter(e => cheb(game.playerX, game.playerY, e.x, e.y) <= range);
  if (!pool.length) return safeFacing(game);
  return pool
    .map(e => ({ x: e.x, y: e.y, d: cheb(game.playerX, game.playerY, e.x, e.y) }))
    .sort((a, b) => a.d - b.d)
    .map(({ x, y }) => ({ x, y }))[0];
}
