// sprites.js — Kenney CC0 spritesheet loader and tile/region extraction
//
// As of v0.4.3-dev, Violencetown uses Kenney's Roguelike packs as its sole
// sprite source (CC0 1.0, committed under game/assets-placeholder/kenney/).
// The previous LimeZu paid-art primary + Kenney fallback architecture was
// retired to remove dual-system overhead during early development.
//
// All sheets are 16×16 native; the renderer draws at TILE_PX=32 via destW/
// destH upscale params, so the 2× nearest-neighbor scale happens at draw
// time without pre-processing. LimeZu's archived copy lives at
// C:\Users\caela\Desktop\LimezuAssets\ for future reference.

export class SpriteSheet {
    constructor(src, frameW, frameH) {
        this.img     = new Image();
        this.frameW  = frameW;
        this.frameH  = frameH;
        this.loaded  = false;
        this.failed  = false;

        this._promise = new Promise((resolve) => {
            this.img.onload = () => {
                this.loaded = true;
                this.cols = Math.floor(this.img.width / this.frameW);
                this.rows = Math.floor(this.img.height / this.frameH);
                resolve(true);
            };
            this.img.onerror = () => {
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

    // Draw by pixel region (for variable-sized sprites or precise extraction)
    drawRegion(ctx, sx, sy, sw, sh, dx, dy, dw, dh) {
        if (!this.loaded) return false;
        ctx.drawImage(this.img, sx, sy, sw, sh, dx, dy, dw ?? sw, dh ?? sh);
        return true;
    }
}

// ── Kenney sheets ────────────────────────────────────────────────────────────

const K = './assets-placeholder/kenney';

const KENNEY_BASE    = `${K}/roguelikeSheet_transparent.png`;     // Town/exterior, items
const KENNEY_DUNGEON = `${K}/roguelikeDungeon_transparent.png`;   // Sewer/dungeon tiles
const KENNEY_CHAR    = `${K}/roguelikeChar_transparent.png`;      // Player, enemies

// Multiple sheet KEYS share underlying PNGs because the renderer/coord-maps
// reference them by semantic name. Browser caching dedupes the HTTP requests,
// so the cost is a few extra Image objects per page, no network overhead.

export const SHEETS = {
    // Sewer/Dungeon
    sewerTiles:   { src: KENNEY_DUNGEON, frameW: 16, frameH: 16 },
    caveTiles:    { src: KENNEY_DUNGEON, frameW: 16, frameH: 16 },

    // Characters (player + all enemies)
    player:       { src: KENNEY_CHAR, frameW: 16, frameH: 16 },
    fungusViolet: { src: KENNEY_CHAR, frameW: 16, frameH: 16 },
    fungusRed:    { src: KENNEY_CHAR, frameW: 16, frameH: 16 },
    fungusKing:   { src: KENNEY_CHAR, frameW: 16, frameH: 16 },
    sewerMonster: { src: KENNEY_CHAR, frameW: 16, frameH: 16 },
    ghostMonster: { src: KENNEY_CHAR, frameW: 16, frameH: 16 },
    boss:         { src: KENNEY_CHAR, frameW: 16, frameH: 16 },

    // Town/exterior + items
    townTerrains: { src: KENNEY_BASE, frameW: 16, frameH: 16 },
    cityTerrains: { src: KENNEY_BASE, frameW: 16, frameH: 16 },
    cityProps:    { src: KENNEY_BASE, frameW: 16, frameH: 16 },
    buildings:    { src: KENNEY_BASE, frameW: 16, frameH: 16 },
    grocery:      { src: KENNEY_BASE, frameW: 16, frameH: 16 },

    // No Kenney equivalent for the previous LimeZu Modern UI sheet. The
    // renderer's `if (uiSheet?.loaded)` checks fall through to a colored-
    // rectangle fallback wherever panels would have used the parchment art.
    // Re-add an entry here if a Kenney UI pack gets selected in the future.
};

// ── Sewer/dungeon tile coords (Kenney Dungeon sheet — best-effort Phase A) ──
// Coordinates picked visually from the sheet; expect 1–2 iterations to dial
// them in. Sheet layout roughly: left/top = props, center = floors+water,
// right = walls+facades.

export const TILE_SPRITE_MAP = {
    0: null,                  // wall  — dark fallback (intentional, frames the room)
    1: { col: 1, row: 5 },    // floor — stone tile
    2: { col: 1, row: 8 },    // sludge — teal water/liquid
    3: { col: 0, row: 5 },    // gap — floor variant
    4: null,                  // grate — fallback
    5: { col: 2, row: 5 },    // drain — floor variant
    6: { col: 1, row: 4 },    // boss floor
    7: { col: 5, row: 4 },    // boss trigger — distinct accent
};

// ── Town tile coords (Kenney Base sheet — best-effort Phase A) ──────────────
// All grid-based now (no more region: true). Coordinates approximate.

// Coordinates dialed in via empirical color-sampling of the Base sheet — see
// session 2026-05-17 where the first-pass eyeball picks all landed in wrong
// regions. Each tile below is the center of a verified-color block.
export const TOWN_TILE_SPRITE_MAP = {
    10: null,                       // town wall edge — dark fallback (intentional black border)
    11: { col: 7,  row: 0 },        // sidewalk — grey stone (data-classified "grey")
    12: { col: 6,  row: 4 },        // road — brown dirt path (center of 4×2 brown block)
    13: { col: 2,  row: 10 },       // grass — green terrain (center of 5×2 solid green)
    14: { col: 3,  row: 6 },        // building wall — orange/brown brick
    15: null,                       // door — fallback for now (Base sheet doors live cols 30+, not yet mapped)
    16: null,                       // sewer entry — fallback
    17: null,                       // fence — fallback (multi-tile, deferred)
    18: null,                       // streetlight — fallback (multi-tile)
    19: null,                       // car — Base sheet has no car (City Pack does)
    20: null,                       // bench — fallback
    21: null,                       // trash can — fallback
};

// ── Item sprites (Kenney Base sheet — best-effort Phase A) ──────────────────
// Pixel-region references; the renderer extracts these via drawRegion().
// 16-pixel grid: x = col*16, y = row*16.

export const ITEM_SPRITES = {
    rock:    { sheet: 'caveTiles',     x: 16,  y: 32,  w: 16, h: 16 },   // skull/bone prop on Dungeon sheet
    pipe:    { sheet: 'townTerrains',  x: 480, y: 176, w: 16, h: 16 },   // wooden post/stake
    soap:    { sheet: 'townTerrains',  x: 528, y: 240, w: 16, h: 16 },   // barrel-like
    bandage: { sheet: 'townTerrains',  x: 304, y: 112, w: 16, h: 16 },   // mushroom/plant
};

// ── Enemy/character sprites (Kenney Char sheet — best-effort Phase A) ──────
// Kenney chars are single-frame per cell (no facing/animation row), so the
// renderer's directional + idle-blink animation logic is short-circuited for
// these. See _drawPlayer and _drawEnemies in renderer.js for the static draw.

export const ENEMY_SPRITES = {
    'Violet Fungus': { sheet: 'fungusViolet', col: 0, row: 0, static: true },
    'Red Fungus':    { sheet: 'fungusRed',    col: 0, row: 1, static: true },
    'Fungus King':   { sheet: 'fungusKing',   col: 0, row: 2, static: true },
    'Ghost Fungus':  { sheet: 'ghostMonster', col: 0, row: 3, static: true },
    'Sewer Monster': { sheet: 'sewerMonster', col: 0, row: 4, static: true },
};

// Player sprite (renderer reads this; previously hardcoded col/row via FACE map)
export const PLAYER_SPRITE = { sheet: 'player', col: 4, row: 0, static: true };

// ── Phase B TODO ────────────────────────────────────────────────────────────
// All coordinates above are first-pass picks from visual inspection of the
// Kenney sheets. Expect to revisit them as the game's visual identity firms
// up. Particularly worth investing in:
//   • A consistent "Violencetown" character palette across the 5 zone enemies
//   • Better tile-to-zone matching (sewer vs cave should look distinct)
//   • Item icons that read clearly at TILE_PX-8 hotbar size
// Iteration loop: edit coords here → reload page → screenshot → adjust.

// ── Loader ───────────────────────────────────────────────────────────────────

export async function loadAllSprites() {
    const loaded = {};
    const promises = [];

    for (const [key, def] of Object.entries(SHEETS)) {
        const sheet = new SpriteSheet(def.src, def.frameW, def.frameH);
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
