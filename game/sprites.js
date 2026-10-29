// sprites.js — Kenney CC0 spritesheet loader and tile/region extraction
//
// As of v0.4.3-dev, Violencetown uses Kenney's Roguelike packs as its sole
// sprite source (CC0 1.0, committed under game/assets-placeholder/kenney/).
// An earlier dual-source setup (a separate primary art set with Kenney as
// fallback) was retired to remove dual-system overhead during early development.
//
// All sheets are 16×16 native; the renderer draws at TILE_PX=32 via destW/
// destH upscale params, so the 2× nearest-neighbor scale happens at draw
// time without pre-processing.

import { dirOf } from './perception.js';

// ── The house style (ruled 2026-10-09, plans/batch-2.md stage 2) ─────────────
// Kenney's Tiny packs are the style everything else conforms to: their plum
// outline on every sprite, one pixel size with the ground. Sprites from the
// other packs get that outline when drawn (drawRegionInk); ground tiles never do.
export const TINY_INK = [63, 38, 49];   // #3F2631, the Tiny packs' outline
// Sheets already drawn in the Tiny style (or re-outlined by a tool), which the
// outline pass leaves alone.
export const TINY_STYLE_SHEETS = new Set(['tinyDungeon', 'tinyTown', 'tinyExtra', 'outlined', 'interior', 'emotes', 'marks', 'ratVariants', 'beastVariants', 'iceCone']);

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
                // undercounts by one. With padding=1, the formula accounts for
                // the gutter between all cells and the implicit gutter after
                // the last column/row.
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

    // A sprite (never a ground tile) drawn with the Tiny packs' outline, unless
    // this sheet is already in the Tiny style. The outlined cell is built once:
    // 1 source pixel of ink on every transparent pixel beside an opaque one, in a
    // cell 1 px wider each side.
    drawRegionInk(ctx, sx, sy, sw, sh, dx, dy, dw, dh) {
        if (!this.loaded) return false;
        dw = dw ?? sw; dh = dh ?? sh;
        if (TINY_STYLE_SHEETS.has(this.key)) return this.drawRegion(ctx, sx, sy, sw, sh, dx, dy, dw, dh);
        const cell = this._inked(sx, sy, sw, sh);
        const kx = dw / sw, ky = dh / sh;
        ctx.drawImage(cell, dx - kx, dy - ky, dw + 2 * kx, dh + 2 * ky);
        return true;
    }
    drawFrameInk(ctx, col, row, x, y, destW, destH) {
        return this.drawRegionInk(ctx, col * (this.frameW + this.padding), row * (this.frameH + this.padding),
            this.frameW, this.frameH, x, y, destW ?? this.frameW, destH ?? this.frameH);
    }
    _inked(sx, sy, sw, sh) {
        this._inkCache = this._inkCache || new Map();
        const k = `${sx},${sy},${sw},${sh}`;
        let c = this._inkCache.get(k);
        if (c) return c;
        c = document.createElement('canvas');
        c.width = sw + 2; c.height = sh + 2;
        const g = c.getContext('2d');
        g.drawImage(this.img, sx, sy, sw, sh, 1, 1, sw, sh);
        const im = g.getImageData(0, 0, c.width, c.height), d = im.data, W = c.width, H = c.height;
        const solid = (x, y) => x >= 0 && y >= 0 && x < W && y < H && d[(y * W + x) * 4 + 3] > 0;
        const ink = [];
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            if (solid(x, y)) continue;
            if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) ink.push((y * W + x) * 4);
        }
        for (const i of ink) { d[i] = TINY_INK[0]; d[i + 1] = TINY_INK[1]; d[i + 2] = TINY_INK[2]; d[i + 3] = 255; }
        g.putImageData(im, 0, 0);
        this._inkCache.set(k, c);
        return c;
    }
}

// ── Kenney sheets ────────────────────────────────────────────────────────────
//
// As of the Tiny overhaul, Violencetown's world/character art comes from two
// Kenney CC0 packs: **Tiny Dungeon** (dungeon tiles, heroes, monsters, items)
// and **Tiny Town** (town terrain, buildings, props, tools). Both are 12×11
// grids of 16×16 cells in a *packed* (gutter-free) atlas, so padding is 0 and
// the renderer's TILE_PX=32 destW/destH upscale gives a crisp 2× pixel look.
//
// Coordinates below were picked against labeled contact sheets generated by
// tools/gen_contact_sheet.py (tools/contact_tinyDungeon.png / _tinyTown.png).
// The legacy roguelike sheets remain bundled but are no longer referenced.

const K    = './assets-placeholder/kenney';
const TINY = `${K}/tiny`;

const TINY_DUNGEON = `${TINY}/dungeon/tinyDungeon_packed.png`;  // dungeon tiles, heroes, monsters, items
const TINY_TOWN    = `${TINY}/town/tinyTown_packed.png`;        // town terrain, buildings, props, tools

