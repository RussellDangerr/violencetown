// costumes.js — CO1: a costume takes every equipment slot and brings its own kit
// (plans/co1-costume-takes-every-slot.md). Pure: state lives on `game.costume`.
//
// Wearing stashes the player's own equipment and skill record and puts the costume's in their
// place; taking it off restores the stash exactly. While worn the kit cannot be changed piece by
// piece (items.js refuses), and the skill record is the costume's own.

import { resolveItemDef } from './item-registry.js';
import { sanitizeSkills } from './skills.js';

export const SLOT_KEYS = ['weapon', 'left', 'top', 'bottom', 'front', 'back', 'sides'];

export const COSTUMES = {
    test_costume: {
        id: 'test_costume',
        name: '[Test Costume]',
        // Every slot, named by item id (null = an empty hand). Existing pieces, so the stats are today's.
        kit: {
            weapon: 'wooden_sword', left: null,
            top: 'foil_hat', bottom: 'shoe_bags', front: 'cardboard_cuirass', back: 'red_cape', sides: 'latex_gloves',
        },
        // Its own skill record ({ skillId: uses }): placeholder, the first rank of one skill.
        skills: { light_fingers: 3 },
    },
};

export const isCostumed = (game) => !!(game && game.costume);

const idOf = (d) => (d && d.id) ? d.id : null;

// Put the costume on. Returns a log line, or null when it cannot be worn (unknown id, or one is on).
export function wearCostume(game, costumeId) {
    const c = COSTUMES[costumeId];
    if (!c || game.costume) return null;
    game.costume = {
        id: c.id,
        stash: { equipment: { ...game.equipment }, skills: { ...(game.skills || {}) } },
    };
    const eq = {};
    for (const k of SLOT_KEYS) eq[k] = resolveItemDef(c.kit[k]);
    game.equipment = eq;
    game.skills = sanitizeSkills(c.skills);
    return `[Put on ${c.name}]`;
}

// Take it off: your own gear and ranks come back exactly as they were. Null when none is worn.
export function removeCostume(game) {
    if (!game.costume) return null;
    const c = COSTUMES[game.costume.id];
    const { equipment, skills } = game.costume.stash;
    game.equipment = { ...equipment };
    game.skills = { ...skills };
    game.costume = null;
    return `[Took off ${c ? c.name : 'the costume'}]`;
}

// Use on a costume item: put it on, or take it off if one is already worn.
export function toggleCostume(game, itemDef) {
    if (!itemDef || !itemDef.costume) return null;
    return game.costume ? removeCostume(game) : wearCostume(game, itemDef.costume);
}

// Death drops the costume: the stash's skill record returns (equipment resets anyway).
export function dropCostume(game) {
    if (!game.costume) return;
    game.skills = { ...game.costume.stash.skills };
    game.costume = null;
}

// ── save ──
export function costumeToSave(game) {
    const c = game.costume;
    if (!c) return {};
    const eq = {};
    for (const k of SLOT_KEYS) eq[k] = idOf(c.stash.equipment[k]);
    return { costume: { id: c.id, stash: { equipment: eq, skills: sanitizeSkills(c.stash.skills) } } };
}

// Clean a saved costume: unknown id or malformed stash means "none".
export function sanitizeCostume(raw) {
    if (!raw || typeof raw !== 'object' || !COSTUMES[raw.id]) return null;
    const s = raw.stash;
    if (!s || typeof s !== 'object' || !s.equipment || typeof s.equipment !== 'object') return null;
    const eq = {};
    for (const k of SLOT_KEYS) eq[k] = typeof s.equipment[k] === 'string' ? s.equipment[k] : null;
    return { id: raw.id, stash: { equipment: eq, skills: sanitizeSkills(s.skills) } };
}

export function costumeFromSave(raw, resolve = resolveItemDef) {
    const c = sanitizeCostume(raw);
    if (!c) return null;
    const eq = {};
    for (const k of SLOT_KEYS) eq[k] = resolve(c.stash.equipment[k]);
    return { id: c.id, stash: { equipment: eq, skills: c.stash.skills } };
}
