// finale-setpiece.js — the Bite, the cowering and phase 2 (plans/fin3-bite-phase-two.md).
//
// Phase 1 (FIN2) ends its Sun Man beat when his summon timer runs out. Here that moment is the
// Bite: the Financier bites Sun Man once, Sun Man goes to a corner of the vault and cowers under
// his cloak while he changes, and when the weakened Financier falls to you alone (FINR8 a) he
// rises as Monstrous Sun Man. Phase 2 is you against him; he is wrapped in sunlight until he
// screams, and a scream is the window in which he can be hurt.
//
// Like sewer-setpiece.js these are plain functions that take the game; main.js calls them from
// thin methods. Nothing here is stored beyond what the Enemy save already carries:
//   - "cowering" is Sun Man's tag, still an ally, no longer a summon (isCowering);
//   - the scream rhythm is a function of game.turn (isExposedOn);
//   - the buffs ride the beast's own buff list, which the save keeps.
//
// Every number here is a stand-in, and every line a player reads is [TEXT].

import { ENTRIES, FINALE_PHASE1 } from './slots.js';
import { spawnEnemy } from './enemies.js';
import { weakenedBuff } from './buffs.js';
import { stepEntity } from './pathing.js';

export const FINALE_PHASE2 = {
    beastTag: 'monstrous_sun_man_boss',       // a `_boss` tag: losing to him runs the boss retry
    beastId: 'finale-monstrous-sun-man',
    beastName: 'Monstrous Sun Man',
    beastLook: 'Boss',                        // the placeholder boss's picture, until he is drawn
    vaultMap: 'vault-map.json',
    // The quest flag that says phase 2 was won, and its value (FIN4 reads this).
    flag: 'finalePhase2',
    won: 'won',
    // The sunlight he is wrapped in: a defence rider so ordinary blows do one point.
    sunlitDefence: 40,
    // His scream: every `screamEvery` turns it opens for `screamTurns` turns. While it is open
    // the sunlight is down, he is `exposedDrop` softer than his own armour, and he swings at
    // nothing. Stand-ins, tuned only so the weakest gear wins (tests/finale-phase2.test.js).
    screamEvery: 4,
    screamTurns: 3,
    exposedDrop: 22,
};

const SUNLIT = 'sunlit';

const text = '[TEXT]';

export const isSunMan = (e) => !!e && e.tag === FINALE_PHASE1.sunManTag;
export const isBeast = (e) => !!e && e.tag === FINALE_PHASE2.beastTag;

// Sun Man, bitten: still his ally flag, no longer on the summon clock. Derived from what the
// Enemy save keeps (tag, ally, isSummon), so a reload mid-change still finds him cowering.
export const isCowering = (e) => isSunMan(e) && !!e._ally && !e._isSummon && !!e.entity?.isAlive?.();

// Is the beast's scream open on turn `n`? A function of the turn alone: nothing to store.
export function isExposedOn(n) {
    return (n % FINALE_PHASE2.screamEvery) < FINALE_PHASE2.screamTurns;
}

const liveBeast = (game) => game.enemies.find(e => isBeast(e) && e.entity.isAlive());
const liveFinancier = (game) => game.enemies.find(e => e.tag === FINALE_PHASE1.financierTag && e.entity.isAlive());

// The nearest free corner of the room to (fromX, fromY): a walkable floor tile with a wall on
// one side and another wall on a different axis. Returns { x, y, faceDx, faceDy } (the way the
// wall is, so he can turn his face to it), or null when the room has no such corner.
export function cornerFor(game, fromX, fromY, ignore = null) {
    const { map } = game;
    const blocked = (x, y) => !map.isInBounds(x, y) || !map.isWalkable(x, y);
    const taken = (x, y) =>
        (game.playerX === x && game.playerY === y)
        || game.enemies.some(o => o !== ignore && o.entity.isAlive() && o.x === x && o.y === y);
    let best = null;
    for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
            if (blocked(x, y) || taken(x, y)) continue;
            const horiz = blocked(x - 1, y) ? -1 : blocked(x + 1, y) ? 1 : 0;
            const vert = blocked(x, y - 1) ? -1 : blocked(x, y + 1) ? 1 : 0;
            if (!horiz || !vert) continue;
            const d = Math.max(Math.abs(x - fromX), Math.abs(y - fromY));
            if (!best || d < best.d) best = { x, y, d, faceDx: 0, faceDy: vert };
        }
    }
    return best;
}

