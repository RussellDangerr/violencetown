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

// healPurchase — Law 6: enemies buy heals at the peg (1 GP = 1 HP).
// Rule: at or below 40 HP and holding at least 20 GP, spend min(gold, missing HP).
// Returns { spend, heal } or null. Pure — npc.js applies the result.
export function healPurchase(hp, maxHp, gold) {
    if (hp > 40 || gold < 20) return null;
    const spend = Math.min(gold, maxHp - hp);
    if (spend <= 0) return null;   // full-HP or sub-Hundred edge — no zero-GP turns
    return { spend, heal: spend };
}
