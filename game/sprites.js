// sprites.js — Spritesheet loader and tile/region extraction
// Sewer demo prototype

export class SpriteSheet {
    constructor(src, frameW, frameH, fallback) {
        this.img     = new Image();
        this.frameW  = frameW;
        this.frameH  = frameH;
        this.loaded  = false;
        this.failed  = false;
        this.usingFallback = false;

        this._promise = new Promise((resolve) => {
            const finishLoad = () => {
                this.loaded = true;
                this.cols = Math.floor(this.img.width / this.frameW);
                this.rows = Math.floor(this.img.height / this.frameH);
                resolve(true);
            };
            this.img.onload = finishLoad;
            this.img.onerror = () => {
                if (fallback && !this.usingFallback) {
                    this.usingFallback = true;
                    this.frameW = fallback.frameW ?? this.frameW;
                    this.frameH = fallback.frameH ?? this.frameH;
                    this.img.onerror = () => { this.failed = true; resolve(false); };
                    this.img.src = fallback.src;
                    return;
                }
                this.failed = true;
                resolve(false);
            };
            this.img.src = src;
        });
    }

    get ready() { return this._promise; }

    // Draw by grid (col, row)
    drawFrame(ctx, col, row, x, y, destW, destH) {
        if (!this.loaded) return false;
        ctx.drawImage(
            this.img,
            col * this.frameW, row * this.frameH,
            this.frameW, this.frameH,
            x, y, destW ?? this.frameW, destH ?? this.frameH
        );
        return true;
    }

    // Draw by pixel region (for variable-sized sprites)
    drawRegion(ctx, sx, sy, sw, sh, dx, dy, dw, dh) {
        if (!this.loaded) return false;
        ctx.drawImage(this.img, sx, sy, sw, sh, dx, dy, dw ?? sw, dh ?? sh);
        return true;
    }
}

// ── Asset paths ──────────────────────────────────────────────────────────────

// Premium (gitignored, local-only) — pointed at a guaranteed-404 path when
// ?placeholder=1 is in the URL, which forces every sheet through its fallback
// so you can see the public-deploy render locally without moving files.
const placeholderMode = typeof location !== 'undefined' && new URLSearchParams(location.search).has('placeholder');
const A = placeholderMode ? '../assets-FORCE-MISSING' : '../assets';
const K = './assets-placeholder/kenney';                // CC0 fallback (committed, public deploy)

// Each SHEETS entry has a primary `src` (LimeZu, paid) and an optional `fallback`
// pointing to a Kenney CC0 sheet that loads when LimeZu is absent. Frame sizes
// differ between sets — LimeZu uses 32×32, Kenney roguelike uses 16×16.
//
// IMPORTANT: TILE_SPRITE_MAP / TOWN_TILE_SPRITE_MAP / ITEM_SPRITES / ENEMY_SPRITES
// coordinates below are calibrated for the LimeZu layouts. When fallback is active
// the same (col,row) will pull from a *different* part of the Kenney sheet — see
// the Phase 2 TODO at the bottom of this file for the remap work.

const KENNEY_TILE  = { src: `${K}/roguelikeSheet_transparent.png`,   frameW: 16, frameH: 16 };
const KENNEY_DUNG  = { src: `${K}/roguelikeDungeon_transparent.png`, frameW: 16, frameH: 16 };
const KENNEY_CHAR  = { src: `${K}/roguelikeChar_transparent.png`,    frameW: 16, frameH: 16 };

