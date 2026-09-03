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
// Is this character actively hunting the player?
//
// The perception ladder (perception.js) added 'searching' — an enemy that has
// LOST you and is sweeping your last-seen tile — and npc.js pursues on it
// exactly as it pursues on 'chasing'. But every gate that asked "is this a
// fight?" was written before that state existed and tested `state === 'chasing'`
// alone, so a searching enemy hunted you while the game believed you were out of
// combat. The sharpest consequence was the three de-aggro resets: they clear
// 'chasing' on death, retry and zone change, so a searcher was never stood down
// and the promised breather did not arrive.
//
// One predicate, so a future state cannot go missing from nine places at once.
// 'returning' is deliberately NOT hunting — that is a character walking home.
export function isHunting(e) {
    return !!e && (e.state === 'chasing' || e.state === 'searching');
}

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

// ── Law 5 — bosses spend, not pool ──────────────────────────────────────────
//
// "A boss phase-transitions by PURCHASING a heal or a rules-change move, priced
// at peg like everything else." Written into the bible at the gold standard and
// deferred to the first boss build ever since; this is that build.
//
// The consequence that makes it a real mechanic rather than a bigger healPurchase:
// the wallet DRAINS. A boss's purse is both its second health bar and its loot,
// so what you take off the corpse is exactly what it did not have to spend on
// you. Rush it and you get the purse; let it settle in and you fight the purse.
//
// Ordering, once wired: eat your own kit (free) -> spend as a boss -> fall back
// to the grunt heal policy. Pure, and ai.js stays a LEAF — `allies` is plain
// {hp, maxHp} data the caller gathers.
export const BOSS_HEAL_FLOOR = 60;   // start buying at or below this
export const BOSS_HEAL_MAX   = 40;   // never dump the whole purse into one heal
export const BOSS_RALLY_MIN  = 20;   // keep this much in pocket before funding others
export const BOSS_RALLY_RANGE = 6;   // it can only fund what it can see about it

export function bossSpend(hp, maxHp, gold, allies) {
    if (!(gold > 0)) return null;

    // 1. Save yourself. At peg, so the spend IS the HP.
    const missing = maxHp - hp;
    if (hp <= BOSS_HEAL_FLOOR && missing > 0) {
        const spend = Math.min(gold, missing, BOSS_HEAL_MAX);
        if (spend > 0) return { kind: 'heal', spend, heal: spend };
    }

    // 2. Otherwise fund the worst-off ally — the rules-change move. It turns a
    //    duel into an attrition fight, which is a phase transition bought rather
    //    than scripted, and it is visible: their pips move as yours drop.
    let best = null;
    for (let i = 0; i < (allies || []).length; i++) {
        const a = allies[i];
        if (!a) continue;
        const need = (a.maxHp ?? 0) - (a.hp ?? 0);
        if (need <= 0) continue;
        if (!best || need > best.need) best = { index: i, need };
    }
    if (best && gold >= BOSS_RALLY_MIN) {
        const spend = Math.min(gold - BOSS_RALLY_MIN, best.need, BOSS_HEAL_MAX);
        if (spend > 0) return { kind: 'rally', index: best.index, spend, heal: spend };
    }
    return null;
}