export const SHEETS = {
    // Tiny packs — the two atlases every coord map below references by key.
    // Packed (no inter-cell gutter), so padding stays 0.
    tinyDungeon:  { src: TINY_DUNGEON, frameW: 16, frameH: 16 },
    tinyTown:     { src: TINY_TOWN,    frameW: 16, frameH: 16 },

    // World-dressing (Kenney CC0): the packed roguelikeCity atlas — cars,
    // building facades, lampposts, storefronts. Gutter-free → padding 0; tiles
    // reference it via pixel-region refs (drawRegion).
    roguelikeCity: { src: `${K}/roguelikeCity_packed.png`, frameW: 16, frameH: 16 },
    // The town car: the full-resolution side-view beater lifted straight from
    // roguelikeCity (orange left-facing car, src px 503–539 × 392–415) onto a
    // 48×48 transparent canvas, wheels resting low. The renderer stretches this
    // one frame over the 2×2-tile (64×64) footprint, so the bigger native art
    // reads crisp instead of pixel-doubling a tiny 32px cell. Drawn at
    // TOWN_TILE_SPRITE_MAP[19] (replaces the wooden-bucket placeholder).
    car:           { src: './assets/car.png', frameW: 48, frameH: 48 },

    // RPG Urban Pack (Kenney CC0, visual-pass 2026-09-06): full-body townsfolk
    // and street furniture. Packed (gutter-free), 27x18 grid of 16x16 cells —
    // the same construction as the Tiny packs above, and its characters carry
    // margin + a dark outline like Tiny Dungeon's, so they mix cleanly where
    // roguelikeChar_transparent.png (see the note above ENEMY_SPRITES) does not.
    // Coordinates picked against tools/contact_rpgUrban.png.
    rpgUrban:      { src: `${K}/rpgUrban_packed.png`, frameW: 16, frameH: 16 },

    // Kenney Emote Pack (Pixel, Style 1) — 16x16 down-tail speech balloons for
    // Town Clock ambient reactions + disposition faces. Horizontal strip packed
    // by tools/gen_emote_sheet.py; column order = EMOTE_SPRITES below. Packed
    // (no gutter), padding 0.
    emotes:       { src: `${K}/emotes_style1.png`, frameW: 16, frameH: 16 },

    // Cells derived from the Tiny packs by tools/gen_tiny_extra.py: a keyed-out
    // rock, the sludge vial and sack, the Fire Blood bottle, the goo vat without
    // its dungeon-floor orange. Packed, padding 0.
    tinyExtra:    { src: `${K}/tinyExtra_packed.png`, frameW: 16, frameH: 16 },

    // The Tiny Dungeon rat, (3,10), recoloured by tools/gen_recolor.py: one cell per
    // variant, exact swaps of its body and eye colours, so the outline and the
    // silhouette are the rat's own. Column order is the tool's VARIANTS list.
    // Packed, padding 0. The Carnival's rats draw from it (ENEMY_SPRITES).
    ratVariants:  { src: `${K}/ratVariants_packed.png`, frameW: 16, frameH: 16 },

    // The Tiny Dungeon (Kenney, CC0) grey beast, (4,10), recoloured by the same tool: only its
    // two greys swapped, the outline and orange tail kept. Column order is the
    // tool's BEAST_VARIANTS list. Packed, padding 0. Lire draws from it.
    beastVariants: { src: `${K}/beastVariants_packed.png`, frameW: 16, frameH: 16 },

    // The Tiger's Blood Ice Cone: Tiny Ski's snowy pine (Kenney, CC0) mirrored
    // and repainted by tools/gen_ice_cone.py, outline included. One cell.
    iceCone:      { src: './assets-placeholder/ice_cone.png', frameW: 16, frameH: 16 },

    // Kenney Emote Pack (Pixel, Style 8) — manga impact marks (animation pass
    // §1). A star inside Style 1's white balloon reads as someone SAYING
    // "star", so hit-marks need the bare glyph instead. Style 5 was the
    // planned pick, but pixel-checked against Style 8 it turned out NOT to be
    // bare in this copy of the pack — only 47/256px transparent (an opaque
    // card, same as Style 1's 40/256) vs. Style 8's 212/256 (genuinely
    // mostly-transparent art, the only style in the pack that is). Style 8
    // also carries a thin dark outline, which reads better against busy tile
    // art than a flat fill would. Horizontal strip packed by
    // tools/gen_emote_sheet.py --style 8 --marks; column order = MARK_SPRITES
    // below. Packed (no gutter), padding 0.
    marks:        { src: `${K}/emotes_marks.png`, frameW: 16, frameH: 16 },

    // Hit-splat badges — our own art, one silhouette per damage type, drawn by
    // tools/gen_splats.py. Rows/columns: splat-layout.js (SPLAT_ROWS, splatCell).
    splats:       { src: './assets/ui_splats.png', frameW: 40, frameH: 32 },

    // Alias for the hardcoded renderer reference:
    //   • renderer._drawPlayer reads `sprites.player` directly.
    player:       { src: TINY_DUNGEON, frameW: 16, frameH: 16 },

    // Procedural 9-slice UI panel — 48×144 atlas with three 48×48 variants
    // stacked vertically (base / dark / glow). Generated by tools/gen_ui_panel.py;
    // see ui-sprites.js drawPanelBig() for how the 16×16 cells get sampled.
    // Panels are drawn via drawRegion with explicit pixel rects, so the nominal
    // frameW/frameH below aren't used for panel sampling.
    uiPanel:      { src: './assets/ui_panel.png', frameW: 32, frameH: 32 },

    // Kenney roguelikeSheet objects, RE-OUTLINED (zone-identity.md Item 0 /
    // "The style rule this pass establishes"). roguelikeSheet_transparent.png
    // is bundled and has art the game badly needs — a dozen gravestone
    // silhouettes, 2x2 circus tents, interior floor — but every object on it
    // carries a light-grey bevel highlight and no dark border, where
    // tinyDungeon/tinyTown carry a bold near-black outline on everything.
    // Used raw it reads flat and looks like a second art pack — the same
    // style mismatch that got roguelikeChar rejected outright (see the note
    // above ENEMY_SPRITES). Rather than reject a second sheet, the ruling was
    // to generate one that fits: tools/gen_outlined_sheet.py re-outlines the
    // specific cells this game wants and packs them here. Packed (no gutter,
    // unlike its 1px-gutter roguelikeSheet source) — padding stays 0 like
    // every other packed sheet. Don't "fix" this to padding: 1 by analogy
    // with the raw source's gutter; this is a separate, already-packed file.
    outlined:     { src: `${K}/rlOutlined_packed.png`, frameW: 16, frameH: 16 },

    // Furniture from Kenney's Roguelike Interior Pack (CC0), outlined in the
    // Tiny plum by tools/gen_outlined_sheet.py (plans/zone-1-interiors-get-a-
    // vocabulary.md). Packed, padding 0, like `outlined` above; the column
    // order is INTERIOR_SPRITES below.
    interior:     { src: `${K}/rlInterior_outlined.png`, frameW: 16, frameH: 16 },

    // Kenney roguelikeDungeon pack (zone-identity.md Item 2) — bundled since
    // early in the project (game/assets-placeholder/kenney/
    // roguelikeDungeon_transparent.png) but never registered until now.
    // Registered to give Sewer its own WALL and a wet-floor accent, so it
    // stops rendering 100% from tinyDungeon like Factory does.
    //
    // UNLIKE every sheet above, this one carries Kenney's native 1px gutter
    // between cells — 492x305px = 29x18 cells at stride 17, not packed. It is
    // the first gutter sheet actually registered in SHEETS (`outlined` above
    // LOOKS like a roguelike sheet but tools/gen_outlined_sheet.py re-packs
    // its output specifically to avoid this). padding: 1 is required — see
    // the SpriteSheet constructor docstring above for the exact "deep rows
    // drift up and render two half-cells stacked" bug that skipping it
    // causes. Coordinates below were checked against a labeled contact sheet
    // generated at this stride, not eyeballed at a packed one.
    roguelikeDungeon: { src: `${K}/roguelikeDungeon_transparent.png`, frameW: 16, frameH: 16, padding: 1 },

    // Kenney roguelikeSheet, raw (the `outlined` sheet above is a re-packed
    // subset of it). Registered for its flat ground cells — the frozen area's
    // snow. It carries the native 1px gutter like roguelikeDungeon, so
    // padding: 1; coordinates are picked at stride 17.
    roguelikeSheet: { src: `${K}/roguelikeSheet_transparent.png`, frameW: 16, frameH: 16, padding: 1 },
};

// ── Sewer/dungeon tile coords (Tiny Dungeon + roguelikeDungeon packs) ──────
// Tiny Dungeon: tan dungeon floors, gray stone-brick, iron grates, doors,
// banner/torch accents. WALL (0) and SLUDGE (2) come from roguelikeDungeon
// instead (zone-identity.md Item 2 — see that SHEETS entry above for why the
// sheet needs padding: 1). Every other entry below still names `tinyDungeon`.
//
// WALL used to be `null` — a flat #1c1510 fallback — over 47% of this map.
// This file used to call that "intentional, frames the room," which is
// defensible at a map's edge and not at half its area, so it now renders
// real brick: roguelikeDungeon (8,0), a plain grey block. The alternative
// alcove variant at (9,1) reads busy/repetitive once tiled across dozens of
// contiguous wall cells (checked by tiling both 5x5); plain brick holds up
// better at the scale Sewer's corridors need.
//
// id 0 was Canyon's outer wall and border too, until the Canyon got tiles of
// its own (60-66, ZONE_TILE_SPRITE_MAP) on 2026-09-27. WALL is Sewer's again.
//
// SLUDGE used to be tinyDungeon (8,2), byte-identical to Factory's
// GOO_VISUAL (id 42 below) — the two zones drew the exact same ooze-hatch
// pixels. It's now roguelikeDungeon (6,11), a bordered teal pool, so Sewer's
// signature hazard tile no longer doubles as Factory's.
export const TILE_SPRITE_MAP = {
    0: { sheet: 'roguelikeDungeon', col: 8, row: 0, under: 'fill' },  // wall — plain grey brick (10 see-through corner px: its own dark colour under them reads as mortar)
    1: { sheet: 'tinyDungeon', col: 0, row: 4 },  // floor — clean tan dungeon stone
    2: { sheet: 'roguelikeDungeon', col: 6, row: 11 }, // sludge — bordered teal pool
    4: { sheet: 'tinyDungeon', col: 0, row: 3 },  // grate — horizontal iron bars
    5: { sheet: 'tinyDungeon', col: 6, row: 3 },  // drain — floor with 4-square stone inset
    6: { sheet: 'tinyDungeon', col: 4, row: 3 },  // boss floor — seamless grey brick, the boss's two-cell dais (was (9,4), Factory's FACTORY_FLOOR; (9-11,4) are wall-run pieces with dark end caps and seam when tiled)
    22: { sheet: 'tinyDungeon', col: 5, row: 3 }, // PORTCULLIS — spiked vertical gate
    23: { sheet: 'tinyDungeon', col: 3, row: 5, under: 1 }, // BARRICADE — wooden crate front (destructible), on sewer floor
};

