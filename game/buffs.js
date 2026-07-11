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
//   - `blind`  — read at the enemy's attack to halve its outgoing damage.

import { SLUDGE_DOT } from './data.js';

export const BUFF_DEFS = {
    // Sludge — a damage-over-time debuff on the PLAYER. Ticks flat SLUDGE_DOT each
    // turn it's active, unless the player has sludge immunity (Shoe Bags). Soap
    // cancels the buff entirely one step earlier (in _advanceWorld), so a cancelled
    // sludge never reaches this hook. (Migrated from the inline _advanceWorld block;
    // the death check stays in _advanceWorld right after the tick.)
    sludge: {
        onTick(owner, game) {
            if (game._hasSludgeImmunity && game._hasSludgeImmunity()) return;
            game.playerHp -= SLUDGE_DOT;
            game._log(`[Sludge — ${SLUDGE_DOT} damage]`);
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
