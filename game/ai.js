// ai.js — shared enemy-AI predicates (PD-3/NH-3). Leaf module (imports nothing)
// so every consumer (enemies/main/wheel-model/items) can use it without a cycle.
//
// `behavior` (the authored ctor input) is parsed ONCE into these two orthogonal
// things; runtime code reads `allegiance`, never `behavior`:
//   capabilities — immutable ambient states an NPC may occupy (IDLE/WANDER/WORKING)
//   allegiance   — mutable 'hostile' | 'neutral' | 'ally'

const AMBIENT_STATES = ['IDLE', 'WANDER', 'WORKING'];

// The immutable ambient-state whitelist from the authored `behavior` array.
// Born-hostiles (null behavior) get an empty set. ALLIED/HOSTILE tokens are not
// ambient capabilities (allegiance carries those).
export function parseCapabilities(behavior) {
  const caps = new Set();
  if (Array.isArray(behavior)) for (const s of behavior) if (AMBIENT_STATES.includes(s)) caps.add(s);
  return caps;
}

// Initial allegiance from the legacy spawn/save shape. Mirrors today exactly:
// an ALLIED array or a truthy _ally is an ally; a missing behavior array is a
// born-hostile chaser; anything else is a neutral townsperson.
export function deriveAllegiance(src) {
  const b = src && src.behavior;
  if ((Array.isArray(b) && b.includes('ALLIED')) || (src && src._ally)) return 'ally';
  if (b == null) return 'hostile';
  return 'neutral';
}

// The one hostility predicate — replaces the ~9 inline `!behavior && !_ally` checks.
export function isHostile(e) {
  return !!e && e.allegiance === 'hostile';
}

// SPECIES, not allegiance. Sewer fare is poison to humans and medicine to the
// things that live down there, and that must survive a disposition flip — a
// bribed Violet Fungus is your ally and still eats mushrooms. Deliberately NOT
// derived from `allegiance`, which answers a different question.
export function isSewerDweller(e) {
  return !!(e && e.sewerDweller);
}

// Default grunt heal policy — per-enemy policies come later (first boss build).
export const HEAL_HP_FLOOR  = 40; // buy only at or below this HP
export const HEAL_MIN_GOLD  = 20; // a sliver below this can never heal

// healPurchase — Law 6: enemies buy heals at the peg (1 GP = 1 HP).
// Rule: at or below HEAL_HP_FLOOR and holding at least HEAL_MIN_GOLD,
// spend min(gold, missing HP).
// Returns { spend, heal } or null. Pure — npc.js applies the result.
export function healPurchase(hp, maxHp, gold) {
  if (hp > HEAL_HP_FLOOR || gold < HEAL_MIN_GOLD) return null;
  const spend = Math.min(gold, maxHp - hp);
  if (spend <= 0) return null; // full-HP edge — no zero-GP turns
  return { spend, heal: spend };
}

// The rock's clatter — the game's first stealth affordance. It reuses PD-1's
// existing seam: npc.js already pursues _lastSeenX/_lastSeenY rather than the
// player's true position, so a rock sets a FALSE last-seen without the thrower
// ever having been seen.
//
// An enemy already chasing is NOT redirected — a rock distracts, it does not
// rescue you from a fight you already started.
export function rockClatter(enemies, x, y) {
  for (const e of enemies || []) {
    if (!e || e.state === 'chasing') continue;
    // Hostiles only. `state: 'chasing'` is not just the AI's flag — renderer.js
    // reads it in three places, and _drawArena blooms the lit combat stage around
    // anything carrying it. A townsperson can never actually chase (their behavior
    // whitelist excludes HOSTILE, so npc.js's HOSTILE branch never runs for them),
    // so setting it on one only lights a combat arena around a shopkeeper.
    if (!isHostile(e)) continue;
    const range = e.sightRange ?? 8;
    if (Math.max(Math.abs(e.x - x), Math.abs(e.y - y)) > range) continue;
    e._lastSeenX = x; e._lastSeenY = y;
    e.state = 'chasing';
  }
}

// ── kitChoice — spend what you carry before you spend gold ───────────────────
//
// The decision half of an enemy using its own kit. Pure, and ai.js is a LEAF, so
// the valuation is INJECTED (`healValueOf`) rather than imported — items.js owns
// what an item does; this owns only when and which.
//
// The floor sits ABOVE HEAL_HP_FLOOR on purpose: an enemy reaches for the
// supplies it is already carrying before it buys HP at the peg with gold. That
// ordering is what makes the kit visible in play — the nameplate's pips drop as
// it eats, and Law 6f's "the unused kit drops on death" finally means something,
// because some of it gets used.
export const KIT_HP_FLOOR = 70;   // at or below this, drink before you swing

export function kitChoice(hp, maxHp, defs, healValueOf, alreadyHealing = false) {
    if (!defs || !defs.length) return null;
    if (hp >= maxHp) return null;       // nothing to heal
    if (hp > KIT_HP_FLOOR) return null; // not hurt enough to bother
    // Do not double-dose. Found in live play: a kitted enemy ate three items on
    // three consecutive turns, burning a mushroom while the sludge sack it had
    // just drunk was still regenerating it. Waiting for the dose to finish looks
    // smarter AND leaves more of the kit on the corpse — which is Law 6f's whole
    // reward for rushing an enemy down instead of letting it settle in.
    if (alreadyHealing) return null;

    let best = null;
    for (let i = 0; i < defs.length; i++) {
        const heal = healValueOf(defs[i]) || 0;
        if (heal <= 0) continue;                    // inedible, or poison to this drinker
        if (!best || heal > best.heal) best = { index: i, def: defs[i], heal };
    }
    return best;
}
