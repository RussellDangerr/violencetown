// data.js — tile types, constants, sprite mappings
// Sewer demo prototype

// ── Tile Types ───────────────────────────────────────────────────────────────

export const TILES = {
    // Sewer tiles (0-7)
    WALL:         { id: 0, walkable: false, hazard: null, fallbackColor: '#1c1510' },
    FLOOR:        { id: 1, walkable: true,  hazard: null, fallbackColor: '#2a2a3a' },
    SLUDGE:       { id: 2, walkable: true,  hazard: 'sludge', fallbackColor: '#3c145a' },
    GAP:          { id: 3, walkable: true,  hazard: null, fallbackColor: '#1e1e30' },
    GRATE:        { id: 4, walkable: false, hazard: null, fallbackColor: '#333340' },
    DRAIN:        { id: 5, walkable: true,  hazard: null, fallbackColor: '#252535' },
    BOSS_FLOOR:   { id: 6, walkable: true,  hazard: null, fallbackColor: '#2e1a3e' },
    BOSS_TRIGGER: { id: 7, walkable: true,  hazard: null, fallbackColor: '#5a1a6a' },

    // Town tiles (10-19)
    TOWN_WALL:    { id: 10, walkable: false, hazard: null, fallbackColor: '#4a3a2a' },
    SIDEWALK:     { id: 11, walkable: true,  hazard: null, fallbackColor: '#8a8a7a' },
    ROAD:         { id: 12, walkable: true,  hazard: null, fallbackColor: '#555555' },
    GRASS:        { id: 13, walkable: true,  hazard: null, fallbackColor: '#2a5a2a' },
    BUILDING:     { id: 14, walkable: false, hazard: null, fallbackColor: '#6a5a4a' },
    DOOR:         { id: 15, walkable: true,  hazard: null, fallbackColor: '#8b6914' },
    SEWER_ENTRY:  { id: 16, walkable: true,  hazard: null, fallbackColor: '#2a1a0a' },
    FENCE:        { id: 17, walkable: false, hazard: null, fallbackColor: '#5a4a3a' },
    STREETLIGHT:  { id: 18, walkable: false, hazard: null, fallbackColor: '#4a4a4a' },
    CAR:          { id: 19, walkable: false, hazard: null, fallbackColor: '#884444' },
    BENCH:        { id: 20, walkable: false, hazard: null, fallbackColor: '#6a5a3a' },
    TRASHCAN:     { id: 21, walkable: false, hazard: null, fallbackColor: '#4a5a4a' },

    // Set-piece tiles (22-23) — the sewer-escape gauntlet
    PORTCULLIS:   { id: 22, walkable: false, hazard: null, fallbackColor: '#3a3a3a' },             // permanent one-way seal
    BARRICADE:    { id: 23, walkable: false, hazard: null, fallbackColor: '#6a4a2a', destructible: true }, // bump/throw to clear

    // Circus tiles (30-39) — Americana carnival, cryptid menagerie
    CIRCUS_GROUND: { id: 30, walkable: true,  hazard: null, fallbackColor: '#c4a070' },
    TENT_STRIPE:   { id: 31, walkable: false, hazard: null, fallbackColor: '#c43030' },
    CONFETTI:      { id: 32, walkable: true,  hazard: null, fallbackColor: '#e8c060' },
    SAWDUST:       { id: 33, walkable: true,  hazard: null, fallbackColor: '#a08050' },

    // Factory tiles (40-49) — Oddworld-coded industrial, alien-occupied
    FACTORY_FLOOR: { id: 40, walkable: true,  hazard: null, fallbackColor: '#3a3a3e' },
    FACTORY_WALL:  { id: 41, walkable: false, hazard: null, fallbackColor: '#5a5a5e' },
    GOO_VISUAL:    { id: 42, walkable: true,  hazard: null, fallbackColor: '#6abe30' },
    CONVEYOR_VIS:  { id: 43, walkable: true,  hazard: null, fallbackColor: '#4a4a3e' },

    // Graveyard tiles (50-59) — surfer-deity cemetery
    GRAVE_DIRT:    { id: 50, walkable: true,  hazard: null, fallbackColor: '#3a2a1e' },
    GRAVESTONE:    { id: 51, walkable: false, hazard: null, fallbackColor: '#7a7a7a' },
    DEAD_GRASS:    { id: 52, walkable: true,  hazard: null, fallbackColor: '#3a3a2a' },
    IRON_FENCE:    { id: 53, walkable: false, hazard: null, fallbackColor: '#1a1a1a' },
};

// Reverse lookup: id → tile def
export const TILE_BY_ID = {};
for (const [key, def] of Object.entries(TILES)) {
    def.name = key;
    TILE_BY_ID[def.id] = def;
}

// ── Constants ────────────────────────────────────────────────────────────────

export const TILE_PX = 32;
export const VIEW_TILES = 19;       // odd number, player at center
export const CANVAS_PX = TILE_PX * VIEW_TILES; // 608

export const PLAYER_MAX_HP = 100;
// MP (Magic / Skill points) — every creature starts at 100. FIGHT → Magic
// spells spend from it; the player's regenerates a little each turn (MP_REGEN
// in main.js). The HUD surfaces it as a cyan bar.
export const PLAYER_MAX_MP = 100;
export const SLUDGE_DOT = 5;
// 9 to match the 9-slot hotbar (layout.HOTBAR_SLOTS) so every slot is both
// rendered and tap/key reachable — a 10th slot was invisible and untappable,
// only reachable via Digit0. Keep these two in lockstep. (fix/critical-path)
export const INVENTORY_SIZE = 9;
export const MAX_STACK = 99;
