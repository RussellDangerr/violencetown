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
//   - `strength` / `defence` — Poition riders. No onTick at all: the buff just
//     has to exist and count down. `strength` is read as a computeHit `flats`
//     bonus in Game.combatAttack (Law 2); `defence` is summed into
//     Game._playerArmor(). Both are carried as { stat, amount } rather than
//     the DoT `{ dmg }` shape — see items.js's poitionBuff and this file's
//     sumBuffStat, its read-side counterpart.
//
// `speed` isn't even a buff — it never touches this list. A haste/slow
// poition converts straight into Game._hasteCharges/_slowCharges, spent at
// the _advanceWorld chokepoint (main.js) via this file's worldBeatPlan.

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

    // Health/mana Poitions with turns > 1 (none authored today — both ship
    // turns:1/instant — but a lasting one falls through to here rather than
    // silently no-op'ing, same "support it for real" spirit as sludge/poison/
    // fire above). Health rides applyDot directly, player-only floor and all.
    health: {
        name: 'Health Poition',
        onTick(owner, game, buff) { applyDot(owner, game, buff, 'Health', 'health_poition'); },
    },
    // Mana has no enemy-side equivalent (Entity.mp exists for symmetry but
    // nothing spends an enemy's MP yet), so — like applyDot's player branch —
    // this only ever fires for the player; an enemy owner is a no-op rather
    // than writing into a resource that doesn't drive anything for them.
    mana: {
        name: 'Mana Poition',
        onTick(owner, game, buff) {
            if (owner !== game) return;
            const dmg = buff.dmg ?? 0;
            const before = game.playerMp;
            game.playerMp = Math.min(game.playerMaxMp, Math.max(0, game.playerMp - dmg));
            const delta = game.playerMp - before;
            game._log(`[Mana ${delta >= 0 ? 'restored' : 'drained'} ${Math.abs(delta)}]`);
        },
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

// ── Rider read (strength / defence) ──────────────────────────────────────────
//
// The strength/defence Poition riders carry no onTick — they just have to
// exist and count down (tickBuffList already does that for any hookless
// buff, per the post-defeat flavor statuses above). The value is read where
// the number is actually computed: Game.combatAttack's `flats` bucket for
// strength, Game._playerArmor's sum for defence. Both go through this one
// helper (Game._poitionMod delegates here) so there's exactly one place that
// knows a rider buff's payload lives at `.stat`/`.amount`, not `.dmg`.
// Extracted to a plain export (rather than living only as a Game method)
// because main.js touches `document` at load and can't be imported under
// Node — this is the pure sliver tests/poition.test.js exercises directly.
export function sumBuffStat(buffs, stat) {
    return (buffs || []).reduce((n, b) => n + (b.stat === stat ? (b.amount || 0) : 0), 0);
}

// ── Speed charge arithmetic (haste / slow) ───────────────────────────────────
//
// Pure decision for one Game._advanceWorld() call, given the current haste/
// slow charge counts: how many times the world-turn body should run this
// call (0, 1, or 2) and what the charges should be afterward. A haste charge
// SKIPS the beat entirely (spent here, at the top, so no call site can forget
// it); a slow charge means the beat that's about to run should run TWICE.
// Haste wins if both are somehow active — holding still leaves nothing to
// double. Extracted so the charge-spend arithmetic is unit-testable under
// Node without a real Game or the enemy-turn/day-clock machinery the actual
// beat touches (main.js can't be imported — see drops.js's header comment
// for the pattern this follows).
export function worldBeatPlan(hasteCharges, slowCharges) {
    hasteCharges = hasteCharges || 0;
    slowCharges = slowCharges || 0;
    if (hasteCharges > 0) return { runs: 0, hasteCharges: hasteCharges - 1, slowCharges };
    if (slowCharges > 0) return { runs: 2, hasteCharges, slowCharges: slowCharges - 1 };
    return { runs: 1, hasteCharges, slowCharges };
}
