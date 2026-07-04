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

export { Entity, attack, formatDamageNumber, DEFAULT_HP, DEFAULT_MP, DEFAULT_ARMOR };