export const SHEETS = {
    // Sewer
    sewerTiles:   { src: `${A}/fungus-cave/Tilesets/Tileset - Sewers 32x32.png`, frameW: 32, frameH: 32, fallback: KENNEY_DUNG },
    caveTiles:    { src: `${A}/fungus-cave/Tilesets/Tileset - Fungus cave and Refugee outpost 32x32.png`, frameW: 32, frameH: 32, fallback: KENNEY_DUNG },
    fungusViolet: { src: `${A}/fungus-cave/Characters/Fungus - violet.png`, frameW: 16, frameH: 32, fallback: KENNEY_CHAR },
    fungusRed:    { src: `${A}/fungus-cave/Characters/Fungus - red.png`, frameW: 16, frameH: 32, fallback: KENNEY_CHAR },
    fungusKing:   { src: `${A}/fungus-cave/Characters/Fungus - King.png`, frameW: 16, frameH: 32, fallback: KENNEY_CHAR },
    sewerMonster: { src: `${A}/fungus-cave/Characters/Sewers monster.png`, frameW: 16, frameH: 32, fallback: KENNEY_CHAR },
    ghostMonster: { src: `${A}/fungus-cave/Characters/Sewers monster - ghost.png`, frameW: 16, frameH: 32, fallback: KENNEY_CHAR },
    player:       { src: `${A}/fungus-cave/Characters/Cleric.png`, frameW: 16, frameH: 32, fallback: KENNEY_CHAR },
    boss:         { src: `${A}/fungus-cave/Battlers/BOSS.png`, frameW: 155, frameH: 135, fallback: KENNEY_CHAR },

    // Town (Modern Exteriors)
    townTerrains: { src: `${A}/modern-exteriors/Modern_Exteriors_32x32/ME_Theme_Sorter_32x32/1_Terrains_and_Fences_32x32.png`, frameW: 32, frameH: 32, fallback: KENNEY_TILE },
    cityTerrains: { src: `${A}/modern-exteriors/Modern_Exteriors_32x32/ME_Theme_Sorter_32x32/2_City_Terrains_32x32.png`, frameW: 32, frameH: 32, fallback: KENNEY_TILE },
    cityProps:    { src: `${A}/modern-exteriors/Modern_Exteriors_32x32/ME_Theme_Sorter_32x32/3_City_Props_32x32.png`, frameW: 32, frameH: 32, fallback: KENNEY_TILE },
    buildings:    { src: `${A}/modern-exteriors/Modern_Exteriors_32x32/ME_Theme_Sorter_32x32/4_Generic_Buildings_32x32.png`, frameW: 32, frameH: 32, fallback: KENNEY_TILE },

    // Items (Modern Interiors)
    grocery:      { src: `${A}/modern-interiors/1_Interiors/32x32/Theme_Sorter_32x32/16_Grocery_store_32x32.png`, frameW: 32, frameH: 32, fallback: KENNEY_TILE },

    // UI — no Kenney roguelike equivalent; falls through to existing colored-box behavior
    uiStyle1:     { src: `${A}/modern-ui/32x32/Modern_UI_Style_1_32x32.png`, frameW: 32, frameH: 32 },
    uiStyle2:     { src: `${A}/modern-ui/32x32/Modern_UI_Style_2_32x32.png`, frameW: 32, frameH: 32 },
};

// ── Sewer tile sprite mappings ───────────────────────────────────────────────
// Sewers tileset (256x352, 8 cols x 11 rows):
// Cols 0-3 rows 0-3: Brick border frame, interior = floor
// Cols 4-7 rows 0-3: Purple sludge pool

export const TILE_SPRITE_MAP = {
    0: null,                  // wall — fallback color
    1: { col: 1, row: 1 },   // floor — dark stone interior
    2: { col: 7, row: 9 },   // sludge — bright purple from bottom-right of sheet
    3: { col: 2, row: 2 },   // gap — floor variant
    4: null,                  // grate — fallback
    5: { col: 2, row: 1 },   // drain — floor variant
    6: { col: 1, row: 2 },   // boss floor
    7: { col: 6, row: 1 },   // boss trigger
};

// ── Town tile sprite mappings ────────────────────────────────────────────────
// Terrains sheet (1024x2368, 32 cols x 74 rows):
// The green grass 9-slice set starts around row 1. Interior fill = (2, 2)
// The grey stone 9-slice set is around col 8+, row 3+. Interior fill = (10, 4)
// Brown brick path: around col 0, row 4+. Interior fill = (2, 5)
//
// These are approximations — may need visual tweaking.

