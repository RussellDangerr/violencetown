// combat.js — core combat rules for violencetown
//
// Rules:
//   - Everything starts with 100 HP
//   - Damage is a single flat number, no rolls, no misses
//   - Armor is a flat reduction applied before damage lands
//   - You always hit; armor just means you hit softer

import { weaponClassOf } from './weapons.js';
import { heldInHands } from './items.js';

const DEFAULT_HP    = 100;
const DEFAULT_MP    = 100;   // Skill / mana — every creature starts at 100
const DEFAULT_ARMOR = 0;

// ── The one pipeline (Gold Standard Law 2) ────────────────────────────────────
//
// Every damage number in the game is computed here. The bucket law:
//   - flats ADD to base (same-family bonuses share one bucket)
//   - earned multipliers (elemental, positional, the target's weak state —
//     each ×1.5 when met, see weaknessKinds) and status buckets
//     (attacker-outgoing, defender-incoming) MULTIPLY — independent
//     achievements both count fully
//   - round ONCE at the end; a positive hit lands for at least 1
//   - elemental immunity (×0) is the one true zero
// Armor is NOT applied here — Entity.takeDamage subtracts it last (min 1).
// 0 means the hit does not happen — call sites must skip attack()/takeDamage
// entirely on 0 (immunity), never floor it back to 1 via armor math.
// Never chain computeHit(computeHit(...)) — pass all buckets in one call
// (round-once).

function computeHit({ base = 0, flats = 0, elemental = 1, positional = 1, state = 1, outgoingMult = 1, incomingMult = 1 } = {}) {
    const raw = (base + flats) * elemental * positional * state * outgoingMult * incomingMult;
    if (raw <= 0) return 0;
    return Math.max(1, Math.round(raw));
}

// Every weakness a hit meets is ×1.5, whatever its kind, and the kinds
// multiply (Caelan's crit ruling, 2026-10-06; plans/el2-crits-from-weakness-kinds.md).
const WEAKNESS_MULT = 1.5;

// Elemental matchup (Law 2): weakness ×1.5, resist ×½, immune ×0, else ×1.
// `target` carries optional weak/resist/immune arrays of damageType strings.
function elementalMult(damageType, target) {
    if (!damageType || !target) return 1;
    if (target.immune?.includes(damageType)) return 0;
    if (target.weak?.includes(damageType))   return WEAKNESS_MULT;
    if (target.resist?.includes(damageType)) return 0.5;
    return 1;
}

// Physical hit kinds (WR1, pick b): slash, stab and crush are real damage
// subtypes that meet weak/resist/immune like any other type, and a weapon lands
// its best kind against each target. Best = the highest elementalMult; a tie
// goes to the class's first kind, so a sword slashes unless a stab does more.
// null when there are no kinds to pick from.
function bestAttackKind(kinds, target) {
    if (!kinds || kinds.length === 0) return null;
    let best = kinds[0];
    let bestMult = elementalMult(best, target);
    for (let i = 1; i < kinds.length; i++) {
        const m = elementalMult(kinds[i], target);
        if (m > bestMult) { best = kinds[i]; bestMult = m; }
    }
    return best;
}

// The kind a weapon's hit lands on `target`, or null. Only a physical hit has a
// kind: a weapon with its own damageType (the energy Ray Gun) keeps that type.
function weaponHitKind(def, target) {
    if (!def || def.damageType) return null;
    return bestAttackKind(weaponClassOf(def)?.attackKinds, target);
}

// Backstab (Law 2 positional, ×WEAKNESS_MULT): the attacker stands on the tile DIRECTLY
// behind the target's last step direction. Strict — only the single tile
// directly opposite the last step counts (a diagonal step yields a diagonal
// back tile); a target with no facing (never stepped, none seeded) has no
// back. Every other tile is ×1: no flanks, no top or bottom hits, no per-zone
// health or armour (Law 2's positional table, ruled 2026-10-23; pinned in
// tests/positional-table.test.js).
function isBackstab(attackerX, attackerY, target) {
    if (!target._lastDx && !target._lastDy) return false;
    return attackerX === target.x - target._lastDx
        && attackerY === target.y - target._lastDy;
}

// ── Weakness kinds → crit and knockout ────────────────────────────────────────
//
// A hit counts the KINDS of weakness it meets, one each:
//   element — its damage type is one the target is weak to (elementalMult > 1)
//   back    — a backstab (isBackstab)
//   state   — the target is in a weak state: feared, or poisoned (ruling: feared
//             plus poisoned). Both at once is still the one state kind.
// Each kind is ×WEAKNESS_MULT and they multiply. Two kinds is a crit; three
// knocks out anything that is not a boss (a boss just takes ×1.5³).
const WEAKNESS_STATES = Object.freeze(['feared', 'poison']);

