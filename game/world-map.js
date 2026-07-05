// world-map.js — the overworld zone graph, drawn as a flat grid of plain boxes
// (old-Zelda subscreen style: no interior detail, just NESW-placed screens).
//
// Each entry positions one map-SCREEN on a small grid by how it connects, and
// lists its neighbours so the renderer can draw connector lines. Interiors
// (Borgir, and Downtown's diner/bank/casino) are NOT screens — they live inside
// a parent zone, so they don't appear here. Hand-authored from the maps'
// transition graph; keep it in sync when zones are added/rewired.
//
//        [DOWNTOWN]—[CANYON]
//            |  (bridge / grapple)
//  [FACTORY]—[TOWN]—[SEWER]
//            |
//        [CARNIVAL]
//            |
//        [GRAVEYARD]
//            |
//        [WILDERNESS]
export const WORLD_ZONES = [
    { zoneName: 'DOWNTOWN',   label: 'DOWNTOWN',   col: 2, row: 0, connects: ['TOWN', 'CANYON'] },
    { zoneName: 'CANYON',     label: 'CANYON',     col: 3, row: 0, connects: ['DOWNTOWN'] },
    { zoneName: 'FACTORY',    label: 'FACTORY',    col: 1, row: 1, connects: ['TOWN'] },
    { zoneName: 'TOWN',       label: 'TOWN',       col: 2, row: 1, connects: ['DOWNTOWN', 'FACTORY', 'SEWER', 'CARNIVAL'] },
    { zoneName: 'SEWER',      label: 'SEWER',      col: 3, row: 1, connects: ['TOWN'] },
    { zoneName: 'CARNIVAL',   label: 'CARNIVAL',   col: 2, row: 2, connects: ['TOWN', 'GRAVEYARD'] },
    { zoneName: 'GRAVEYARD',  label: 'GRAVEYARD',  col: 2, row: 3, connects: ['CARNIVAL', 'WILDERNESS'] },
    { zoneName: 'WILDERNESS', label: 'WILDERNESS', col: 2, row: 4, connects: ['GRAVEYARD'] },
];

// Case-insensitive lookup by a map's `zoneName`. Interiors (BORGIR, DINER,
// FIRST BLOOD BANK, CASINO) return null — the caller resolves them to their
// parent overworld zone via INTERIOR_PARENT below so "you are here" still lands.
export function zoneByName(name) {
    const n = String(name || '').toUpperCase();
    return WORLD_ZONES.find(z => z.zoneName === n) || null;
}

// Interior zoneName -> the overworld screen it sits inside, so the map can mark
// "you are here" on the parent box while the player is indoors.
export const INTERIOR_PARENT = {
    BORGIR: 'TOWN',
    DINER: 'DOWNTOWN',
    'FIRST BLOOD BANK': 'DOWNTOWN',
    CASINO: 'DOWNTOWN',
};

// The overworld screen for any zoneName (itself if a screen, else its parent).
export function overworldZone(name) {
    const n = String(name || '').toUpperCase();
    if (zoneByName(n)) return n;
    return INTERIOR_PARENT[n] || null;
}

// Unique connector pairs (each as [a,b] sorted) so the renderer draws one line.
export function connectorPairs() {
    const seen = new Set(), out = [];
    for (const z of WORLD_ZONES) for (const other of (z.connects || [])) {
        const key = [z.zoneName, other].sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        out.push([z.zoneName, other]);
    }
    return out;
}
