// skills.js — use-ranks: doing one thing well makes you better at that one thing.
//
// A skill counts clean successes of a single action. At set counts it reaches a
// rank, and every rank reached adds a small perk to the same passives bag that
// rings feed (rings.js aggregatePassives). There is no level number and no stat
// growth: a rank changes what an action can do, never how hard you hit.
//
// The record lives on the player as { skillId: cleanUses }. Nothing you wear
// owns it, so a swap of gear or rings cannot touch it. Pure: no game state, no
// imports.
//
// Design: plans/us1-light-fingers.md

export const SKILLS = {
    // Counted by a theft the victim never notices (main.js, the Thieve resolver).
    // Its perks are the two keys theft.js already reads from the passives bag.
    light_fingers: {
        ranks: [
            { at: 3,  perk: { stealLimit: 25 } },
            { at: 8,  perk: { noticeBuffer: 1 } },
            { at: 15, perk: { stealLimit: 25, noticeBuffer: 1 } },
        ],
    },
};

// How many ranks of this skill the count has reached (0 = none yet).
export function rankOf(skills, id) {
    const def = SKILLS[id];
    if (!def) return 0;
    const n = skills?.[id] ?? 0;
    let rank = 0;
    for (const r of def.ranks) if (n >= r.at) rank++;
    return rank;
}

// Count one clean use. Returns a NEW record and the rank reached by this use, or
// 0 if it reached none. An unknown id changes nothing.
export function recordUse(skills, id) {
    const before = { ...(skills || {}) };
    if (!SKILLS[id]) return { skills: before, rankedUp: 0 };
    const was = rankOf(before, id);
    const next = { ...before, [id]: (before[id] ?? 0) + 1 };
    const now = rankOf(next, id);
    return { skills: next, rankedUp: now > was ? now : 0 };
}

// Every perk of every rank reached, summed into one passives bag.
export function skillPerks(skills) {
    const mods = {};
    for (const id of Object.keys(SKILLS)) {
        const rank = rankOf(skills, id);
        for (const r of SKILLS[id].ranks.slice(0, rank)) {
            for (const [k, v] of Object.entries(r.perk)) mods[k] = (mods[k] || 0) + v;
        }
    }
    return mods;
}

// Two passives bags added key by key. Neither input is changed.
export function mergePassives(a, b) {
    const out = { ...(a || {}) };
    for (const [k, v] of Object.entries(b || {})) out[k] = (out[k] || 0) + v;
    return out;
}

// A record fit to keep: known skills only, whole counts, never below zero, and
// no zero entries. Anything else in a save is dropped rather than trusted.
export function sanitizeSkills(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    for (const id of Object.keys(SKILLS)) {
        const v = raw[id];
        if (typeof v !== 'number' || !Number.isFinite(v)) continue;
        const n = Math.floor(v);
        if (n > 0) out[id] = n;
    }
    return out;
}
