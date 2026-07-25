// buffs.js — the buff-behavior table (PD-4).
//
// A buff/debuff is a plain record { id, name, turns, type, ...extra } living on
// Game.buffs[] (player) or Enemy.buffs[] (each enemy) — same shape both sides.
// Their per-turn / on-expiry LOGIC used to be smeared across the core loop (the
// sludge DoT inline in _advanceWorld, the recover heal inline in _tickBuffs, a
// separate silently-diverged Enemy.tickBuffs). This table co-locates each
// status's behavior next to its id, and one shared tickBuffList() drives both
// sides so they can't drift again.
//
// A def may carry:
//   onTick(owner, game, buff)   — fires each turn while the buff is still active
//                                 (before that turn's decrement).
//   onExpire(owner, game, buff) — fires once as the buff drops off.
// `owner` is the buffed entity (the Game for player buffs, an Enemy for enemy
// buffs); `game` is always the Game (world access). For player buffs owner===game.
//
// NOT every status fits a per-turn/expiry hook, and those deliberately stay as
// documented riders at their read sites rather than table entries:
//   - `guard`  — a passive damage-halve read in applyDamageToPlayer (not a tick).
//   - `feared` — a movement override in resolveEnemyTurns (flee instead of act).
//   - `blind`  — folds into applyDamageToPlayer's single computeHit call
//     (outgoingMult) to halve the attacker's outgoing damage.

import { SLUDGE_DOT } from './data.js';

export const DOT_FLOOR = 1;

// One tick of a damage-over-time debuff. Shared by every DoT so they cannot
// diverge (the discipline challengeGp and affectedTiles already follow).
// `buff.dmg` is authored per-instance so a 3x5 sludge sack and a 5x3 fire bottle
// differ without needing separate defs; it falls back to the legacy tile-hazard
// constant so an old save's bare {id:'sludge'} still ticks.
//
// tickBuffList's contract is onTick(owner, game, buff) where owner === game for
// PLAYER buffs and owner is the Enemy for enemy buffs. This function MUST branch
// on that: the old sludge def wrote game.playerHp unconditionally, which was safe
// only because sludge has never been an enemy buff. poison and fire will be.
function applyDot(owner, game, buff, label, cause) {
    const dmg = buff.dmg ?? SLUDGE_DOT;

    if (owner === game) {
        // Law 7: a DoT never lands the killing tick on the PLAYER — it floors at
        // 1 and does NOT self-cure, so you stand there at 1 HP still burning.
        // Clamped upward too: sewer fare on a sewer-dweller is a negative dmg
        // (a regeneration) and must never exceed the Hundred.
        game.playerHp = Math.min(game.playerMaxHp, Math.max(DOT_FLOOR, game.playerHp - dmg));
        // It still CLAIMS the defeat, so when something else finishes the player
        // the scenario reads the DoT (defeat-scenarios.js keys on cause 'sludge').
        // Healing never claims a defeat.
        if (dmg > 0) game._lastDefeatedBy = { cause };
    } else {
        // Enemies get NO floor. D2's floor is player-only and so is ours — an
        // explicit player-experience concession, not a simulation rule. A sludge
        // bomb absolutely finishes a Violet Fungus.
        const ent = owner.entity;
        if (!ent) return;
        ent.hp = Math.min(ent.maxHp, ent.hp - dmg);
        if (ent.hp <= 0) { ent.hp = 0; ent.alive = false; }
    }
    game._log(`[${owner === game ? 'You' : (owner.name ?? owner.type)} — ${label} ${Math.abs(dmg)}]`);
}

export const BUFF_DEFS = {
    // Sludge — a damage-over-time debuff. Ticks per-buff dmg each turn it's
    // active, unless the player has sludge immunity (Shoe Bags — a PLAYER
    // affordance; an enemy has no such gear). Soap cancels the buff entirely one
    // step earlier (in _advanceWorld), so a cancelled sludge never reaches this
    // hook. (Migrated from the inline _advanceWorld block; the death check stays
    // in _advanceWorld right after the tick.)
    sludge: {
        onTick(owner, game, buff) {
            if (owner === game && game._hasSludgeImmunity && game._hasSludgeImmunity()) return;
            applyDot(owner, game, buff, 'Sludge', 'sludge');
        },
    },
    poison: {
        name: 'Poisoned',
        onTick(owner, game, buff) { applyDot(owner, game, buff, 'Poison', 'poison'); },
    },
    fire: {
        name: 'Burning',
        onTick(owner, game, buff) { applyDot(owner, game, buff, 'Burning', 'fire'); },
    },

    // Recover — a delayed heal (pendingHeal) that lands when the buff expires.
    recover: {
        onExpire(owner, game, buff) {
            if (!buff || !buff.pendingHeal) return;
            const before = game.playerHp;
            game.playerHp = Math.max(0, Math.min(game.playerHp + buff.pendingHeal, game.playerMaxHp));
            game._log(`[Recover — healed ${game.playerHp - before} HP]`);
        },
    },

    // Post-defeat flavor statuses (Outward-style). Temporary + cosmetic — no
    // per-turn effect; tickBuffList decrements + drops them like any buff. They
    // read the defeat on the HUD, never a permanent stat cut.
    rattled: { name: 'Rattled' },
    hunched: { name: 'Hunched' },
    sludged: { name: 'Sludged' },
};

// Advance a buff list one turn: fire each still-active buff's onTick, decrement,
// then for every buff that hit 0 remove it, run onExpireLog (side-specific), and
// fire its onExpire. Shared by Game._tickBuffs (player) and Enemy.tickBuffs.
export function tickBuffList(buffs, owner, game, onExpireLog) {
    if (!buffs || !buffs.length) return;
    const expired = [];
    for (const b of buffs) {
        const def = BUFF_DEFS[b.id];
        if (def && def.onTick) def.onTick(owner, game, b);
        b.turns--;
        if (b.turns <= 0) expired.push(b);
    }
    for (const b of expired) {
        const i = buffs.indexOf(b);
        if (i >= 0) buffs.splice(i, 1);
        if (onExpireLog) onExpireLog(b);
        const def = BUFF_DEFS[b.id];
        if (def && def.onExpire) def.onExpire(owner, game, b);
    }
}