// ── The Bite ────────────────────────────────────────────────────────────────

// The Financier bites Sun Man, once. Called when Sun Man's summon timer ends (main.js
// _finaleSummonLeft), in place of him leaving. Returns true when it was Sun Man.
export function biteSunMan(game, sun) {
    if (!isSunMan(sun) || !sun.entity.isAlive()) return false;
    game._log(text, 'combat');                                // the bite
    game._spawnOverheadDialogue?.(sun.x, sun.y, text, { sourceRef: sun });
    const fin = liveFinancier(game);
    if (fin) {
        const w = weakenedBuff(FINALE_PHASE1.defenceDrop);
        fin.addBuff(w.id, w.name, w.turns, w.type, { stat: w.stat, amount: w.amount });   // the red W over him
    }
    // He is no longer on the summon clock, so the timer's cleanup leaves him standing, and he
    // stops fighting: from here on he is cowering (isCowering).
    sun._isSummon = false;
    sun._aiding = false;
    // Off to a corner, and his face to the wall: the cloak over it is a placeholder pose.
    const corner = cornerFor(game, sun.x, sun.y, sun);
    if (corner) {
        stepEntity(sun, corner.x, corner.y, game._MOVE_MS);
        sun._lastDx = corner.faceDx;
        sun._lastDy = corner.faceDy;
    }
    game._log(text, 'combat');                                // the cloak over his face
    game.emitGameEvent('sun_man_bitten', { weakened: !!fin });
    return true;
}

// A blow aimed at a cowering Sun Man goes nowhere. True when it was refused.
export function blocksCowerHit(game, target) {
    if (!isCowering(target)) return false;
    game._log(text, 'combat');
    return true;
}

// ── The rise ────────────────────────────────────────────────────────────────

// What Monstrous Sun Man is, as a spawn: the stand-in boss block the Financier's entry copies,
// with its kit emptied (the scream is his puzzle, not a bandage), wearing a borrowed picture.
function beastSpawn(x, y) {
    const f = ENTRIES.financier;
    return {
        id: FINALE_PHASE2.beastId, type: FINALE_PHASE2.beastLook, x, y,
        boss: true, name: FINALE_PHASE2.beastName, tag: FINALE_PHASE2.beastTag,
        hp: f.hp, armor: f.armor, damage: f.damage, gold: 0,   // no purse to buy healing with: the scream is his puzzle
        barks: structuredClone(f.barks), barkEveryTurns: f.barkEveryTurns,
        equipped: structuredClone(f.equipped), loadout: [],
    };
}

// Put the sunlight on, or take it off, to match turn `n`: the shield rider while the scream is
// shut, the `weakened` drop while it is open. Idempotent. Returns true when it opened just now.
function syncBeast(beast, n) {
    const exposed = isExposedOn(n);
    const was = beast.hasBuff('weakened');
    if (exposed) {
        beast.removeBuff(SUNLIT);
        const w = weakenedBuff(FINALE_PHASE2.exposedDrop);
        beast.addBuff(w.id, w.name, w.turns, w.type, { stat: w.stat, amount: w.amount });
        beast._emergeDelay = 1;       // he swings at nothing next turn (resolveEnemyTurns spends it)
    } else {
        beast.removeBuff('weakened');
        beast.addBuff(SUNLIT, 'Sunlit', 9999, 'buff', { stat: 'defence', amount: FINALE_PHASE2.sunlitDefence });
    }
    return exposed && !was;
}

