// wheel-model.js — pure state model for the circular-XMB combat wheel.
// Verb tree (Fight/Trick/Treat/Flight) → item → aim, navigated by one grammar
// (forward/back/cycle). No DOM/canvas; main.js drives it and routes compose().
// See plans/combat-wheel-rework.md. The old game/action-wheel.js (grip+spin)
// stays in use until the cutover task; this file is additive.

const always = () => true;

// Leaf: { key, label, needsItem, aimType, resolver, dep?, available(game) }
//   aimType: 'reticle' (free placement) | 'adjacent' (range-1 lock) | 'none' (self)
//   dep: true → mechanic ships in a later pass; leaf shows greyed / wired to a stub
export const VERB_TREE = {
  FIGHT: { label: 'FIGHT', subverbs: [
    { key: 'melee',  label: 'Melee',  needsItem: false, aimType: 'adjacent', resolver: 'combatAttack', available: always },
    { key: 'ranged', label: 'Ranged', needsItem: false, aimType: 'reticle',  resolver: 'rangedAttack', dep: true,
      available: (g) => !!(g.equipment && g.equipment.weapon && g.equipment.weapon.ranged) },
    { key: 'magic',  label: 'Magic',  needsItem: false, aimType: 'reticle',  resolver: 'castSpell',    dep: true,
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

export const LAYER = { CATEGORY: 0, SUBVERB: 1, ITEM: 2, AIM: 3 };

export function createWheelState() {
  return {
    layer: LAYER.CATEGORY,
    categoryIndex: 0,
    subVerbIndex: 0,
    itemIndex: 0,
    reticle: null,   // {x,y} when in AIM
    lastFired: null, // {catKey, subKey, itemSlot, aimTile}
  };
}

export const currentCategory = (w) => VERB_TREE[categoryKeys()[w.categoryIndex]];
export const currentLeaf = (w) => currentCategory(w).subverbs[w.subVerbIndex];

const wrap = (i, n) => ((i % n) + n) % n;

function itemAllowedForLeaf(def, leaf) {
  if (leaf.key === 'throw')            return def.useType ? def.useType.includes('throw') : true;
  if (leaf.resolver === 'resolveUse')  return def.useType ? def.useType.includes('use') : true;
  return true;
}

// Inventory slot indices valid for the current leaf's item ring.
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
      if (leaf.aimType !== 'none') { w.layer = LAYER.AIM; return; }
      return 'fire';
    case LAYER.ITEM:
      if (leaf.aimType !== 'none') { w.layer = LAYER.AIM; return; }
      return 'fire';
    case LAYER.AIM:
      return 'fire';
  }
}

// Returns 'close' when already at the top.
export function back(w) {
  if (w.layer === LAYER.CATEGORY) return 'close';
  w.layer -= 1;
  if (w.layer < LAYER.SUBVERB) w.layer = LAYER.CATEGORY;
  w.reticle = null;
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

export function compose(w) {
  const leaf = currentLeaf(w);
  return {
    leaf,
    itemSlot: leaf.needsItem ? w.itemIndex : -1,
    aimTile: leaf.aimType === 'none' ? null : (w.reticle || null),
  };
}

const FACING_DELTA = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
function facingTile(g) { const [dx, dy] = FACING_DELTA[g.facing] || [0, 1]; return { x: g.playerX + dx, y: g.playerY + dy }; }

// Reticle's starting tile: nearest hostile for Fight/Throw, adjacent character for
// Trade, safest walkable adjacent for Run, else the player's facing tile.
export function autoAimTile(leaf, game) {
  if (leaf.aimType === 'none') return null;
  const alive = (game.enemies || []).filter(e => e.entity.isAlive());
  if (leaf.resolver === 'run') {
    const cands = Object.values(FACING_DELTA)
      .map(([dx, dy]) => ({ x: game.playerX + dx, y: game.playerY + dy }))
      .filter(t => game.map.isWalkable(t.x, t.y));
    if (!cands.length) return facingTile(game);
    const distTo = t => alive.length ? Math.min(...alive.map(e => cheb(t.x, t.y, e.x, e.y))) : 99;
    return cands.sort((a, b) => distTo(b) - distTo(a))[0];
  }
  const pool = leaf.resolver === 'trade'
    ? alive
    : alive.filter(e => !e.behavior || e.behavior.includes('HOSTILE'));
  if (!pool.length) return facingTile(game);
  return pool
    .map(e => ({ x: e.x, y: e.y, d: cheb(game.playerX, game.playerY, e.x, e.y) }))
    .sort((a, b) => a.d - b.d)
    .map(({ x, y }) => ({ x, y }))[0];
}
