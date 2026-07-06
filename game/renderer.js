// renderer.js — Final pass: pixel art world + parchment UI
// Large panels: 9-slice from Modern UI Style 1
// Small panels: hand-colored parchment fill matching the sprite palette
// All text: dark brown on parchment for readability (not gold-on-dark)

import { TILE_PX, VIEW_TILES, CANVAS_PX } from './data.js';

// Supersample factor: render the canvas at SS x the internal 608 resolution so
// the (anti-aliased) VT323 text stays sharp under the pixel-art upscale rather
// than being blown up soft. All drawing stays in 608 coords via a base
// ctx.setTransform(SS,…) at the top of each frame; tap input maps via
// CANVAS_INTERNAL_PX (608) independently, so it's unaffected.
const SS = 2;
import { TILE_SPRITE_MAP, TOWN_TILE_SPRITE_MAP, ZONE_TILE_SPRITE_MAP, ENEMY_SPRITES, ITEM_SPRITES, PLAYER_SPRITE, PROP_SPRITES, EMOTE_SPRITES, EQUIP_FIGURE_SPRITE } from './sprites.js';
import { UI, ITEM_COLORS, drawPanelBig, drawPanelSmall, drawInset } from './ui-sprites.js';
import { ROOT, selectedNode, activeRing, activeIndex, decisionPath, previewChildren, affectedTiles, verbApplies, isCombatActive, flapperDeflection } from './wheel-model.js'; // (sunburst wheel)
import { SPELLS } from './spells.js';
import {
    OVERLAY_RECTS, THROW_RECTS,
    HOTBAR_SLOT_W, HOTBAR_SLOT_H, HOTBAR_GAP, HOTBAR_SLOTS, HOTBAR_STRIDE,
    HOTBAR_TOTAL_W, HOTBAR_OX, HOTBAR_OY, HOTBAR_X_START, HOTBAR_Y,
    QUESTLOG_RECT, LOG_MODAL_RECT, JOURNAL_RECT, TARGET_LIST_RECT, TARGET_LIST_ROW_H,
    TRADE_MODAL_RECT, TRADE_BUY_ORIGIN, TRADE_SELL_ORIGIN, TRADE_BUYBACK_ORIGIN, TRADE_BRIBE_RECT,
    TRADE_CELL_W, TRADE_CELL_H, TRADE_COLS, tradeCellRect,
    RADIAL_CENTER_X, RADIAL_CENTER_Y, WHEEL_HUB_R, WHEEL_TILE_GAP, wheelRingR,
    EQUIPMENT_MODAL_RECT, EQUIP_FIGURE_RECT, EQUIP_SLOT_RECTS, closeButtonRect,
} from './layout.js';
import { ITEMS, itemTier } from './items.js';                                // (trade slice 1) stock item defs; (6d) value tiers
import { WORLD_ZONES, overworldZone, connectorPairs } from './world-map.js'; // (Phase 4) rudimentary world map
import { hasLineOfSight } from './enemies.js';                               // (aggro overlay) READ-ONLY: same Bresenham the chase AI uses
import { buyPrice, sellPrice, bribeStepCost, mood, canTrade, BRIBE_STEP } from './trade.js'; // (trade slice 1) pricing + mood smiley
import * as Settings from './settings.js'; // (combat-feel-pass) reduce-motion for hit-splats (namespace import — see main.js)

// (combat-feel-pass) Hit-splat fill colors by damage type. Crit keeps the
// physical fill but takes a gold border (handled in _drawHitSplat). New types
// (poison/fire) are wired but unused until something produces that damage.
const SPLAT_COLOR = {
    physical: '#d23f2f',
    sludge:   '#9a52c8',
    poison:   '#57a23e',
    fire:     '#f0833a',
    cold:     '#5ec3e8',
    heal:     '#3fb56a',
    miss:     '#3a6ea5',
};

// ── Procedural character walk/idle animation (plans/movement-feel.md) ─────────
// The Tiny Dungeon / Kenney sheets have ONE static front-facing pose per
// character, so we sell "walking" with transforms on that single cell — applied
// identically to the player and every enemy/NPC so the whole cast moves the
// same way. Per Caelan's feel notes: integer PIXEL bob (no sub-pixel), a small
// alternating ROTATION waddle (NOT a squash — non-uniform scale breaks the pixel
// ratio and reads as "off the canvas"), and a horizontal flip to face left.
// All tunable.
const WALK_BOB_PX   = 2;   // peak vertical bounce per tile (integer pixels)
const WALK_LEAN_DEG = 5;   // peak waddle rotation, alternates each step; 0 = off
const IDLE_BOB_PX   = 1;   // standing breathe (discrete pixel, synced to idle tick)

// Vertical bob + waddle rotation for a walking (or idle) character. `progress`
// is the 0→1 slide position; `stepIndex` parity picks the waddle side; `idleTick`
// drives the standing breathe. Bob is rounded to whole pixels to stay crisp.
function walkAnim(animating, progress, stepIndex, idleTick) {
    if (animating) {
        const phase = Math.sin(Math.PI * (progress || 0)); // 0→1→0 across the tile
        const side  = (stepIndex % 2) ? 1 : -1;            // which foot leads
        return { bob: -Math.round(phase * WALK_BOB_PX), rot: phase * WALK_LEAN_DEG * side * Math.PI / 180 };
    }
    // Idle "breathing" bounce — a gentle up/down so characters never read as
    // dead statues (Town Clock ambient-life pass). 4-phase triangle on the idle
    // tick: 0,-1,-2,-1 px, ~1s/cycle at the 250ms idle cadence. Applies to every
    // character (player + all enemies share this path).
    return { bob: [0, -1, -2, -1][(idleTick || 0) % 4], rot: 0 };
}

// Wrap a sprite draw in the character transform (bob + waddle + facing flip),
// pivoted on the sprite centre. flipX = -1 faces left. No non-uniform scale, so
// pixel ratios stay 1:1.
function withWalk(ctx, cx, cy, { bob = 0, rot = 0, flipX = 1 }, draw) {
    ctx.save();
    ctx.translate(cx, cy + bob);
    if (rot) ctx.rotate(rot);
    if (flipX !== 1) ctx.scale(flipX, 1);
    ctx.translate(-cx, -cy);
    draw();
    ctx.restore();
}

