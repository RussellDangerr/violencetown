// tags.js — the one tag vocabulary (plans/t1-tag-layer.md).
//
// Items, weapons, rings, enemies, tiles and map spawns may carry `tags: [...]`.
// Every tag used in content must be in TAGS; content-validate.js fails on any
// other. Nothing reads a tag for an effect yet, apart from ring fusions, which
// key on ring tags (rings.js findFusion). The list is internal, never shown.

import { TILE_BY_ID } from './data.js';

export const TAGS = Object.freeze([
    // The systems audit's eight (plans/systems-audit-2026-08.md §5.4).
    'flammable', 'metal', 'porous', 'wet', 'rigid', 'vermin', 'undead', 'conducts',
    // Ring tags (ring-data.js) not already above.
    'sewer', 'fire',
]);

const TAG_SET = new Set(TAGS);

export function isTag(t) {
    return typeof t === 'string' && TAG_SET.has(t);
}

// The entries of a list that are not known tags (non-strings included).
export function unknownTags(list) {
    return Array.isArray(list) ? list.filter(t => !isTag(t)) : [];
}

// Older flags that already mean a tag. They are read, not migrated: an enemy
// with `vermin: true` has the `vermin` tag without carrying it in `tags`.
const FLAG_TAGS = Object.freeze({ vermin: 'vermin', sewerDweller: 'sewer' });

// A thing's tags: its own `tags`, then any flag tags, deduped, in that order.
export function tagsOf(thing) {
    if (!thing || typeof thing !== 'object') return [];
    const out = [];
    if (Array.isArray(thing.tags)) for (const t of thing.tags) if (!out.includes(t)) out.push(t);
    for (const [flag, tag] of Object.entries(FLAG_TAGS))
        if (thing[flag] === true && !out.includes(tag)) out.push(tag);
    return out;
}

export function hasTag(thing, tag) {
    return tagsOf(thing).includes(tag);
}

// The tags of a tile, by its numeric id. Empty for an unknown id.
export function tileTags(id) {
    return tagsOf(TILE_BY_ID[id]);
}
