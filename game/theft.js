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

import { VERDICT } from './perception.js';

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
export function kitTake(victim, resolve) {
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
    if (bestIdx < 0) return null;
    victim.loadout = ids.filter((_, i) => i !== bestIdx);
    return bestDef;
}

// Removing gear moves their real numbers — steal the brute's plate and then
// fight a softer brute. Armor is clamped into Law 3's band and damage floored at
// zero so a theft can never author an illegal entity.
export function gearTake(victim, resolve) {
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
    if (bestIdx < 0) return null;
    victim.equipped = ids.filter((_, i) => i !== bestIdx);
    if (victim.entity) {
        const next = (victim.entity.armor ?? 0) - (bestDef.armor ?? 0);
        victim.entity.armor = Math.max(ARMOR_MIN, Math.min(ARMOR_MAX, next));
    }
    victim.damage = Math.max(0, (victim.damage ?? 0) - (bestDef.damage ?? 0));
    return bestDef;
}
