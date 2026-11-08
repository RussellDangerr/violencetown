// theft.js — the pure arithmetic behind the Thieve verb.
//
// Succeeding and being NOTICED are two different questions. A theft from a blind
// spot always succeeds; whether the victim notices is decided here, by the WEIGHT
// of what you took against a buffer that never refills. Under the buffer nothing
// happens at all — no disposition change, no hostility, they never know. The -100
// is the price of being noticed, not the price of stealing.
//
// This module never touches gold. It reports the amount and main.js moves it via
// trade.js's transferGold, so the single-choke-point invariant survives and a
// theft stays auditable beside every buy, sell and bribe.
//
// It also never imports ITEMS or WEAPONS. Callers pass a `resolve` function — in
// the game that is Game._resolveItemDef, the one lookup that finds weapons too.
// A bare ITEMS[id] silently drops every weapon, and stolen Gear is overwhelmingly
// weapons (see game/item-registry.js).
//
// Design: plans/stealth-perception-and-thieve.md

import { VERDICT, perceives } from './perception.js';

export const STEAL_BASE         = 50;   // GP ceiling on a Coin take, before passives
export const NOTICE_BASE        = 3;    // weight a victim fails to notice, before passives
export const PERIPHERAL_PENALTY = 0.5;  // buffer multiplier when robbed from their flank
export const COIN_PER_WEIGHT    = 25;
export const VALUE_PER_WEIGHT   = 25;
export const GEAR_WEIGHT_FLOOR  = 3;

// Law 3's armor band — a theft must never author an entity outside it.
const ARMOR_MIN = -90;
const ARMOR_MAX = 10;

// ── The two perk axes ───────────────────────────────────────────────────────
//
// They pull against each other on purpose: a limit perk alone makes you take
// 100 GP — weight 4 against a base buffer of 3 — and get caught for it. Wanting
// both is a build. `passives` is rings.js's aggregatePassives output.
export function stealLimit(passives) { return STEAL_BASE + (passives?.stealLimit ?? 0); }
export function baseNotice(passives) { return NOTICE_BASE + (passives?.noticeBuffer ?? 0); }

// ── Weight: what a take costs you ───────────────────────────────────────────
export function coinWeight(gp) {
    return Math.ceil((gp ?? 0) / COIN_PER_WEIGHT);
}

export function itemWeight(def) {
    return Math.max(1, Math.ceil((def?.baseValue ?? 0) / VALUE_PER_WEIGHT));
}

// Gear is deliberately heavy because it is the ACTION-ECONOMY take: you are not
// moving an icon, you are moving their combat numbers onto your side of the
// fight. Lifting a crowbar (damage 12) can never be quiet.
export function gearWeight(def) {
    return Math.max(GEAR_WEIGHT_FLOOR, (def?.armor ?? 0) * 2 + (def?.damage ?? 0));
}

// ── Buffer: what a victim fails to notice ───────────────────────────────────
export function noticeBuffer(passives, verdict) {
    const base = baseNotice(passives);
    if (verdict === VERDICT.PERIPHERAL) {
        return Math.max(1, Math.floor(base * PERIPHERAL_PENALTY));
    }
    return Math.max(1, base);
}

// `taken` is the victim's accumulated weightTaken, which NEVER decreases — that
// is what makes the second pocket riskier than the first, permanently and across
// a zone re-entry.
export function isClean(taken, weight, buffer) {
    return (taken + weight) <= buffer;
}

// ── The takes ───────────────────────────────────────────────────────────────
//
// Reports only. Gold movement is the caller's job (transferGold).
export function coinTake(victim, limit) {
    return Math.min(victim?.gold ?? 0, limit);
}

// Highest baseValue, ties broken by authored order — deterministic, never
// random, so the player can predict what a pocket yields and a theft stays a
// plan rather than a slot machine. Entries that resolve to nothing are skipped
// rather than stolen as ghosts.
export function pickKit(victim, resolve) {
    const ids = victim?.loadout ?? [];
    let bestIdx = -1, bestDef = null;
    for (let i = 0; i < ids.length; i++) {
        const def = resolve(ids[i]);
        if (!def) continue;
        if (!bestDef || (def.baseValue ?? 0) > (bestDef.baseValue ?? 0)) {
            bestIdx = i;
            bestDef = def;
        }
    }
    return bestIdx < 0 ? null : { index: bestIdx, def: bestDef };
}

export function kitTake(victim, resolve) {
    const pick = pickKit(victim, resolve);
    if (!pick) return null;
    victim.loadout = victim.loadout.filter((_, i) => i !== pick.index);
    return pick.def;
}

// ── Putting a piece on ──────────────────────────────────────────────────────
//
// (plans/tg1-enemies-wear-armour.md) Gear needs something to take. At spawn an
// enemy whose kit lists armour puts on ONE piece of it: it leaves the kit, joins
// `equipped`, and that piece's number is ALL the armour the enemy has. gearTake
// below is the other half: lift the piece and they are left at 0.