// ── Town tile coords (Tiny Town pack) ───────────────────────────────────────
// Tiny Town has rich terrain/buildings/fences but ships no urban props (cars,
// streetlights, manholes, trashcans, benches). The packed roguelikeCity atlas
// supplies the building-wall pick at 14 and the sewer manhole at 16 — it's
// placed and working, so it stays put. Bench/trash-can (20/21) come from
// rpgUrban instead (visual-pass, 2026-09-06): Kenney's RPG Urban Pack is the
// same gutter-free 16px construction as tinyTown, so the street furniture
// matches the terrain it sits on rather than a different series. Streetlights
// are props now (PROP_SPRITES.streetlight) — id 18 is retired.
export const TOWN_TILE_SPRITE_MAP = {
    10: { sheet: 'tinyTown', col: 5, row: 0, under: 13 }, // town wall edge — a hedge of round bushes on grass (was a flat brown fallback band)
    11: { sheet: 'tinyTown', col: 1, row: 9 },       // sidewalk — light gray stone slab
    12: { sheet: 'tinyTown', col: 1, row: 2 },       // road — borderless dirt-field center (edge cells carry grass borders)
    13: { sheet: 'tinyTown', col: 0, row: 0 },       // grass — plain green
    14: { sheet: 'roguelikeCity', col: 1, row: 6 },  // building wall — red-brick city facade (world-dressing; was tinyTown tan brick)
    15: { sheet: 'tinyTown', col: 1, row: 7 },       // door — brown door in wood facade
    16: { sheet: 'roguelikeCity', col: 9, row: 24 }, // sewer entry — round manhole cover set in the pavement
    17: { sheet: 'tinyTown', col: 9, row: 3, under: 12 },  // fence — vertical wood plank, gaps showing the road it lines
    19: { sheet: 'car', col: 0, row: 0 },            // car — Kenney roguelikeCity beater (world-dressing; was the wooden-bucket placeholder)
    20: { sheet: 'rpgUrban', col: 7, row: 9, under: 11 },  // bench — wooden bench, slatted seat on two legs, on sidewalk
    21: { sheet: 'rpgUrban', col: 9, row: 9, under: 11 },  // trash can — grey bin with a maroon base band, on sidewalk
};

// ── Item sprites (Tiny packs) ───────────────────────────────────────────────
// Pixel-region references; the renderer extracts these via drawRegion().
// 16-pixel grid: x = col*16, y = row*16 (cells are gutter-free in packed atlas).

export const ITEM_SPRITES = {
    // Equipment / junk — Tiny Dungeon (visual rhymes at the 24×24 inventory size):
    rock:    { sheet: 'tinyExtra',   x: 0 * 16,  y: 0,       w: 16, h: 16 },  // grey rubble, ground keyed out (the old cell carried a square of dirt)
    pipe:    { sheet: 'tinyExtra',   x: 8 * 16,  y: 0,       w: 16, h: 16 },  // the staff in copper (WA1; it drew as a broad sword)
    soap:    { sheet: 'tinyDungeon', x: 5 * 16,  y: 9 * 16,  w: 16, h: 16 },  // white potion = pale bar proxy
    bandage: { sheet: 'tinyDungeon', x: 7 * 16,  y: 9 * 16,  w: 16, h: 16 },  // red potion = healing-red proxy

    // Ambro (food) items — Tiny packs:
    boardwalk_burger: { sheet: 'tinyDungeon', x: 10 * 16, y: 6 * 16, w: 16, h: 16 },  // burger/bun stack (exact)
    hot_dog:          { sheet: 'tinyTown',    x: 9 * 16,  y: 7 * 16, w: 16, h: 16 },  // round bread loaf
    mystery_meat:     { sheet: 'tinyTown',    x: 10 * 16, y: 7 * 16, w: 16, h: 16 },  // ambiguous bun/meat lump
    tunnel_mushroom:  { sheet: 'tinyTown',    x: 5 * 16,  y: 2 * 16, w: 16, h: 16 },  // red-cap toadstools (exact)

    // Quest item — wall-mounted machine/meter box reads "mechanical".
    catalytic_converter: { sheet: 'tinyTown', x: 9 * 16, y: 4 * 16, w: 16, h: 16 },

    // ── Poitions (visual-pass, 2026-09-06) ──────────────────────────────────
    // All six rendered as the generic grey '?' glyph — the v0.20.0 headline
    // category, unreadable in the bag. The four skinny vials on row 10 carry
    // the four most-used; the two free fat bottles on row 9 take the rest.
    health_poition:   { sheet: 'tinyDungeon', x: 7 * 16, y: 10 * 16, w: 16, h: 16 },  // red vial
    mana_poition:     { sheet: 'tinyDungeon', x: 8 * 16, y: 10 * 16, w: 16, h: 16 },  // blue vial
    strength_poition: { sheet: 'tinyDungeon', x: 6 * 16, y: 10 * 16, w: 16, h: 16 },  // green vial
    speed_poition:    { sheet: 'tinyDungeon', x: 5 * 16, y: 10 * 16, w: 16, h: 16 },  // plain vial
    gold_poition:     { sheet: 'tinyDungeon', x: 6 * 16, y: 9  * 16, w: 16, h: 16 },  // green bottle — money green
    defence_poition:  { sheet: 'tinyDungeon', x: 8 * 16, y: 9  * 16, w: 16, h: 16 },  // blue bottle

    // ── Item icons, second pass (visual-pass, 2026-09-06) ───────────────────
    // Shortlist picks verified against the labeled contact sheets (tools/contact_*.png).
    fire_blood:     { sheet: 'tinyExtra',   x: 3 * 16,  y: 0,      w: 16, h: 16 },  // the red bottle in fire orange: a drinkable poition (the flame banner it used carried a square of stone wall)
    burger_fries:   { sheet: 'tinyDungeon', x: 5 * 16,  y: 8 * 16, w: 16, h: 16 },  // nested-square box icon — passable fries carton
    wererat_fur:    { sheet: 'tinyTown',    x: 10 * 16, y: 8 * 16, w: 16, h: 16 },  // brown satchel/pouch

    // ── Third pass (batch 2, 2026-10-08) — the fourteen that drew as a letter ──
    sludge_brain:      { sheet: 'tinyExtra',   x: 1 * 16,  y: 0,       w: 16, h: 16 },  // vial, recoloured to sludge
    sludge_sack:       { sheet: 'tinyExtra',   x: 2 * 16,  y: 0,       w: 16, h: 16 },  // sack, recoloured to sludge
    wooden_sword:      { sheet: 'tinyDungeon', x: 11 * 16, y: 8 * 16,  w: 16, h: 16 },  // brown-bladed sword
    ray_gun:           { sheet: 'tinyExtra',   x: 9 * 16,  y: 0,       w: 16, h: 16 },  // a brass pistol with a teal glass coil (WA2; it drew as a crystal staff)
    lion_whip:         { sheet: 'tinyExtra',   x: 5 * 16,  y: 0,       w: 16, h: 16 },  // the wavy shaft in leather (WA1; it drew as a staff)
    fearmur:           { sheet: 'tinyExtra',   x: 7 * 16,  y: 0,       w: 16, h: 16 },  // the staff in bone (WA1; it drew as a hammer)
    gator_tail:        { sheet: 'tinyExtra',   x: 6 * 16,  y: 0,       w: 16, h: 16 },  // the tapered blade in gator green (WA1; it drew as a spear)
    foil_hat:          { sheet: 'tinyDungeon', x: 4 * 16,  y: 5 * 16,  w: 16, h: 16 },  // silver dome
    cardboard_cuirass: { sheet: 'tinyDungeon', x: 6 * 16,  y: 5 * 16,  w: 16, h: 16 },  // brown board
    grappling_hook:    { sheet: 'tinyTown',    x: 9 * 16,  y: 10 * 16, w: 16, h: 16 },  // hooked blade
    alcohol:           { sheet: 'tinyTown',    x: 8 * 16,  y: 8 * 16,  w: 16, h: 16 },  // blue jar
    tigers_blood_ice_cone: { sheet: 'iceCone', x: 0,     y: 0,       w: 16, h: 16 },  // tools/gen_ice_cone.py (ICR6)
    // latex_gloves, red_cape, shoe_bags: no fitting cell yet; they draw as
    // UNKNOWN_ITEM_SPRITE until they get art.
};