function inWeakState(target) {
    const buffs = target && target.buffs;
    return Array.isArray(buffs) && buffs.some(b => b && WEAKNESS_STATES.includes(b.id));
}

function weaknessKinds({ elemental = 1, backstab = false, target = null } = {}) {
    const kinds = [];
    if (elemental > 1)       kinds.push('element');
    if (backstab)            kinds.push('back');
    if (inWeakState(target)) kinds.push('state');
    return kinds;
}

// What a hit's kinds add up to. `boss` is the caller's call (main.js reads the
// `boss` flag and the `_boss` tag, the two ways the game marks one).
function critOf(kinds, { boss = false } = {}) {
    const n = (kinds || []).length;
    return { kinds: n, crit: n >= 2, knockout: n >= 3 && !boss };
}

// The raw damage that empties `entity` through its armor: what a knockout lands
// when the multiplied hit alone would fall short. Never less than `dmg`.
function knockoutDamage(dmg, entity) {
    if (!entity) return dmg;
    // Count the same guard takeDamage soaks (a live Defence Poition), or it lives.
    const guard = typeof entity.guardOf === 'function' ? entity.guardOf() : 0;
    return Math.max(dmg, (entity.hp ?? 0) + (entity.armor ?? 0) + guard, 1);
}

// ── Shields in a hand (plans/ws6-shields-in-hand.md) ─────────────────────────
// Ruled "both": a held shield bashes (its class lands crush), adds armour while
// held, and cuts the next hit you take. Two shields stack: each hand's shield
// adds its own armour and cuts a hit of its own.
//
// Placeholders, no ruling gives them: armour is the smallest any worn piece has
// today, the cut is the Defend action's halving, and a spent block is ready
// again after one turn. A shield def's own `armor` wins over the default.
const SHIELD_DEFAULTS = Object.freeze({ armor: 1, blockMult: 0.5, blockCooldown: 1 });

const handsOfClass = (def) => weaponClassOf(def)?.hands || 1;

function isShield(def) {
    return weaponClassOf(def)?.id === 'shield';
}

// The hands holding a shield, right hand first: ['weapon'], ['left'], both, or [].
function shieldHands(eq) {
    return heldInHands(eq, handsOfClass).filter(h => isShield(h.def)).map(h => h.hand);
}

// Armour the held shields add, one shield per hand.
function shieldArmor(eq) {
    let total = 0;
    for (const hand of shieldHands(eq)) total += eq[hand].armor ?? SHIELD_DEFAULTS.armor;
    return total;
}

// Raise a shield against a hit landing on `turn`. `blocks` maps a hand to the
// turn its block is ready again (missing = ready). The first ready shield, right
// hand first, spends its block and the hit's incoming multiplier is the cut;
// with none ready it is 1. The caller folds `mult` into the hit's one
// computeHit call, alongside guard, so the hit still rounds once.
//   -> { mult, hand }   hand is null when nothing blocked
function raiseShield(eq, blocks, turn) {
    for (const hand of shieldHands(eq)) {
        // A block further off than one cooldown is left over from another game
        // (the turn counter went back, e.g. a load): treat it as ready.
        const readyAt = blocks[hand] ?? -Infinity;
        if (readyAt <= turn || readyAt > turn + SHIELD_DEFAULTS.blockCooldown) {
            blocks[hand] = turn + SHIELD_DEFAULTS.blockCooldown;
            return { mult: SHIELD_DEFAULTS.blockMult, hand };
        }
    }
    return { mult: 1, hand: null };
}

// A hit's number, or 0 when it is not one (undefined, null, NaN, a string).
function hitNumber(n) {
    return typeof n === 'number' && !Number.isNaN(n) ? n : 0;
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
    // A hit that is not a number (a weapon with no damage) counts as 0, so it
    // lands the minimum: NaN through Math.max would leave hp NaN, never 0.
    takeDamage(rawDamage) {
        // (plans/ek1-hurt-enemy-uses-kit.md) An enemy's live Defence Poition adds to
        // its armour for as long as it runs. `guardOf` is set by the Enemy that owns
        // this body (not an own-enumerable field); the player and bare entities have none.
        const guard = typeof this.guardOf === 'function' ? this.guardOf() : 0;
        const dealt = Math.max(1, hitNumber(rawDamage) - (this.armor + guard));
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

    const raw     = hitNumber(damage);
    const dealt   = target.takeDamage(raw);
    const blocked = raw - dealt;

    return {
        attacker: attacker.name,
        target:   target.name,
        rawDamage: raw,
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

export { Entity, attack, formatDamageNumber, computeHit, elementalMult, bestAttackKind, weaponHitKind, isBackstab, isShield, shieldHands, shieldArmor, raiseShield, SHIELD_DEFAULTS, WEAKNESS_MULT, WEAKNESS_STATES, weaknessKinds, critOf, knockoutDamage, DEFAULT_HP, DEFAULT_MP, DEFAULT_ARMOR };