// Town tiles use pixel-region references from the large exterior sheets.
// Format: { sheet, x, y, w, h } for drawRegion (not grid-based).
// 'region' flag tells the renderer to use drawRegion instead of drawFrame.
export const TOWN_TILE_SPRITE_MAP = {
    10: null,  // town wall edge — keep dark fallback
    11: { region: true, sheet: 'cityTerrains', x: 0,   y: 128, w: 32, h: 32 },  // sidewalk — concrete edge from city block
    12: { region: true, sheet: 'cityTerrains', x: 384, y: 128, w: 32, h: 32 },  // road — grey asphalt from city block interior
    13: { region: true, sheet: 'townTerrains', x: 32,  y: 64,  w: 32, h: 32 },  // grass — green interior from terrains
    14: { region: true, sheet: 'buildings',     x: 0,   y: 64,  w: 32, h: 32 },  // building wall — brick facade
    15: { region: true, sheet: 'buildings',     x: 128, y: 160, w: 32, h: 32 },  // door — from building doorways
    16: null,  // sewer entry — dark fallback (manhole)
    17: null,  // fence — fallback
    18: null,  // streetlight — fallback (multi-tile, hard to do in 1x1)
    19: { region: true, sheet: 'cityProps',     x: 0,   y: 6848, w: 32, h: 32 }, // car — red vehicle from bottom of props
    20: null,  // bench — fallback
    21: null,  // trash can — fallback
};

// ── Item sprites ─────────────────────────────────────────────────────────────
// Map item IDs to sprite regions (sheet + pixel coords)
// These use drawRegion() for pixel-precise extraction from large sheets

// Item sprites from Fungus Cave + Refugee Outpost tileset (256x1120, 8 cols x 35 rows)
// Row 8 (y=256): wooden crates/boxes
// Row 9 (y=288): barrels with colored liquids at cols 6-7
// Row 13 (y=416): mushrooms and small plants
// Row 14 (y=448): bags, sacks
export const ITEM_SPRITES = {
    rock:    { sheet: 'caveTiles', x: 0,   y: 256, w: 32, h: 32 },  // wooden crate (row 8, col 0)
    pipe:    { sheet: 'caveTiles', x: 192, y: 256, w: 32, h: 32 },  // tool/axe (row 8, col 6)
    soap:    { sheet: 'caveTiles', x: 192, y: 288, w: 32, h: 32 },  // barrel with blue liquid (row 9, col 6)
    bandage: { sheet: 'caveTiles', x: 0,   y: 416, w: 32, h: 32 },  // red mushroom (row 13, col 0)
};

// ── Enemy sprites ────────────────────────────────────────────────────────────

export const ENEMY_SPRITES = {
    'Violet Fungus': { sheet: 'fungusViolet', col: 1, row: 0 },
    'Red Fungus':    { sheet: 'fungusRed',    col: 1, row: 0 },
    'Fungus King':   { sheet: 'fungusKing',   col: 1, row: 0 },
    'Ghost Fungus':  { sheet: 'ghostMonster', col: 1, row: 0 },
    'Sewer Monster': { sheet: 'sewerMonster', col: 1, row: 0 },
};

// ── Phase 2 TODO: Kenney-specific coordinate maps ────────────────────────────
//
// When a sheet falls back to its Kenney source, the (col,row) values in the maps
// above still reference the LimeZu layout. A Kenney sheet uses the same indexing
// API but tiles are in different positions. Public-deploy parity requires parallel
// maps keyed by sheet.usingFallback. Categories needing remapping:
//   • TILE_SPRITE_MAP       (sewer/cave tiles → roguelikeDungeon coords)
//   • TOWN_TILE_SPRITE_MAP  (town tiles      → roguelikeSheet coords)
//   • ITEM_SPRITES          (caveTiles items → roguelikeSheet or Dungeon coords)
//   • ENEMY_SPRITES         (fungus chars    → roguelikeChar monster row coords)
// Renderer change: when sheet.usingFallback, read from a KENNEY_* map of the same
// shape and let drawFrame/drawRegion proceed unchanged with the substituted coords.

// ── Loader ───────────────────────────────────────────────────────────────────

export async function loadAllSprites() {
    const loaded = {};
    const promises = [];

    for (const [key, def] of Object.entries(SHEETS)) {
        const sheet = new SpriteSheet(def.src, def.frameW, def.frameH, def.fallback);
        loaded[key] = sheet;
        promises.push(sheet.ready);
    }

    await Promise.all(promises);

    let ok = 0, fail = 0;
    for (const [, sheet] of Object.entries(loaded)) {
        if (sheet.loaded) ok++; else fail++;
    }

    return { sheets: loaded, ok, fail };
}