// What an item with no ITEM_SPRITES entry draws as: a plain bag, so a missing
// icon reads as "an item" instead of a letter in a box.
export const UNKNOWN_ITEM_SPRITE = { sheet: 'tinyTown', x: 11 * 16, y: 8 * 16, w: 16, h: 16 };

export function itemSprite(id) {
    return ITEM_SPRITES[id] || UNKNOWN_ITEM_SPRITE;
}

// NOT a source for these: `roguelikeChar_transparent.png` is bundled, and its
// left two columns DO hold about fourteen finished, fully-dressed characters —
// so it looks like the answer to any humanoid-cell shortage. (Everything to
// their right is a paper-doll kit: separate torso, helmet, hair and weapon
// layers meant to be composited.)
//
// The finished ones are still unusable HERE, for a subtler reason: they are
// framed bust-up and fill the cell edge to edge, while every Tiny Dungeon
// character is a small full-body figure with margin and a dark outline. Drop
// them onto the same tile map and they read about 40% larger and cropped at the
// waist. It is a framing mismatch, not a content one, so no amount of picking
// better cells fixes it.
//
// Checked twice, 2026-09-06 — the first pass dismissed the sheet for the wrong
// reason ("no finished characters"), which is why the real reason is recorded
// here. Adopting it means moving EVERY character off Tiny Dungeon, not mixing.
//
// ── Enemy/character sprites (Tiny Dungeon pack) ─────────────────────────────
// Tiny sprites are single-cell (no facing/animation frames), so every entry
// carries `static: true`. As of the animation pass (visual-pass §4) that field
// is no longer read by the renderer — _drawEnemySprite resolves the draw cell
// through spriteFrame() (below) now, which returns col/row untouched for any
// entry with no `dirCols`, i.e. every Tiny Dungeon entry in this table. The
// RPG Urban people (the Violencian crowd and the named town NPCs) carry
// URBAN_FRAMES and face their travel.
// `static` stays put on each entry as inert historical data; there is no live
// branch left that flipping it would change.
//
// The sewer's creature set is five types, not six — Violet/Red/Ghost Fungus
// and the Fungus King, placed by sewer-map.json, plus Rat, which
// sewer-setpiece.js spawns in the other three's place once the "escape the
// sewer" gauntlet starts (only the King survives that conversion). An earlier
// version of this note also counted a "Sewer Monster"; nothing in the
// codebase spawns one any more. All five are mapped to distinct creature
// cells so they never look alike. Zone-exclusive enemies (Greedy Green /
// Clown / Skeleton, in Factory / Circus / Graveyard) may reuse a creature
// read since they can't co-occur with the sewer set. Tiny Dungeon ships no
// literal mushroom / clown / skeleton sprite —
// those are flagged compromises (see the overhaul notes / verify in-browser).

// The RPG Urban sheet's six people each own a 4-column x 3-row block: cols
// 23-26 are [left, down, up, right] and each person's base row (0, 3, 6, 9, 12,
// 15) is the standing pose, +1/+2 the two stride frames. Measured against
// tools/contact_rpgUrban.png; see Violencian below for the full note.
// [up, down, left, right], the order spriteFrame reads.
const URBAN_FRAMES = { dirCols: [25, 24, 23, 26], walkRows: 3 };

