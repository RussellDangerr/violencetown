// drops.js — pure helpers for the per-zone runtime dropped-items layer.
//
// The record + re-inject logic lives here so it is unit-testable under node:
// Game (main.js) touches document at load and can't be constructed in a test,
// while these functions are pure and mirror ai.js / pathing.js / rings.js.
// Game delegates from _recordDrop (record), _loadMap (re-inject), and
// _handleEnemyDeath (the unused-kit death drop, below).

import { resolveLoadout } from './enemies.js';

// Record a runtime drop into the per-map bucket ("mapUrl" → [{ type, x, y }]),
// deduped on {type,x,y}. Enemies — bosses included — respawn from JSON on every
// _loadMap, so a boss whose drop is left on the ground and then re-killed would
// otherwise farm duplicate records that re-inject N-fold on each re-entry. The
// dedup keeps the world permanent, not regenerative. Mutates `dropped`; returns
// true only if this drop was newly recorded.
export function recordDrop(dropped, url, type, x, y) {
    const bucket = (dropped[url] ||= []);
    if (bucket.some(d => d.type === type && d.x === x && d.y === y)) return false;
    bucket.push({ type, x, y });
    return true;
}

// The runtime drops to re-inject for `url` on map load: every recorded drop the
// player hasn't since picked up (same "url|x|y|type" key in the `collected` set,
// as written by the pickup path). Pure read — returns a new [{ type, x, y }]
// array and mutates nothing; the caller resolves defs and places them.
export function pendingDrops(dropped, collected, url) {
    return (dropped[url] || []).filter(d => !collected.has(`${url}|${d.x}|${d.y}|${d.type}`));
}

// Task 14 / Law 6f AS AMENDED — the unused kit drops. He spent his tricks or
// he didn't; what's left is the reward for rushing him. Resolves an enemy's
// authored `loadout` (an item-id array) to real item defs and returns the
// ground-item descriptors to place at its tile — the same {type,x,y,def}
// shape _handleEnemyDeath already pushes for the Were-Rat converter / Pike's
// rope. Pure — like _recordDrop, "the CALLER then places it into
// groundItems" (and records the drop, logs it, and mugs the id).
export function dropLoadout(loadout, x, y) {
    return resolveLoadout(loadout).map(def => ({ type: def.id, x, y, def }));
}
