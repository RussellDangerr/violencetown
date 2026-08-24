// item-registry.js — the one spelling of "what item ids exist, and what do
// they resolve to." WEAPONS (weapons.js) and ITEMS (items.js) are two
// separate authoring tables; every consumer that needs to treat an id as
// belonging to either one goes through here instead of rebuilding the union
// or the resolution order itself.
//
// Before this module existed the rule had four independent, executable
// copies: Game._resolveItemDef (main.js), two inline WEAPONS-then-ITEMS
// checks in enemies.js (resolveLoadout, challengeGp), and content-validate.js
// building the same union as a Set from scratch. All four now delegate here.

import { ITEMS } from './items.js';
import { WEAPONS } from './weapons.js';

// Resolve an item id to its definition, weapons first. Returns null for an
// unknown or falsy id — callers treat "not found" uniformly rather than
// branching on undefined vs null.
export function resolveItemDef(id) {
    if (!id) return null;
    return WEAPONS[id] || ITEMS[id] || null;
}

// Every known item id, from either table.
export const ALL_ITEM_IDS = new Set([...Object.keys(ITEMS), ...Object.keys(WEAPONS)]);

// Ids that exist ONLY in WEAPONS — content-validate.js uses this to flag a
// weapon authored somewhere that resolves through ALL_ITEM_IDS but not
// through a resolver that still does a bare ITEMS-only lookup.
export const WEAPON_ONLY_IDS = new Set(Object.keys(WEAPONS).filter(id => !ITEMS[id]));