export const ENEMY_SPRITES = {
    // Sewer set — six distinct creatures:
    'Violet Fungus': { sheet: 'tinyDungeon', col: 0, row: 10, static: true }, // orange spider — creepy crawler
    'Red Fungus':    { sheet: 'tinyDungeon', col: 2, row: 9,  static: true }, // red crab — reddish creature
    'Fungus King':   { sheet: 'tinyDungeon', col: 1, row: 9,  static: true }, // orange ogre — biggest/boss read
    'Ghost Fungus':  { sheet: 'tinyDungeon', col: 0, row: 9,  static: true }, // green ghost — most fungal/spectral
    // Rat: (3,9) is a HOODED FIGURE, not a rat — the old comment called the
    // robe front a "bib". The pack's actual rats are on the bottom row, beside
    // the vials. Canyon rats have been rendering as robed people all along.
    'Rat': { sheet: 'tinyDungeon', col: 3, row: 10, static: true }, // brown rat, curved body and tail
    // The Carnival's rats: the brown rat recoloured, columns in gen_recolor.py's
    // VARIANTS order (birthday 0, sludge 1, robot 2).
    'Birthday Rat': { sheet: 'ratVariants', col: 0, row: 0, static: true },
    'Sludge Rat':   { sheet: 'ratVariants', col: 1, row: 0, static: true },
    'Robot Rat':    { sheet: 'ratVariants', col: 2, row: 0, static: true },

    // Merchant / bosses — humanoid cells:
    // Carrion: was (2,7), shared with Pike. (3,9) is freed by the Rat move and
    // is a better read for a carrion-merchant anyway — gaunt and hooded.
    // Pike keeps (2,7) to itself.
    'Carrion': { sheet: 'tinyDungeon', col: 3, row: 9, static: true }, // hooded, gaunt — the freed cell
    'Boss':    { sheet: 'tinyDungeon', col: 0, row: 8, static: true }, // knight helmet — Borgir employer
    'Wererat': { sheet: 'tinyDungeon', col: 3, row: 7, static: true }, // horned viking — hulking were-rat brute

    // Town — ambient Violencians. A POOL, not one cell: every citizen used to be
    // tinyDungeon (4,7), a plain brown-haired figure whose palette and silhouette
    // read as the player at (1,7) — so the whole town looked like eight copies of
    // you. (4,7) is retired for exactly that reason.
    //
    // The pool that followed borrowed cells from Carnival Clown, Operator, Cook,
    // Banker and Carrion, because Tiny Dungeon had no spare humanoids left to
    // give it — safe only because none of those five ever shares town or
    // downtown with a Violencian (verified by script; tests/sprite-coverage
    // enforces it). As of the RPG Urban Pack adoption (visual-pass, 2026-09-06)
    // that borrowing is over: six purpose-built civilians from rpgUrban replace
    // the pool outright, and the five borrowed cells go back to being sole-owned
    // by their original type. `col`/`row` mirror variants[0] so every consumer
    // that reads the flat shape — content-validate, the coverage test — keeps
    // working.
    'Violencian': {
        sheet: 'rpgUrban', col: 24, row: 0, static: true,
        // 4 facings x 3 walk-cycle rows per character (visual-pass §4). Verified
        // 2026-09-06 against a labelled contact sheet (tools/gen_contact_sheet.py
        // -> tools/contact_rpgUrban.png), not assumed: col 23 = left, 24 =
        // down/front (the cell every variant below already used), 25 = up/back
        // (solid hair, no face — the prior guess that this was the back row
        // checked out), 26 = right. Each base row's own +0 row is the standing
        // pose already in use; +1/+2 are the two stride frames (confirmed by
        // eye — feet apart, mirrored between the two).
        //
        // This is a SEPARATE axis from the variant pool below, resolved by
        // spriteFrame() at draw time, not by enumerating more variant cells —
        // every variants[] entry still only ever names its down-facing (col 24)
        // identity cell, same as before this pass.
        ...URBAN_FRAMES,
        // Three of the six looks, not six (DS1): the named town NPCs below
        // borrow the sheet's people, and the three who stand among the crowd
        // (Vendor, Stranger, Bootlegger) take their looks out of this pool so
        // no one on downtown or town draws the same base cell. The three kept
        // here belong to named NPCs who each have an interior to themselves.
        variants: [
            { col: 24, row: 0 },  // auburn hair, green shirt (also Cook, diner only)
            { col: 24, row: 6 },  // pale blue hair, blue-grey top (also Banker, bank only)
            { col: 24, row: 12 }, // light hair, pale blue top (also Operator, casino only)
        ],
    },

    // Canyon — Pike the ageless prospector (reuses the gaunt robed-monk cell; a
    // proper grizzled-prospector read is a later sprite-picker pass).
    'Pike': { sheet: 'tinyDungeon', col: 2, row: 7, static: true }, // bald robed monk — gaunt, weathered

    // Zone-exclusive enemies (compromise picks — no clown/skeleton art exists):
    'Greedy Green':     { sheet: 'tinyDungeon', col: 4, row: 9,  static: true }, // green-bandana goblin
    // Downtown's mugger wears the same goblin (ruled: the two read as kin). Safe
    // to share: Greedy Green never stands in Downtown.
    'Ruffian':          { sheet: 'tinyDungeon', col: 4, row: 9,  static: true }, // green-bandana goblin
    'Carnival Clown':   { sheet: 'tinyDungeon', col: 0, row: 7,  static: true }, // purple mage — most colorful humanoid
    'Rattling Skeleton':{ sheet: 'tinyDungeon', col: 1, row: 10, static: true }, // white ghost — pale/bony proxy

    // ── Named town NPCs (DS1) ───────────────────────────────────────────────
    // Each borrows one of the six RPG Urban people, so it walks with real
    // four-way frames instead of one mirrored Tiny cell (the ruling: no free
    // four-facing pack exists, so lend townsfolk looks to named NPCs). One look
    // per named NPC, so no two of them look alike. Each base cell is the
    // person's down-facing standing pose (col 24); spriteFrame does the rest.
    // Vendor, Stranger and Bootlegger share downtown/town with the crowd, so
    // Violencian's pool above no longer carries their looks.
    'Vendor':     { sheet: 'rpgUrban', col: 24, row: 3,  static: true, ...URBAN_FRAMES }, // long auburn hair, red shirt (downtown)
    'Stranger':   { sheet: 'rpgUrban', col: 24, row: 15, static: true, ...URBAN_FRAMES }, // black hair, red headband (downtown)
    'Bootlegger': { sheet: 'rpgUrban', col: 24, row: 9,  static: true, ...URBAN_FRAMES }, // hard hat, work clothes (town)
    'Banker':     { sheet: 'rpgUrban', col: 24, row: 6,  static: true, ...URBAN_FRAMES }, // grey-blue hair and beard: the elder (bank)
    'Operator':   { sheet: 'rpgUrban', col: 24, row: 12, static: true, ...URBAN_FRAMES }, // bald and heavy-set: the bouncer (casino)
    'Cook':       { sheet: 'rpgUrban', col: 24, row: 0,  static: true, ...URBAN_FRAMES }, // the young one in green (diner)

    // ── One-offs (visual-pass, 2026-09-06) ──────────────────────────────────
    // Reuses a cell from a zone the holder cannot co-occur with
    // (tests/sprite-coverage.test.js enforces that).
    // Puck gave the knight helm (0,8) back to Boss, which now stands in the
    // Factory too (the Act 2 placeholder boss); (4,8) was free.
    'Puck':       { sheet: 'tinyDungeon', col: 4, row: 8, static: true }, // grey-haired elder

    // Lire, the lion the Lion Whip's "Hire Lire" trick summons (main.js
    // _spawnSummon). No lion in Tiny Dungeon: the grey beast, (4,10), recoloured
    // tawny by tools/gen_recolor.py (BEAST_VARIANTS column 0).
    'Lire': { sheet: 'beastVariants', col: 0, row: 0, static: true },

    // The frozen area's mooks (plans/ic4-frozen-creatures.md). No snow creature
    // exists in the bundled sheets, so each borrows the closest Tiny Dungeon
    // cell. The two shared cells belong to types that never stand in the frozen
    // area (tests/sprite-coverage.test.js enforces that).
    'Snowman':    { sheet: 'tinyDungeon', col: 1, row: 10, static: true }, // white ghost, shared with Rattling Skeleton
    'Yeti':       { sheet: 'tinyDungeon', col: 1, row: 9,  static: true }, // the ogre, shared with Fungus King
    'Polar Bear': { sheet: 'tinyDungeon', col: 4, row: 10, static: true }, // grey beast, Lire's uncoloured source

    // Not a person: a puzzleWall growth blocking a sewer pipe.
    'Sludge Bloom': { sheet: 'tinyDungeon', col: 8, row: 2, static: true }, // stone hatch leaking green ooze
};

