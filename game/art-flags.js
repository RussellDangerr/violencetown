// art-flags.js — SPIKE (spike/art-style, plans/batch-2.md stage 2): the art-style
// prototype's switches, read from the address bar so the shipped look is the
// default and each option can be compared on the same scene.
//
//   ?art=size             characters, chests and ground items at the full tile
//                         (one pixel size with the ground) instead of 24 px
//   ?art=size,outline     + the Tiny packs' plum outline on every sprite from
//                         another pack (never on repeating ground tiles)
//   ?art=size,outline,shadow   + banded shadows along the base of walls

const raw = (typeof location !== 'undefined' && location.search)
    ? new URLSearchParams(location.search).get('art') : null;
const on = new Set(String(raw || '').split(',').map(s => s.trim()).filter(Boolean));

export const ART = {
    size: on.has('size'),
    outline: on.has('outline'),
    shadow: on.has('shadow'),
};

// The Tiny packs' outline colour; their sprites already carry it.
export const TINY_INK = [63, 38, 49];

// Sheets drawn in the Tiny style already (or re-outlined by a tool), which
// the outline pass leaves alone.
export const TINY_STYLE_SHEETS = new Set(['tinyDungeon', 'tinyTown', 'tinyExtra', 'outlined', 'emotes', 'marks']);

// How far a character, chest or ground item sits in from its tile's edge.
export function spriteInset() { return ART.size ? 0 : 4; }
