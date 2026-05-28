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
    // `padding` is the gap (in source pixels) between adjacent cells. Kenney's
    // roguelike packs ship with a 1-pixel gutter between every 16×16 cell —
    // ignoring it makes deep-row sprites drift up by `row` pixels and render
    // halves of two cells stacked together (the "character bottom half on top"
    // bug). Set `padding: 1` on every roguelike sheet; leave 0 for packed
    // sheets (e.g. roguelikeCity_packed.png is gutter-free).
    constructor(src, frameW, frameH, padding = 0) {
        this.img     = new Image();
        this.frameW  = frameW;
        this.frameH  = frameH;
        this.padding = padding;
        this.loaded  = false;
        this.failed  = false;

        this._promise = new Promise((resolve) => {
            this.img.onload = () => {
                this.loaded = true;
                // Adding `padding` to the numerator handles Kenney's "missing
                // trailing gutter" — the last column/row doesn't have its
                // own trailing 1px, so the naive (W / (frameW+padding)) math
                // undercounts by one. (e.g. roguelikeChar is 918 wide: with
                // padding=1, (918+1)/17 = 54.0 cleanly, matching the actual
                // 54 character columns in the sheet.)
                const stride = this.frameW + this.padding;
                this.cols = Math.floor((this.img.width  + this.padding) / stride);
                this.rows = Math.floor((this.img.height + this.padding) / stride);
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

    // Draw by grid (col, row). Source coords account for any inter-cell
    // padding declared on the sheet — see constructor for context.
    drawFrame(ctx, col, row, x, y, destW, destH) {
        if (!this.loaded) return false;
        ctx.drawImage(
            this.img,
            col * (this.frameW + this.padding),
            row * (this.frameH + this.padding),
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

const KENNEY_BASE    = `${K}/roguelikeSheet_transparent.png`;     // Original generic sheet (kept for compat)
const KENNEY_DUNGEON = `${K}/roguelikeDungeon_transparent.png`;   // Sewer/dungeon tiles
const KENNEY_CHAR    = `${K}/roguelikeChar_transparent.png`;      // Player, enemies
const KENNEY_CITY    = `${K}/roguelikeCity_packed.png`;           // Town tiles (added 2026-05-22 — proper city pack)

// Multiple sheet KEYS share underlying PNGs because the renderer/coord-maps
// reference them by semantic name. Browser caching dedupes the HTTP requests,
// so the cost is a few extra Image objects per page, no network overhead.

// Kenney roguelike PNGs have a 1-pixel gutter between every 16×16 cell.
// The packed City PNG does NOT (it's a tight 16-stride atlas). See the
// SpriteSheet constructor comment for why this matters.
const ROGUELIKE_PAD = 1;

export const SHEETS = {
    // Sewer/Dungeon
    sewerTiles:   { src: KENNEY_DUNGEON, frameW: 16, frameH: 16, padding: ROGUELIKE_PAD },
    caveTiles:    { src: KENNEY_DUNGEON, frameW: 16, frameH: 16, padding: ROGUELIKE_PAD },

    // Characters (player + all enemies)
    player:       { src: KENNEY_CHAR, frameW: 16, frameH: 16, padding: ROGUELIKE_PAD },
    fungusViolet: { src: KENNEY_CHAR, frameW: 16, frameH: 16, padding: ROGUELIKE_PAD },
    fungusRed:    { src: KENNEY_CHAR, frameW: 16, frameH: 16, padding: ROGUELIKE_PAD },
    fungusKing:   { src: KENNEY_CHAR, frameW: 16, frameH: 16, padding: ROGUELIKE_PAD },
    sewerMonster: { src: KENNEY_CHAR, frameW: 16, frameH: 16, padding: ROGUELIKE_PAD },
    ghostMonster: { src: KENNEY_CHAR, frameW: 16, frameH: 16, padding: ROGUELIKE_PAD },
    boss:         { src: KENNEY_CHAR, frameW: 16, frameH: 16, padding: ROGUELIKE_PAD },

    // Town/exterior + items — KENNEY_BASE kept for legacy ITEM_SPRITES references.
    // Active town tile rendering uses cityTiles (KENNEY_CITY) added 2026-05-22.
    townTerrains: { src: KENNEY_BASE, frameW: 16, frameH: 16, padding: ROGUELIKE_PAD },
    cityTerrains: { src: KENNEY_BASE, frameW: 16, frameH: 16, padding: ROGUELIKE_PAD },
    cityProps:    { src: KENNEY_BASE, frameW: 16, frameH: 16, padding: ROGUELIKE_PAD },
    buildings:    { src: KENNEY_BASE, frameW: 16, frameH: 16, padding: ROGUELIKE_PAD },
    grocery:      { src: KENNEY_BASE, frameW: 16, frameH: 16, padding: ROGUELIKE_PAD },

    // Roguelike City Pack — proper town tiles with single-cell road/sidewalk/grass/
    // buildings + cars, trees, streetlights, manhole covers (sewer entries).
    // This is a *packed* atlas with NO inter-cell gutter, hence padding stays 0.
    cityTiles:    { src: KENNEY_CITY, frameW: 16, frameH: 16 },

    // Procedural 9-slice UI panel — 48×144 atlas with three 48×48 variants
    // stacked vertically (base / dark / glow). Generated by tools/gen_ui_panel.py;
    // see ui-sprites.js drawPanelBig() for how the 16×16 cells get sampled.
    // Panels are drawn via drawRegion with explicit pixel rects, so the nominal
    // frameW/frameH below aren't used for panel sampling.
    uiPanel:      { src: './assets/ui_panel.png', frameW: 32, frameH: 32 },

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
    1: { col: 10, row: 3 },   // floor — cracked stone w/ X-pattern (reads as worn sewer floor)
    2: { col: 6,  row: 16 },  // sludge — deep teal water (Kenney Dungeon row 16)
    3: { col: 12, row: 3 },   // gap — cracked stone variant for natural variation
    4: { col: 3,  row: 8 },   // grate — vertical iron bars
    5: { col: 11, row: 3 },   // drain — cracked stone variant
    6: { col: 15, row: 0 },   // boss floor — clean solid stone (contrast with worn normal floor)
    7: { col: 10, row: 13 },  // boss trigger — stone with purple gems (accent)
};

// ── Town tile coords (Kenney Base sheet — best-effort Phase A) ──────────────
// All grid-based now (no more region: true). Coordinates approximate.

// 2026-05-22 polish-session Round 4: town tiles now use the Kenney Roguelike
// City Pack (cityTiles sheet) which has proper single-cell tiles for the
// urban exterior — unlike the Base sheet's 2-cell terrain sets that rendered
// as split-stripe textures. All coords verified against tile-picker overlay.
export const TOWN_TILE_SPRITE_MAP = {
    10: null,                                            // town wall edge — dark fallback (frames the map)
    11: { sheet: 'cityTiles', col: 0,  row: 19 },        // sidewalk — concrete slab
    12: { sheet: 'cityTiles', col: 10, row: 21 },        // road — black asphalt center
    13: { sheet: 'cityTiles', col: 1,  row: 26 },        // grass — pure green
    14: { sheet: 'cityTiles', col: 0,  row: 5  },        // building wall — red brick
    // Town secondary tiles — best-effort picks (some 2-tile props in the
    // city sheet are rendered as just the bottom/most-recognizable half).
    // User can swap via sprite-picker.html if any of these read wrong.
    15: { sheet: 'cityTiles', col: 24, row: 8 },         // door — wooden facade
    16: { sheet: 'cityTiles', col: 10, row: 24 },        // sewer entry — manhole cover
    17: { sheet: 'cityTiles', col: 16, row: 11 },        // fence — wooden plank
    18: { sheet: 'cityTiles', col: 5,  row: 9 },         // streetlight — pole top
    19: { sheet: 'cityTiles', col: 14, row: 12 },        // car — vehicle approx (top half of multi-tile)
    20: { sheet: 'cityTiles', col: 10, row: 11 },        // bench — wood plank
    21: { sheet: 'cityTiles', col: 9,  row: 9 },         // trash can — dark cylinder
};

// ── Item sprites (Kenney Base sheet — best-effort Phase A) ──────────────────
// Pixel-region references; the renderer extracts these via drawRegion().
// 16-pixel grid: x = col*16, y = row*16.

export const ITEM_SPRITES = {
    // Equipment/weapon items — Kenney Dungeon sheet (visual rhymes for clarity
    // at the 24×24 inventory display size):
    rock:    { sheet: 'caveTiles', x: 0,  y: 0,  w: 16, h: 16 },   // brown boulder = clear "rock"
    pipe:    { sheet: 'caveTiles', x: 16, y: 32, w: 16, h: 16 },   // long bone = elongated object reads as pipe
    soap:    { sheet: 'caveTiles', x: 0,  y: 64, w: 16, h: 16 },   // single white mushroom = soap-bar proxy
    bandage: { sheet: 'caveTiles', x: 48, y: 64, w: 16, h: 16 },   // small white shape = bandage roll proxy

    // Ambro (food) items — mixed sources matched to fiction:
    //   boardwalk/hot_dog = city food-stand crates (Boardwalk fare)
    //   mystery_meat      = dungeon skull (per item: "don't ask what it was")
    //   tunnel_mushroom   = dungeon mushroom (grows in the sewer)
    boardwalk_burger: { sheet: 'cityTiles', x: 160, y: 288, w: 16, h: 16 },  // orange-fruit crate top
    hot_dog:          { sheet: 'cityTiles', x: 176, y: 288, w: 16, h: 16 },  // green-veggie crate top
    mystery_meat:     { sheet: 'caveTiles', x: 0,   y: 32,  w: 16, h: 16 },  // skull
    tunnel_mushroom:  { sheet: 'caveTiles', x: 16,  y: 48,  w: 16, h: 16 },  // orange mushroom cluster
};

// ── Enemy/character sprites (Kenney Char sheet — best-effort Phase A) ──────
// Kenney chars are single-frame per cell (no facing/animation row), so the
// renderer's directional + idle-blink animation logic is short-circuited for
// these. See _drawPlayer and _drawEnemies in renderer.js for the static draw.

export const ENEMY_SPRITES = {
    // Kenney char sheet cols 0-1, rows 0-3 are slimes/blobs in 4 color variants.
    // Col 0 = passive (closed mouth), col 1 = aggressive (red mouth open).
    // Enemies use col 1 (angry) variants for visual menace.
    'Violet Fungus': { sheet: 'fungusViolet', col: 1, row: 0, static: true }, // cream angry slime (no purple available)
    'Red Fungus':    { sheet: 'fungusRed',    col: 1, row: 1, static: true }, // tan angry slime (reads reddish)
    'Fungus King':   { sheet: 'fungusKing',   col: 1, row: 2, static: true }, // brown angry slime (darker = king)
    'Ghost Fungus':  { sheet: 'ghostMonster', col: 1, row: 3, static: true }, // green angry slime (most fungus-like)
    'Sewer Monster': { sheet: 'sewerMonster', col: 1, row: 2, static: true }, // brown slime (sewer goop reads brown)
    // Carrion the dehydrated zombie merchant — uses humanoid (0,5) orange-shirt.
    // Per plans/cosmology-and-arc.md she's visually distinct (pushes a cart,
    // dehydrated, sludge-coated). Orange-shirted humanoid is closer to "merchant
    // figure" than the slime placeholder used previously.
    'Carrion':       { sheet: 'sewerMonster', col: 0, row: 5, static: true },

    // Zone enemies — first-pass picks at correct post-gutter-fix stride.
    // Greedy Green reuses the green-slime cell with passive face (col=0) so
    // it reads visually distinct from Ghost Fungus's angry face at (1, 3).
    // Carnival Clown + Rattling Skeleton tap the humanoid rows of the
    // char sheet; closest matches in stock Kenney art (the pack ships no
    // explicit clown or skeleton sprite). User can swap via sprite-picker.
    'Greedy Green':     { sheet: 'ghostMonster', col: 0, row: 3, static: true }, // passive green slime
    'Carnival Clown':   { sheet: 'sewerMonster', col: 1, row: 6, static: true }, // humanoid in colorful shirt
    'Rattling Skeleton':{ sheet: 'sewerMonster', col: 1, row: 11, static: true }, // pale bearded figure (closest to skeletal)
};

// Player sprite — Kenney char sheet (0,7) = brown-hat brown-belt adventurer.
// Previous (4,0) landed on an EMPTY cell in the char sheet, causing the
// renderer to draw a green fallback rectangle instead of a sprite.
export const PLAYER_SPRITE = { sheet: 'player', col: 0, row: 7, static: true };

// ── Zone tile coords (Circus / Factory / Graveyard) ─────────────────────────
// These three zones previously rendered as flat fallbackColor rectangles
// (no sprite refs anywhere). First-pass picks below render real art for the
// 12 tile ids defined in data.js. Pick verification was done via the
// sprite-picker tool (game/sprite-picker.html) at the correct stride.
//
// `sheet:` names the SpriteSheet key; renderer._drawTiles resolves it
// against `game.renderer.sprites[sheet]`. If the key is omitted, the
// renderer falls back to the default sewerTiles sheet.

export const ZONE_TILE_SPRITE_MAP = {
    // Circus — striped carnival awnings live in the top-right of
    // roguelikeSheet around rows 0-3. Sand/dirt for ground variety.
    30: { sheet: 'townTerrains', col: 8,  row: 0 },  // CIRCUS_GROUND — sand floor
    31: { sheet: 'townTerrains', col: 10, row: 0 },  // TENT_STRIPE   — orange/white striped awning
    32: { sheet: 'townTerrains', col: 1,  row: 5 },  // CONFETTI      — grass dotted with orange flowers
    33: { sheet: 'townTerrains', col: 5,  row: 7 },  // SAWDUST       — packed brown dirt

    // Factory — industrial gray stone from the dungeon sheet, plus the
    // existing sludge green for "goo" since the dungeon sheet doesn't ship
    // a dedicated goo tile. Conveyor reuses a worn-stone variant.
    40: { sheet: 'sewerTiles', col: 10, row: 0 },   // FACTORY_FLOOR — clean stone slab
    41: { sheet: 'sewerTiles', col: 12, row: 0 },   // FACTORY_WALL  — adjacent stone wall
    42: { sheet: 'sewerTiles', col: 6,  row: 16 },  // GOO_VISUAL    — green water/sludge
    43: { sheet: 'sewerTiles', col: 1,  row: 3 },   // CONVEYOR_VIS  — cracked stone for wear pattern

    // Graveyard — dirt + autumn-flower grass for somber tone, plus the
    // black coffin-shape and iron-bars from roguelikeSheet's right side.
    50: { sheet: 'townTerrains', col: 5,  row: 7 }, // GRAVE_DIRT    — brown dirt patch
    51: { sheet: 'townTerrains', col: 33, row: 1 }, // GRAVESTONE    — black tombstone/coffin shape
    52: { sheet: 'townTerrains', col: 0,  row: 5 }, // DEAD_GRASS    — orange-flower grass (autumn)
    53: { sheet: 'townTerrains', col: 32, row: 3 }, // IRON_FENCE    — vertical iron bars
};

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
        const sheet = new SpriteSheet(def.src, def.frameW, def.frameH, def.padding ?? 0);
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
