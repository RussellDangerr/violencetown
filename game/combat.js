// combat.js — core combat rules for violencetown
//
// Rules:
//   - Everything starts with 100 HP
//   - Damage is a single flat number, no rolls, no misses
//   - Armor is a flat reduction applied before damage lands
//   - You always hit; armor just means you hit softer

const DEFAULT_HP    = 100;
const DEFAULT_MP    = 100;   // Skill / mana — every creature starts at 100
const DEFAULT_ARMOR = 0;

// ── The one pipeline (Gold Standard Law 2) ────────────────────────────────────
//
// Every damage number in the game is computed here. The bucket law:
//   - flats ADD to base (same-family bonuses share one bucket)
//   - earned multipliers (elemental, positional) and status buckets
//     (attacker-outgoing, defender-incoming) MULTIPLY — independent
//     achievements both count fully
//   - round ONCE at the end; a positive hit lands for at least 1
//   - elemental immunity (×0) is the one true zero
// Armor is NOT applied here — Entity.takeDamage subtracts it last (min 1).
// 0 means the hit does not happen — call sites must skip attack()/takeDamage
// entirely on 0 (immunity), never floor it back to 1 via armor math.
// Never chain computeHit(computeHit(...)) — pass all buckets in one call
// (round-once).

function computeHit({ base = 0, flats = 0, elemental = 1, positional = 1, outgoingMult = 1, incomingMult = 1 } = {}) {
    const raw = (base + flats) * elemental * positional * outgoingMult * incomingMult;
    if (raw <= 0) return 0;
    return Math.max(1, Math.round(raw));
}

// Elemental matchup (Law 2): weakness ×2, resist ×½, immune ×0, else ×1.
// `target` carries optional weak/resist/immune arrays of damageType strings.
function elementalMult(damageType, target) {
    if (!damageType || !target) return 1;
    if (target.immune?.includes(damageType)) return 0;
    if (target.weak?.includes(damageType))   return 2;
    if (target.resist?.includes(damageType)) return 0.5;
    return 1;
}

// ── Entity ────────────────────────────────────────────────────────────────────

class Entity {
    constructor({ name, hp = DEFAULT_HP, mp = DEFAULT_MP, armor = DEFAULT_ARMOR } = {}) {
        this.name    = name ?? 'unknown';
        this.maxHp   = hp;
        this.hp      = hp;
        // MP (Magic / Skill Points) — gates skill use. The player spends it on
        // FIGHT → Magic spells and regenerates a little each turn; enemies carry
        // the field for symmetry but don't cast yet.
        this.maxMp   = mp;
        this.mp      = mp;
        this.armor   = armor;
        this.alive   = true;
    }

    // Returns actual damage dealt after armor reduction (minimum 1).
    takeDamage(rawDamage) {
        const dealt = Math.max(1, rawDamage - this.armor);
        this.hp     = Math.max(0, this.hp - dealt);
        if (this.hp === 0) this.alive = false;
        return dealt;
    }

    isDead()   { return !this.alive; }
    isAlive()  { return  this.alive; }
}

// ── Attack ────────────────────────────────────────────────────────────────────

// attack(attacker, target, damage)
//   → { attacker, target, rawDamage, dealt, blocked, targetHp, killed }
//
// No miss. No RNG here. Caller passes a single flat damage number.
// Armor soaks what it can; at least 1 always lands.

function attack(attacker, target, damage) {
    if (target.isDead()) return null;

    const dealt   = target.takeDamage(damage);
    const blocked = damage - dealt;

    return {
        attacker: attacker.name,
        target:   target.name,
        rawDamage: damage,
        dealt,
        blocked,
        targetHp:  target.hp,
        killed:    target.isDead(),
    };
}

// ── Damage number display ─────────────────────────────────────────────────────

function formatDamageNumber(result) {
    if (!result) return null;
    const { dealt, blocked, killed } = result;
    let s = `${dealt}`;
    if (blocked > 0) s += ` (${blocked} blocked)`;
    if (killed)      s += ' ✕';
    return s;
}

// ── Exports ───────────────────────────────────────────────────────────────────

export { Entity, attack, formatDamageNumber, computeHit, elementalMult, DEFAULT_HP, DEFAULT_MP, DEFAULT_ARMOR };