// Stable per-entity hash. Used for cosmetic variety (spriteVariant) and for
// animation phase, so a given character both LOOKS the same every time you see
// it and BREATHES on its own beat rather than in lockstep with the whole cast.
// Falls back to position when an entity has no id.
export function idHash(entity) {
    const key = String(entity?.id ?? `${entity?.x},${entity?.y}`);
    let h = 2166136261;
    for (let i = 0; i < key.length; i++) {
        h ^= key.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

// Which variant a given entity shows. Deterministic on the entity's identity,
// so a citizen looks the same every time you see them and across save/reload —
// a crowd that reshuffles on every frame is worse than a uniform one.
//
// Falls back to position when an entity has no id: still stable, still varied.
// Entries with no `variants` are returned untouched, so this is safe to call on
// every sprite lookup.
export function spriteVariant(info, entity) {
    if (!info?.variants?.length) return info;
    const v = info.variants[idHash(entity) % info.variants.length];
    return { ...info, col: v.col, row: v.row };
}

// Facing column + walk-frame row — a SEPARATE axis from spriteVariant above,
// applied AFTER it. spriteVariant answers "who are you": a pure, time-
// invariant hash of the entity's id (tests/sprite-variants.test.js locks that
// down, correctly — it's a cosmetic identity, not a frame clock). spriteFrame
// answers "how are you standing right now": facing + walk phase, which is
// expected to change from one call to the next as the entity moves. Keeping
// these separate is deliberate, not an oversight — don't fold one into the
// other.
//
// Entries opt in with two fields, present only on the rpgUrban people (the
// Violencian crowd and the named town NPCs, via URBAN_FRAMES):
//   dirCols:  [up, down, left, right] sheet columns for each facing.
//   walkRows: how many rows, starting at the entry's own `row`, form a walk
//             cycle. row+0 is the standing pose already in use before this
//             pass; row+1.. are the additional stride frames.
// An entry with no `dirCols` (every Tiny Dungeon character) is returned
// UNTOUCHED, so it keeps rendering exactly the single cell it always has.
//
// `anim` is `{ animating, progress, idleTick, phase }`:
//   - mid-step (`animating`): `progress` is the same 0->1 slide position
//     walkAnim() already receives, so the stride frames trade off across the
//     tile crossing instead of freezing on one foot.
//   - at rest: `idleTick` + `phase` are game._idleTick and the entity's
//     idHash-derived offset — the same desync walkAnim's idle bob uses
//     (commit 97198d8) — so a crowd's stance shifts out of step the same way
//     its breathing already does, instead of every character flickering in
//     lockstep.
// Two frames is the floor in either regime; with walkRows >= 3 the mid-step
// regime additionally reaches the third row, so idle and walking don't have
// to share their frame pair.
const DIR_COL_INDEX = { up: 0, down: 1, left: 2, right: 3 };

export function spriteFrame(info, entity, anim = {}) {
    if (!info?.dirCols) return info;

    const col = info.dirCols[DIR_COL_INDEX[dirOf(entity)]];
    const n = Math.max(1, info.walkRows || 1);
    const strideRows = Math.max(1, n - 1);

    let frame;
    if (anim.animating && n > 1) {
        const t = Math.max(0, Math.min(1, anim.progress ?? 0));
        frame = 1 + Math.min(strideRows - 1, Math.floor(t * strideRows));
    } else {
        // Two-frame idle flicker (row+0 / row+1), desynced per entity so the
        // whole cast doesn't shift its weight in lockstep.
        frame = n > 1 ? ((anim.idleTick ?? 0) + (anim.phase ?? 0)) % 2 : 0;
    }

    return { ...info, col, row: info.row + frame };
}

// Containers — replaces the procedural brown box in _drawContainers, which
// renderer.js flagged as a polish-pass placeholder.
export const CONTAINER_SPRITES = {
    closed: { sheet: 'tinyDungeon', col: 5, row: 7, static: true },
    open:   { sheet: 'tinyDungeon', col: 6, row: 7, static: true },
    full:   { sheet: 'tinyDungeon', col: 7, row: 7, static: true },
};

// Player sprite — Tiny Dungeon (1,7) = brown adventurer with cap + satchel,
// the natural read for a burger-delivery courier. Drawn via `sprites.player`.
export const PLAYER_SPRITE = { sheet: 'player', col: 1, row: 7, static: true };

// ── Outlined roguelikeSheet objects (gravestones / circus tents / floor) ───
// Column index into the `outlined` strip (game/assets-placeholder/kenney/
// rlOutlined_packed.png), generated by tools/gen_outlined_sheet.py from
// roguelikeSheet_transparent.png's light-bevel originals — see that script's
// module docstring for why the style pass was needed and exactly how each
// cell's edge-clipping was resolved (measured per cell, not eyeballed: most
// gravestones got a lossless 1px shift toward existing margin, but three
// gravestones and both tents are flush against opposite edges of their
// source cell with no margin to shift into, so those got a ~1px shrink-inset
// instead — nothing cropped, just enough room manufactured for the stroke).
// KEEP IN SYNC with that script's printed column order.
//
// The gravestones are PROP_SPRITES below and the tents are ZONE_TILE_SPRITE_MAP
// ids 34/35 (zone-identity.md Item 3). The floor pair waits on Item 1
// (interiors) — unused until then, not dead.
export const OUTLINED_SPRITES = {
    // Gravestones — 12 distinct silhouettes, each a PROP_SPRITES entry of the
    // same name. graveyard-map.json places one per grave.
    gravestoneArchRound: 0,
    gravestoneFlatTop: 1,
    gravestoneGothicPeak: 2,
    gravestoneNotched: 3,
    gravestoneWideArch: 4,
    gravestoneEngravedCross: 5,
    gravestoneBlankA: 6,
    gravestonePlusCross1: 7,
    gravestonePlusCross2: 8,
    gravestonePlusCross3: 9,
    gravestoneWoodCross: 10,
    gravestoneBlankB: 11,

    // Circus tents — each a 2x2 block. A consumer draws all four quadrants
    // together at their relative offsets (TL at the base tile, TR one tile
    // right, BL one tile down, BR one tile right+down) to reconstruct the
    // full tent; they were assembled to 32x32 and outlined as ONE image
    // before being re-sliced, so the seam between quadrants stays invisible
    // instead of getting a dark cross drawn through the middle.
    tentGreenTL: 12, tentGreenTR: 13, tentGreenBL: 14, tentGreenBR: 15,
    tentTanTL: 16, tentTanTR: 17, tentTanBL: 18, tentTanBR: 19,

    // Interior floor — NOT outlined, on purpose. These tile; an outline
    // would draw a grid across the ground instead of a seamless surface.
    floorPlainA: 20, floorPlainB: 21,
    floorRugA: 22, floorRugB: 23,

    // The graveyard's stone gateway — two halves of one arch, outlined as a
    // single strip so the lintel joins without a seam (see the generator).
    cemeteryArchL: 24, cemeteryArchR: 25,
};

// ── Interior furniture (Roguelike Interior Pack, outlined) ──────────────────
// Column index into the `interior` strip (game/assets-placeholder/kenney/
// rlInterior_outlined.png). KEEP IN SYNC with tools/gen_outlined_sheet.py's
// INTERIOR_RUNS then INTERIOR_SINGLES. A run's cells were outlined as one strip,
// so its middles carry no side stroke: lay a run as its L, any middles, its R.
export const INTERIOR_SPRITES = {
    counterL: 0, counterDrawers: 1, counterDoors: 2, counterGrill: 3,
    counterBottles: 4, counterDishes: 5, counterSink: 6, counterR: 7,
    deskL: 8, deskMid: 9, deskR: 10,
    feltTableL: 11, feltTableR: 12,
    stove: 13,
    chairDown: 14, chairUp: 15, chairRight: 16, chairLeft: 17,
    tableSquare: 18, tableRound: 19,
    shelfA: 20, shelfB: 21,
    plantA: 22, plantB: 23,
};

// ── Props (tall, ground-anchored overlay objects — depth/verticality) ───────
// Unlike tiles (always one cell, drawn flat), props render TALLER than a single
// tile, anchored at their base tile, and depth-sort with the cast so the player
// can walk in front of and behind them. Source is a pixel region (drawRegion) so
// a multi-cell sprite scales uniformly at the game's 2x — no pixel-ratio break.
//   sx/sy/sw/sh — source rect in the sheet (16px grid; packed = gutter-free).
//   wTiles/hTiles — tiles the drawn sprite spans; the base (collision) tile is
//   the bottom-center one. So a 2x2 sprite overhangs its base by one tile up and
//   half a tile to each side, and the player walks behind that overhang.
export const PROP_SPRITES = {
    // Tiny Town tall conifer — 1x2 cells (col 4, rows 0-1) → 32x64 at 2x. One
    // tile wide, two tall: a clean, narrow trunk-and-canopy that reads as a real
    // tree. The player is occluded only when directly behind it (same column),
    // never when merely passing alongside. shadowRx/Ry size the trunk's pool.
    tree: { sheet: 'tinyTown', sx: 4 * 16, sy: 0, sw: 16, sh: 32, wTiles: 1, hTiles: 2, shadowRx: 12, shadowRy: 4.5 },

    // rpgUrban's double-arm streetlight — 1x2 cells (col 3, rows 6-7), the
    // tree's shape. It was a one-cell STREETLIGHT tile drawing the squat
    // lamp-with-a-red-lens at (1,7), which read as a parking meter; the real
    // streetlights are two cells tall and could never fit a tile. The
    // double arm is symmetric, so it reads right on any side of any road —
    // the single-arm (2,6)+(2,7) would point its lamp away from half of them.
    streetlight: { sheet: 'rpgUrban', sx: 3 * 16, sy: 6 * 16, sw: 16, sh: 32, wTiles: 1, hTiles: 2, shadowRx: 7, shadowRy: 2.5 },

    // A jutting sandstone spire — roguelikeDungeon (3,0), a gutter sheet, so the
    // pixel region is at stride 17. It is what a grappling hook bites on: the
    // canyon's climb-out anchor stands on one (map `anchors`, plans/grapple-swing.md).
    // A rock rather than the sheet's rope-and-hook hoist at (5,9) — with a rope
    // already hanging there, you would not need Pike's.
    grappleRock: { sheet: 'roguelikeDungeon', sx: 3 * 17, sy: 0, sw: 16, sh: 16, wTiles: 1, hTiles: 1, shadowRx: 9, shadowRy: 3 },

    // Your car at the bottom of the canyon, a write-off — the same beater as the
    // CAR tile, but a prop: tile 19 bumps into main.js _interactCar, which is the
    // Town car's engine and fuel. One cell, the radical canyon/wreck carries it.
    wreckedCar: { sheet: 'car', sx: 0, sy: 0, sw: 48, sh: 48, wTiles: 1, hTiles: 1, shadowRx: 11, shadowRy: 3 },

    // Gravestones — one prop per silhouette on the outlined strip, keyed by the
    // strip's own names. 1x1: the art is no taller than a cell, so what a prop
    // buys over the old GRAVESTONE tile is a different stone per grave, a
    // ground shadow, and grass showing through the stone's transparent edges.
    ...Object.fromEntries(Object.entries(OUTLINED_SPRITES)
        .filter(([name]) => name.startsWith('gravestone'))
        .map(([name, col]) => [name, { sheet: 'outlined', sx: col * 16, sy: 0, sw: 16, sh: 16, wTiles: 1, hTiles: 1, shadowRx: 10, shadowRy: 3.5 }])),

    // The graveyard's stone gateway, a left and a right piece placed side by
    // side over a 2-tile path, `solid: false` in the map so you walk through.
    // No ground shadow: a prop's shadow is one ellipse centred in its cell,
    // which would sit in the middle of the doorway, not under the posts.
    cemeteryArchL: { sheet: 'outlined', sx: OUTLINED_SPRITES.cemeteryArchL * 16, sy: 0, sw: 16, sh: 16, wTiles: 1, hTiles: 1, shadow: false },
    cemeteryArchR: { sheet: 'outlined', sx: OUTLINED_SPRITES.cemeteryArchR * 16, sy: 0, sw: 16, sh: 16, wTiles: 1, hTiles: 1, shadow: false },

    // Interior furniture — one prop per piece on the `interior` strip, keyed by
    // the strip's own names, placed in the Borgir, the diner, the bank and the
    // casino. 1x1 and solid. No ground shadow: most pieces fill their cell, and
    // a counter is a run of cells, which one centred ellipse per cell would
    // dot with blobs.
    ...Object.fromEntries(Object.entries(INTERIOR_SPRITES)
        .map(([name, col]) => [name, { sheet: 'interior', sx: col * 16, sy: 0, sw: 16, sh: 16, wTiles: 1, hTiles: 1, shadow: false }])),
};

// ── Emote balloons (Kenney Emote Pack, Pixel Style 1) ───────────────────────
// Column index into the `emotes` strip (game/assets-placeholder/kenney/
// emotes_style1.png, packed by tools/gen_emote_sheet.py). Drawn above an NPC's
// head as a transient speech balloon when an ambient reaction fires — the
// placeholder grunt text ([Hrm.]/[Tch.]) made visual. KEEP IN SYNC with that
// script's ORDER list.
export const EMOTE_SPRITES = {
    dots1: 0, dots2: 1, dots3: 2, question: 3, exclamation: 4, sleep: 5,
    music: 6, anger: 7, heart: 8, idea: 9, laugh: 10, star: 11,
    drop: 12, faceHappy: 13, faceAngry: 14, faceSad: 15, alert: 16, swirl: 17,
};

// ── Impact marks (Kenney Emote Pack, Pixel Style 8) ─────────────────────────
// Column index into the `marks` strip (game/assets-placeholder/kenney/
// emotes_marks.png, packed by tools/gen_emote_sheet.py --style 8 --marks).
// Bare symbol, no balloon — see the `marks` SHEETS entry above for why Style 8
// rather than the originally-planned Style 5. Drawn beside a hit-splat's
// damage number as a manga impact mark; see Game._pickHitMark / _spawnHitSplat
// (main.js) and Renderer._drawHitSplat (renderer.js). KEEP IN SYNC with
// gen_emote_sheet.py's MARKS_ORDER list.
//
// Seven of the eight columns have a call site (see pickHitMark in
// hit-splat.js). `cross` is the one that does not: it reads as a negation,
// and the only beat that would want it — a blow that lands for nothing —
// never reaches a splat, because combatAttack returns on an immune target
// before spawning one and logs instead. Wiring it would mean spawning a
// 0-damage splat first, which is a design call, not a mapping one.
export const MARK_SPRITES = {
    star: 0, stars: 1, anger: 2, drop: 3, drops: 4, cross: 5, swirl: 6, exclamation: 7,
};

// ── Zone tile coords (Circus / Factory / Graveyard) ─────────────────────────
// These three zones previously rendered as flat fallbackColor rectangles
// (no sprite refs anywhere). First-pass picks below render real art for the
// 12 tile ids defined in data.js. Pick verification was done via the
// sprite-picker tool (game/sprite-picker.html) at the correct stride.
//
// `sheet:` names the SpriteSheet key; renderer._drawTiles resolves it
// against `game.renderer.sprites[sheet]`. Every entry must name a sheet explicitly.
//
// Two optional fields:
//   quad  — the tile is one quadrant of a 2x2 picture; tileFrame picks which.
//   under — what is painted first, so see-through art shows ground rather than
//           a hole in the cleared canvas: a tile id, or 'fill' for the tile's
//           own flat colour. Required for any placed tile whose art has a single
//           see-through pixel — tests/tile-coverage.test.js measures the PNGs.
//           (Without it the hole was black by day and the lighting pass's
//           near-white at dusk: the town's benches and fences flickered.)

// The cell of art a tile draws at world (x, y). Nearly every tile is one cell,
// the same wherever it lies. A `quad` tile's cell comes from the parity of
// (x, y), so a whole picture is any even-aligned 2x2 block of that id —
// tests/zone-identity.test.js holds the maps to that. Allocates nothing: the
// four quadrant refs are built once, below.
export function tileFrame(ref, x, y) {
    return ref.quad ? ref.quad[(x & 1) + 2 * (y & 1)] : ref;
}

// TL, TR, BL, BR of a 2x2 picture on the outlined strip, as tile refs.
function outlinedQuad(name) {
    return ['TL', 'TR', 'BL', 'BR'].map(q => ({ sheet: 'outlined', col: OUTLINED_SPRITES[name + q], row: 0 }));
}

export const ZONE_TILE_SPRITE_MAP = {
    // Circus — Tiny Town terrain, and real tents (zone-identity.md Item 3):
    // roguelikeSheet's 2x2 green and tan tents from the outlined strip. They
    // replace TENT_STRIPE, red roof shingles that stood in for a tent over all
    // 344 of the carnival's tent cells. (Striped awnings exist too, green/white
    // and orange/white in roguelikeCity_packed.png — still unused.)
    30: { sheet: 'tinyTown', col: 7, row: 3 },   // CIRCUS_GROUND — stone pavers on grass, a fairground path (its own cell, not the road's)
    32: { sheet: 'tinyTown', col: 2, row: 0 },   // CONFETTI      — grass dotted with orange flowers
    // SAWDUST — a rounded dirt patch with a grass rim, Tiny Town's four corner
    // cells as one 2x2 picture; every sawdust patch on the map is 2x2 from an
    // even tile, so each one draws whole.
    33: { sheet: 'tinyTown', quad: [[0, 1], [2, 1], [0, 3], [2, 3]].map(([col, row]) => ({ sheet: 'tinyTown', col, row })) },
    34: { sheet: 'outlined', quad: outlinedQuad('tentGreen'), under: 30 }, // GREEN_TENT
    35: { sheet: 'outlined', quad: outlinedQuad('tentTan'),   under: 30 }, // TAN_TENT

    // Factory — needed no new sheet (zone-identity.md Item 2). WALL moves to
    // roguelikeCity's chain-link fencing so Factory reads industrial rather
    // than dungeon-brick; CONVEYOR_VIS moves to a tinyDungeon rail-and-
    // crosstie motif. FLOOR and GOO_VISUAL stay put — the defect there was
    // Sewer sharing them (SLUDGE, id 2 in TILE_SPRITE_MAP above, moved off
    // GOO_VISUAL's cell, and BOSS_FLOOR, id 6, off FACTORY_FLOOR's), not the
    // tiles themselves. tests/zone-identity.test.js now fails if any two tile
    // ids draw the same cell without a written reason.
    //
    // WALL: roguelikeCity (16,17), a continuous chain-link weave. (15,17)
    // alongside it frames each cell with its own post, which tiles as a
    // visibly repeated post-and-panel wall rather than one continuous fence
    // across Factory's long wall runs (checked by tiling both 5x5) — this
    // map's WALL is 300 of 900 cells, mostly long straight runs, so the
    // seamless weave holds up better at that scale.
    //
    // CONVEYOR_VIS corrects a false claim: this comment used to say "No
    // conveyor art; wood slats proxy it." Surveyed and untrue — tinyDungeon
    // (7,6) is a rail-and-crosstie motif, three cells from the wood-slat
    // proxy it replaces here. (tinyDungeon (6,6), listed alongside it in an
    // earlier survey as a second candidate, turned out on inspection to be a
    // color-matched variant of the SAME wood-slat/ladder family as the old
    // proxy — not a conveyor motif at all; pixel-diffed against (7,6)/(8,6)
    // before picking (7,6) instead of trusting the survey.) This is the
    // third false "no art exists" claim found in this file: awnings (false —
    // the art exists, see the Circus note above) and iron
    // railings (genuine — see IRON_FENCE below) were the first two.
    //
    // Other unused industrial art surveyed while here, left for a later
    // pass: tinyDungeon has a segmented pipe-loop at (9-11, 5-7) — a fixed
    // 3x3 decorative frame (corners + straight runs), not a freely tileable
    // single cell. rpgUrban has L/T pipe fittings at (1,6)/(2,6)/(3,6-7), a
    // pipe wrench at (1,7), and hazard barriers at (5,8)/(6,8) — all unused,
    // already loaded (no new SHEETS entry needed to use any of it).
    40: { sheet: 'tinyDungeon', col: 9, row: 4 },     // FACTORY_FLOOR — clean gray stone slab
    41: { sheet: 'roguelikeCity', col: 16, row: 17, under: 40 }, // FACTORY_WALL  — chain-link fencing, factory floor through the mesh
    42: { sheet: 'tinyExtra', col: 4, row: 0, under: 40 },  // GOO_VISUAL — green ooze hatch on factory floor (tinyDungeon (8,2) with its orange keyed out)
    43: { sheet: 'tinyDungeon', col: 7, row: 6, under: 40 },     // CONVEYOR_VIS  — rail-and-crosstie belt motif, on factory floor

    // Graveyard — Tiny Town dirt/foliage. The graves are props (PROP_SPRITES
    // gravestone*), a silhouette per grave; they replaced one tinyDungeon (4,5)
    // cross tiled over all 96 grave cells.
    50: { sheet: 'tinyTown',    col: 1, row: 1 }, // GRAVE_DIRT    — brown dirt patch
    52: { sheet: 'tinyTown',    col: 1, row: 0 }, // DEAD_GRASS    — tufted grass (ground fill; toadstools tiled too busy)
    53: { sheet: 'tinyTown',    col: 9, row: 3, under: 52 }, // IRON_FENCE    — wood fence (no iron railing in pack), dead grass between the planks

    // Canyon — picked 2026-09-27 from sheets already loaded, each tiled 4x4
    // and in a mock canyon before choosing. The red-boulder cell tinyDungeon
    // (0,1) was the obvious wall and was passed over: it is the rock item's
    // sprite, and a dropped rock would vanish into it. All six are opaque.
    60: { sheet: 'tinyDungeon',      col: 1,  row: 4 },  // CANYON_FLOOR — speckled sand
    61: { sheet: 'tinyDungeon',      col: 1,  row: 0 },  // CANYON_WALL  — red rock, flecked with stone
    62: { sheet: 'roguelikeDungeon', col: 10, row: 8 },  // DRY_RIVERBED — cracked earth, the river's old silt
    63: { sheet: 'tinyDungeon',      col: 0,  row: 2 },  // SCREE        — red rubble at the foot of a wall
    64: { sheet: 'tinyDungeon',      col: 2,  row: 4 },  // LEDGE        — sand with a darker lip along the top
    65: null,                                            // CHASM        — no art: the flat near-black is the drop
    66: { sheet: 'roguelikeDungeon', col: 1,  row: 11 }, // RIVER        — open water

    // Frozen area — picked 2026-10-26 from sheets already bundled; no pack has
    // real snow or ice. The open-water cells were passed over for ICE: they are
    // RIVER's colour, and RIVER is water you cannot walk on. Both opaque.
    70: { sheet: 'roguelikeSheet', col: 45, row: 26 },   // SNOW — flat white ground
    71: { sheet: 'roguelikeCity',  col: 14, row: 9 },    // ICE  — pale glass with a diagonal sheen, seamless
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
        sheet.key = key;
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
