// fight-arc.js — the arc of attacks under you in a fight (plans/fa1-fight-arc.md).
//
// Pure: no DOM, no canvas. While a fight is on, a half-ring of numbered slots sits under
// the player, one per attack owned. This module says which slots exist, where they sit,
// which one a point lands on and whether the arc should get out of the way of an aim.
// main.js runs a slot through the wheel's own drill, and the renderer draws what is here.
//
// The slots are NOT a second list of attacks: each one is a node of the wheel's own tree
// (ROOT), found by key, with the path to it. A slot therefore runs exactly what the wheel
// runs, and its greyed reason is wheel-model's (FX58), never a copy.

import { ROOT, greyedReason, GREYED_REASON_TEXT, affectedTiles } from './wheel-model.js';
import { fighters } from './fight-area.js';
import { tileToScreen } from './viewport.js';
import { TILE_PX } from './data.js';

export const ARC_MAX = 8;

// The arc's slots, in their fixed order. Ranged and Throw are the same action on the wheel
// (Ranged is "a duplicate of TRICK > Throw, by design"), so the arc has the one slot; that
// keeps the cap at eight even with all three spells.
export const ARC_KEYS = Object.freeze(['hit', 'cleave', 'spin', 'ranged', 'fireball', 'coneofcold', 'boo', 'defend']);

// Find a node by key in the wheel's tree: { node, path } with path = indices into ROOT.
function findNode(key, node = ROOT, path = []) {
    for (let i = 0; i < (node.children || []).length; i++) {
        const c = node.children[i];
        if (c.key === key) return { node: c, path: [...path, i] };
        const deeper = findNode(key, c, [...path, i]);
        if (deeper) return deeper;
    }
    return null;
}

const FOUND = ARC_KEYS.map(key => {
    const f = findNode(key);
    if (!f) throw new Error(`fight-arc: the wheel has no node "${key}"`);
    return f;
});

function owns(node, game) {
    if (!node.spellId) return true;   // moves are always yours; only spells are owned or not
    return game.hasSpell ? !!game.hasSpell(node.spellId) : (game.knownSpells || []).includes(node.spellId);
}

// Every slot you have right now, numbered from 1. `reason` is wheel-model's greyed reason
// key (null when the slot is usable); `line` is its log line.
export function arcSlots(game) {
    const out = [];
    for (const { node, path } of FOUND) {
        if (!owns(node, game)) continue;
        if (out.length >= ARC_MAX) break;
        const reason = greyedReason(node, game);
        out.push({ n: out.length + 1, key: node.key, label: node.label, node, path, reason, line: reason ? GREYED_REASON_TEXT[reason] : null });
    }
    return out;
}

// A fight is on: the same test the fog uses (fight-area.js).
export function arcOn(game) {
    return !!game && game.state !== 'dead' && fighters(game.enemies).length > 0;
}

// Shown while a fight is on and nothing covers the world: idle, or the wheel's aim layer.
// The wheel's dial, its confirm and every other menu hide it.
export function arcVisible(game) {
    if (!arcOn(game)) return false;
    if (game.state === 'idle') return true;
    return game.state === 'radial_menu' && !!game.wheel && !!game.wheel.aiming && !game.wheel.confirming;
}

// ── Geometry (all stand-ins; the look is the owner's) ───────────────────────
export const ARC_RX = 190;        // half-ellipse radii, logical px, from the player's centre
export const ARC_RY = 84;         // 64 keeps the ring of tiles beside you (reach 48) clear of it
export const ARC_SLOT_W = 64;
export const ARC_SLOT_H = 28;
export const ARC_ALPHA = 0.9;
export const ARC_FADED_ALPHA = 0.2;

// Where each of the eight positions sits: slot 1 at the left end, round the bottom, slot 8
// at the right end. A position belongs to its number, so a slot never moves when another
// appears or goes greyed. Returned as eight rects whether or not the slot exists.
export function arcLayout(vp) {
    const cx = vp.origin.x + TILE_PX / 2, cy = vp.origin.y + TILE_PX / 2;
    const slots = [];
    for (let k = 0; k < ARC_MAX; k++) {
        const a = Math.PI - (k * Math.PI) / (ARC_MAX - 1);
        const mx = cx + ARC_RX * Math.cos(a), my = cy + ARC_RY * Math.sin(a);
        slots.push({ n: k + 1, x: Math.round(mx - ARC_SLOT_W / 2), y: Math.round(my - ARC_SLOT_H / 2), w: ARC_SLOT_W, h: ARC_SLOT_H });
    }
    return { cx, cy, slots };
}

// The slot number under a screen point (0 for none), among the slots that exist.
export function arcSlotAt(vp, slots, pt, slop = 0) {
    if (!pt) return 0;
    const have = new Set(slots.map(s => s.n));
    for (const r of arcLayout(vp).slots) {
        if (!have.has(r.n)) continue;
        if (pt.x >= r.x - slop && pt.x <= r.x + r.w + slop && pt.y >= r.y - slop && pt.y <= r.y + r.h + slop) return r.n;
    }
    return 0;
}

const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// True while the player is aiming at a tile one of the arc's slots sits over: the arc then
// fades and stops catching taps, so the tile under it is plain to see and to tap. The tiles
// are the aim's own (affectedTiles), so a cone or a burst fades it too.
export function arcFaded(vp, game, scroll = { x: 0, y: 0 }) {
    const w = game && game.wheel;
    if (!w || !w.aiming || !w.reticle) return false;
    const tiles = affectedTiles(w, game);
    const rects = arcLayout(vp).slots;
    const have = new Set(arcSlots(game).map(s => s.n));
    return tiles.some(t => {
        const p = tileToScreen(vp, t.x, t.y, game.playerX, game.playerY, scroll.x, scroll.y);
        const tr = { x: p.x, y: p.y, w: TILE_PX, h: TILE_PX };
        return rects.some(r => have.has(r.n) && overlaps(tr, r));
    });
}
