// world-map.js — the overworld zone graph, drawn as a flat grid of plain boxes
// (old-Zelda subscreen style: no interior detail, just NESW-placed screens).
//
// Each entry positions one map-SCREEN on a small grid by how it connects, and
// lists its neighbours so the renderer can draw connector lines. Interiors
// (Borgir, and Downtown's diner/bank/casino) are NOT screens — they live inside
// a parent zone, so they don't appear here. Hand-authored from the maps'
// transition graph; keep it in sync when zones are added/rewired.
//
// [SIDE AREA]—[DOWNTOWN]—[CANYON]—[GORGE]   (the side area's gate is fenced shut until TX6)
//            |  (bridge / grapple)
//  [FACTORY]—[TOWN]—[SEWER]
//    |       |
//    |   [CARNIVAL]
//    |       |
//    |   [GRAVEYARD]
//    |       |
//  [FROZEN]—[WILDERNESS]—[VALLEY]  (the Valley also hangs off the Canyon, by the hook)
export const WORLD_ZONES = [
    { zoneName: 'DOWNTOWN',   label: 'DOWNTOWN',   col: 2, row: 0, connects: ['TOWN', 'CANYON', '[SIDE AREA]'] },
    { zoneName: 'CANYON',     label: 'CANYON',     col: 3, row: 0, connects: ['DOWNTOWN', 'GORGE', 'VALLEY'] },
    // The Gorge (plans/gv1-canyon-to-gorge.md): reached by the Canyon's left wall. Downtown holds the
    // Canyon's left on this grid, so its box sits to the right for now; the place is a stand-in.
    { zoneName: 'GORGE',      label: 'GORGE',      col: 4, row: 0, connects: ['CANYON'] },
    // The side area (plans/tx5-downtown-side-area.md): off the spine, behind a fenced gate on Downtown's
    // west edge. Its name is a placeholder.
    { zoneName: '[SIDE AREA]', label: '[SIDE AREA]', col: 1, row: 0, connects: ['DOWNTOWN'] },
    { zoneName: 'FACTORY',    label: 'FACTORY',    col: 1, row: 1, connects: ['TOWN', '[FROZEN AREA]'] },
    { zoneName: 'TOWN',       label: 'TOWN',       col: 2, row: 1, connects: ['DOWNTOWN', 'FACTORY', 'SEWER', 'CARNIVAL'] },
    { zoneName: 'SEWER',      label: 'SEWER',      col: 3, row: 1, connects: ['TOWN'] },
    { zoneName: 'CARNIVAL',   label: 'CARNIVAL',   col: 2, row: 2, connects: ['TOWN', 'GRAVEYARD'] },
    { zoneName: 'GRAVEYARD',  label: 'GRAVEYARD',  col: 2, row: 3, connects: ['CARNIVAL', 'WILDERNESS'] },
    { zoneName: 'WILDERNESS', label: 'WILDERNESS', col: 2, row: 4, connects: ['GRAVEYARD', '[FROZEN AREA]', 'VALLEY'] },
    // The Valley (plans/gv2-canyon-to-valley.md): up the hook climb from the Canyon, and out its far
    // side into the Wilderness. The box sits beside the Wilderness; the place is a stand-in, and the
    // line from the Canyon runs a long way, behind the boxes between.
    { zoneName: 'VALLEY',     label: 'VALLEY',     col: 4, row: 4, connects: ['CANYON', 'WILDERNESS'] },
    // The frozen area (plans/ic3-frozen-area.md): its name is a placeholder
    // until Caelan names it; zoneByName upper-cases the map's zoneName.
    { zoneName: '[FROZEN AREA]', label: '[FROZEN AREA]', col: 1, row: 4, connects: ['FACTORY', 'WILDERNESS'] },
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
    '[TEXT]': 'DOWNTOWN',   // the bank's vault (vault-map.json); its name is still a placeholder
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