// Armour turns blows and has no wear timer. Bandage and Soap have armour only
// while a timer runs: consumables, not clothes. A weapon is never "worn".
export function isWearable(def) {
    return !!def && (def.armor ?? 0) > 0 && !def.equipDuration && !((def.damage ?? 0) > 0);
}

// Which of `loadout` goes on: the heaviest by gearWeight (the weight Thieve
// ranks a take by), ties broken by authored order. Never random, so the player
// can predict it. Returns { index, def } or null.
export function pieceToWear(loadout, resolve) {
    let best = null;
    (loadout ?? []).forEach((id, index) => {
        const def = typeof id === 'string' ? resolve(id) : null;
        if (!isWearable(def)) return;
        if (!best || gearWeight(def) > gearWeight(best.def)) best = { index, def };
    });
    return best;
}

// Dress one enemy's numbers. Pure: { armor, loadout } in; { armor, loadout, worn }
// out, `worn` being the id that went on (or null).
//
// A kit with no armour in it changes nothing: the enemy keeps its number, a
// negative softness number included. A kit that lists armour puts the heaviest
// piece on, and the enemy's own authored armour is replaced by that piece's
// number alone (TG1R4), so lifting the piece leaves them at 0.
//
// `stolen` is the ids Thieve already lifted off this enemy. The choice is made
// BEFORE the theft is subtracted from the kit, so a piece you stole stays stolen
// instead of the next-heaviest piece quietly going on in its place; that enemy
// stands at 0, the same as straight after the lift.
export function dressOne(armor, loadout, resolve, stolen = []) {
    const pick = pieceToWear(loadout, resolve);
    if (!pick) return { armor, loadout, worn: null };
    const rest = loadout.filter((_, i) => i !== pick.index);
    if (stolen.includes(pick.def.id)) return { armor: 0, loadout: rest, worn: null };
    return { armor: pick.def.armor, loadout: rest, worn: pick.def.id };
}

// Removing gear moves their real numbers — steal the brute's plate and then
// fight a softer brute. Armor is clamped into Law 3's band and damage floored at
// zero so a theft can never author an illegal entity.
export function pickGear(victim, resolve) {
    const ids = victim?.equipped ?? [];
    let bestIdx = -1, bestDef = null;
    for (let i = 0; i < ids.length; i++) {
        const def = resolve(ids[i]);
        if (!def) continue;
        if (!bestDef || gearWeight(def) > gearWeight(bestDef)) {
            bestIdx = i;
            bestDef = def;
        }
    }
    return bestIdx < 0 ? null : { index: bestIdx, def: bestDef };
}

export function gearTake(victim, resolve) {
    const pick = pickGear(victim, resolve);
    if (!pick) return null;
    const bestDef = pick.def;
    victim.equipped = victim.equipped.filter((_, i) => i !== pick.index);
    if (victim.entity) {
        const next = (victim.entity.armor ?? 0) - (bestDef.armor ?? 0);
        victim.entity.armor = Math.max(ARMOR_MIN, Math.min(ARMOR_MAX, next));
    }
    victim.damage = Math.max(0, (victim.damage ?? 0) - (bestDef.damage ?? 0));
    return bestDef;
}

// ── The preview ─────────────────────────────────────────────────────────────
//
// What the aim strip shows while the reticle sits on a person: the take, then the
// verdict. A pure READ of the same pieces the lift in main.js reads — it removes
// nothing, moves no gold and does not even open a `_robbed` record for a victim
// who has none. Returns null when there is nothing to show: no one there, no one
// who can be lifted from, nothing to take, or any verb but the three lifts.
//
// The words are placeholders and live here, in one place, for Caelan to write.
export const LIFT_WORDS = { clean: '[TEXT]', noticed: '[TEXT]' };

const LIFT_BRANCH = { thieveCoin: 'coin', thieveKit: 'kit', thieveGear: 'gear' };

export function liftPreview(game, resolver, aimTile) {
    const branch = LIFT_BRANCH[resolver];
    if (!branch || !aimTile || !game) return null;
    const victim = game._thieveTarget?.(aimTile);
    if (!victim) return null;

    const passives = game._theftPassives();
    let weight = 0, gp = 0, name = null;
    if (branch === 'coin') {
        gp = coinTake(victim, stealLimit(passives));
        if (gp <= 0) return null;
        weight = coinWeight(gp);
    } else {
        const resolve = (id) => game._resolveItemDef(id);
        const pick = branch === 'kit' ? pickKit(victim, resolve) : pickGear(victim, resolve);
        if (!pick) return null;
        weight = branch === 'kit' ? itemWeight(pick.def) : gearWeight(pick.def);
        name = pick.def.name ?? pick.def.id ?? null;
    }

    const verdict = perceives(game.map, victim, game.playerX, game.playerY);
    const taken = game._robbed?.[victim.id]?.weightTaken ?? 0;
    const buffer = noticeBuffer(passives, verdict);
    const clean = isClean(taken, weight, buffer);
    return { branch, gp, name, weight, taken, buffer, clean, words: clean ? LIFT_WORDS.clean : LIFT_WORDS.noticed };
}