// Sun Man rises. Called when the Financier falls (main.js _finaleOnDeath). If Sun Man is still
// on the summon clock (the Financier went down before his third turn ended) the Bite lands first.
// Returns true when the beast came.
export function riseSunMan(game) {
    if (liveBeast(game)) return false;
    let sun = game.enemies.find(e => isSunMan(e) && e.entity.isAlive());
    if (!sun) return false;
    if (!isCowering(sun)) biteSunMan(game, sun);
    const { x, y } = sun;
    game.enemies = game.enemies.filter(e => e !== sun);
    const beast = spawnEnemy(beastSpawn(x, y), game._muggedIds, game._robbed);
    beast.state = 'chasing';                 // he comes for you at once
    beast._lastSeenX = game.playerX;
    beast._lastSeenY = game.playerY;
    syncBeast(beast, game.turn + 1);
    beast._emergeDelay = 1;                  // he spends the turn rising: inert, but standing there
    game.enemies.push(beast);
    game._log(text, 'combat');                                // he rises
    game._log(text, 'combat');                                // the coaching cue: hit him when he screams
    game._spawnOverheadDialogue?.(x, y, text, { sourceRef: beast });
    game.emitGameEvent('monstrous_sun_man_rises', { id: beast.id });
    return true;
}

// The end of every world turn: keep the beast's scream in step with the turn, announcing it when
// it opens. A no-op without a beast.
export function finaleTick(game) {
    const beast = liveBeast(game);
    if (!beast) return;
    if (syncBeast(beast, game.turn + 1)) {
        game._log(text, 'combat');                            // the scream, and the cue again
        game._spawnOverheadDialogue?.(beast.x, beast.y, text, { sourceRef: beast });
    }
}

// ── Phase 2 won, lost, left and returned to ────────────────────────────────────

// The beast fell: phase 2 is won. The flag is saved with the quest state; the event fires the
// first time only. Returns true when `e` was the beast.
export function beastFell(game, e) {
    if (!isBeast(e)) return false;
    game._log(text, 'combat');                                // the essence, compressed
    if (!game.questEngine) return true;
    const first = game.questEngine.state.flags[FINALE_PHASE2.flag] !== FINALE_PHASE2.won;
    game.questEngine.state.flags[FINALE_PHASE2.flag] = FINALE_PHASE2.won;
    if (first) game.emitGameEvent('finale_phase2_won', { id: e.id });
    return true;
}

// You went down to Monstrous Sun Man: he goes back to his corner at full health, calm, with the
// scream rhythm reset. Returns true when `boss` was the beast.
export function resetBeast(game, boss) {
    if (!isBeast(boss)) return false;
    boss.buffs = [];
    boss.entity.hp = boss.entity.maxHp;
    boss.state = 'idle';
    boss._emergeDelay = 0;
    const home = cornerFor(game, boss.homeX, boss.homeY, boss);
    if (home) stepEntity(boss, home.x, home.y, game._MOVE_MS);
    syncBeast(boss, game.turn + 1);
    return true;
}

// A map has loaded. In the vault, once phase 1 is won: the Financier does not come back, and
// if phase 2 is not yet won Monstrous Sun Man is waiting in his corner. Elsewhere, nothing.
export function restoreFinale(game, url) {
    if (url !== FINALE_PHASE2.vaultMap) return;
    const flags = game.questEngine?.state?.flags;
    if (!flags || flags[FINALE_PHASE1.flag] !== FINALE_PHASE1.won) return;
    game.enemies = game.enemies.filter(e => e.tag !== FINALE_PHASE1.financierTag);
    if (flags[FINALE_PHASE2.flag] === FINALE_PHASE2.won || liveBeast(game)) return;
    const corner = cornerFor(game, game.map.width - 2, 1);
    if (!corner) return;
    const beast = spawnEnemy(beastSpawn(corner.x, corner.y), game._muggedIds, game._robbed);
    syncBeast(beast, game.turn + 1);
    game.enemies.push(beast);
}