export class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx    = canvas.getContext('2d');
        canvas.width  = CANVAS_PX * SS;
        canvas.height = CANVAS_PX * SS;
        this.ctx.imageSmoothingEnabled = false;

        this.half    = (VIEW_TILES - 1) / 2;
        this.sprites = null;
        this.zone    = 'TOWN';
    }

    // The 9-slice panel atlas. Was a dead-loaded `uiStyle1` reference (no
    // matching Kenney sheet ever shipped), so drawPanelBig has been falling
    // back to flat-color rectangles since v0.4-ish. The new `uiPanel` sheet
    // is generated by tools/gen_ui_panel.py and contains base/dark/glow
    // variants stacked vertically.
    get uiSheet() { return this.sprites?.uiPanel ?? null; }

    // ── Splash ───────────────────────────────────────────────────────────────

    renderSplash(splashCanvas) {
        const ctx = splashCanvas.getContext('2d');
        splashCanvas.width = 320 * SS;
        splashCanvas.height = 220 * SS;
        ctx.setTransform(SS, 0, 0, SS, 0, 0);
        ctx.imageSmoothingEnabled = false;

        ctx.fillStyle = '#0e0c08';
        ctx.fillRect(0, 0, 320, 220);

        const ui = this.uiSheet;
        if (ui?.loaded) {
            drawPanelBig(ctx, ui, 16, 12, 288, 196);
        } else {
            ctx.fillStyle = UI.panelBg;
            ctx.fillRect(20, 16, 280, 188);
            ctx.strokeStyle = UI.panelBorder;
            ctx.lineWidth = 2;
            ctx.strokeRect(20, 16, 280, 188);
        }

        // Small game-name header — bitmap font, centered, with a 1px dark
        // drop-shadow so the gold lifts off the parchment.
        if (this.font) {
            // Wordmark — a bold gold marquee with a bronze bevel that reads on
            // the dark stone panel (a black drop-shadow would vanish here).
            this.font.drawText(ctx, 'VIOLENCETOWN', 162, 32, {
                color: '#6a5320', scale: 2, align: 'center',
            });
            this.font.drawText(ctx, 'VIOLENCETOWN', 160, 30, {
                color: UI.gold, scale: 2, align: 'center',
            });
        }

        // Horizontal rule under header — gold center with sewer-green tick
        // accents at each end, echoing the in-game goo palette.
        ctx.strokeStyle = UI.panelBorder;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(66, 50); ctx.lineTo(254, 50); ctx.stroke();
        ctx.fillStyle = '#9bb43e';
        ctx.fillRect(64, 49, 3, 3);
        ctx.fillRect(253, 49, 3, 3);

        // Cityscape silhouette — replaces an earlier character lineup that
        // read as three skin-tone variants. Procedural noir skyline drawn
        // directly: dark buildings with scattered window dots and a low moon.
        // Reads as "a place bigger than you, mostly hostile, occasionally lit".
        // Anchored inside the panel from y=56 down to y=130.
        this._drawSplashCityscape(ctx);

        // Big GAME START prompt — the centerpiece. Scale 3 = 24px tall.
        // Hard 2px black drop-shadow gives the marquee its chunky arcade weight.
        if (this.font) {
            this.font.drawText(ctx, 'GAME START', 162, 150, {
                color: '#5a4420', scale: 3, align: 'center',
            });
            this.font.drawText(ctx, 'GAME START', 160, 148, {
                color: UI.gold, scale: 3, align: 'center',
            });

            // Subtitle hint
            this.font.drawText(ctx, 'PRESS SPACE OR CLICK BELOW', 160, 178, {
                color: UI.textLight, scale: 1, align: 'center',
            });
        }

        // Version — read from <meta name="version"> so it's a single source of truth
        const meta = typeof document !== 'undefined'
            ? document.querySelector('meta[name="version"]')
            : null;
        const version = meta ? meta.getAttribute('content') : '?';
        if (this.font) {
            // y=186 clears the panel's bottom 16px-cell trim/accents at y≈193+
            // (was 192, which clipped the descenders). Right-anchored 24px in
            // from the panel's right edge (x≈304); left-anchored 24px from left.
            this.font.drawText(ctx, 'V' + version, 280, 186, {
                color: UI.textLight, scale: 1, align: 'right',
            });
            this.font.drawText(ctx, 'BY CAELAN GANDER', 32, 186, {
                color: UI.textLight, scale: 1, align: 'left',
            });
        }
    }

    // ── Splash cityscape ─────────────────────────────────────────────────────
    //
    // A procedural neo-noir skyline that fills the splash's middle band. The
    // intent: convey "a savage town, bigger than you, with a few lit windows
    // that hint at the lives behind every wall." Drawn purely with rects so
    // it scales pixel-perfect at any preview size and never depends on an
    // asset that might not load.
    //
    // Composition (within the panel's 288×196 interior, anchored at x≈16,
    // y≈12 on the 320×220 splash canvas):
    //   - Sky band:   y=56..130
    //   - Far row:    short dim silhouettes (back layer)
    //   - Near row:   taller silhouettes with window dots (front layer)
    //   - Moon:       a small ochre disk top-right, partially behind near row
    //
    // Building positions/heights are seeded from a fixed pattern so the
    // splash always renders the same — recruiters who reload see a stable
    // composition, not a random one. The pattern is keyed to the canvas
    // x-coordinate so it tiles cleanly within the panel.

    _drawSplashCityscape(ctx) {
        const PANEL_X = 24, PANEL_W = 272;
        const SKY_Y = 56, SKY_H = 76;
        const GROUND_Y = SKY_Y + SKY_H;

        // Sky — a dusk gradient (deep indigo night above, warm ember at the
        // horizon) so the near-black skyline silhouettes crisply against it on
        // the dark stone panel; lit gold windows + a low moon punch through.
        const sky = ctx.createLinearGradient(0, SKY_Y, 0, GROUND_Y);
        sky.addColorStop(0,    '#241f3a');
        sky.addColorStop(0.55, '#3a2a3a');
        sky.addColorStop(1,    '#4a2e22');
        ctx.fillStyle = sky;
        ctx.fillRect(PANEL_X, SKY_Y, PANEL_W, SKY_H);

        // Moon — small ochre disk, behind the near-row silhouettes.
        // Aproximated with 5 stacked rects so it stays crisp at every scale.
        const moonX = PANEL_X + PANEL_W - 56, moonY = SKY_Y + 12;
        const moonRects = [[2,0,4,1],[1,1,6,1],[0,2,8,4],[1,6,6,1],[2,7,4,1]];
        ctx.fillStyle = '#d4b96a';
        for (const [dx, dy, w, h] of moonRects) {
            ctx.fillRect(moonX + dx, moonY + dy, w, h);
        }

        // Far-row buildings — short, dim, no windows. Provides depth.
        // Heights cycle through a 6-step pattern keyed to building index.
        const FAR_H = [10, 14, 8, 16, 12, 10];
        const FAR_W = 14;
        const farY0 = GROUND_Y - 20;
        ctx.fillStyle = '#2a1e14';
        for (let i = 0; PANEL_X + i * FAR_W < PANEL_X + PANEL_W; i++) {
            const h = FAR_H[i % FAR_H.length];
            const bx = PANEL_X + i * FAR_W;
            ctx.fillRect(bx, farY0 - h, FAR_W, h + 20);
        }

        // Near-row buildings — taller, varied widths, window dots. The
        // pattern is deliberately uneven so the skyline reads as a real
        // city block, not a periodic texture.
        // Each tuple: [width, height, windowsPerRow, windowRows]
        const NEAR_PATTERN = [
            [22, 38, 3, 5], [16, 28, 2, 3], [28, 52, 4, 7], [14, 22, 1, 2],
            [24, 44, 3, 6], [18, 32, 2, 4], [30, 58, 4, 8], [20, 36, 2, 5],
            [14, 26, 1, 3], [26, 48, 3, 6],
        ];
        let bx = PANEL_X;
        let i = 0;
        ctx.fillStyle = '#100a08';
        while (bx < PANEL_X + PANEL_W) {
            const [bw, bh, wPerRow, wRows] = NEAR_PATTERN[i % NEAR_PATTERN.length];
            const by = GROUND_Y - bh;
            // Building body
            ctx.fillRect(bx, by, bw, bh + 8); // +8 lets it run past the ground line
            // Top-edge highlight (one pixel lighter) — gives the silhouette
            // a slight glint that suggests the moon is grazing the rooftops.
            ctx.fillStyle = '#3a2a18';
            ctx.fillRect(bx, by, bw, 1);
            ctx.fillStyle = '#100a08';
            // Window dots — small 1×1 ochre marks, evenly spaced.
            // Skip a deterministic ~20% so the windows look lived-in (some
            // dark, some lit) rather than a perfect grid.
            const wPadX = 3, wPadY = 6;
            const wSpaceX = (bw - wPadX * 2 - wPerRow) / Math.max(1, wPerRow - 1) || 0;
            const wSpaceY = 5;
            for (let r = 0; r < wRows; r++) {
                for (let c = 0; c < wPerRow; c++) {
                    // Deterministic "lit?" — skip when (i*7 + r*3 + c) % 5 === 0
                    if ((i * 7 + r * 3 + c) % 5 === 0) continue;
                    const wx = bx + wPadX + c * (1 + wSpaceX);
                    const wy = by + wPadY + r * (1 + wSpaceY);
                    if (wy + 1 > by + bh - 2) continue; // don't draw windows past the bottom
                    ctx.fillStyle = '#d4b96a';
                    ctx.fillRect(Math.round(wx), Math.round(wy), 1, 1);
                    ctx.fillStyle = '#100a08';
                }
            }
            bx += bw;
            i++;
        }

        // Ground line — single dark pixel-row separating skyline from the
        // parchment band below, so the eye doesn't have to track where the
        // city ends and the GAME START callout begins.
        ctx.fillStyle = '#0a0606';
        ctx.fillRect(PANEL_X, GROUND_Y - 1, PANEL_W, 2);
    }

    // ── Game Frame ───────────────────────────────────────────────────────────

    renderFrame(game) {
        const { ctx } = this;
        ctx.setTransform(SS, 0, 0, SS, 0, 0);   // supersample: draw in 608 coords at SS density
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, CANVAS_PX, CANVAS_PX);

        this._scrollX = 0;
        this._scrollY = 0;
        if (game._animating) {
            const t = game._animProgress || 0;
            // Round the camera scroll to WHOLE pixels. A fractional offset draws
            // every tile at a sub-pixel x/y, and with image-smoothing off the
            // browser rounds adjacent tile edges inconsistently — flashing thin
            // seams ("grid lines") between tiles as you walk. Integer scroll =
            // crisp, seam-free pixel scrolling. (movement-feel feel pass)
            this._scrollX = Math.round((game._animToX - game._animFromX) * t * TILE_PX);
            this._scrollY = Math.round((game._animToY - game._animFromY) * t * TILE_PX);
        }

        // Screen shake (Phase F) — random offset applied to world rendering
        // only. Magnitude scales linearly with remaining time so the shake
        // decays to zero rather than ending abruptly. HUD is rendered after
        // the restore so it stays fixed on screen during the shake.
        const now = performance.now();
        const shakeRemaining = (game._screenShakeUntil ?? 0) - now;
        let shakeX = 0, shakeY = 0;
        if (shakeRemaining > 0) {
            const duration = shakeRemaining / 150; // rough normalize (0..~1.2)
            const decay = Math.min(1, duration);
            const mag = (game._screenShakeMagnitude ?? 0) * decay;
            shakeX = Math.round((Math.random() - 0.5) * mag * 2); // whole-pixel shake
            shakeY = Math.round((Math.random() - 0.5) * mag * 2); // (avoid sub-pixel seams)
        }
        // Stash the shake offset so the zone-exit pass can re-apply the SAME world
        // transform after the lighting/arena dim (see _drawTransitions call below).
        this._shakeX = shakeX; this._shakeY = shakeY;

        ctx.save();
        ctx.translate(shakeX, shakeY);

        this._drawTiles(game);
        this._drawContainers(game);
        this._drawGroundItems(game);
        // Depth pass: enemies + player draw in one y-sorted (feet-line) pass so
        // closer characters occlude farther ones, each grounded by a drop-shadow.
        this._drawActors(game);
        this._drawJammedDoor(game);

        // (aggro overlay) Alerted-enemy sight rings + LOS threads — world space,
        // so they sit under the shake translate and track tiles like the reticle.
        this._drawAggroOverlay(game);

        // (combat-wheel rework) Aim reticle lives in world space so it tracks the
        // map; the wheel list itself is drawn in screen space after the restore.
        if (game.wheel && (game.wheel.aiming || game.wheel.confirming)) this._drawReticle(game);

        // Floating damage numbers float above the world but under the HUD
        // so the HP panel + hotbar are never occluded by spammy combat.
        this._drawDamageNumbers(game);

        ctx.restore();

        // (world-structure) Wilderness blackout — a heavy radial darkness with
        // only a faint pool of light around the player. Drawn in screen space
        // (after the shake restore, so it stays centered) and before the HUD so
        // HP/hotbar stay readable. Gated on zone — only the Wilderness is dark.
        this._drawDarkness();

        // Day/night lighting grade (Town Clock) — multiply an ambient-night
        // lightmap (with additive lamp/window/player glows) over the world. No-op
        // in full day; the Wilderness opts out (it owns _drawDarkness).
        this._drawLighting(game);

        // Combat arena (lit aggro-radius). Eased in/out so the fight blooms a lit
        // stage with the world dimming/cooling around it, releasing when the
        // encounter clears. Drawn after day/night so it composes (the player aura
        // still lights the arena at night), before the HUD so HP/clock stay legible.
        const arenaTarget = (game._inCombat && game._inCombat()) ? 1 : 0;
        const aCur = this._arenaLevel ?? 0;
        this._arenaLevel = Math.abs(arenaTarget - aCur) < 0.01 ? arenaTarget : aCur + (arenaTarget - aCur) * 0.15;
        this._drawArena(game);

        // Visible zone-exit markers. Drawn AFTER the day/night + arena + Wilderness
        // dimming so the glow/arrows aren't sunk by a night multiply or the
        // Wilderness blackout — the markers MUST stay legible. World-space, so we
        // re-apply the same shake translate the world used; the projection inside
        // already folds in _scrollX/_scrollY. The label hint it draws is screen-space.
        ctx.save();
        ctx.translate(this._shakeX || 0, this._shakeY || 0);
        this._drawTransitions(game);
        ctx.restore();

        // HUD — rendered AFTER restore so screen shake doesn't affect it
        this._drawHPPanel(game);
        this._drawBuffBar(game);
        this._drawQuestLog(game);
        this._drawHotbar(game);

        // Subtle vignette border
        this._drawVignette();

        // Modals
        if (game.state === 'item_overlay')    this._drawItemOverlay(game);
        if (game.state === 'radial_menu')     this._drawRadialMenu(game);
        if (game.state === 'target_list')     this._drawTargetList(game);
        if (game.state === 'item_throw_dir')  this._drawThrowPrompt(game);
        if (game.state === 'ending') this._drawEndingOverlay(game);
        if (game.state === 'log_modal') this._drawLogModal(game);
        if (game.state === 'trade') this._drawTradeModal(game);
        if (game.state === 'dialogue') this._drawDialogueModal(game);
        if (game.state === 'equipment') this._drawEquipmentModal(game);
        if (game.state === 'inspect') this._drawInspectPanel(game);
        if (game.state === 'journal') this._drawJournal(game);

        // (menu grammar) Universal ✕ / Back affordance — after the current Menu is
        // drawn, stash its panel rect + draw a tappable close chip at the top-right.
        // main hit-tests renderer._closeBtnRect / _menuPanelRect, kept here in ONE
        // place so the chip and its hit-zone can't drift. Prompts (inspect) + the
        // wheel are excluded (any-tap / native ▼CLOSE); target_list uses the rect
        // _drawTargetList stashed this frame (its height is per-verb-count).
        const CLOSE_PANEL = {
            target_list: this._targetListRect,
            journal:     JOURNAL_RECT,
            log_modal:   LOG_MODAL_RECT,
            trade:       TRADE_MODAL_RECT,
            equipment:   EQUIPMENT_MODAL_RECT,
            dialogue:    TRADE_MODAL_RECT,
        }[game.state] || null;
        this._menuPanelRect = CLOSE_PANEL;
        this._closeBtnRect = CLOSE_PANEL ? closeButtonRect(CLOSE_PANEL) : null;
        if (this._closeBtnRect) this._drawCloseButton(this.ctx, this._closeBtnRect);
    }

    // (menu grammar) The ✕ / Back chip — a small dark rounded plate with a gold X,
    // top-right of a Menu panel: the always-visible, tappable exit on every Menu
    // (paired with Esc + tap-outside; gamepad B later). The X is drawn as strokes,
    // not a glyph, since the bitmap font is ASCII-only.
    _drawCloseButton(ctx, r) {
        const x = r.x, y = r.y, w = r.w, h = r.h, rad = 6;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x + rad, y);
        ctx.arcTo(x + w, y, x + w, y + h, rad);
        ctx.arcTo(x + w, y + h, x, y + h, rad);
        ctx.arcTo(x, y + h, x, y, rad);
        ctx.arcTo(x, y, x + w, y, rad);
        ctx.closePath();
        ctx.fillStyle = UI.panelBg; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = UI.panelBorder; ctx.stroke();
        const m = 9;
        ctx.lineWidth = 2.5; ctx.strokeStyle = UI.gold; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x + m, y + m); ctx.lineTo(x + w - m, y + h - m);
        ctx.moveTo(x + w - m, y + m); ctx.lineTo(x + m, y + h - m);
        ctx.stroke();
        ctx.restore();
    }

    // (world-structure) Heavy radial darkness for the Wilderness zone — a tiny
    // pool of light around the player, near-black beyond. "No light, no car"
    // made literal: you can barely see, so going deeper is plainly suicidal.
    _drawDarkness() {
        if (this.zone !== 'WILDERNESS') return;
        const { ctx } = this;
        const cx = CANVAS_PX / 2, cy = CANVAS_PX / 2;
        const g = ctx.createRadialGradient(cx, cy, TILE_PX * 0.8, cx, cy, TILE_PX * 4.5);
        g.addColorStop(0,   'rgba(2,2,6,0)');
        g.addColorStop(0.4, 'rgba(2,2,6,0.6)');
        g.addColorStop(1,   'rgba(2,2,6,0.98)');
        ctx.save();
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);
        ctx.restore();
    }

    // ── Day/night lighting (Town Clock) ──────────────────────────────────────
    //
    // A classic 2D lightmap: an offscreen canvas filled with the ambient night
    // color, then additive ('lighter') warm radial glows painted at every
    // emissive source (lamps, lit windows, and the player's own aura). That
    // lightmap is multiplied over the rendered world — so the town darkens and
    // cools toward night while lit pools punch back to full brightness. Drawn in
    // screen space (after the shake restore) and beneath the HUD.
    //
    // game._nightLevel drives it: 0 = full day (no-op, normal daytime look); 1 =
    // deep night. The Town Clock day-phase will animate this; for now it can be
    // set directly. The Wilderness keeps its own blackout (_drawDarkness) and is
    // skipped here so the two don't stack.
    _drawLighting(game) {
        const n = game._nightLevel ?? 0;
        if (n <= 0.001 || this.zone === 'WILDERNESS') return;

        const lm = (this._lightCanvas ??= document.createElement('canvas'));
        if (lm.width !== CANVAS_PX) { lm.width = CANVAS_PX; lm.height = CANVAS_PX; }
        const lctx = lm.getContext('2d');

        // Ambient base — white (day) lerped toward deep cool night by nightLevel.
        const amb = this._ambientColor(n);
        lctx.globalCompositeOperation = 'source-over';
        lctx.fillStyle = `rgb(${amb.r},${amb.g},${amb.b})`;
        lctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);

        // Additive warm lights punch holes of brightness in the night.
        lctx.globalCompositeOperation = 'lighter';
        for (const L of this._collectLights(game)) {
            const grd = lctx.createRadialGradient(L.x, L.y, 0, L.x, L.y, L.radius);
            grd.addColorStop(0,   `rgba(${L.r},${L.g},${L.b},1)`);
            grd.addColorStop(0.5, `rgba(${L.r},${L.g},${L.b},0.55)`);
            grd.addColorStop(1,   'rgba(0,0,0,0)');
            lctx.fillStyle = grd;
            lctx.fillRect(L.x - L.radius, L.y - L.radius, L.radius * 2, L.radius * 2);
        }

        const { ctx } = this;
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.drawImage(lm, 0, 0);
        ctx.restore();
    }

    // Emissive sources in view: the player's own warm aura (fixed at view center,
    // so night stays navigable) plus the map's lights (lamps/windows), converted
    // to screen space with the same scroll the world uses. Radii are in tiles.
    _collectLights(game) {
        const { half } = this;
        const lights = [{
            x: half * TILE_PX + TILE_PX / 2,
            y: half * TILE_PX + TILE_PX / 2,
            radius: TILE_PX * 3.2, r: 255, g: 236, b: 200,
        }];
        for (const L of (game.map?.lights || [])) {
            const vx = L.x - game.playerX + half;
            const vy = L.y - game.playerY + half;
            if (vx < -4 || vx > VIEW_TILES + 3 || vy < -4 || vy > VIEW_TILES + 3) continue;
            lights.push({
                x: vx * TILE_PX - this._scrollX + TILE_PX / 2,
                y: vy * TILE_PX - this._scrollY + TILE_PX / 2,
                radius: (L.radius ?? 2.5) * TILE_PX,
                r: L.r ?? 255, g: L.g ?? 205, b: L.b ?? 130,
            });
        }
        return lights;
    }

    // Ambient multiply color for a night level: white (day) → deep cool night.
    _ambientColor(n) {
        const t = Math.max(0, Math.min(1, n));
        const lerp = (a, b) => Math.round(a + (b - a) * t);
        return { r: lerp(255, 48), g: lerp(255, 54), b: lerp(255, 92) };
    }

    // ── Combat arena (lit aggro-radius) ──────────────────────────────────────
    //
    // While a fight is engaged, the viewport blooms a lit "stage" around the
    // encounter and the world beyond dims + cools, so the combat boundary is
    // VISIBLE (no JRPG teleport-to-a-forest) and the eye is pulled to the fight.
    // Same multiply-overlay trick as the day/night lightmap, inverted: a dim fill
    // with a bright spotlight hole at the encounter centre. Eased by _arenaLevel
    // (set in renderFrame) so it blooms in and releases out; the radius sizes to
    // contain the engaged enemies. Purely visual — combat geometry stays
    // grid-clean. The dim tone is tunable.
    _drawArena(game) {
        const lvl = this._arenaLevel ?? 0;
        if (lvl <= 0.001 || this.zone === 'WILDERNESS') return;   // Wilderness owns its blackout

        // Cool desaturated dark the periphery multiplies toward; lerp white →
        // tone by level so the stage blooms in smoothly (white = no-op at lvl 0).
        const tone = { r: 82, g: 84, b: 94 };
        const dr = Math.round(255 + (tone.r - 255) * lvl);
        const dg = Math.round(255 + (tone.g - 255) * lvl);
        const db = Math.round(255 + (tone.b - 255) * lvl);

        // Radius: contain the engaged (chasing) enemies + margin, clamped.
        let maxTiles = 2.5;
        for (const e of game.enemies) {
            if (e.ambient || e.state !== 'chasing' || !e.entity.isAlive()) continue;
            const d = Math.max(Math.abs(e.x - game.playerX), Math.abs(e.y - game.playerY));
            if (d > maxTiles) maxTiles = d;
        }
        const coreR = Math.min(7, maxTiles + 1.5) * TILE_PX;
        const edgeR = coreR + TILE_PX * 2.6;

        const am = (this._arenaCanvas ??= document.createElement('canvas'));
        if (am.width !== CANVAS_PX) { am.width = CANVAS_PX; am.height = CANVAS_PX; }
        const actx = am.getContext('2d');

        actx.globalCompositeOperation = 'source-over';
        actx.fillStyle = `rgb(${dr},${dg},${db})`;
        actx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);

        // Punch the lit stage at the encounter — centred on the player (always at
        // view centre; combat centres on the hero).
        const cx = this.half * TILE_PX + TILE_PX / 2;
        const cy = this.half * TILE_PX + TILE_PX / 2;
        const grd = actx.createRadialGradient(cx, cy, 0, cx, cy, edgeR);
        grd.addColorStop(0, 'rgba(255,255,255,1)');
        grd.addColorStop(Math.min(0.98, coreR / edgeR), 'rgba(255,255,255,1)');
        grd.addColorStop(1, 'rgba(255,255,255,0)');
        actx.fillStyle = grd;
        actx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);

        const { ctx } = this;
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.drawImage(am, 0, 0);
        ctx.restore();
    }

    // ── Tiles ────────────────────────────────────────────────────────────────

    _drawTiles(game) {
        const { ctx, half, sprites } = this;
        const sheet = sprites?.sewerTiles;
        const pad = 2;
        // Car (tile 19) is painted as ONE 2×2 sprite, not a 2×2 grid of four
        // 32px cars. The map keeps all four cells as id 19 (so the block stays a
        // non-walkable bump-to-interact obstacle — see main.js _interactCar);
        // this is purely a render special-case. Each car cell instead draws the
        // ground beneath it (sidewalk, the surrounding walkable surface) so no
        // cell reads as a hole, and the block's top-left cell is collected here
        // and drawn as a single 64×64 car (the full-res 48×48 sprite stretched
        // over the block) AFTER the tile loop — deferred so the other three
        // cells' ground (painted later in the loop) can't overpaint the
        // overhanging car.
        const carBlocks = [];
        for (let vy = -pad; vy < VIEW_TILES + pad; vy++) {
            for (let vx = -pad; vx < VIEW_TILES + pad; vx++) {
                const wx = game.playerX - half + vx;
                const wy = game.playerY - half + vy;
                const px = vx * TILE_PX - this._scrollX;
                const py = vy * TILE_PX - this._scrollY;
                const id = game.map.getTile(wx, wy);
                const def = game.map.getTileDef(wx, wy);

                // Car cell: substitute the ground sprite for the per-cell draw,
                // and remember the block's top-left for the deferred 64×64 pass.
                // Top-left = a tile-19 cell whose west and north neighbors aren't
                // tile 19 (generic 2×2-block corner detection).
                const isCar = id === 19;
                const drawId = isCar ? 11 : id;   // 11 = SIDEWALK (the surface the car is parked on)
                if (isCar && game.map.getTile(wx - 1, wy) !== 19 && game.map.getTile(wx, wy - 1) !== 19) {
                    carBlocks.push({ px, py });
                }

                // Lookup chain: sewer ids 0-7 → TILE_SPRITE_MAP,
                // town ids 10-21 → TOWN_TILE_SPRITE_MAP,
                // circus/factory/graveyard ids 30+ → ZONE_TILE_SPRITE_MAP.
                // Disjoint id ranges so order doesn't matter, but explicit
                // chain keeps the resolution path readable.
                const ref = TILE_SPRITE_MAP[drawId] || TOWN_TILE_SPRITE_MAP[drawId] || ZONE_TILE_SPRITE_MAP[drawId];
                let ok = false;
                if (ref) {
                    if (ref.region) {
                        // Pixel-region based (for large exterior sheets)
                        const regionSheet = sprites?.[ref.sheet];
                        if (regionSheet?.loaded) {
                            ok = regionSheet.drawRegion(ctx, ref.x, ref.y, ref.w, ref.h, px, py, TILE_PX, TILE_PX);
                        }
                    } else {
                        // Grid-based (for sewer tileset)
                        const tileSheet = ref.sheet ? sprites?.[ref.sheet] : sheet;
                        if (tileSheet?.loaded) {
                            ok = tileSheet.drawFrame(ctx, ref.col, ref.row, px, py, TILE_PX, TILE_PX);
                        }
                    }
                }
                if (!ok) {
                    ctx.fillStyle = def.fallbackColor;
                    ctx.fillRect(px, py, TILE_PX, TILE_PX);
                }
            }
        }

        // Deferred 2×2 car pass — one crisp car per block, anchored at the
        // top-left car cell (covers all four cells). The car sheet's single
        // 48×48 frame (full-res side-view sprite from roguelikeCity) is stretched
        // over the 64×64 block, so it reads sharp instead of pixel-doubling a
        // tiny 32px cell. Drawn after every cell's ground so the car overhang
        // isn't clipped by later ground draws. imageSmoothingEnabled stays false
        // (global default) → no blur on the upscale.
        const carSheet = sprites?.car;
        for (const b of carBlocks) {
            let ok = false;
            if (carSheet?.loaded) {
                ok = carSheet.drawFrame(ctx, 0, 0, b.px, b.py, TILE_PX * 2, TILE_PX * 2);
            }
            if (!ok) {
                // Car sheet not loaded — flat fill across the whole block in the
                // car tile's fallbackColor (data.js TILES.CAR), so it still reads
                // as one object, not four. Color inlined (TILES isn't imported here).
                ctx.fillStyle = '#884444';
                ctx.fillRect(b.px, b.py, TILE_PX * 2, TILE_PX * 2);
            }
        }
    }

    // ── Zone-exit markers ──────────────────────────────────────────────────────
    //
    // Transition tiles teleport the player to another zone, but they're drawn as
    // plain floor — so after the 4× map scale pushed exits to the edges, the
    // player couldn't tell which tiles are doors. This is a RENDER-ONLY overlay:
    // a soft pulsing gold glow + a bright arrow on every transition tile, the
    // arrow pointing OUTWARD toward the map edge it leads through. A multi-tile
    // door (several entries sharing a toMap along one edge) becomes a row/column
    // of arrows = an obvious gateway. When the player stands on or orthogonally
    // beside a transition, its `label` shows as a bottom-of-screen hint (mirrors
    // the AIM hint in _drawWheel). Touches NO map data or trigger logic.
    //
    // Called from renderFrame AFTER the day/night + arena + Wilderness dimming,
    // under a re-applied world transform, so the markers stay legible in the dark.
    _drawTransitions(game) {
        const trans = game.map?.transitions;
        if (!trans || !trans.length) return;
        const { ctx, half } = this;
        const mw = game.map.width, mh = game.map.height;

        // Pulse 0..1 (gold breathes). performance.now() matches the renderer's
        // other time-driven effects (shake, etc.); ~4.4 s period (2π·700 ms).
        const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 700);

        const EXIT = '255,205,90'; // warm gold — clearly not floor

        // Outward arrow direction = the dominant axis from the map CENTRE to the
        // tile. A door always sits near the edge it leads through, so center→tile
        // points outward — and this stays correct for doors set one tile INSIDE
        // the border (e.g. town's SEWER exit at x=32 in a 34-wide map, or the
        // factory's east exit at x=28 in 30), where a strict on-the-edge test
        // would wrongly fall through to 'down'. A truly central tile degenerates
        // gracefully to whichever axis dominates (or 'down' if dead-centre).
        const E = 0.5;
        const dirOf = (t) => {
            const dx = (t.x + 0.5) - mw / 2;
            const dy = (t.y + 0.5) - mh / 2;
            if (Math.abs(dx) < E && Math.abs(dy) < E) return 'down';
            if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
            return dy >= 0 ? 'down' : 'up';
        };

        let hintLabel = null; // shown if player is on/adjacent to a transition

        for (const t of trans) {
            // Adjacency for the label hint: on the tile or one orthogonal step
            // away. Recorded before any cull (an adjacent tile is always on-screen,
            // but this keeps the hint independent of the draw cull).
            const md = Math.abs(t.x - game.playerX) + Math.abs(t.y - game.playerY);
            if (md <= 1) hintLabel = t.label || hintLabel;

            const vx = t.x - game.playerX + half;
            const vy = t.y - game.playerY + half;
            // Cheap off-canvas cull (mirror the container/item pass margins).
            if (vx < -2 || vx > VIEW_TILES + 1 || vy < -2 || vy > VIEW_TILES + 1) continue;
            const px = vx * TILE_PX - this._scrollX;
            const py = vy * TILE_PX - this._scrollY;

            const cx = px + TILE_PX / 2, cy = py + TILE_PX / 2;

            // 1) Soft pulsing radial glow on the tile.
            const glowR = TILE_PX * (0.62 + 0.10 * pulse);
            const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
            g.addColorStop(0,   `rgba(${EXIT},${0.42 + 0.20 * pulse})`);
            g.addColorStop(0.6, `rgba(${EXIT},${0.16 + 0.10 * pulse})`);
            g.addColorStop(1,   `rgba(${EXIT},0)`);
            ctx.save();
            ctx.fillStyle = g;
            ctx.fillRect(px - TILE_PX * 0.5, py - TILE_PX * 0.5, TILE_PX * 2, TILE_PX * 2);

            // 2) Bright outward-pointing arrow (filled triangle). Built pointing
            // 'up' then rotated to the edge direction so all four share one path.
            const dir = dirOf(t);
            const rot = { up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 }[dir];
            const a = TILE_PX * 0.30;                 // arrow half-extent
            const lift = 1 + 1.5 * pulse;             // tiny outward throb
            ctx.translate(cx, cy);
            ctx.rotate(rot);
            ctx.translate(0, -lift);
            ctx.beginPath();
            ctx.moveTo(0, -a);                        // tip (outward)
            ctx.lineTo(a * 0.8, a * 0.5);             // back-right
            ctx.lineTo(0, a * 0.15);                  // notch (chevron feel)
            ctx.lineTo(-a * 0.8, a * 0.5);            // back-left
            ctx.closePath();
            ctx.fillStyle = `rgba(${EXIT},${0.85 + 0.15 * pulse})`;
            ctx.fill();
            ctx.lineWidth = 1;
            ctx.strokeStyle = 'rgba(60,40,10,0.8)'; // dark edge → reads on any floor
            ctx.stroke();
            ctx.restore();
        }

        // 3) Label hint — dark strip + centered label near the bottom, matching
        // the AIM hint in _drawWheel. Drawn in SCREEN space, so we undo the shake
        // translate this method is called under (keeps the strip rock-steady).
        if (hintLabel && this.font) {
            ctx.save();
            ctx.translate(-(this._shakeX || 0), -(this._shakeY || 0));
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.fillRect(0, CANVAS_PX - 24, CANVAS_PX, 24);
            // Plain ASCII only — the bitmap font (32-126) renders anything else
            // as '?', so use a hyphen separator, not an em dash.
            const hint = `EXIT - ${String(hintLabel).toUpperCase()}`;
            this.font.drawText(ctx, hint, CANVAS_PX / 2, CANVAS_PX - 16,
                { color: UI.gold, scale: 1, align: 'center', shadow: '#000' });
            ctx.restore();
        }
    }

    // ── Containers ───────────────────────────────────────────────────────────
    //
    // Placeholder chest rendering: dark-brown box with a gold lid stripe.
    // When the chest has contents, a small gold pip floats in the center to
    // distinguish "ripe to loot" from "already emptied." Sprite art is a
    // polish-pass concern (step 7); the box reads at a glance and that's
    // enough for now.

    _drawContainers(game) {
        const { ctx, half } = this;
        for (const c of game.containers) {
            const vx = c.x - game.playerX + half;
            const vy = c.y - game.playerY + half;
            if (vx < -2 || vx > VIEW_TILES + 1 || vy < -2 || vy > VIEW_TILES + 1) continue;
            const px = vx * TILE_PX - this._scrollX;
            const py = vy * TILE_PX - this._scrollY;

            // Body
            ctx.fillStyle = '#5a3a1a';
            ctx.fillRect(px + 6, py + 10, TILE_PX - 12, TILE_PX - 16);
            // Lid stripe
            ctx.fillStyle = '#c4a050';
            ctx.fillRect(px + 6, py + 10, TILE_PX - 12, 4);
            // Outline
            ctx.strokeStyle = '#2a1a08';
            ctx.lineWidth = 1;
            ctx.strokeRect(px + 6, py + 10, TILE_PX - 12, TILE_PX - 16);

            // Contents indicator — up to three gold pips along the lid, one
            // per item up to a visual cap of 3. Lets the player watch the
            // chest fill as workers deposit, without needing to read the log.
            if (c.contents.length > 0) {
                const pips = Math.min(3, c.contents.length);
                ctx.fillStyle = '#ffdd44';
                const pipSize = 3;
                const pipGap = 2;
                const totalWidth = pips * pipSize + (pips - 1) * pipGap;
                const startX = px + (TILE_PX - totalWidth) / 2;
                for (let i = 0; i < pips; i++) {
                    ctx.fillRect(startX + i * (pipSize + pipGap), py + 11, pipSize, pipSize);
                }
            }
        }
    }

    // ── Ground Items ─────────────────────────────────────────────────────────

    _drawGroundItems(game) {
        const { ctx, half, sprites } = this;
        for (const item of game.groundItems) {
            const vx = item.x - game.playerX + half;
            const vy = item.y - game.playerY + half;
            if (vx < -2 || vx > VIEW_TILES + 1 || vy < -2 || vy > VIEW_TILES + 1) continue;
            const px = vx * TILE_PX - this._scrollX;
            const py = vy * TILE_PX - this._scrollY;

            // Try sprite from ITEM_SPRITES
            const spr = ITEM_SPRITES[item.type];
            let drawn = false;
            if (spr && sprites?.[spr.sheet]?.loaded) {
                drawn = sprites[spr.sheet].drawRegion(ctx, spr.x, spr.y, spr.w, spr.h, px + 4, py + 4, 24, 24);
            }

            if (!drawn) {
                const info = ITEM_COLORS[item.type] || { bg: '#aaa', letter: '?' };
                ctx.fillStyle = '#000000aa';
                ctx.fillRect(px + 9, py + 9, 16, 16);
                ctx.fillStyle = info.bg;
                ctx.fillRect(px + 8, py + 8, 16, 16);
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 10px monospace';
                ctx.fillText(info.letter, px + 12, py + 20);
            }
        }
    }

    // ── Actors (enemies + player), depth-sorted ───────────────────────────────
    //
    // (depth/verticality pass) One painter's-algorithm pass over the whole cast.
    // Ground shadows are laid down first as a separate floor layer (so a nearer
    // character's shadow never paints over a farther character's sprite), then
    // sprites are drawn back→front by their feet-line screen Y. This is what lets
    // the player walk in front of — and behind — other characters correctly,
    // replacing the old "all enemies, then the player always on top" order.

    _drawActors(game) {
        const { half } = this;
        const now = performance.now();
        const actors = [];

        for (const e of game.enemies) {
            // Step-slide: enemies glide one tile instead of teleporting. Logic
            // (AI/collision) reads the snapped e.x/e.y; only the drawn position
            // lerps from the tile they left. (plans/movement-feel.md #6)
            let ex = e.x, ey = e.y;
            if (e._slideStart != null) {
                const st = Math.min(1, (now - e._slideStart) / (e._slideMs || 1));
                if (st < 1) {
                    ex = e._slideFromX + (e.x - e._slideFromX) * st;
                    ey = e._slideFromY + (e.y - e._slideFromY) * st;
                }
            }
            const vx = ex - game.playerX + half;
            const vy = ey - game.playerY + half;
            if (vx < -2 || vx > VIEW_TILES + 1 || vy < -2 || vy > VIEW_TILES + 1) continue;

            const isAlive = e.entity.isAlive();
            // Stagger (Phase C) knockback offset — only animates while alive.
            const staggerRemaining = isAlive ? (e._staggerUntil ?? 0) - now : 0;
            const staggerProgress = staggerRemaining > 0 ? staggerRemaining / 80 : 0;
            const offsetX = staggerProgress > 0 ? (e._staggerDx ?? 0) * staggerProgress : 0;
            const offsetY = staggerProgress > 0 ? (e._staggerDy ?? 0) * staggerProgress : 0;

            const px = vx * TILE_PX - this._scrollX + offsetX;
            const py = vy * TILE_PX - this._scrollY + offsetY;
            actors.push({ kind: 'enemy', e, px, py, dead: !isAlive, feetY: py + TILE_PX });
        }

        // The player draws at the fixed view center; the world scrolls under it.
        const { ppx, ppy } = this._playerScreenPos(game, now);
        actors.push({ kind: 'player', px: ppx, py: ppy, dead: false, feetY: ppy + TILE_PX });

        // Tall props (trees, posts) join the same sort, keyed on their base tile,
        // so the player passes in front of — and behind — them. Wider cull margin
        // since a prop's sprite overhangs its base tile.
        for (const p of (game.map?.propSpawns || [])) {
            const def = PROP_SPRITES[p.type];
            if (!def) continue;
            const vx = p.x - game.playerX + half;
            const vy = p.y - game.playerY + half;
            if (vx < -3 || vx > VIEW_TILES + 2 || vy < -3 || vy > VIEW_TILES + 2) continue;
            const px = vx * TILE_PX - this._scrollX;
            const py = vy * TILE_PX - this._scrollY;
            actors.push({ kind: 'prop', def, px, py, feetY: py + TILE_PX });
        }

        // Floor layer: lay every shadow down first so none can occlude a sprite
        // standing behind it. Props get a broader pool; corpses a fainter one.
        for (const a of actors) {
            if (a.kind === 'prop') this._drawGroundShadow(a.px + TILE_PX / 2, a.py + TILE_PX - 3, 0.32, a.def.shadowRx ?? 12, a.def.shadowRy ?? 4.5);
            else this._drawGroundShadow(a.px + TILE_PX / 2, a.py + TILE_PX - 4, a.dead ? 0.2 : 0.35);
        }

        // Painter's order: smaller feet-Y (further back / north) first. On a tie
        // the player draws last so it reads on top of a same-row NPC or prop.
        actors.sort((a, b) => (a.feetY - b.feetY) || (a.kind === 'player' ? 1 : -1));
        for (const a of actors) {
            if (a.kind === 'prop') this._drawPropSprite(a.def, a.px, a.py);
            else if (a.kind === 'player') this._drawPlayerSprite(game, a.px, a.py, now);
            else this._drawEnemySprite(game, a.e, a.px, a.py, now);
        }
    }

    // Soft elliptical drop-shadow on the ground beneath a character — a radial
    // gradient circle squashed vertically. Cheap, asset-free, and it grounds the
    // sprite so the idle bob reads as "lifting off the floor" instead of sliding.
    _drawGroundShadow(cx, cy, alpha, rx = 11, ry = 4.2) {
        const { ctx } = this;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(1, ry / rx);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
        g.addColorStop(0,    `rgba(0,0,0,${alpha})`);
        g.addColorStop(0.55, `rgba(0,0,0,${alpha * 0.72})`);
        g.addColorStop(1,    'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, rx, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // Draw a tall prop (tree/post) anchored at its base tile, scaled uniformly
    // (2x) from its source region so pixels stay crisp. Centered horizontally on
    // the base tile with the sprite's bottom on the tile's bottom edge, so the
    // overhang rises into the tiles above and depth-sorts for walk-behind.
    _drawPropSprite(def, px, py) {
        const { ctx, sprites } = this;
        const sheet = sprites?.[def.sheet];
        if (!sheet?.loaded) return;
        const dw = def.wTiles * TILE_PX;
        const dh = def.hTiles * TILE_PX;
        const dx = px + TILE_PX / 2 - dw / 2;   // center on the base tile
        const dy = py + TILE_PX - dh;           // bottom edge sits on the tile
        sheet.drawRegion(ctx, def.sx, def.sy, def.sw, def.sh, dx, dy, dw, dh);
    }

    // ── Enemies ──────────────────────────────────────────────────────────────
    //
    // Draw a single enemy/NPC sprite + overlays (hit-flash, HP bar, buff badges,
    // mood face, or corpse/KO marker) at a screen position resolved by
    // _drawActors. The body is unchanged from the old _drawEnemies loop; only the
    // position/cull/slide/stagger math moved up into _drawActors.

    _drawEnemySprite(game, e, px, py, now) {
        const { ctx, sprites } = this;
        const isAlive = e.entity.isAlive();
        // Hit-flash only animates while alive — corpses are static after death.
        const flashing = isAlive && (e._hitFlashUntil ?? 0) > now;

        // Sprite — same draw for alive and dead; the death state is expressed via
        // the gray tint overlay below, not a different sprite. Same walk/idle
        // animation as the player so the whole cast moves alike: bob + waddle
        // during a step-slide, idle breathe otherwise. Corpses stay still.
        const sliding = isAlive && e._slideStart != null && (now - e._slideStart) < (e._slideMs || 0);
        const ea = isAlive
            ? walkAnim(sliding, sliding ? Math.min(1, (now - e._slideStart) / (e._slideMs || 1)) : 0, e._stepIndex || 0, game._idleTick)
            : { bob: 0, rot: 0 };
        const eFlip = (isAlive && e._faceLeft) ? -1 : 1;
        const ecx = px + TILE_PX / 2, ecy = py + TILE_PX / 2;
        let ok = false;
        const info = ENEMY_SPRITES[e.type];
        withWalk(ctx, ecx, ecy, { bob: ea.bob, rot: ea.rot, flipX: eFlip }, () => {
            if (info && sprites?.[info.sheet]?.loaded) {
                const col = info.static
                    ? info.col
                    : (((game._idleTick || 0) % 2 === 0) ? 0 : 2);
                ok = sprites[info.sheet].drawFrame(ctx, col, info.row, px + 4, py + 4, TILE_PX - 8, TILE_PX - 8);
            }
            if (!ok) {
                ctx.fillStyle = isAlive ? '#cc4433' : '#555';
                ctx.fillRect(px + 6, py + 6, TILE_PX - 12, TILE_PX - 12);
            }
        });

        if (isAlive) {
            // Hit-flash overlay — alpha fades as the flash ages so it pops on the
            // first frame and decays. Heavier hits look heavier (duration scaled
            // in main.js combatAttack).
            if (flashing) {
                const flashDur = (e._hitFlashUntil ?? now) - now; // remaining
                const fade = Math.max(0, Math.min(1, flashDur / 120));
                ctx.fillStyle = `rgba(255, 60, 40, ${0.55 * fade})`;
                ctx.fillRect(px + 4, py + 4, TILE_PX - 8, TILE_PX - 8);
            }

            // HP bar above living enemy (with border). Suppressed for ambient
            // townsfolk (Town Clock) — a floating health bar over a peaceful
            // Violencian reads as a combat target.
            const frac = e.entity.hp / e.entity.maxHp;
            const bx = px + 4, by = py - 6, bw = TILE_PX - 8, bh = 5;
            if (!e.ambient) {
                ctx.fillStyle = '#000000cc';
                ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
                ctx.fillStyle = UI.hpBg;
                ctx.fillRect(bx, by, bw, bh);
                ctx.fillStyle = UI.hpRed;
                ctx.fillRect(bx, by, bw * frac, bh);
            }

            // Debuff / buff badges — one-letter colored markers stacked
            // horizontally above the HP bar. Buffs green, debuffs red; the letter
            // is the first character of the buff name uppercased.
            if (e.buffs && e.buffs.length > 0) {
                const badgeY = py - 20;
                let badgeX = px + 2;
                for (const b of e.buffs) {
                    ctx.fillStyle = '#000000cc';
                    ctx.fillRect(badgeX, badgeY, 9, 10);
                    if (this.font) {
                        const letter = (b.name?.[0] ?? '?').toUpperCase();
                        const color = b.type === 'buff' ? UI.buff : UI.debuff;
                        this.font.drawText(ctx, letter, badgeX + 1, badgeY + 1, {
                            color, scale: 1,
                        });
                    }
                    badgeX += 11;
                }
            }

            // (AGGRO meter) Mood smiley over the head — the same disposition face
            // the shop uses, floating above any NPC that HAS a disposition.
            // Mindless things show nothing. Sits above the HP bar; nudged higher
            // when buff badges occupy that row.
            if (e.disposition != null) {
                const faceR  = 6.5;
                const faceCX = px + TILE_PX / 2;
                const faceCY = (e.buffs && e.buffs.length > 0) ? py - 28 : py - 15;
                ctx.fillStyle = 'rgba(0,0,0,0.35)';   // soft backing for readability over busy sprites
                ctx.beginPath(); ctx.arc(faceCX, faceCY, faceR + 1.5, 0, Math.PI * 2); ctx.fill();
                this._drawMoodFace(faceCX, faceCY, mood(e.disposition).face, faceR);
            }

            // Ambient emote balloon (Town Clock) — a transient Kenney Emote Pack
            // speech balloon over the head, replacing the old grunt text: it pops
            // in from the tail, holds, then floats up and fades. Drawn last so it
            // sits above this NPC's other overhead UI.
            if (e._emote != null) {
                const col = EMOTE_SPRITES[e._emote];
                const sheet = sprites?.emotes;
                const age = now - (e._emoteStart || 0);
                const life = e._emoteMs || 1800;
                if (sheet?.loaded && col != null && age >= 0 && age < life) {
                    const t    = age / life;
                    const fade = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;  // hold, fade the last 30%
                    const pop  = age < 130 ? age / 130 : 1;          // quick inflate-in
                    const rise = 4 * t;                              // gentle float up
                    const sz   = 20 * pop;
                    const ex   = px + TILE_PX / 2 - sz / 2;
                    const ey   = (py - 6) - sz - rise;               // tail just above the head
                    ctx.save();
                    ctx.globalAlpha = Math.max(0, fade);
                    sheet.drawFrame(ctx, col, 0, ex, ey, sz, sz);
                    ctx.restore();
                }
            }
        } else {
            // Corpse — gray tint overlay turns the sprite into a faded version of
            // itself, marking it "defeated" without a separate corpse sprite.
            ctx.fillStyle = 'rgba(60, 60, 60, 0.55)';
            ctx.fillRect(px + 4, py + 4, TILE_PX - 8, TILE_PX - 8);

            // K.O. tag below — the player's permanent record of "you fought this
            // person here."
            if (this.font) {
                this.font.drawText(ctx, `[KO] ${e.type.toUpperCase()}`, px + TILE_PX / 2, py + TILE_PX - 2, {
                    color: '#9a8a78', scale: 1, align: 'center',
                });
            }
        }
    }

    // ── Wedged door (pipe-jam — zone pursuit) ───────────────────────────────
    // A dark plank slab with an X of pipe across the door you wedged shut, plus
    // an integrity bar that drains as the trapped pursuers pound it.
    _drawJammedDoor(game) {
        const j = game._jammedDoor;
        if (!j) return;
        const { ctx, half } = this;
        const vx = j.x - game.playerX + half;
        const vy = j.y - game.playerY + half;
        if (vx < -1 || vx > VIEW_TILES || vy < -1 || vy > VIEW_TILES) return;
        const px = vx * TILE_PX - this._scrollX;
        const py = vy * TILE_PX - this._scrollY;

        ctx.fillStyle = 'rgba(40,30,20,0.85)';
        ctx.fillRect(px + 3, py + 3, TILE_PX - 6, TILE_PX - 6);
        ctx.strokeStyle = '#b8b8b8';                 // the steel pipe wedged across
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(px + 6, py + 6); ctx.lineTo(px + TILE_PX - 6, py + TILE_PX - 6);
        ctx.moveTo(px + TILE_PX - 6, py + 6); ctx.lineTo(px + 6, py + TILE_PX - 6);
        ctx.stroke();

        const frac = Math.max(0, j.integrity / (j.max || 1));
        const bx = px + 4, by = py - 6, bw = TILE_PX - 8, bh = 4;
        ctx.fillStyle = '#000000cc';
        ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
        ctx.fillStyle = '#3a2a1a';
        ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = frac > 0.5 ? '#caa84a' : (frac > 0.25 ? '#d2802f' : '#d23f2f');
        ctx.fillRect(bx, by, bw * frac, bh);
    }

    // ── Floating damage numbers ──────────────────────────────────────────────
    //
    // Each particle floats upward and fades over its 600ms lifetime. The
    // particle stores its origin in tile-space so it tracks the camera
    // correctly if the player moves while the particle is alive.
    //
    // Rendering math: position offset is velocity × elapsed (in seconds);
    // alpha is the linear fade ramp (1 → 0) across lifetime. The text uses
    // a black drop-shadow so it's readable against any tile background.

    _drawDamageNumbers(game) {
        const { ctx, half } = this;
        const now = performance.now();
        for (const dn of game._damageNumbers) {
            const age = now - dn.bornAt;
            if (age >= dn.maxAge) continue; // expired (filtered next loop tick)

            // (combat-feel-pass) Typed hit-splats take the RuneScape-style badge
            // path with per-type motion. Untyped particles (overhead dialogue,
            // milestone words like K.O.) keep the original rise-and-fade below.
            if (dn.type) { this._drawHitSplat(game, dn, age); continue; }

            const t = age / 1000; // seconds
            const vx = dn.tileX - game.playerX + half;
            const vy = dn.tileY - game.playerY + half;
            // stackSlot adds a fixed pixel offset per slot so per-source
            // dialogue stacks chat-window-style (newest at speaker, older
            // rising). Particles without stackSlot (damage numbers, event
            // words) get slot 0 = no offset, behavior unchanged.
            const STACK_LINE_PX = 14;
            const slotOffset = (dn.stackSlot ?? 0) * STACK_LINE_PX;
            const px = vx * TILE_PX + TILE_PX / 2 - this._scrollX + dn.vx * t;
            const py = vy * TILE_PX + TILE_PX / 4 - this._scrollY + dn.vy * t - slotOffset;

            const alpha = 1 - age / dn.maxAge;

            // Scale-on-spawn — elastic ease-out from 0.5× → 1.0× over the
            // first 100ms gives every number a satisfying "pop" entrance.
            // Past 100ms it sits at 1×; past 500ms it starts shrinking again
            // as it fades, like a deflating balloon.
            let scaleMul = 1;
            if (age < 100) {
                const p = age / 100;
                // Cubic ease-out from 0.5 → 1.0
                scaleMul = 0.5 + 0.5 * (1 - Math.pow(1 - p, 3));
            } else if (age > dn.maxAge - 150) {
                const p = (age - (dn.maxAge - 150)) / 150;
                scaleMul = 1 - 0.2 * p; // shrink slightly while fading out
            }

            // Bitmap font path — pixel-perfect text with a black outline that
            // tracks the scale. Falls back to canvas text if the font failed
            // to load (defensive; main.js logs a warn in that case).
            if (this.font) {
                // Map dn.size (8-20px historically) to a bitmap scale
                // (1=8px, 2=16px, 3=24px). Round to nearest integer scale
                // so the pixels stay aligned. The scale-on-spawn modulates
                // this within a per-particle range.
                const baseScale = Math.max(1, Math.round(dn.size / 8));
                const scale = Math.max(1, Math.round(baseScale * scaleMul));
                // Per-source dialogue particles (sourceRef) get NO outline —
                // they're already on a contrast-friendly parchment bubble.
                // Damage numbers / event words DO get an outline since they
                // float over varied tile backgrounds.
                const hasOutline = !dn.sourceRef;
                const colorWithAlpha = hexToRgba(dn.color, alpha);
                const shadow = hasOutline ? `rgba(0, 0, 0, ${alpha * 0.85})` : null;
                this.font.drawText(ctx, dn.text, px, py, {
                    color: colorWithAlpha,
                    scale,
                    align: 'center',
                    shadow,
                });
            } else {
                // Fallback path retained — system monospace, alpha-faded.
                ctx.font = `bold ${Math.round(dn.size * scaleMul)}px monospace`;
                ctx.textAlign = 'center';
                ctx.fillStyle = `rgba(0, 0, 0, ${alpha * 0.8})`;
                ctx.fillText(dn.text, px + 1, py + 1);
                ctx.fillStyle = hexToRgba(dn.color, alpha);
                ctx.fillText(dn.text, px, py);
            }
        }
        ctx.textAlign = 'left'; // reset for downstream HUD draws
    }

    // (combat-feel-pass) Draw one RuneScape-style hit-splat: a colored badge
    // (color = damage type) carrying the number, with a per-type animation and
    // a directional/omni fan. Cheap canvas transforms; deterministic per hit.
    _drawHitSplat(game, dn, age) {
        const { ctx, half } = this;
        const m = this._hitSplatMotion(dn, age);
        const a = Math.max(0, Math.min(1, m.alpha));
        if (a <= 0.01) return;

        // Tile → screen (camera-tracked), then the per-type motion offset.
        const bx = (dn.tileX - game.playerX + half) * TILE_PX + TILE_PX / 2 - this._scrollX;
        const by = (dn.tileY - game.playerY + half) * TILE_PX + TILE_PX / 4 - this._scrollY;
        const x = bx + m.ox;
        const y = by + m.oy;

        const color = SPLAT_COLOR[dn.type] || SPLAT_COLOR.physical;
        const scale = 1;                          // bitmap font scale (8px glyphs — small)
        const big = dn.crit ? 1.2 : 1;
        const textW = dn.text.length * 8 * scale;
        // Round badge — radius fits the number plus a little pad, so short hits
        // read as a small circle rather than a wide oval.
        const r = (Math.max(textW, 8) / 2 + 6) * big;
        const w = r * 2 * (m.sx || 1);
        const h = r * 2 * (m.sy || 1);

        ctx.save();
        ctx.translate(x, y);

        // Heal halo — a soft radiant glow that pulses, then fades.
        if (m.glow > 0) {
            const r = w * 0.85;
            const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
            g.addColorStop(0, `rgba(255,250,205,${0.5 * m.glow * a})`);
            g.addColorStop(1, 'rgba(255,250,205,0)');
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
        }

        ctx.scale(m.scale, m.scale);

        // Badge — a round "splat", filled by type, with a border (gold = crit).
        ctx.beginPath();
        ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
        ctx.fillStyle = hexToRgba(color, a);
        ctx.fill();
        ctx.lineWidth = dn.crit ? 2 : 1.25;
        ctx.strokeStyle = dn.crit ? hexToRgba('#f0d782', a) : `rgba(255,255,255,${a * 0.55})`;
        ctx.stroke();

        // Number — white, centered, with a soft shadow for contrast.
        if (this.font) {
            this.font.drawText(ctx, dn.text, 0, -4, {
                color: hexToRgba('#ffffff', a),
                scale,
                align: 'center',
                shadow: `rgba(0,0,0,${a * 0.7})`,
            });
        }
        ctx.restore();
    }

    // (combat-feel-pass) Per-type motion for a hit-splat. Returns pixel offsets,
    // a uniform scale, axis stretch (sx/sy), alpha, and a heal-glow factor,
    // driven by `age` and the splat's launch direction / fan slot. Reduce-motion
    // dampens the amplitude. Pure math — no allocations beyond the small object.
    _hitSplatMotion(dn, age) {
        const reduce = Settings.get('reduceMotion');
        const k = reduce ? 0.45 : 1;
        const p = Math.min(1, age / dn.maxAge);
        const e = 1 - (1 - p) * (1 - p);                 // easeOut

        // Travel heading: along the blow (directional, fanned per slot) or fanned
        // around the target (omni). Directional also drifts up a touch.
        let ang;
        if (dn.dir) ang = Math.atan2(dn.dir.y, dn.dir.x) + dn.slot * 0.20;
        else ang = -Math.PI / 2 + dn.slot * (Math.PI * 2 / 6);
        const tx = Math.cos(ang), ty = Math.sin(ang);

        let alpha = 1;
        if (p < 0.12) alpha = p / 0.12;
        else if (p > 0.72) alpha = Math.max(0, 1 - (p - 0.72) / 0.28);

        let ox = 0, oy = 0, scale = 1, sx = 1, sy = 1, glow = 0;

        switch (dn.type) {
            case 'sludge':                                // oozes + drips DOWN
                scale = p < 0.18 ? 0.6 + 0.5 * (p / 0.18) : 1.1 - 0.1 * e;
                sy = 1 + 0.5 * e * k;
                sx = 1 - 0.12 * e * k;
                ox = tx * 6 * k;
                oy = 30 * e * k;
                break;
            case 'poison': {                              // rising rattle
                const shud = Math.sin(age * 0.05) * 4 * k;
                scale = p < 0.14 ? 0.6 + 0.4 * (p / 0.14) : 1;
                ox = tx * 10 * e * k + shud;
                oy = ty * 10 * e * k - 20 * e * k;
                break;
            }
            case 'fire':                                  // flicker + burn up
                alpha *= 0.6 + 0.4 * Math.sin(age * 0.045);
                scale = (p < 0.14 ? 0.7 + 0.3 * (p / 0.14) : 1) * (1 - 0.25 * p * k);
                ox = tx * 8 * e * k;
                oy = -26 * e * k;
                break;
            case 'heal':                                  // gentle float + holy glow
                scale = p < 0.2 ? 0.85 + 0.15 * (p / 0.2) : 1;
                oy = -22 * e * k;
                glow = (0.5 + 0.5 * Math.sin(age * 0.012)) * (1 - p);
                break;
            case 'miss':                                  // whiff sideways on the wind
                scale = p < 0.14 ? 0.7 + 0.3 * (p / 0.14) : 1;
                ox = (tx * 8 + 34 * e) * k;
                oy = (-10 * e - 4 * Math.sin(age * 0.01)) * k;
                break;
            case 'physical':
            default: {                                    // hard snappy pop (crit = bigger + further)
                const pop = dn.crit ? 1.6 : 1.3;
                const travel = dn.crit ? 26 : 16;
                const up = dn.crit ? 42 : 14;
                scale = p < 0.13 ? 0.5 + (pop - 0.5) * (p / 0.13)
                      : p < 0.30 ? pop - (pop - 1) * ((p - 0.13) / 0.17)
                      : 1;
                ox = tx * travel * e * k;
                oy = ty * travel * e * k - up * e * k;
                break;
            }
        }
        if (reduce) scale = 1 + (scale - 1) * 0.5;
        return { ox, oy, scale, sx, sy, alpha, glow };
    }

    // ── Player ───────────────────────────────────────────────────────────────

    // The player's screen position — fixed at the view center, nudged by the
    // Phase-C stagger knockback. The world scrolls under it, so unlike enemies it
    // has no slide term. Shared by the depth pass and the item-overlay backdrop.
    _playerScreenPos(game, now) {
        const { half } = this;
        const staggerRemaining = (game._playerStaggerUntil ?? 0) - now;
        const staggerProgress = staggerRemaining > 0 ? staggerRemaining / 80 : 0;
        const offsetX = staggerProgress > 0 ? (game._playerStaggerDx ?? 0) * staggerProgress : 0;
        const offsetY = staggerProgress > 0 ? (game._playerStaggerDy ?? 0) * staggerProgress : 0;
        return { ppx: half * TILE_PX + offsetX, ppy: half * TILE_PX + offsetY };
    }

    // Standalone player draw — used by the item-overlay backdrop, which dims the
    // world and shows only the player. The main world render routes the player
    // through _drawActors so it depth-sorts against the rest of the cast.
    _drawPlayer(game) {
        const now = performance.now();
        const { ppx, ppy } = this._playerScreenPos(game, now);
        this._drawPlayerSprite(game, ppx, ppy, now);
    }

    _drawPlayerSprite(game, ppx, ppy, now) {
        const { ctx, sprites } = this;
        const flashing = (game._playerHitFlashUntil ?? 0) > now;

        // ── Procedural walk animation (plans/movement-feel.md, feel pass) ─────
        // Single static front-facing sprite → "a person walking" via an integer
        // pixel bob + a small alternating rotation waddle (NO squash — that broke
        // the pixel ratio) + a horizontal flip to face left, plus a faint idle
        // breathe when standing. Shared verbatim with the enemies via walkAnim/
        // withWalk so the whole cast animates the same way.
        const a = walkAnim(game._animating, game._animProgress, game._stepIndex, game._idleTick);
        const flipX = (game.facing === 'left') ? -1 : 1;
        const cx = ppx + TILE_PX / 2, cy = ppy + TILE_PX / 2; // sprite center
        withWalk(ctx, cx, cy, { bob: a.bob, rot: a.rot, flipX }, () => {
            let ok = false;
            if (sprites?.player?.loaded) {
                ok = sprites.player.drawFrame(
                    ctx, PLAYER_SPRITE.col, PLAYER_SPRITE.row,
                    ppx + 4, ppy + 4, TILE_PX - 8, TILE_PX - 8
                );
            }
            if (!ok) {
                ctx.fillStyle = '#44bb44';
                ctx.fillRect(ppx + 6, ppy + 6, TILE_PX - 12, TILE_PX - 12);
            }
        });

        // Hit-flash overlay — red tint when the player just took damage.
        // Sharper alpha than the enemy flash since the player sprite tends
        // to be more visually prominent on a dark sewer floor.
        if (flashing) {
            ctx.fillStyle = 'rgba(255, 50, 30, 0.5)';
            ctx.fillRect(ppx + 4, ppy + 4, TILE_PX - 8, TILE_PX - 8);
        }
    }

    // ── HP Panel (top-left, parchment style) ─────────────────────────────────
    //
    // Three-resource stack: HP (red), MP (cyan), GP (gold card row). HP and
    // MP render as inset bars with a bitmap-font readout. GP renders as a
    // small "Gold Card" pill — an in-universe artifact (see
    // plans/gold-card.md): part rewards card, part bank account, part Town
    // ID. For the v1 HUD it's just a gold rectangle stamped "GP" with the
    // numeric balance trailing.
    //
    // Weapon stays at the bottom as a one-line summary.

    _drawHPPanel(game) {
        const { ctx } = this;
        const x = 6, y = 6, w = 170, h = 90;

        drawPanelSmall(ctx, x, y, w, h, this.uiSheet);

        const bx = x + 8, bw = w - 16, bh = 12;
        let by = y + 8;

        // — HP bar — always red per the violencetown palette (blood, not
        //   "danger" — the old green→red threshold was retired here).
        const hpFrac = game.playerHp / game.playerMaxHp;
        drawInset(ctx, bx, by, bw, bh);
        const hpW = (bw - 2) * hpFrac;
        ctx.fillStyle = UI.hpRed;
        ctx.fillRect(bx + 1, by + 1, hpW, bh - 2);
        ctx.fillStyle = '#e8674a';                       // glossy top highlight
        ctx.fillRect(bx + 1, by + 1, hpW, 1);
        if (this.font) {
            this.font.drawText(ctx, `HP ${game.playerHp}/${game.playerMaxHp}`, bx + 3, by + 2, {
                color: '#fff', scale: 1,
            });
        }
        by += bh + 4;

        // — MP bar — cyan. FIGHT → Magic spells spend from it; it regenerates a
        //   little each turn (MP_REGEN in main.js), so this drains and refills.
        const mpFrac = (game.playerMp ?? game.playerMaxMp) / (game.playerMaxMp ?? 100);
        drawInset(ctx, bx, by, bw, bh);
        const mpW = (bw - 2) * mpFrac;
        ctx.fillStyle = '#3a8ab0';
        ctx.fillRect(bx + 1, by + 1, mpW, bh - 2);
        ctx.fillStyle = '#6fc0e0';                       // glossy top highlight
        ctx.fillRect(bx + 1, by + 1, mpW, 1);
        if (this.font) {
            this.font.drawText(ctx, `MP ${game.playerMp ?? 0}/${game.playerMaxMp ?? 100}`, bx + 3, by + 2, {
                color: '#fff', scale: 1,
            });
        }
        by += bh + 4;

        // — Gold Card (GP) — an embossed credit-card chip (see plans/gold-card.md).
        this._drawGoldCard(game, bx, by, bw);
        by += 14 + 4;

        // — Weapon line at the bottom (informational; the hotbar carries
        //   the canonical inventory).
        const wpn = game.equipment.weapon;
        if (wpn && this.font) {
            const name = wpn.name.replace(/[\[\]]/g, '').toUpperCase();
            this.font.drawText(ctx, `${name}  ${wpn.damage} DMG`, x + 8, by, {
                color: UI.text, scale: 1,
            });
        }
    }

    // The Gold Card (GP) rendered as an embossed credit-card chip: a gold body
    // with an EMV contact pad on the left, a "GP" label, and the balance on the
    // right. Split out of _drawHPPanel so the card can grow its own flourishes.
    _drawGoldCard(game, cardX, cardY, cardW) {
        const { ctx } = this;
        const cardH = 14;
        // Bezel + gold body, embossed with a top highlight and a bottom shadow.
        ctx.fillStyle = '#1a1208';                      // dark bezel
        ctx.fillRect(cardX, cardY, cardW, cardH);
        ctx.fillStyle = UI.gold;                        // gold body
        ctx.fillRect(cardX + 1, cardY + 1, cardW - 2, cardH - 2);
        ctx.fillStyle = '#f4dd9a';                      // top highlight
        ctx.fillRect(cardX + 1, cardY + 1, cardW - 2, 1);
        ctx.fillStyle = '#a8894a';                      // bottom shadow
        ctx.fillRect(cardX + 1, cardY + cardH - 2, cardW - 2, 1);
        // EMV contact chip — a muted-gold pad with cross contact lines. Replaces
        // the old flat magnetic strip; reads as a real credit-card chip.
        const chipX = cardX + 4, chipY = cardY + 3, chipW = 12, chipH = 8;
        ctx.fillStyle = '#8b7340';
        ctx.fillRect(chipX, chipY, chipW, chipH);
        ctx.fillStyle = '#c9a955';
        ctx.fillRect(chipX + 1, chipY + 1, chipW - 2, chipH - 2);
        ctx.fillStyle = '#8b7340';
        ctx.fillRect(chipX + 1, chipY + Math.floor(chipH / 2), chipW - 2, 1);   // horizontal contact
        ctx.fillRect(chipX + Math.floor(chipW / 2), chipY + 1, 1, chipH - 2);   // vertical contact
        if (this.font) {
            this.font.drawText(ctx, 'GP', chipX + chipW + 4, cardY + 3, { color: '#2a2012', scale: 1 });
            this.font.drawText(ctx, `${game.gold ?? 0}`, cardX + cardW - 4, cardY + 3, {
                color: '#2a2012', scale: 1, align: 'right',
            });
        }
    }

    // ── Buff Bar (top-right) ─────────────────────────────────────────────────

    _drawBuffBar(game) {
        if (game.buffs.length === 0) return;
        const { ctx } = this;
        const bw = 52, bh = 26, gap = 3;
        const total = game.buffs.length;
        const totalW = total * (bw + gap) - gap + 12;
        const px = CANVAS_PX - totalW - 6, py = 6;

        drawPanelSmall(ctx, px, py, totalW, bh + 12, this.uiSheet);

        for (let i = 0; i < total; i++) {
            const buff = game.buffs[i];
            const bx = px + 6 + i * (bw + gap), by = py + 6;

            // Inset background
            drawInset(ctx, bx, by, bw, bh);

            // Name + turns
            if (this.font) {
                const nameColor = buff.type === 'debuff' ? UI.hpRed : UI.hpGreen;
                this.font.drawText(ctx, buff.name.toUpperCase().slice(0, 5), bx + 3, by + 3, {
                    color: nameColor, scale: 1,
                });
                this.font.drawText(ctx, `${buff.turns}`, bx + bw - 4, by + 14, {
                    color: UI.gold, scale: 1, align: 'right',
                });
            }
        }
    }

    // ── Quest Log (consolidated bottom-left "one box") ───────────────────────
    //
    // Stage 1 HUD consolidation: the five scattered top/bottom surfaces (zone
    // label, quest objective, clock, turn counter, and the rolling log strip)
    // collapse into ONE ornate parchment panel at QUESTLOG_RECT, clearing the
    // top of the screen entirely. Layout, top → bottom, inside ~8px padding:
    //
    //   (a) HEADER   : zone name (gold) · HH:MM · T:turn (dim)
    //   (b) OBJECTIVE: active quest text (gold), truncated to width; skipped
    //                  (feed shifts up one line) when there's no objective.
    //   (c) FEED     : last 3 log messages, category-tinted, age-faded, newest
    //                  at the bottom — chat-window convention.
    //
    // The bitmap font is 8px/char at scale 1 and lines advance 12px. With the
    // panel 104px tall the interior (after 8px top + bottom padding) is 88px =
    // room for header (12) + objective (12) + a 12px gap + three feed lines
    // (36) with margin to spare, so nothing spills past QUESTLOG_RECT.

    _drawQuestLog(game) {
        const { ctx } = this;
        const R = QUESTLOG_RECT;
        const PAD = 12;                      // buffer so text clears the ornate corners
        const LH = 12;                       // line height (8px glyph + 4px lead)
        const innerW = R.w - PAD * 2;
        const maxChars = Math.max(4, Math.floor(innerW / 8));

        drawPanelSmall(ctx, R.x, R.y, R.w, R.h, this.uiSheet);
        if (!this.font) return;

        const tx = R.x + PAD;
        let y = R.y + PAD;

        // (a) HEADER — LOCATION left-aligned, TIME right-aligned. (Turn counter
        // dropped for now per playtest; the two ends read like a title bar.)
        const zone = (game.map?.zoneName || '').toUpperCase();
        this.font.drawText(ctx, zone, tx, y, { color: UI.gold, scale: 1 });
        const timeStr = (typeof game._timeOfDay === 'function') ? game._timeOfDay() : '';
        if (timeStr) {
            this.font.drawText(ctx, timeStr, R.x + R.w - PAD, y, { color: UI.dim, scale: 1, align: 'right' });
        }
        y += LH;

        // (b) OBJECTIVE — active quest text (gold). Skip the line if none, so
        // the feed shifts up to fill the space.
        const objective = game.questEngine ? game.questEngine.getHudText() : null;
        if (objective) {
            let t = objective.toUpperCase();
            if (t.length > maxChars) t = t.slice(0, maxChars - 1) + '~';
            this.font.drawText(ctx, t, tx, y, { color: UI.gold, scale: 1 });
            y += LH;
        }

        // (c) MESSAGE FEED — last 3, oldest → newest, age-faded. Anchored to the
        // panel's bottom so a missing objective grows the visible feed upward.
        const messages = game._logStripMessages;
        if (!messages || messages.length === 0) return;
        const visible = messages.slice(-3);
        const alphas  = [0.5, 0.75, 1.0];    // oldest → newest
        const feedTop = R.y + R.h - PAD - visible.length * LH;
        const startY  = Math.max(y, feedTop);
        for (let i = 0; i < visible.length; i++) {
            const m = visible[i];
            const alpha = alphas[alphas.length - visible.length + i];
            const tinted = hexToRgba(this._logStripColor(m.category), alpha);
            let text = m.text;
            if (text.length > maxChars) text = text.slice(0, maxChars - 1) + '~';
            this.font.drawText(ctx, text, tx, startY + i * LH, { color: tinted, scale: 1 });
        }
    }

    // Map a log-strip message category to a parchment-palette tint. Falls
    // back to UI.text so unknown categories stay readable. Kept as its own
    // method so future categories slot in without touching _drawQuestLog.
    _logStripColor(category) {
        switch (category) {
            case 'combat':     return UI.hpRed;    // damage, deaths, fights
            case 'pickup':     return UI.hpGreen;  // items collected, gold
            case 'transition': return UI.gold;     // zone entries, milestones
            case 'system':
            default:           return UI.text;     // dark brown — default
        }
    }

    // ── Inventory Hotbar (bottom) ────────────────────────────────────────────

    _drawHotbar(game) {
        const { ctx, sprites } = this;
        const sw = HOTBAR_SLOT_W, sh = HOTBAR_SLOT_H, gap = HOTBAR_GAP;
        const count = HOTBAR_SLOTS;
        const totalW = HOTBAR_TOTAL_W;
        const ox = HOTBAR_OX;
        const oy = HOTBAR_OY;

        // Selected item tooltip above hotbar — name, description, and stats
        if (game.selectedSlot >= 0 && game.inventory[game.selectedSlot]) {
            const itemDef = game.inventory[game.selectedSlot].itemDef;
            const itemName = itemDef.name.replace(/[\[\]]/g, '');

            // Build stat line
            let statLine = '';
            if (itemDef.healAmount) statLine = `Heals ${itemDef.healAmount} HP`;
            else if (itemDef.damage) statLine = `${itemDef.useType === 'throw' ? 'Throw' : 'Melee'} ${itemDef.damage} dmg`;

            const desc = itemDef.description || '';
            const hasDesc = desc.length > 0;
            const hasStat = statLine.length > 0;
            const lines = 1 + (hasDesc ? 1 : 0) + (hasStat ? 1 : 0);
            const th = 10 + lines * 13;
            const tw = Math.max(itemName.length * 7 + 16, hasDesc ? Math.min(desc.length * 5.5 + 16, 300) : 0, 120);
            const tx = (CANVAS_PX - tw) / 2;
            const ty = oy - th - 6;

            // Item tooltip uses the dark variant so it reads as an
            // overlay above the parchment hotbar without clashing.
            drawPanelSmall(ctx, tx, ty, tw, th, this.uiSheet, 'dark');

            let lineY = ty + 4;

            // Name (uppercased for bitmap-font readability emphasis)
            if (this.font) {
                this.font.drawText(ctx, itemName.toUpperCase(), CANVAS_PX / 2, lineY, {
                    color: UI.gold, scale: 1, align: 'center',
                });
            }
            lineY += 11;

            // Stat line
            if (hasStat && this.font) {
                const statColor = itemDef.healAmount ? '#44ff88' : '#ffaa44';
                this.font.drawText(ctx, statLine.toUpperCase(), CANVAS_PX / 2, lineY, {
                    color: statColor, scale: 1, align: 'center',
                });
                lineY += 11;
            }

            // Description — fits more chars at 8px-per-glyph than the old 5.5px estimate
            if (hasDesc && this.font) {
                const maxChars = Math.floor((tw - 12) / 8);
                const truncated = desc.length > maxChars ? desc.slice(0, maxChars - 2) + '..' : desc;
                this.font.drawText(ctx, truncated, CANVAS_PX / 2, lineY, {
                    color: UI.dim || '#8a8070', scale: 1, align: 'center',
                });
            }
        }

        // Parchment background strip
        drawPanelSmall(ctx, ox, oy - 4, totalW, sh + 12, this.uiSheet);

        // Selected-slot pulse — same 2Hz heartbeat as the radial menu's
        // active slice so the two highlight surfaces feel consistent.
        const selPulse = 0.5 + 0.5 * Math.sin(performance.now() / 1000 * Math.PI * 2);

        for (let i = 0; i < count; i++) {
            const sx = HOTBAR_X_START + i * HOTBAR_STRIDE;
            const sy = HOTBAR_Y;
            const stack = game.inventory[i];
            const sel = game.selectedSlot === i;
            const isEmpty = !stack;

            // Slot frame — selected gets the parchment "glow" variant +
            // pulsing gold halo; unselected gets a flat dark inset.
            if (sel) {
                // Outer halo (gold, swelling with pulse)
                ctx.fillStyle = `rgba(212, 185, 106, ${0.3 + 0.4 * selPulse})`;
                ctx.fillRect(sx - 2, sy - 2, sw + 4, sh + 4);
            }
            drawInset(ctx, sx, sy, sw, sh);

            // Selected highlight border (always crisp, on top of the halo)
            if (sel) {
                ctx.strokeStyle = UI.gold;
                ctx.lineWidth = 2;
                ctx.strokeRect(sx - 1, sy - 1, sw + 2, sh + 2);
            }

            // Empty-slot opacity nudge — empty slots render at ~70%
            // opacity so the filled slots draw the eye first.
            const slotAlpha = isEmpty ? 0.7 : 1.0;
            const prevAlpha = ctx.globalAlpha;
            ctx.globalAlpha = slotAlpha;

            // Key number (top-left corner of slot)
            if (this.font) {
                this.font.drawText(ctx, `${i + 1}`, sx + 2, sy + 2, {
                    color: sel ? UI.gold : UI.textLight, scale: 1,
                });
            }

            // Reset alpha after the key number; item draw decides for itself.
            ctx.globalAlpha = prevAlpha;

            // Item
            if (stack) {
                // Try sprite
                const spr = ITEM_SPRITES[stack.itemDef.id];
                let drawn = false;
                if (spr && sprites?.[spr.sheet]?.loaded) {
                    drawn = sprites[spr.sheet].drawRegion(ctx, spr.x, spr.y, spr.w, spr.h, sx + 7, sy + 9, 24, 24);
                }
                if (!drawn) {
                    const info = ITEM_COLORS[stack.itemDef.id] || { bg: '#888', letter: '?' };
                    ctx.fillStyle = info.bg;
                    ctx.fillRect(sx + 9, sy + 11, 22, 22);
                    if (this.font) {
                        this.font.drawText(ctx, info.letter, sx + 16, sy + 17, {
                            color: '#fff', scale: 2,
                        });
                    }
                }

                // Stack count (bottom-right)
                if (stack.count > 1) {
                    // Dark backing for readability
                    ctx.fillStyle = '#000000aa';
                    ctx.fillRect(sx + sw - 16, sy + sh - 11, 14, 10);
                    if (this.font) {
                        this.font.drawText(ctx, `${stack.count}`, sx + sw - 3, sy + sh - 10, {
                            color: UI.gold, scale: 1, align: 'right',
                        });
                    }
                }
            }
        }
    }

    // ── Item Overlay ─────────────────────────────────────────────────────────

    _drawItemOverlay(game) {
        const { ctx, half } = this;
        const ui = this.uiSheet;
        const cx = half * TILE_PX + TILE_PX / 2;
        const cy = half * TILE_PX + TILE_PX / 2;

        // Phase D: slide-in animation. Options lerp from the player tile
        // center → their final positions over 80ms with ease-out, while
        // the panel alpha and option opacity ramp 0 → 1. This is the
        // "snappy" feel — the menu doesn't appear, it *arrives*.
        const now = performance.now();
        const openAt = game._overlayOpenedAt ?? now;
        const rawT = Math.min(1, Math.max(0, (now - openAt) / 80));
        const t = easeOutCubic(rawT);

        ctx.fillStyle = `rgba(0,0,0,${0.5 * t})`;
        ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);
        this._drawPlayer(game);

        const opts = game.overlayOptions;
        const finalPos = {
            up:    { x: OVERLAY_RECTS.up.x,    y: OVERLAY_RECTS.up.y },
            down:  { x: OVERLAY_RECTS.down.x,  y: OVERLAY_RECTS.down.y },
            left:  { x: OVERLAY_RECTS.left.x,  y: OVERLAY_RECTS.left.y },
            right: { x: OVERLAY_RECTS.right.x, y: OVERLAY_RECTS.right.y },
        };
        // ASCII fallback arrows since the bitmap font is plain ASCII —
        // ^ v < > read instantly as directional cues.
        const arr = { up: '^', down: 'V', left: '<', right: '>' };
        // Lerp source — center of the player tile, slightly above
        const src = { x: cx - 44, y: cy - 16 };

        const prevAlpha = ctx.globalAlpha;
        ctx.globalAlpha = t;
        for (const [dir, opt] of Object.entries(opts)) {
            if (!finalPos[dir]) continue;
            const fp = finalPos[dir];
            const px = src.x + (fp.x - src.x) * t;
            const py = src.y + (fp.y - src.y) * t;
            const w = 88, h = 32;

            drawPanelSmall(ctx, px, py, w, h, this.uiSheet);

            if (this.font) {
                const label = opt.label.toUpperCase();
                this.font.drawText(ctx, `${arr[dir]} ${label}`, px + 8, py + 12, {
                    color: UI.text, scale: 1,
                });
            }
        }
        ctx.globalAlpha = prevAlpha;
    }

    // ── Radial Menu (Omnitrix-style combat wheel) ────────────────────────────
    //
    // Six-slice inner wheel + on-demand outer arc for sub-options. The active
    // slice (game.radialInnerIndex) gets a gold highlight; if it's a category
    // with sub-options (Throw / Give / Skill), the outer arc renders showing
    // those options laid out along the same hemisphere as the inner slice.
    // When game.radialDrilled is true, the cursor is on the outer arc and the
    // sub-slice gets the highlight instead.

    _drawRadialMenu(game) { this._drawWheel(game); }

    // (Target List) A RuneScape-style vertical menu — the target named at the top,
    // its ordered verbs as rows (each in its colour-language hue), the selected row
    // highlighted, drawn in the ornate panel chrome. The ONLY non-radial target
    // surface, so it never gets confused with the action wheel.
    _drawTargetList(game) {
        const { ctx } = this; const ui = this.uiSheet; if (!this.font) return;
        const tl = game.targetList; if (!tl || !tl.verbs.length) return;
        ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX); ctx.restore();
        const RH = TARGET_LIST_ROW_H, px = TARGET_LIST_RECT.x, py = TARGET_LIST_RECT.y, w = TARGET_LIST_RECT.w;
        const h = 44 + tl.verbs.length * RH + 8;
        this._targetListRect = { x: px, y: py, w, h };   // stashed for the ✕ / tap-outside hit-test (menu grammar)
        if (ui?.loaded) drawPanelBig(ctx, ui, px, py, w, h, 'base');
        else            drawPanelSmall(ctx, px, py, w, h);
        const t = tl.target;
        const name = (t.npc && (t.npc.name || t.npc.type)) || (t.item && ((t.item.def && t.item.def.name) || t.item.type)) || (t.examinable && t.examinable.id) || '?';
        this.font.drawText(ctx, String(name).replace(/[\[\]]/g, '').toUpperCase().slice(0, 18), px + w / 2, py + 14, { color: UI.gold, scale: 1, align: 'center' });
        for (let i = 0; i < tl.verbs.length; i++) {
            const v = tl.verbs[i], sel = (i === tl.sel), ry = py + 44 + i * RH;
            if (sel) { ctx.fillStyle = 'rgba(212,185,106,0.18)'; ctx.fillRect(px + 8, ry - 2, w - 16, RH - 4); }
            const col = sel ? UI.textLight : (v.key === 'cancel' ? UI.dim : (v.color || UI.text));
            this.font.drawText(ctx, (sel ? '> ' : '  ') + v.label, px + 16, ry + 6, { color: col, scale: 1 });
        }
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }

    // (Target Wheel — "The Price is Right") A full pegged ring of the tapped
    // target's verbs: each a colour-language wedge, gold trim + rim pegs, the
    // selected verb spun under the top pointer, the target named in the hub.
    _drawTargetWheel(game) {
        const { ctx } = this;
        const tw = game.targetWheel; if (!tw || !tw.verbs || !tw.verbs.length) return;
        const cx = RADIAL_CENTER_X, cy = RADIAL_CENTER_Y, TOP = -Math.PI / 2;
        const n = tw.verbs.length, step = (Math.PI * 2) / n;
        // (§12.5) match the Player Wheel's fight re-skin so targeting a foe
        // mid-fight feels the same: red-ward wash + a soft rim vignette.
        const combat = isCombatActive(game);
        ctx.save();
        ctx.fillStyle = combat ? 'rgba(38,4,4,0.52)' : 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);
        if (combat) {
            const rg = ctx.createRadialGradient(cx, cy, CANVAS_PX * 0.34, cx, cy, CANVAS_PX * 0.72);
            rg.addColorStop(0, 'rgba(150,20,20,0)');
            rg.addColorStop(1, 'rgba(140,12,12,0.30)');
            ctx.fillStyle = rg; ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);
        }
        ctx.restore();
        const now = (typeof performance !== 'undefined') ? performance.now() : 0;
        const reduce = (typeof Settings !== 'undefined') && Settings.get && Settings.get('reduceMotion');
        let scale = 1;
        if (!reduce) { const ot = (now - (tw._openAt || 0)) / 160; if (ot >= 0 && ot < 1) { const s = ot * ot * (3 - 2 * ot); scale = 0.86 + 0.14 * s; } }
        ctx.save();
        if (scale !== 1) { ctx.translate(cx, cy); ctx.scale(scale, scale); ctx.translate(-cx, -cy); }
        const band = wheelRingR(0);
        const half = step / 2 - WHEEL_TILE_GAP;
        for (let i = 0; i < n; i++) {
            const v = tw.verbs[i], mid = TOP + (i - tw.sel) * step, isSel = (i === tw.sel);
            this._wheelTile(band[0], band[1], mid, half,
                v.color || '#6b5436', isSel ? 1 : 0.58,
                v.label, v.text || '#fff3d0',
                isSel ? { w: 3, c: '#fff3c0' } : { w: 1.5, c: '#d9b34a' },
                v.icon || null, isSel);   // (§12.4) selected verb rises
            const a = mid - step / 2, pr = band[1] + 3;
            ctx.beginPath(); ctx.arc(cx + Math.cos(a) * pr, cy + Math.sin(a) * pr, 3, 0, Math.PI * 2); ctx.closePath();
            ctx.fillStyle = '#e8c14f'; ctx.fill();
        }
        ctx.beginPath(); ctx.arc(cx, cy, WHEEL_HUB_R, 0, Math.PI * 2); ctx.closePath();
        ctx.fillStyle = 'rgba(30,24,16,0.95)'; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(212,185,106,0.6)'; ctx.stroke();
        if (this.font) {
            const t = tw.target;
            const name = (t.npc && (t.npc.name || t.npc.type)) || (t.item && ((t.item.def && t.item.def.name) || t.item.type)) || (t.examinable && t.examinable.id) || '?';
            this.font.drawText(ctx, String(name).replace(/[\[\]]/g, '').toUpperCase().slice(0, 9), cx, cy - 3, { color: UI.gold, scale: 1, align: 'center' });
        }
        const ppr = band[1] + 12;
        ctx.beginPath(); ctx.moveTo(cx, cy - ppr + 10); ctx.lineTo(cx - 7, cy - ppr); ctx.lineTo(cx + 7, cy - ppr); ctx.closePath();
        ctx.fillStyle = '#e8462f'; ctx.fill();
        // (§12.4) Flapper — the same brass clicker as the Player Wheel, ticking
        // against the rim pegs as verbs spin under the pointer.
        let flapAngle = 0;
        if (!reduce && tw._spinAt) {
            const fst = (now - tw._spinAt) / 120;
            if (fst >= 0 && fst < 1) flapAngle = flapperDeflection(fst, tw._spinDir || 0);
        }
        ctx.save();
        ctx.translate(cx, cy - band[1] - 26);
        ctx.rotate(flapAngle);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-4, 13); ctx.lineTo(4, 13); ctx.closePath();
        ctx.fillStyle = '#d9b34a'; ctx.fill();
        ctx.lineWidth = 1; ctx.strokeStyle = '#2a2218'; ctx.stroke();
        ctx.restore();
        ctx.restore();
        ctx.globalAlpha = 1; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }

    // (Phase 4) Journal — the "where am I in the quest" screen ([J]). Shows the
    // active quest as a stage CHECKLIST (done checked, current highlighted with
    // its location + description), the COMPLETED quests, and a scrollable WITNESS
    // LOG. Reads QuestEngine.getActiveQuestView / getCompletedTitles /
    // getJournalLines. Same ornate-panel chrome as the log modal.
    _drawJournal(game) {
        const { ctx } = this;
        const ui = this.uiSheet;
        if (!this.font) return;
        const R = JOURNAL_RECT;
        ctx.fillStyle = 'rgba(0,0,0,0.72)';
        ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);
        if (ui?.loaded) drawPanelBig(ctx, ui, R.x, R.y, R.w, R.h, 'base');
        else            drawPanelSmall(ctx, R.x, R.y, R.w, R.h);

        const qe = game.questEngine;
        const cx = CANVAS_PX / 2;
        const innerX = R.x + 22;
        const maxChars = Math.max(8, Math.floor((R.w - 56) / 8));
        let y = R.y + 16;

        this.font.drawText(ctx, 'JOURNAL', cx, y, { color: UI.gold, scale: 2, align: 'center' });
        y += 26;

        // Tabs: QUESTS | MAP (Tab / M switches).
        const tab = game._journalTab || 'quests';
        this.font.drawText(ctx, 'QUESTS', cx - 46, y, { color: tab === 'quests' ? UI.gold : UI.dim, scale: 1, align: 'center' });
        this.font.drawText(ctx, 'MAP',    cx + 46, y, { color: tab === 'map'    ? UI.gold : UI.dim, scale: 1, align: 'center' });
        y += 18;

        if (tab === 'map') {
            this._drawWorldMapBody(game, R, y);
            this.font.drawText(ctx, '▼ CLOSE · J    TAB/M SWITCH', cx, R.y + R.h - 12, { color: UI.dim, scale: 1, align: 'center' });
            ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
            return;
        }

        // Active quest — the stage checklist.
        const view = qe ? qe.getActiveQuestView() : null;
        if (view) {
            this.font.drawText(ctx, view.title.toUpperCase(), innerX, y, { color: UI.gold, scale: 1 }); y += 15;
            for (const st of view.stages) {
                const mark = st.done ? '✓' : st.current ? '▸' : '·';
                const col = st.done ? UI.dim : st.current ? UI.textLight : UI.text;
                for (const line of this._wrapText(`${mark} ${st.objective}`, maxChars)) {
                    this.font.drawText(ctx, line, innerX + 6, y, { color: col, scale: 1 }); y += 12;
                }
                if (st.current && st.location) { this.font.drawText(ctx, `   @ ${st.location}`, innerX + 6, y, { color: UI.gold, scale: 1 }); y += 12; }
                if (st.current && st.description) for (const line of this._wrapText(`   ${st.description}`, maxChars)) { this.font.drawText(ctx, line, innerX + 6, y, { color: UI.dim, scale: 1 }); y += 12; }
            }
        } else {
            this.font.drawText(ctx, 'No active quest.', innerX, y, { color: UI.dim, scale: 1 }); y += 15;
        }

        // Completed quests.
        const done = qe ? qe.getCompletedTitles() : [];
        if (done.length) {
            y += 6;
            this.font.drawText(ctx, 'COMPLETED', innerX, y, { color: UI.textLight, scale: 1 }); y += 14;
            for (const t of done) { this.font.drawText(ctx, `✓ ${t}`, innerX + 6, y, { color: UI.dim, scale: 1 }); y += 12; }
        }

        // Witness log — scrollable feed filling the rest of the panel.
        y += 8;
        this.font.drawText(ctx, 'WITNESS LOG', innerX, y, { color: UI.textLight, scale: 1 }); y += 14;
        const lines = [];
        for (const e of (qe ? qe.getJournalLines() : [])) for (const w of this._wrapText(e.text, maxChars)) lines.push(w);
        const bottom = R.y + R.h - 26;
        const rows = Math.max(1, Math.floor((bottom - y) / 12));
        const scroll = Math.max(0, Math.min(game._journalScroll || 0, Math.max(0, lines.length - rows)));
        const startI = Math.max(0, lines.length - rows - scroll);
        for (const line of lines.slice(startI, startI + rows)) { this.font.drawText(ctx, line, innerX + 6, y, { color: UI.text, scale: 1 }); y += 12; }

        this.font.drawText(ctx, '▼ CLOSE · J    ↑↓ SCROLL · TAB/M MAP', cx, R.y + R.h - 12, { color: UI.dim, scale: 1, align: 'center' });
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }

    // (Phase 4) The rudimentary world map — plain labeled boxes on a grid, one per
    // overworld screen, connector lines between neighbours. The current zone is
    // filled gold ("YOU"); the active quest's targetZone is ringed red ("» GO").
    // Old-Zelda subscreen style: flat boxes, no interior detail. `top` = the y to
    // start below the tab header.
    _drawWorldMapBody(game, R, top) {
        const { ctx } = this;
        const here = overworldZone(game.map && game.map.zoneName);
        const target = game.questEngine ? overworldZone(game.questEngine.getTargetZone()) : null;

        const cols = WORLD_ZONES.map(z => z.col), rows = WORLD_ZONES.map(z => z.row);
        const c0 = Math.min(...cols), c1 = Math.max(...cols), r0 = Math.min(...rows), r1 = Math.max(...rows);
        const bw = 92, bh = 40, gx = 26, gy = 20;
        const gridW = (c1 - c0) * (bw + gx) + bw;
        const gridH = (r1 - r0) * (bh + gy) + bh;
        const ox = R.x + Math.round((R.w - gridW) / 2);
        const oy = top + Math.round(((R.y + R.h - 30 - top) - gridH) / 2);
        const boxOf = (z) => ({ x: ox + (z.col - c0) * (bw + gx), y: oy + (z.row - r0) * (bh + gy), w: bw, h: bh });
        const centerOf = (z) => { const b = boxOf(z); return { x: b.x + b.w / 2, y: b.y + b.h / 2 }; };
        const byName = (n) => WORLD_ZONES.find(z => z.zoneName === n);

        // Connectors first (behind the boxes).
        ctx.strokeStyle = 'rgba(212,185,106,0.5)'; ctx.lineWidth = 2;
        for (const [a, b] of connectorPairs()) {
            const za = byName(a), zb = byName(b); if (!za || !zb) continue;
            const ca = centerOf(za), cb = centerOf(zb);
            ctx.beginPath(); ctx.moveTo(ca.x, ca.y); ctx.lineTo(cb.x, cb.y); ctx.stroke();
        }

        // Boxes.
        for (const z of WORLD_ZONES) {
            const b = boxOf(z);
            const isHere = z.zoneName === here;
            const isTarget = z.zoneName === target;
            ctx.fillStyle = isHere ? 'rgba(212,185,106,0.85)' : 'rgba(30,24,16,0.9)';
            ctx.fillRect(b.x, b.y, b.w, b.h);
            ctx.lineWidth = isTarget ? 3 : 2;
            ctx.strokeStyle = isTarget ? '#e8462f' : isHere ? '#fff3c0' : 'rgba(212,185,106,0.6)';
            ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
            if (!this.font) continue;
            const txtCol = isHere ? '#2a2010' : UI.text;
            this.font.drawText(ctx, z.label, b.x + b.w / 2, b.y + b.h / 2 - 4, { color: txtCol, scale: 1, align: 'center' });
            if (isHere)        this.font.drawText(ctx, 'YOU',  b.x + b.w / 2, b.y + b.h / 2 + 8, { color: '#7a2010', scale: 1, align: 'center' });
            else if (isTarget) this.font.drawText(ctx, '» GO', b.x + b.w / 2, b.y + b.h / 2 + 8, { color: '#e8462f', scale: 1, align: 'center' });
        }
    }

    // (§12.3) Examine → a modal INSPECT panel layered over the dimmed world:
    // a tier-coloured title, the tier label, the wrapped description, and a
    // dismiss hint. game.inspect = { title, tierName, tierColor, body }. The log
    // line + the examine quest event still fire from the caller; this is the
    // legible presentation layer. Blocks until any key / tap (see main.js).
    _drawInspectPanel(game) {
        const { ctx } = this;
        const ui = this.uiSheet;
        const insp = game.inspect;
        if (!insp || !this.font) return;

        ctx.fillStyle = 'rgba(0,0,0,0.72)';
        ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);

        const w = 400, padX = 22;
        const maxChars = Math.max(8, Math.floor((w - padX * 2) / 8));
        const bodyLines = this._wrapText(insp.body || '', maxChars);
        const hasTier = !!insp.tierName;
        const h = (hasTier ? 60 : 44) + bodyLines.length * 12 + 24;
        const px = Math.round((CANVAS_PX - w) / 2);
        const py = Math.round((CANVAS_PX - h) / 2);

        if (ui?.loaded) drawPanelBig(ctx, ui, px, py, w, h, 'glow');
        else            drawPanelSmall(ctx, px, py, w, h);

        const cx = CANVAS_PX / 2;
        let ty = py + 16;
        this.font.drawText(ctx, String(insp.title || 'Examine').toUpperCase(), cx, ty,
            { color: insp.tierColor || UI.gold, scale: 2, align: 'center' });
        ty += 24;
        if (hasTier) {
            this.font.drawText(ctx, String(insp.tierName).toUpperCase(), cx, ty,
                { color: insp.tierColor || UI.gold, scale: 1, align: 'center' });
            ty += 16;
        }
        ty += 4;
        const innerX = px + padX;
        for (const line of bodyLines) {
            this.font.drawText(ctx, line, innerX, ty, { color: UI.text, scale: 1 });
            ty += 12;
        }
        this.font.drawText(ctx, '▼ CLOSE · ANY KEY', cx, py + h - 14, { color: UI.dim, scale: 1, align: 'center' });
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }

    // One donut-wedge tile (a curved "Simon-Says" segment) + a centered label.
    // Angles in radians: `mid` = the tile's centre angle, `half` = half its width.
    _wheelTile(r0, r1, mid, half, fill, alpha, label, txtColor, outline, icon, dominant = false) {
        const { ctx } = this, cx = RADIAL_CENTER_X, cy = RADIAL_CENTER_Y;
        // (§12.4) the selected wedge "rises" — a touch wider + a longer outer
        // radius so the current choice reads as the hero slice at a glance.
        // Static emphasis (no pulse), so reduce-motion is unaffected.
        const r1d = dominant ? r1 + 4 : r1;
        const halfd = dominant ? half + 0.06 : half;
        ctx.beginPath();
        ctx.arc(cx, cy, r1d, mid - halfd, mid + halfd);
        ctx.arc(cx, cy, r0, mid + halfd, mid - halfd, true);
        ctx.closePath();
        ctx.globalAlpha = alpha; ctx.fillStyle = fill; ctx.fill(); ctx.globalAlpha = 1;
        if (dominant) {   // soft outer glow to lift the hero slice off the ring
            ctx.save(); ctx.globalAlpha = 0.5; ctx.lineWidth = 5;
            ctx.strokeStyle = 'rgba(255,243,192,0.55)'; ctx.stroke(); ctx.restore();
        }
        if (outline) { ctx.lineWidth = outline.w; ctx.strokeStyle = outline.c; ctx.stroke(); }
        if (!this.font) return;
        const lr = (r0 + r1d) / 2;
        const lx = cx + Math.cos(mid) * lr, ly = cy + Math.sin(mid) * lr;
        if (icon) {
            // (Phase 4) a monochrome glyph stacked over the label, in the tile's
            // TEXT colour (never a hue) — a colour-independent shape cue.
            this.font.drawText(ctx, icon, lx, ly - 11, { color: txtColor, scale: 1.4, align: 'center' });
            if (label) this.font.drawText(ctx, label, lx, ly + 3, { color: txtColor, scale: 1, align: 'center' });
        } else if (label) {
            this.font.drawText(ctx, label, lx, ly - 4, { color: txtColor, scale: 1, align: 'center' });
        }
    }

    // (sunburst wheel) Concentric radial menu: hub (MENU/breadcrumb tip) · greyed
    // decision-stack rings growing inward · one bright active ring (selection at
    // the TOP pointer) you spin · a partial preview arc of the highlight's children
    // fanning above the pointer. AIM/CONFIRM reuse the world reticle (see _render).
    _drawWheel(game) {
        const { ctx } = this;
        const cx = RADIAL_CENTER_X, cy = RADIAL_CENTER_Y, TOP = -Math.PI / 2;
        const w = game.wheel; if (!w) return;

        // ── AIM: bottom hint only; the world + reticle stay readable ──
        if (w.aiming) {
            if (this.font) {
                ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, CANVAS_PX - 24, CANVAS_PX, 24); ctx.restore();
                const hint = `${selectedNode(w).label.toUpperCase()}  ·  AIM — MOVE · SPACE FIRE · ↓ BACK`;
                this.font.drawText(ctx, hint, cx, CANVAS_PX - 16, { color: UI.gold, scale: 1, align: 'center', shadow: '#000' });
            }
            return;
        }

        // ── CONFIRM ("Plus Ultra"): about to strike a friendly ──
        if (w.confirming) {
            ctx.save(); ctx.fillStyle = 'rgba(48,0,0,0.55)'; ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX); ctx.restore();
            const tgt = w.reticle && game.enemies.find(e => e.entity.isAlive() && e.x === w.reticle.x && e.y === w.reticle.y);
            const name = String((tgt && (tgt.type || (tgt.entity && tgt.entity.name))) || 'them').replace(/[\[\]]/g, '').toUpperCase();
            if (this.font) {
                this.font.drawText(ctx, '!! PLUS ULTRA !!', cx, cy - 42, { color: '#ff5555', scale: 2, align: 'center', shadow: '#000' });
                this.font.drawText(ctx, `STRIKE ${name}?`, cx, cy - 8, { color: UI.gold, scale: 1, align: 'center', shadow: '#000' });
                this.font.drawText(ctx, "THEY'RE NOT YOUR ENEMY", cx, cy + 12, { color: UI.text, scale: 1, align: 'center', shadow: '#000' });
                this.font.drawText(ctx, '↑ AGAIN TO COMMIT  ·  ↓ BACK', cx, cy + 38, { color: '#e8dcc0', scale: 1, align: 'center', shadow: '#000' });
            }
            ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
            return;
        }

        // ── Sunburst ──
        // (§12.5) When a fight is live, re-skin the backdrop: a red-ward wash + a
        // soft rim vignette. Subtle — wedge colours stay untouched for legibility.
        const combat = isCombatActive(game);
        ctx.save();
        ctx.fillStyle = combat ? 'rgba(38,4,4,0.52)' : 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);
        if (combat) {
            const rg = ctx.createRadialGradient(cx, cy, CANVAS_PX * 0.34, cx, cy, CANVAS_PX * 0.72);
            rg.addColorStop(0, 'rgba(150,20,20,0)');
            rg.addColorStop(1, 'rgba(140,12,12,0.30)');
            ctx.fillStyle = rg; ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);
        }
        ctx.restore();

        const catNode = ROOT.children[w.path[0]];
        // (Phase 0) `HUE` = the current SECTION's colour — the deepest *ancestor*
        // along the path that defines one (excludes the selection itself) — so
        // uncolored leaves inherit their section (Magic → purple), not the top-level
        // category, and the accent reflects the tier you're in. Leaf wedges that
        // set their own `color` (Fireball ember, Cone of Cold ice) override it.
        let sectionColor = null, _sn = ROOT;
        for (let k = 0; k < w.path.length - 1; k++) { _sn = (_sn && _sn.children) ? _sn.children[w.path[k]] : null; if (_sn && _sn.color) sectionColor = _sn.color; }
        const HUE = sectionColor || (catNode && catNode.color) || ({ fight: '#c8443a', trick: '#cba43c', treat: '#4f9b4a' })[catNode && catNode.key] || '#8a5a2c';
        const depth = w.path.length;

        // The {ring, sel} at locked level d (0-based), walking the REAL tree.
        const ringAt = (d) => { let node = ROOT; for (let k = 0; k < d; k++) node = node.children[w.path[k]]; return { ring: node.children, sel: w.path[d] }; };

        // Compass cardinals: TOP (above) is the selection; the flanks are prev
        // (left) and next (right); the bottom is the reserved BACK.
        const RIGHT = 0, BOTTOM = Math.PI / 2, LEFT = Math.PI;
        const QHALF = Math.PI / 4 - WHEEL_TILE_GAP * 2;   // quadrant tile half-width
        const wrap = (i, m) => ((i % m) + m) % m;
        const tileEnabled = (node) => !node.placeholder && (!node.available || node.available(game)) && verbApplies(node, game);

        // ── (Phase 3 juice) easing reads performance.now() each frame — the menu
        //    render loop stays alive while the wheel is open (_hasActiveEffects).
        //    reduce-motion snaps everything to rest (no scale/rotation) but keeps
        //    colour + audio. Computed values are stashed on _wheelAnim so the
        //    animation can be probed headless (rAF is throttled there).
        const reduce = (typeof Settings !== 'undefined') && Settings.get && Settings.get('reduceMotion');
        const now = (typeof performance !== 'undefined') ? performance.now() : 0;
        const smooth = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
        let scale = 1, spin = 0;
        if (!reduce) {
            // Open overshoot: 0.85 → 1.05 → 1.0 over 180ms.
            const ot = (now - (game._overlayOpenedAt ?? 0)) / 180;
            if (ot >= 0 && ot < 1) scale = (ot < 0.55) ? 0.85 + 0.20 * smooth(ot / 0.55)
                                                        : 1.05 - 0.05 * smooth((ot - 0.55) / 0.45);
            // Drill / back re-center pop: a quick 0.90 → 1.0 punch on a depth change.
            const dt = (now - (w._drillAt ?? 0)) / 150;
            if (dt >= 0 && dt < 1) scale *= 0.90 + 0.10 * smooth(dt);
            // Spin sweep: the active ring rotates ±90° → 0 over 120ms after a cycle,
            // so the newly-selected tile sweeps up into the TOP slot.
            const st = (now - (w._spinAt ?? 0)) / 120;
            if (w._spinAt && st >= 0 && st < 1) spin = (w._spinDir || 0) * (Math.PI / 2) * (1 - smooth(st));
        }
        this._wheelAnim = { scale, spin, reduce: !!reduce };

        // Everything below the wash scales about the centre (the open/drill pop).
        ctx.save();
        if (scale !== 1) { ctx.translate(cx, cy); ctx.scale(scale, scale); ctx.translate(-cx, -cy); }

        // 1) Greyed decision breadcrumb: each locked parent's chosen tile at TOP,
        //    stacked inward toward the hub (innermost = the earliest choice).
        for (let d = 0; d < depth - 1; d++) {
            const r = ringAt(d), node = r.ring[r.sel], band = wheelRingR(d);
            this._wheelTile(band[0], band[1], TOP, QHALF, node.color || HUE, 0.3, node.label, '#9a8c70', null);
        }

        // 2) Active compass ring (outermost): top = selected, left = prev, right =
        //    next, bottom = reserved BACK. Options beyond prev/sel/next are OFF-SCREEN
        //    (spin to bring one into a slot); the pip carousel (§5) hints how many.
        const ring = activeRing(w), sel = activeIndex(w), n = ring.length;
        const activeBand = wheelRingR(depth - 1);
        // (Phase 4) verified monochrome glyphs — a colour-free shape cue per node.
        const WHEEL_ICONS = {
            fight: '⚔', trick: '♦', treat: '♥', flight: '»',
            melee: '⚔', ranged: '➹', magic: '✦',
            hit: '✶', cleave: '⚔', spin: '⟳',
            throw: '➹', defend: '⛊', bribe: '¤', trade: '⇄',
            eat: '♥', cleanse: '✧', run: '»', hide: '☾', wait: '⏱',
        };
        const drawSlot = (mid, node, isSel) => {
            const en = tileEnabled(node);
            // (Phase 0) each wedge paints from its own node.color/node.text; flanks
            // dim via alpha, so opening Fight reads red / amber / purple.
            const col = node.color || HUE;
            const txt = !en ? '#7a6c50' : (node.text || (isSel ? '#fff3d0' : '#e8dcc0'));
            this._wheelTile(activeBand[0], activeBand[1], mid, QHALF,
                col, en ? (isSel ? 1 : 0.5) : 0.32,
                node.placeholder ? '…' : node.label,
                txt,
                isSel ? { w: 3, c: '#fff3c0' } : null,
                node.placeholder ? null : WHEEL_ICONS[node.key],
                isSel && en);   // (§12.4) the live selection rises as the hero slice
        };
        // `spin` rotates the whole active ring (options + Back) so a cycle sweeps
        // the new selection up under the fixed pointer.
        drawSlot(TOP + spin, ring[sel], true);
        if (n >= 2) drawSlot(LEFT + spin,  ring[wrap(sel - 1, n)], false);
        if (n >= 2) drawSlot(RIGHT + spin, ring[wrap(sel + 1, n)], false);
        // Reserved BACK tile — down always collapses a level (or CLOSES at the root).
        this._wheelTile(activeBand[0], activeBand[1], BOTTOM + spin, QHALF, '#2c2620', 0.8,
            depth === 1 ? '▼ CLOSE' : '▼ BACK', '#b7a988', null);

        // 3) Preview arc (the highlight's children) — a couple of curved tiles above
        //    the pointer, last-used child centred; or a "fire" cue for a leaf.
        const kids = previewChildren(w);
        let outerMost = activeBand[1];
        if (kids.length) {
            const band = wheelRingR(depth); outerMost = band[1];
            const memIdx = Math.max(0, Math.min((w._memory && w._memory[w.path.join('.')]) ?? 0, kids.length - 1));
            const SPREAD = 0.42, HALF = 0.18;
            for (let off = -1; off <= 1; off++) {
                const j = memIdx + off; if (j < 0 || j >= kids.length) continue;
                const center = (off === 0);
                this._wheelTile(band[0], band[1], TOP + off * SPREAD, HALF,
                    center ? HUE : '#4a3c2a', center ? 0.66 : 0.4, kids[j].label,
                    center ? '#fff0cc' : '#b0a184', center ? { w: 2, c: '#e8cf90' } : null);
            }
        } else if (this.font) {
            this.font.drawText(ctx, '▲ FIRE', cx, cy - activeBand[1] - 16, { color: UI.gold, scale: 1, align: 'center', shadow: '#000' });
        }

        // 4) Hub disc + breadcrumb tip (MENU / Fight / Melee …).
        ctx.beginPath(); ctx.arc(cx, cy, WHEEL_HUB_R, 0, Math.PI * 2); ctx.closePath();
        ctx.fillStyle = 'rgba(30,24,16,0.95)'; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(212,185,106,0.6)'; ctx.stroke();
        if (this.font) { const dp = decisionPath(w); this.font.drawText(ctx, dp[dp.length - 1].toUpperCase(), cx, cy - 6, { color: UI.gold, scale: 1, align: 'center' }); }

        // 5) Off-screen carousel: one pip per active-ring option (selected filled),
        //    drawn on top of the hub — hints the options currently spun off-screen.
        if (n > 3) {
            const pipGap = 7, py = cy + 12, x0 = cx - (n - 1) * pipGap / 2;
            for (let i = 0; i < n; i++) {
                ctx.beginPath(); ctx.arc(x0 + i * pipGap, py, 2, 0, Math.PI * 2); ctx.closePath();
                ctx.fillStyle = (i === sel) ? '#fff3c0' : 'rgba(212,185,106,0.4)'; ctx.fill();
            }
        }

        // 6) Flapper-pointer ▼ at TOP: ONE downward clicker just outside the rim
        // that deflects in the spin direction as a slice sweeps under it, then
        // springs back to rest (wheel-of-fortune feel). Replaces the old static
        // pointer + a separate (upside-down) brass flapper — one element, so
        // there's no doubled pointer. Reduce-motion holds it still. (§12.4, fix)
        let flapAngle = 0;
        if (!reduce && w._spinAt) {
            const fst = (now - w._spinAt) / 120;
            if (fst >= 0 && fst < 1) flapAngle = flapperDeflection(fst, w._spinDir || 0);
        }
        ctx.save();
        ctx.translate(cx, cy - outerMost - 14);            // pivot just outside the outermost element
        ctx.rotate(flapAngle);
        ctx.beginPath(); ctx.moveTo(0, 12); ctx.lineTo(-7, 0); ctx.lineTo(7, 0); ctx.closePath();  // tip points DOWN into the wheel
        ctx.fillStyle = '#fff3c0'; ctx.fill();
        ctx.lineWidth = 1; ctx.strokeStyle = '#2a2218'; ctx.stroke();
        ctx.restore();

        ctx.restore();   // undo the open/drill scale transform

        // (§12.5) Threat readout — a compact combat banner (count + nearest foe)
        // while a fight is live; drawn in screen space so the wheel's pop can't
        // wobble it. Reuses the crossed-swords glyph the Fight wedge wears.
        if (combat && this.font) {
            const foes = (game.enemies || []).filter(e => !e.ambient && e.state === 'chasing' && e.entity && e.entity.isAlive());
            if (foes.length) {
                let near = foes[0], nd = Infinity;
                for (const e of foes) {
                    const d = Math.max(Math.abs(e.x - game.playerX), Math.abs(e.y - game.playerY));
                    if (d < nd) { nd = d; near = e; }
                }
                const nm = String(near.type || (near.entity && near.entity.name) || 'FOE').replace(/[\[\]]/g, '').toUpperCase().slice(0, 12);
                ctx.save(); ctx.fillStyle = 'rgba(40,0,0,0.6)'; ctx.fillRect(0, CANVAS_PX - 26, CANVAS_PX, 26); ctx.restore();
                this.font.drawText(ctx, `⚔ ${foes.length}  ${nm}`, cx, CANVAS_PX - 16, { color: '#e8462f', scale: 1, align: 'center', shadow: '#000' });
            }
        }
        ctx.globalAlpha = 1; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }

    // (combat-wheel rework) Aim reticle — drawn in WORLD space (call from inside
    // the camera transform). A dashed line from the player to the reticle tile,
    // plus a box on the target tile. BASIC; footprint/AoE is a later pass.
    _drawReticle(game) {
        const w = game.wheel;
        if (!w || (!w.aiming && !w.confirming) || !w.reticle) return;
        const { ctx, half } = this;
        const toScreen = (tx, ty) => ({
            x: (tx - game.playerX + half) * TILE_PX - this._scrollX,
            y: (ty - game.playerY + half) * TILE_PX - this._scrollY,
        });
        const r = toScreen(w.reticle.x, w.reticle.y);
        const p = toScreen(game.playerX, game.playerY);
        ctx.save();
        // AoE footprint — wash every tile the action will hit (cleave arc, throw/
        // fireball burst, cone). affectedTiles is the SAME function the damage uses,
        // so the wash is exactly what gets struck. Single-target verbs return one
        // tile → nothing extra washed, just the reticle box below.
        const tiles = affectedTiles(w, game);
        if (tiles.length > 1) {
            ctx.fillStyle = 'rgba(212,185,106,0.16)';
            for (const t of tiles) {
                const s = toScreen(t.x, t.y);
                ctx.fillRect(s.x + 1, s.y + 1, TILE_PX - 2, TILE_PX - 2);
            }
        }
        // Highlight every enemy that would be caught — the "show who's hit" cue.
        const alive = (game.enemies || []).filter(e => e.entity.isAlive());
        ctx.lineWidth = 2;
        for (const t of tiles) {
            const e = alive.find(en => en.x === t.x && en.y === t.y);
            if (!e) continue;
            const s = toScreen(t.x, t.y);
            ctx.fillStyle = 'rgba(230,80,60,0.24)';
            ctx.fillRect(s.x + 1, s.y + 1, TILE_PX - 2, TILE_PX - 2);
            ctx.strokeStyle = 'rgba(235,90,70,0.95)';
            ctx.strokeRect(s.x + 1.5, s.y + 1.5, TILE_PX - 3, TILE_PX - 3);
        }
        // Aim line from the player + the reticle box.
        ctx.strokeStyle = 'rgba(212,185,106,0.9)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(p.x + TILE_PX / 2, p.y + TILE_PX / 2);
        ctx.lineTo(r.x + TILE_PX / 2, r.y + TILE_PX / 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeRect(r.x + 1, r.y + 1, TILE_PX - 2, TILE_PX - 2);
        ctx.restore();
    }

    // ── Aggro / Line-of-Sight overlay ────────────────────────────────────────
    //
    // PURELY VISUAL, READ-ONLY. For every enemy that's currently ALERT (chasing,
    // i.e. the legacy-chase AI flipped e.state to 'chasing') and still alive, we
    // wash a faint gold sight ring at its true sightRange and — when the path to
    // the player is clear — thread a thin dashed gold line from the enemy to the
    // player. It reuses the EXACT Bresenham (`hasLineOfSight`) the chase logic
    // uses, so the line only shows when the enemy genuinely "sees" you.
    //
    // Aesthetic echoes the aim reticle / arena spotlight: low-alpha gold accent,
    // a gentle eased breath on the ring so it reads as "alive" without flicker.
    // Drawn in world space (same `_scrollX/Y` projection + caller's shake
    // translate) so it tracks tiles. Reduce-motion flattens the breath.
    _drawAggroOverlay(game) {
        const { ctx, half } = this;
        const now = performance.now();
        const reduce = (typeof Settings !== 'undefined') && Settings.get && Settings.get('reduceMotion');

        // Gentle 0..1 breath (~2.6s period). Reduce-motion holds it steady so the
        // ring is a calm static wash instead of a pulse.
        const breath = reduce ? 0.5 : (0.5 + 0.5 * Math.sin(now / 420));

        const toScreen = (tx, ty) => ({
            x: (tx - game.playerX + half) * TILE_PX - this._scrollX,
            y: (ty - game.playerY + half) * TILE_PX - this._scrollY,
        });

        for (const e of game.enemies) {
            // Only relevant enemies: alive AND actively alerted. The legacy chase
            // path sets e.state='chasing' on sighting (FSM enemies route through it
            // too), so this is the single "is hunting the player" signal. Anything
            // idle/wandering/working draws nothing — keeps the screen uncluttered.
            if (e.state !== 'chasing') continue;
            if (!e.entity?.isAlive()) continue;

            const c = toScreen(e.x + 0.5, e.y + 0.5);          // enemy tile center
            const radius = (e.sightRange || 0) * TILE_PX;
            if (radius <= 0) continue;

            // Cull if the whole ring is well off-canvas (cheap bounding test).
            if (c.x + radius < -TILE_PX || c.x - radius > CANVAS_PX + TILE_PX ||
                c.y + radius < -TILE_PX || c.y - radius > CANVAS_PX + TILE_PX) continue;

            ctx.save();

            // Sight ring — faint gold stroke, breath nudges alpha between ~0.08
            // and ~0.16 so it's always subtle. A radial gradient fill gives the
            // very softest interior tint without washing the tiles out.
            const ringA = 0.08 + 0.08 * breath;
            const g = ctx.createRadialGradient(c.x, c.y, radius * 0.55, c.x, c.y, radius);
            g.addColorStop(0,    'rgba(212,185,106,0)');
            g.addColorStop(0.85, `rgba(212,185,106,${0.05 * breath})`);
            g.addColorStop(1,    `rgba(212,185,106,${0.10 * breath})`);
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(c.x, c.y, radius, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = `rgba(212,185,106,${ringA + 0.04})`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(c.x, c.y, radius, 0, Math.PI * 2);
            ctx.stroke();

            // Line-of-sight thread — only when the path is genuinely clear (same
            // Bresenham the AI uses). A thin dashed red-gold line from the enemy
            // to the player: red shifts the read from "could see" (ring) to "sees
            // you now". Low alpha so it never dominates.
            if (hasLineOfSight(game.map, e.x, e.y, game.playerX, game.playerY)) {
                const p = toScreen(game.playerX + 0.5, game.playerY + 0.5);
                ctx.strokeStyle = `rgba(204,68,34,${0.18 + 0.12 * breath})`;
                ctx.lineWidth = 1.5;
                ctx.setLineDash([3, 4]);
                ctx.beginPath();
                ctx.moveTo(c.x, c.y);
                ctx.lineTo(p.x, p.y);
                ctx.stroke();
                ctx.setLineDash([]);
            }

            ctx.restore();
        }
    }

    // ── Throw Prompt ─────────────────────────────────────────────────────────

    _drawThrowPrompt(game) {
        const { ctx, half } = this;
        const cx = half * TILE_PX + TILE_PX / 2;
        const cy = half * TILE_PX + TILE_PX / 2;

        // ASCII arrows (the bitmap font is plain ASCII). ^ v < > read as
        // direction immediately and stay crisp at scale 2.
        const dirs = [
            { x: THROW_RECTS.up.x,    y: THROW_RECTS.up.y,    l: '^' },
            { x: THROW_RECTS.down.x,  y: THROW_RECTS.down.y,  l: 'V' },
            { x: THROW_RECTS.left.x,  y: THROW_RECTS.left.y,  l: '<' },
            { x: THROW_RECTS.right.x, y: THROW_RECTS.right.y, l: '>' },
        ];

        for (const d of dirs) {
            // 32×32 throw targets stay with the flat-fill fallback since
            // drawPanelSmall thresholds the 9-slice at 64px (corners
            // would overlap and degenerate at smaller sizes).
            drawPanelSmall(ctx, d.x, d.y, 32, 32, this.uiSheet);
            if (this.font) {
                this.font.drawText(ctx, d.l, d.x + 16, d.y + 8, {
                    color: UI.text, scale: 2, align: 'center',
                });
            }
        }
    }

    // (Legacy _drawWinOverlay removed with the tile-7 boss-trigger trap —
    //  fix/critical-path. The real ending is _drawEndingOverlay below.)

    // ── Ending Overlay (End of Chapter One) ──────────────────────────────────
    //
    // The real main-quest ending (fix/critical-path). Driven by game.state
    // 'ending' (set in Game._endChapterOne from fix_car's onComplete). A clean
    // canvas card — no DOM — that gives the burger courier his car-running beat
    // and offers a restart. Mirrors the win-overlay drawing vocabulary (glow
    // panel + bitmap font) so it sits inside the established art style.
    _drawEndingOverlay(game) {
        const { ctx } = this;
        const ui = this.uiSheet;

        // Full dark wash — the world recedes; this is a "chapter card", not a
        // small toast over live play.
        ctx.fillStyle = 'rgba(0,0,0,0.82)';
        ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);

        const w = 460, h = 300;
        const px = (CANVAS_PX - w) / 2, py = (CANVAS_PX - h) / 2;
        if (ui?.loaded) drawPanelBig(ctx, ui, px, py, w, h, 'glow');
        else            drawPanelSmall(ctx, px, py, w, h);

        if (!this.font) return;
        const cx = CANVAS_PX / 2;

        // Title
        this.font.drawText(ctx, 'END OF', cx, py + 34, { color: UI.textLight, scale: 1, align: 'center' });
        this.font.drawText(ctx, 'CHAPTER ONE', cx, py + 52, { color: UI.gold, scale: 2, align: 'center' });

        // Outro — short and tasteful. Kept to the bitmap font's ASCII set.
        const lines = [
            'The cataclysmic converter clicks home.',
            'The engine catches. The car ROARS to life.',
            '',
            'Somewhere across Violencetown, a burger',
            'is getting cold. Not your problem yet.',
            'Tonight, the courier just drives.',
        ];
        let ly = py + 96;
        for (const line of lines) {
            if (line) this.font.drawText(ctx, line, cx, ly, { color: UI.text, scale: 1, align: 'center' });
            ly += 18;
        }

        // Stat line + restart prompt
        const turns = game._endingTurns ?? game.turn;
        this.font.drawText(ctx, `${turns} TURNS`, cx, py + h - 56, { color: UI.textLight, scale: 1, align: 'center' });
        this.font.drawText(ctx, 'PRESS N TO PLAY AGAIN', cx, py + h - 34, { color: UI.gold, scale: 1, align: 'center' });
        this.font.drawText(ctx, '(OR TAP)', cx, py + h - 18, { color: UI.textLight, scale: 1, align: 'center' });
    }

    // ── Log Modal ([L]) ──────────────────────────────────────────────────────
    // Full scrollable message history (game._logHistory). Geometry mirrors
    // LOG_MODAL_RECT in main.js so touch hit-testing lines up. Lines hard-wrap
    // to the panel width; the newest sits at the bottom and _logModalScroll
    // (clamped here, then written back) pages toward older lines.
    _drawLogModal(game) {
        const { ctx } = this;
        const ui = this.uiSheet;

        ctx.fillStyle = 'rgba(0,0,0,0.72)';
        ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);

        const px = LOG_MODAL_RECT.x, py = LOG_MODAL_RECT.y, w = LOG_MODAL_RECT.w, h = LOG_MODAL_RECT.h;
        if (ui?.loaded) drawPanelBig(ctx, ui, px, py, w, h, 'base');
        else            drawPanelSmall(ctx, px, py, w, h);

        if (!this.font) return;

        this.font.drawText(ctx, 'MESSAGE LOG', CANVAS_PX / 2, py + 16, {
            color: UI.gold, scale: 2, align: 'center',
        });

        const padX = 24;
        const textX = px + padX;
        const charsPerLine = Math.max(8, Math.floor((w - padX * 2) / 8)); // 8px glyph @ scale 1
        const contentTop = py + 56;
        const contentBottom = py + h - 30;
        const lineH = 12;
        const visibleLines = Math.max(1, Math.floor((contentBottom - contentTop) / lineH));

        const hist = game._logHistory || [];
        if (hist.length === 0) {
            this.font.drawText(ctx, 'No messages yet.', CANVAS_PX / 2, contentTop + 12, {
                color: UI.dim, scale: 1, align: 'center',
            });
            return;
        }

        // Wrap each entry into display lines (oldest first → newest at bottom).
        const lines = [];
        for (const m of hist) {
            const color = this._logStripColor(m.category);
            const t = m.text;
            if (t.length <= charsPerLine) {
                lines.push({ text: t, color });
            } else {
                for (let i = 0; i < t.length; i += charsPerLine) {
                    lines.push({ text: t.slice(i, i + charsPerLine), color });
                }
            }
        }

        const total = lines.length;
        const maxScroll = Math.max(0, total - visibleLines);
        let scroll = game._logModalScroll || 0;
        if (scroll > maxScroll) scroll = maxScroll;
        game._logModalScroll = scroll;            // write the clamp back

        const start = Math.max(0, total - visibleLines - scroll);
        const end = Math.min(total, start + visibleLines);
        for (let i = start; i < end; i++) {
            this.font.drawText(ctx, lines[i].text, textX, contentTop + (i - start) * lineH, {
                color: lines[i].color, scale: 1,
            });
        }

        // Footer row: older/newer affordances flank the centered close hint.
        const footerY = py + h - 16;
        if (start > 0) {
            this.font.drawText(ctx, '^ OLDER', textX, footerY, { color: UI.dim, scale: 1 });
        }
        if (end < total) {
            this.font.drawText(ctx, 'NEWER v', px + w - padX, footerY, {
                color: UI.dim, scale: 1, align: 'right',
            });
        }
        this.font.drawText(ctx, 'L / ESC TO CLOSE', CANVAS_PX / 2, footerY, {
            color: UI.textLight, scale: 1, align: 'center',
        });
    }

    // ── Trade window (Puck's shop — trade slice 1) ──────────────────────────
    // Two 3-wide grids on one parchment panel: BUY (the vendor's stock) and SELL
    // (the player's bag). A mood smiley + GP readout sit up top; a bribe button
    // and hint sit at the bottom. Cell rects come from layout.tradeCellRect, the
    // same source main._tapTrade hit-tests against, so taps land on what's drawn.
    _drawTradeModal(game) {
        const { ctx } = this;
        const ui = this.uiSheet;
        const npc = game._tradeNpc;
        if (!npc) return;

        ctx.fillStyle = 'rgba(0,0,0,0.72)';
        ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);

        const R = TRADE_MODAL_RECT;
        if (ui?.loaded) drawPanelBig(ctx, ui, R.x, R.y, R.w, R.h, 'base');
        else            drawPanelSmall(ctx, R.x, R.y, R.w, R.h);
        if (!this.font) return;

        const disp = npc.disposition ?? 0;
        const dealing = canTrade(disp);
        const m = mood(disp);
        // Three modes share this one modal:
        //  • shop  (a vendor)      — BUY (priced) + SELL columns + bribe.
        //  • offer (a non-vendor)  — one satchel→NPC give column (Phase 6a).
        //  • loot  (a chest shim)  — a zero-cost TAKE column, no mood/bribe/sell
        //                            (Phase 6b: chests route through this window).
        const container = !!npc._container;
        const offerMode = !container && !npc.vendor;

        // Title
        const title = container ? `THE ${(npc.type || 'CHEST').toUpperCase()}`
                    : offerMode ? `OFFER TO ${(npc.type || 'SOMEONE').toUpperCase()}`
                                : `${(npc.type || 'TRADER').toUpperCase()}'S TILL`;
        this.font.drawText(ctx, title, CANVAS_PX / 2, R.y + 14, { color: UI.gold, scale: 2, align: 'center' });

        // Mood row — smiley + label on the left, GP on the right. A chest has no
        // mood, so it only shows the player's GP.
        const moodY = R.y + 48;
        if (!container) {
            this._drawMoodFace(R.x + 26, moodY, m.face);
            this.font.drawText(ctx, m.mood.toUpperCase(), R.x + 44, moodY - 3, { color: (dealing || offerMode) ? UI.textLight : UI.hpRed, scale: 1 });
        }
        this.font.drawText(ctx, `GP ${game.gold ?? 0}`, R.x + R.w - 24, moodY - 6, { color: UI.gold, scale: 2, align: 'right' });

        // Left-column header: TAKE (chest) / BUY (vendor) / — (offer has none).
        if (container)       this.font.drawText(ctx, 'TAKE', TRADE_BUY_ORIGIN.x, TRADE_BUY_ORIGIN.y - 18, { color: UI.gold, scale: 1 });
        else if (!offerMode) this.font.drawText(ctx, 'BUY',  TRADE_BUY_ORIGIN.x, TRADE_BUY_ORIGIN.y - 18, { color: UI.gold, scale: 1 });
        if (!container) this.font.drawText(ctx, offerMode ? 'OFFER' : 'SELL', TRADE_SELL_ORIGIN.x, TRADE_SELL_ORIGIN.y - 18, { color: UI.gold, scale: 1 });

        // LEFT grid — chest TAKE cells (0 GP) or vendor BUY cells (priced).
        if (container || !offerMode) {
            const stock = npc.stock || [];
            for (let i = 0; i < stock.length; i++) {
                const itemDef = ITEMS[stock[i]];
                if (!itemDef) continue;
                if (container) {
                    this._drawTradeCell(itemDef, tradeCellRect(TRADE_BUY_ORIGIN, i), 0, true);   // free
                } else {
                    const price = dealing ? buyPrice(itemDef, disp) : null;
                    this._drawTradeCell(itemDef, tradeCellRect(TRADE_BUY_ORIGIN, i), price, dealing && price != null);
                }
            }
            if (container && stock.length === 0) {
                this.font.drawText(ctx, 'EMPTY', TRADE_BUY_ORIGIN.x, TRADE_BUY_ORIGIN.y + 8, { color: UI.dim, scale: 1 });
            }
        }

        // RIGHT grid — shop SELL / offer give column. A chest has no right column.
        if (!container) {
            const sell = game._tradeSell || [];
            for (let i = 0; i < sell.length; i++) {
                const itemDef = sell[i].itemDef;
                if (offerMode) {
                    // Quest items can't be handed away (pre-prod review): draw them
                    // DIMMED + non-tappable with the ◆ marker; regular items are a
                    // lit ♥ give cell.
                    const q = itemDef.questItem;
                    this._drawTradeCell(itemDef, tradeCellRect(TRADE_SELL_ORIGIN, i), null, !q, q ? '◆' : '♥');
                } else {
                    // (Phase 6d) A special-buyer pays a fixed price for an oddment
                    // sellPrice() refuses. Quest items are EXCLUDED (pre-prod review:
                    // the car-fix Converter must not be sellable), so they fall
                    // through to the dimmed "—" like any unsellable item.
                    const special = (!itemDef.questItem && npc.specialBuys) ? npc.specialBuys[itemDef.id] : null;
                    if (special != null) {
                        this._drawTradeCell(itemDef, tradeCellRect(TRADE_SELL_ORIGIN, i), special, true);
                    } else {
                        const price = dealing ? sellPrice(itemDef, disp) : null;
                        this._drawTradeCell(itemDef, tradeCellRect(TRADE_SELL_ORIGIN, i), price, dealing && price != null);
                    }
                }
            }
            if (sell.length === 0) {
                this.font.drawText(ctx, 'BAG EMPTY', TRADE_SELL_ORIGIN.x, TRADE_SELL_ORIGIN.y + 8, { color: UI.dim, scale: 1 });
            }
        }

        // (Phase 6c) BUYBACK row — vendor only. Items you sold this window, still
        // re-buyable at the LOCKED price, with a live countdown to the window's
        // close. Refunds (buy→sell-back) ride the SELL column, so only re-buyable
        // sold items need their own row here. Capped at TRADE_COLS for one row.
        if (!container && !offerMode && npc._buyback && game._buybackList) {
            const remaining = game._buybackRemainingMs(npc);
            const bb = game._buybackList(npc);
            if (bb.length > 0) {
                const secs = Math.ceil(remaining / 1000);
                const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
                this.font.drawText(ctx, `BUYBACK  ${clock}`, TRADE_BUYBACK_ORIGIN.x, TRADE_BUYBACK_ORIGIN.y - 18, { color: UI.gold, scale: 1 });
                for (let i = 0; i < bb.length && i < TRADE_COLS; i++) {
                    const def = ITEMS[bb[i].itemId];
                    if (!def) continue;
                    this._drawTradeCell(def, tradeCellRect(TRADE_BUYBACK_ORIGIN, i), bb[i].price, true);
                }
            }
        }

        // Bribe button — shop/offer only (a chest can't be bribed).
        if (!container) {
            const B = TRADE_BRIBE_RECT;
            const cost = bribeStepCost(disp);
            const maxed = disp >= 100;
            const canBribe = !maxed && (game.gold ?? 0) >= cost;
            drawInset(ctx, B.x, B.y, B.w, B.h);
            ctx.fillStyle = canBribe ? 'rgba(212,185,106,0.18)' : 'rgba(0,0,0,0.15)';
            ctx.fillRect(B.x + 1, B.y + 1, B.w - 2, B.h - 2);
            const bribeLabel = maxed ? 'MOOD MAXED' : `BRIBE +${BRIBE_STEP}  ${cost} GP`;
            this.font.drawText(ctx, bribeLabel, B.x + B.w / 2, B.y + B.h / 2 - 3, {
                color: canBribe ? UI.gold : UI.dim, scale: 1, align: 'center',
            });
        }

        // Footer hint.
        const footer = container ? 'TAP TO TAKE    E / ESC CLOSE'
                     : offerMode ? 'TAP TO GIVE    B BRIBE    E / ESC CLOSE'
                                 : 'TAP TO BUY / SELL    B BRIBE    E / ESC CLOSE';
        this.font.drawText(ctx, footer, CANVAS_PX / 2, R.y + R.h - 16, {
            color: UI.textLight, scale: 1, align: 'center',
        });
    }

    // One shop cell: inset frame, item icon, price under it. `enabled` false
    // (won't-deal, or unsellable like a quest item) dims the cell and the price
    // shows as "—". `marker` (Phase 6a offer mode) replaces the price with a
    // give/quest glyph drawn in gold, and the cell stays fully lit. (Phase 6d) A
    // value-tier colour bar rides the cell's top edge for at-a-glance rarity.
    _drawTradeCell(itemDef, r, price, enabled, marker) {
        const { ctx } = this;
        drawInset(ctx, r.x, r.y, r.w, r.h);
        const prevAlpha = ctx.globalAlpha;
        // Dim a disabled cell — including a marker cell that's disabled, e.g. a
        // quest item in offer mode that can't be handed away (pre-prod review).
        if (!enabled) ctx.globalAlpha = 0.45;

        // (Phase 6d) tier bar — a 3px band of the item's rarity colour at the top.
        const tier = itemTier(itemDef);
        ctx.fillStyle = tier.color;
        ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, 3);

        const iconSize = 32;
        this._drawItemIcon(itemDef, r.x + (r.w - iconSize) / 2, r.y + 10, iconSize);

        if (this.font) {
            const label = marker != null ? marker : (price == null ? '—' : `${price}`);
            this.font.drawText(ctx, label, r.x + r.w / 2, r.y + r.h - 16, {
                color: (marker != null || price != null) ? UI.gold : UI.dim, scale: 1, align: 'center',
            });
        }
        ctx.globalAlpha = prevAlpha;
    }

    // Draw an item's icon (sprite if loaded, else the ITEM_COLORS bg+letter
    // fallback) into a size×size box. Mirrors the hotbar's item draw.
    _drawItemIcon(itemDef, x, y, size) {
        const { ctx, sprites } = this;
        const spr = ITEM_SPRITES[itemDef.id];
        let drawn = false;
        if (spr && sprites?.[spr.sheet]?.loaded) {
            drawn = sprites[spr.sheet].drawRegion(ctx, spr.x, spr.y, spr.w, spr.h, x, y, size, size);
        }
        if (!drawn && itemDef.icon === 'sword') { this._drawSwordIcon(x, y, size); drawn = true; }
        if (!drawn) {
            const info = ITEM_COLORS[itemDef.id] || { bg: '#888', letter: '?' };
            ctx.fillStyle = info.bg;
            ctx.fillRect(x, y, size, size);
            if (this.font) {
                this.font.drawText(ctx, info.letter, x + size / 2, y + size / 2 - 3, { color: '#fff', scale: 1, align: 'center' });
            }
        }
    }

    // A tiny procedural short-sword icon for the default weapon, so the WEAPON
    // slot (and hotbar) reads as a blade instead of a fallback "?". Drawn on a
    // dark plate, blade pointing up-and-right with a gold crossguard + pommel.
    _drawSwordIcon(x, y, size) {
        const { ctx } = this;
        ctx.save();
        ctx.fillStyle = '#2a241a';                       // dark plate so it reads on any panel
        ctx.fillRect(x, y, size, size);
        ctx.translate(x + size / 2, y + size / 2);
        ctx.rotate(-Math.PI / 4);                        // blade points up-right
        const bw = Math.max(2, size * 0.14);             // blade width
        const bl = size * 0.60;                          // blade length (guard → tip)
        const gl = size * 0.28;                          // grip length (guard → pommel)
        ctx.fillStyle = '#d8d8e0';                       // steel blade
        ctx.fillRect(-bw / 2, -bl, bw, bl);
        ctx.fillStyle = '#f4f4fa';                       // bright edge highlight
        ctx.fillRect(-bw / 2, -bl, Math.max(1, bw * 0.35), bl);
        ctx.fillStyle = UI.gold;                         // crossguard
        const gw = size * 0.50, gh = Math.max(2, size * 0.12);
        ctx.fillRect(-gw / 2, -gh / 2, gw, gh);
        ctx.fillStyle = '#7a5230';                       // wrapped grip
        ctx.fillRect(-bw / 2, 0, bw, gl);
        ctx.fillStyle = UI.gold;                         // pommel
        ctx.beginPath(); ctx.arc(0, gl, bw * 0.8, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }

    // ── Dialogue modal (Step 4 — disposition dialogue) ───────────────────────
    // Name + mood-face + disposition up top, the NPC's current line, then the
    // choice list (delta badge + once/repeat tag) with a cursor, and Leave.
    // Reads everything off the game (game._dialogueNpc / _dialogueReply /
    // _dialogueCursor / _dialogueChoices()), so the renderer needs no dialogue data.
    _drawDialogueModal(game) {
        const { ctx } = this;
        const ui = this.uiSheet;
        const npc = game._dialogueNpc;
        if (!npc || !this.font) return;

        ctx.fillStyle = 'rgba(0,0,0,0.72)';
        ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);

        const R = TRADE_MODAL_RECT;
        if (ui?.loaded) drawPanelBig(ctx, ui, R.x, R.y, R.w, R.h, 'base');
        else            drawPanelSmall(ctx, R.x, R.y, R.w, R.h);

        const disp = npc.disposition ?? 0;
        const m = mood(disp);
        const innerX = R.x + 20;

        this.font.drawText(ctx, (npc.name || npc.type || 'SOMEONE').toUpperCase(), CANVAS_PX / 2, R.y + 14, { color: UI.gold, scale: 2, align: 'center' });

        const moodY = R.y + 50;
        this._drawMoodFace(R.x + 26, moodY, m.face);
        this.font.drawText(ctx, m.mood.toUpperCase(), R.x + 44, moodY - 3, { color: UI.textLight, scale: 1 });
        this.font.drawText(ctx, `${disp > 0 ? '+' : ''}${disp}`, R.x + R.w - 24, moodY - 6, { color: disp < 0 ? UI.hpRed : UI.gold, scale: 2, align: 'right' });

        let ty = R.y + 82;
        const maxChars = Math.floor((R.w - 40) / 8);
        for (const line of this._wrapText(game._dialogueReply || '', maxChars)) {
            this.font.drawText(ctx, line, innerX, ty, { color: UI.text, scale: 1 });
            ty += 12;
        }

        const choices = game._dialogueChoices();
        const cursor = game._dialogueCursor;
        const rowH = 26;
        let cy = R.y + 156;
        const row = (i, label, badge, badgeColor, tag) => {
            const sel = cursor === i;
            if (sel) { ctx.fillStyle = 'rgba(212,185,106,0.18)'; ctx.fillRect(R.x + 12, cy - 4, R.w - 24, rowH - 2); }
            this.font.drawText(ctx, (sel ? '> ' : '  ') + label, innerX, cy, { color: sel ? UI.textLight : UI.text, scale: 1 });
            if (badge) this.font.drawText(ctx, badge, R.x + R.w - 92, cy, { color: badgeColor, scale: 1, align: 'right' });
            if (tag)   this.font.drawText(ctx, tag,   R.x + R.w - 24, cy, { color: UI.dim, scale: 1, align: 'right' });
            cy += rowH;
        };
        choices.forEach((c, i) => {
            const delta = c.delta ?? 0;
            const badge = delta ? `${delta > 0 ? '+' : ''}${delta} ${delta > 0 ? ':)' : ':('}` : '';
            const badgeColor = delta < 0 ? UI.hpRed : (delta > 0 ? '#79c46a' : UI.dim);
            const tag = c.cost ? `${c.cost} GP` : (c.repeatable ? 'repeat' : 'once');
            row(i, c.label, badge, badgeColor, tag);
        });
        row(choices.length, 'Leave', '', null, '');

        this.font.drawText(ctx, 'W/S  SELECT     SPACE  PICK     E  LEAVE', CANVAS_PX / 2, R.y + R.h - 18, { color: UI.dim, scale: 1, align: 'center' });
    }

    // ── Equipment screen (Stage 3 — read-only Vitruvian dress-up) ────────────
    // A front-facing mannequin ringed by 6 body-zone slot plates. Reads
    // game.equipment (weapon set, all armor slots null today → EMPTY plates).
    // Purely a display; no hit-testing beyond "tap outside = close" in main.js.
    _drawEquipmentModal(game) {
        const { ctx, sprites } = this;
        const ui = this.uiSheet;
        if (!this.font) return;

        // Scrim
        ctx.fillStyle = 'rgba(0,0,0,0.72)';
        ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);

        // Ornate panel
        const R = EQUIPMENT_MODAL_RECT;
        if (ui?.loaded) drawPanelBig(ctx, ui, R.x, R.y, R.w, R.h, 'base');
        else            drawPanelSmall(ctx, R.x, R.y, R.w, R.h);

        // Title (left) + total worn armor (right) — flank the centered HEAD
        // plate so neither is occluded by it.
        this.font.drawText(ctx, 'EQUIPMENT', R.x + 20, R.y + 14, { color: UI.gold, scale: 2, align: 'left' });
        const armorTotal = game._playerArmor ? game._playerArmor() : 0;
        this.font.drawText(ctx, 'ARMOR ' + armorTotal, R.x + R.w - 20, R.y + 14, { color: UI.gold, scale: 2, align: 'right' });

        const F = EQUIP_FIGURE_RECT;
        const fcx = F.x + F.w / 2, fcy = F.y + F.h / 2;

        // Faint Vitruvian circle + square behind the figure.
        const prevAlpha = ctx.globalAlpha;
        ctx.globalAlpha = 0.25;
        ctx.strokeStyle = UI.panelBorder;
        ctx.lineWidth = 2;
        const rad = Math.min(F.w, F.h) / 2 + 20;
        ctx.beginPath();
        ctx.arc(fcx, fcy, rad, 0, Math.PI * 2);
        ctx.stroke();
        const sq = rad * 1.35;
        ctx.strokeRect(fcx - sq / 2, fcy - sq / 2, sq, sq);
        ctx.globalAlpha = prevAlpha;

        // The figure — a clean line-drawn STICK FIGURE in the Vitruvian spread
        // pose (round head, spine, arms fanning down-and-out, legs fanning
        // down-and-out). Reads far better than a stretched sprite, and the
        // spread limbs echo the reach toward the ARMS / FEET slots.
        const headCy = F.y + F.h * 0.10, headR = F.w * 0.16;
        const shoulderY = F.y + F.h * 0.30, hipY = F.y + F.h * 0.62;
        const armEndY = F.y + F.h * 0.52, footY = F.y + F.h * 0.98;
        const armSpan = F.w * 0.72, legSpan = F.w * 0.42;
        ctx.save();
        ctx.strokeStyle = UI.gold;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.arc(fcx, headCy, headR, 0, Math.PI * 2); ctx.stroke();        // head
        ctx.beginPath(); ctx.moveTo(fcx, headCy + headR); ctx.lineTo(fcx, hipY); ctx.stroke();  // spine
        ctx.beginPath();                                                                    // arms
        ctx.moveTo(fcx - armSpan, armEndY); ctx.lineTo(fcx, shoulderY); ctx.lineTo(fcx + armSpan, armEndY);
        ctx.stroke();
        ctx.beginPath();                                                                    // legs
        ctx.moveTo(fcx - legSpan, footY); ctx.lineTo(fcx, hipY); ctx.lineTo(fcx + legSpan, footY);
        ctx.stroke();
        ctx.fillStyle = UI.gold;                                                            // eye dot (echoes the sketch)
        ctx.beginPath(); ctx.arc(fcx + headR * 0.35, headCy - headR * 0.1, 1.6, 0, Math.PI * 2); ctx.fill();
        ctx.restore();

        // Slot plates ringing the figure.
        for (const slot of EQUIP_SLOT_RECTS) {
            const s = slot;
            drawInset(ctx, s.x, s.y, s.w, s.h);

            // Connector line from the plate toward the figure's matching zone.
            const zx = F.x + (s.zone?.fx ?? 0.5) * F.w;
            const zy = F.y + (s.zone?.fy ?? 0.5) * F.h;
            const pcx = s.x + s.w / 2, pcy = s.y + s.h / 2;
            ctx.save();
            ctx.globalAlpha = 0.5;
            ctx.strokeStyle = UI.panelBorder;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(pcx, pcy);
            ctx.lineTo(zx, zy);
            ctx.stroke();
            ctx.restore();

            // Label (zone caption) in gold along the top of the plate.
            this.font.drawText(ctx, s.label, s.x + s.w / 2, s.y + 4, { color: UI.gold, scale: 1, align: 'center' });

            // Equipped item (icon + name) or EMPTY.
            const item = game.equipment ? game.equipment[s.key] : null;
            if (item) {
                const iconSize = 20;
                this._drawItemIcon(item, s.x + 6, s.y + s.h - iconSize - 4, iconSize);
                const name = (item.name || item.id || '').replace(/^\[|\]$/g, '');
                this.font.drawText(ctx, name.toUpperCase(), s.x + iconSize + 12, s.y + s.h - iconSize + 2, { color: UI.text, scale: 1 });
                if (item.armor) this.font.drawText(ctx, '+' + item.armor, s.x + s.w - 6, s.y + 4, { color: UI.gold, scale: 1, align: 'right' });
            } else {
                this.font.drawText(ctx, 'EMPTY', s.x + s.w / 2, s.y + s.h - 16, { color: UI.dim, scale: 1, align: 'center' });
            }
        }

        // Footer hint.
        this.font.drawText(ctx, 'TAP A PLATE TO REMOVE   ·   C / ESC  CLOSE', CANVAS_PX / 2, R.y + R.h - 16, { color: UI.textLight, scale: 1, align: 'center' });
    }

    // Word-wrap `text` into lines no longer than `maxChars` characters (the
    // bitmap font is fixed 8px/char at scale 1).
    _wrapText(text, maxChars) {
        const words = String(text).split(' ');
        const lines = [];
        let line = '';
        for (const w of words) {
            if (line && line.length + 1 + w.length > maxChars) { lines.push(line); line = w; }
            else line = line ? line + ' ' + w : w;
        }
        if (line) lines.push(line);
        return lines;
    }

    // A tiny procedural mood smiley keyed off trade.mood().face. Center at
    // (cx, cy). Eyes flatten to brows when wary/angry; the mouth bends from a
    // full beam to a hard frown; "refuse" goes a sour red.
    _drawMoodFace(cx, cy, face, r = 9) {
        const { ctx } = this;
        const s = r / 9;   // inner features are tuned for r=9; scale them with r

        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = face === 'refuse' ? '#b15a4a' : '#e8c34a';
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#2a2218';
        ctx.stroke();

        // Eyes (or angled brows for the sour moods).
        ctx.fillStyle = '#2a2218';
        const ey = cy - 2.5 * s, ex = 3.4 * s;
        if (face === 'angry' || face === 'wary' || face === 'refuse') {
            ctx.fillRect(cx - ex - 1.5 * s, ey - 0.5 * s, 3.4 * s, 2 * s);
            ctx.fillRect(cx + ex - 1.9 * s, ey - 0.5 * s, 3.4 * s, 2 * s);
        } else {
            ctx.beginPath(); ctx.arc(cx - ex, ey, 1.4 * s, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(cx + ex, ey, 1.4 * s, 0, Math.PI * 2); ctx.fill();
        }

        // Mouth — curvature by mood. depth>0 smiles, depth<0 frowns.
        const depth = ({ beam: 4, happy: 3, content: 1.5, neutral: 0, wary: -2, angry: -3.5, refuse: -3.5 }[face] ?? 0) * s;
        const my = cy + 3.5 * s;
        ctx.strokeStyle = '#2a2218';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        if (depth === 0) {
            ctx.moveTo(cx - 4.5 * s, my);
            ctx.lineTo(cx + 4.5 * s, my);
        } else {
            const cornerY = my - depth * 0.5;
            ctx.moveTo(cx - 4.5 * s, cornerY);
            ctx.quadraticCurveTo(cx, my + depth, cx + 4.5 * s, cornerY);
        }
        ctx.stroke();
    }

    // ── Vignette (subtle edge darkening) ────────────────────────────────────

    _drawVignette() {
        const { ctx } = this;
        const s = CANVAS_PX;
        // Cache the gradient — CANVAS_PX is fixed, so it never changes, and
        // rebuilding it every frame (60/s in combat) churned the GC.
        if (!this._vignetteGradient) {
            const g = ctx.createRadialGradient(s/2, s/2, s * 0.35, s/2, s/2, s * 0.55);
            g.addColorStop(0, 'rgba(0,0,0,0)');
            g.addColorStop(1, 'rgba(0,0,0,0.3)');
            this._vignetteGradient = g;
        }
        ctx.fillStyle = this._vignetteGradient;
        ctx.fillRect(0, 0, s, s);
    }

    // ── Flash ────────────────────────────────────────────────────────────────

    flash(color = 'rgba(200,50,20,0.3)') {
        this.ctx.fillStyle = color;
        this.ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);
    }
}

// ── Color util ──────────────────────────────────────────────────────────────
//
// Convert a hex color (#rrggbb) and an alpha (0..1) to an rgba string. Used
// by the damage-number renderer to apply per-frame alpha fades without
// needing to pre-compute rgba strings for every brightness step.

function hexToRgba(hex, alpha) {
    if (!hex || hex[0] !== '#') return `rgba(255,255,255,${alpha})`;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

// Ease-out cubic — fast at the start, gentle at the end. The right curve
// for "appearing" animations like menu slides: the motion looks decisive
// (it commits early) and lands softly (no harsh stop).
function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
}
