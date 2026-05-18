// renderer.js — Final pass: pixel art world + parchment UI
// Large panels: 9-slice from Modern UI Style 1
// Small panels: hand-colored parchment fill matching the sprite palette
// All text: dark brown on parchment for readability (not gold-on-dark)

import { TILE_PX, VIEW_TILES, CANVAS_PX, INVENTORY_SIZE } from './data.js';
import { TILE_SPRITE_MAP, TOWN_TILE_SPRITE_MAP, ENEMY_SPRITES, ITEM_SPRITES, PLAYER_SPRITE } from './sprites.js';
import { UI, ITEM_COLORS, drawPanelBig, drawPanelSmall, drawInset } from './ui-sprites.js';

export class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx    = canvas.getContext('2d');
        canvas.width  = CANVAS_PX;
        canvas.height = CANVAS_PX;
        this.ctx.imageSmoothingEnabled = false;

        this.half    = (VIEW_TILES - 1) / 2;
        this.sprites = null;
        this.zone    = 'TOWN';
    }

    get uiSheet() { return this.sprites?.uiStyle1 ?? null; }

    // ── Splash ───────────────────────────────────────────────────────────────

    renderSplash(splashCanvas) {
        const ctx = splashCanvas.getContext('2d');
        splashCanvas.width = 320;
        splashCanvas.height = 220;
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

        ctx.textAlign = 'center';

        // Small game-name header
        ctx.fillStyle = UI.panelBorder;
        ctx.font = 'bold 11px monospace';
        ctx.fillText('VIOLENCETOWN', 160, 38);

        // Horizontal rule under header
        ctx.strokeStyle = UI.panelBorder;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(90, 44); ctx.lineTo(230, 44); ctx.stroke();

        // Character lineup — three distinct chars from the Kenney sheet,
        // picked from the leftmost column where small character bodies live.
        // Coords are decorative-only (no gameplay binding), so they're picked
        // here directly rather than referenced from ENEMY_SPRITES.
        const lineupRow = [
            { sheet: this.sprites?.sewerMonster, col: 0, row: 0 },
            { sheet: this.sprites?.player,        col: 0, row: 1 },
            { sheet: this.sprites?.fungusViolet,  col: 0, row: 2 },
        ];
        const charScale = 2;       // 16×16 Kenney → 32×32 displayed (nearest-neighbor)
        const spacing   = 56;
        const startX    = 160 - (lineupRow.length - 1) * spacing / 2 - 16;
        const lineupY   = 70;
        lineupRow.forEach((entry, i) => {
            if (entry.sheet?.loaded) {
                entry.sheet.drawFrame(
                    ctx, entry.col, entry.row,
                    startX + i * spacing, lineupY,
                    entry.sheet.frameW * charScale,
                    entry.sheet.frameH * charScale
                );
            }
        });

        // Big GAME START prompt — the centerpiece
        ctx.fillStyle = UI.panelBorder;
        ctx.font = 'bold 28px monospace';
        ctx.fillText('GAME START', 160, 160);

        // Subtitle hint
        ctx.fillStyle = UI.textLight;
        ctx.font = '9px monospace';
        ctx.fillText('press SPACE or click below', 160, 178);

        // Version — read from <meta name="version"> so it's a single source of truth
        const meta = typeof document !== 'undefined'
            ? document.querySelector('meta[name="version"]')
            : null;
        const version = meta ? meta.getAttribute('content') : '?';
        ctx.textAlign = 'right';
        ctx.fillStyle = UI.textLight;
        ctx.font = '8px monospace';
        ctx.fillText('v' + version, 296, 200);

        ctx.textAlign = 'left';
    }

    // ── Game Frame ───────────────────────────────────────────────────────────

    renderFrame(game) {
        const { ctx } = this;
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, CANVAS_PX, CANVAS_PX);

        this._scrollX = 0;
        this._scrollY = 0;
        if (game._animating) {
            const t = game._animProgress || 0;
            this._scrollX = (game._animToX - game._animFromX) * t * TILE_PX;
            this._scrollY = (game._animToY - game._animFromY) * t * TILE_PX;
        }

        this._drawTiles(game);
        this._drawGroundItems(game);
        this._drawEnemies(game);
        this._drawPlayer(game);

        // HUD
        this._drawHPPanel(game);
        this._drawZoneLabel(game);
        this._drawBuffBar(game);
        this._drawHotbar(game);

        // Subtle vignette border
        this._drawVignette();

        // Modals
        if (game.state === 'item_overlay') this._drawItemOverlay(game);
        if (game.state === 'item_throw_dir') this._drawThrowPrompt(game);
        if (game.state === 'win') this._drawWinOverlay(game);
    }

    // ── Tiles ────────────────────────────────────────────────────────────────

    _drawTiles(game) {
        const { ctx, half, sprites } = this;
        const sheet = sprites?.sewerTiles;
        const pad = 2;
        for (let vy = -pad; vy < VIEW_TILES + pad; vy++) {
            for (let vx = -pad; vx < VIEW_TILES + pad; vx++) {
                const wx = game.playerX - half + vx;
                const wy = game.playerY - half + vy;
                const px = vx * TILE_PX - this._scrollX;
                const py = vy * TILE_PX - this._scrollY;
                const id = game.map.getTile(wx, wy);
                const def = game.map.getTileDef(wx, wy);
                const ref = TILE_SPRITE_MAP[id] || TOWN_TILE_SPRITE_MAP[id];
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

    // ── Enemies ──────────────────────────────────────────────────────────────

    _drawEnemies(game) {
        const { ctx, half, sprites } = this;
        for (const e of game.enemies) {
            if (!e.entity.isAlive()) continue;
            const vx = e.x - game.playerX + half;
            const vy = e.y - game.playerY + half;
            if (vx < -2 || vx > VIEW_TILES + 1 || vy < -2 || vy > VIEW_TILES + 1) continue;
            const px = vx * TILE_PX - this._scrollX;
            const py = vy * TILE_PX - this._scrollY;

            let ok = false;
            const info = ENEMY_SPRITES[e.type];
            if (info && sprites?.[info.sheet]?.loaded) {
                // Kenney chars are single-frame; honor `static` to use the
                // exact col from the sprite map instead of animation flipping.
                const col = info.static
                    ? info.col
                    : (((game._idleTick || 0) % 2 === 0) ? 0 : 2);
                // 24×24 square draw — fits Kenney's 16×16 native at 1.5× upscale,
                // avoids the vertical stretch that 28×36 produced.
                ok = sprites[info.sheet].drawFrame(ctx, col, info.row, px + 4, py + 4, TILE_PX - 8, TILE_PX - 8);
            }
            if (!ok) {
                ctx.fillStyle = '#cc4433';
                ctx.fillRect(px + 6, py + 6, TILE_PX - 12, TILE_PX - 12);
            }

            // HP bar above enemy (with border)
            const frac = e.entity.hp / e.entity.maxHp;
            const bx = px + 4, by = py - 6, bw = TILE_PX - 8, bh = 5;
            ctx.fillStyle = '#000000cc';
            ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
            ctx.fillStyle = UI.hpBg;
            ctx.fillRect(bx, by, bw, bh);
            ctx.fillStyle = UI.hpRed;
            ctx.fillRect(bx, by, bw * frac, bh);
        }
    }

    // ── Player ───────────────────────────────────────────────────────────────

    _drawPlayer(game) {
        const { ctx, half, sprites } = this;
        const ppx = half * TILE_PX;
        const ppy = half * TILE_PX;

        // Kenney chars are single-frame per cell — no facing/animation rows.
        // PLAYER_SPRITE.col/row are read from sprites.js as the canonical
        // player cell. The previous LimeZu FACE/animation logic is parked
        // until/unless we get an animated Kenney character pack.
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
    }

    // ── HP Panel (top-left, parchment style) ─────────────────────────────────

    _drawHPPanel(game) {
        const { ctx } = this;
        const x = 6, y = 6, w = 170, h = 50;

        drawPanelSmall(ctx, x, y, w, h);

        // HP bar inside the parchment
        const bx = x + 8, by = y + 8, bw = w - 16, bh = 14;
        const frac = game.playerHp / game.playerMaxHp;

        drawInset(ctx, bx, by, bw, bh);
        ctx.fillStyle = frac > 0.3 ? UI.hpGreen : UI.hpRed;
        ctx.fillRect(bx + 1, by + 1, (bw - 2) * frac, bh - 2);

        // HP text — dark on parchment bar
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px monospace';
        ctx.fillText(`HP ${game.playerHp} / ${game.playerMaxHp}`, bx + 4, by + 11);

        // Weapon (strip brackets for display)
        const wpn = game.equipment.weapon;
        if (wpn) {
            const name = wpn.name.replace(/[\[\]]/g, '');
            ctx.fillStyle = UI.text;
            ctx.font = '10px monospace';
            ctx.fillText(`⚔ ${name}  dmg:${wpn.damage}`, x + 8, y + 40);
        }
    }

    // ── Zone Label (top center) ──────────────────────────────────────────────

    _drawZoneLabel(game) {
        const { ctx } = this;
        const label = game.map?.zoneName || '';
        const turnText = `T:${game.turn}`;
        const w = Math.max(100, label.length * 10 + 60);
        const px = (CANVAS_PX - w) / 2;

        drawPanelSmall(ctx, px, 4, w, 22);

        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = UI.text;
        ctx.fillText(label, CANVAS_PX / 2, 19);

        // Turn counter right-aligned in the label
        ctx.textAlign = 'right';
        ctx.fillStyle = UI.dim;
        ctx.font = '9px monospace';
        ctx.fillText(turnText, px + w - 6, 18);
        ctx.textAlign = 'left';
    }

    // ── Buff Bar (top-right) ─────────────────────────────────────────────────

    _drawBuffBar(game) {
        if (game.buffs.length === 0) return;
        const { ctx } = this;
        const bw = 52, bh = 26, gap = 3;
        const total = game.buffs.length;
        const totalW = total * (bw + gap) - gap + 12;
        const px = CANVAS_PX - totalW - 6, py = 6;

        drawPanelSmall(ctx, px, py, totalW, bh + 12);

        for (let i = 0; i < total; i++) {
            const buff = game.buffs[i];
            const bx = px + 6 + i * (bw + gap), by = py + 6;

            // Inset background
            drawInset(ctx, bx, by, bw, bh);

            // Name + turns
            ctx.fillStyle = buff.type === 'debuff' ? UI.hpRed : UI.hpGreen;
            ctx.font = 'bold 9px monospace';
            ctx.fillText(buff.name, bx + 3, by + 11);
            ctx.fillStyle = UI.gold;
            ctx.font = 'bold 11px monospace';
            ctx.fillText(`${buff.turns}`, bx + bw - 14, by + 23);
        }
    }

    // ── Inventory Hotbar (bottom) ────────────────────────────────────────────

    _drawHotbar(game) {
        const { ctx, sprites } = this;
        const sw = 42, sh = 42, gap = 3;
        const count = 9;
        const totalW = count * (sw + gap) - gap + 16;
        const ox = (CANVAS_PX - totalW) / 2;
        const oy = CANVAS_PX - sh - 20;

        // Selected item name tooltip above hotbar
        if (game.selectedSlot >= 0 && game.inventory[game.selectedSlot]) {
            const itemName = game.inventory[game.selectedSlot].itemDef.name.replace(/[\[\]]/g, '');
            const tw = itemName.length * 7 + 16;
            const tx = (CANVAS_PX - tw) / 2;
            const ty = oy - 24;
            drawPanelSmall(ctx, tx, ty, tw, 18);
            ctx.fillStyle = UI.text;
            ctx.font = 'bold 10px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(itemName, CANVAS_PX / 2, ty + 13);
            ctx.textAlign = 'left';
        }

        // Parchment background strip
        drawPanelSmall(ctx, ox, oy - 4, totalW, sh + 12);

        for (let i = 0; i < count; i++) {
            const sx = ox + 8 + i * (sw + gap);
            const sy = oy + 2;
            const stack = game.inventory[i];
            const sel = game.selectedSlot === i;

            // Slot inset
            if (sel) {
                ctx.fillStyle = '#4a4020';
                ctx.fillRect(sx - 1, sy - 1, sw + 2, sh + 2);
            }
            drawInset(ctx, sx, sy, sw, sh);

            // Selected highlight border
            if (sel) {
                ctx.strokeStyle = UI.gold;
                ctx.lineWidth = 2;
                ctx.strokeRect(sx - 1, sy - 1, sw + 2, sh + 2);
            }

            // Key number
            ctx.fillStyle = sel ? UI.gold : '#5a5040';
            ctx.font = '9px monospace';
            ctx.fillText(`${i + 1}`, sx + 2, sy + 9);

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
                    ctx.fillStyle = '#fff';
                    ctx.font = 'bold 14px monospace';
                    ctx.fillText(info.letter, sx + 14, sy + 28);
                }

                // Stack count (bottom-right)
                if (stack.count > 1) {
                    // Dark backing for readability
                    ctx.fillStyle = '#000000aa';
                    ctx.fillRect(sx + sw - 16, sy + sh - 12, 14, 11);
                    ctx.fillStyle = UI.gold;
                    ctx.font = 'bold 9px monospace';
                    ctx.fillText(`${stack.count}`, sx + sw - 14, sy + sh - 3);
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

        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);
        this._drawPlayer(game);

        const opts = game.overlayOptions;
        const pos = {
            up:    { x: cx - 44, y: cy - TILE_PX - 38 },
            down:  { x: cx - 44, y: cy + TILE_PX + 8 },
            left:  { x: cx - TILE_PX - 84, y: cy - 16 },
            right: { x: cx + TILE_PX + 8,  y: cy - 16 },
        };
        const arr = { up: '↑', down: '↓', left: '←', right: '→' };

        for (const [dir, opt] of Object.entries(opts)) {
            if (!pos[dir]) continue;
            const p = pos[dir];
            const w = 88, h = 32;

            drawPanelSmall(ctx, p.x, p.y, w, h);

            ctx.fillStyle = UI.text;
            ctx.font = 'bold 12px monospace';
            ctx.fillText(`${arr[dir]} ${opt.label}`, p.x + 8, p.y + 21);
        }
    }

    // ── Throw Prompt ─────────────────────────────────────────────────────────

    _drawThrowPrompt(game) {
        const { ctx, half } = this;
        const cx = half * TILE_PX + TILE_PX / 2;
        const cy = half * TILE_PX + TILE_PX / 2;

        const dirs = [
            { x: cx - 16, y: cy - TILE_PX - 18, l: '↑' },
            { x: cx - 16, y: cy + TILE_PX + 2,  l: '↓' },
            { x: cx - TILE_PX - 18, y: cy - 16, l: '←' },
            { x: cx + TILE_PX + 2,  y: cy - 16, l: '→' },
        ];

        for (const d of dirs) {
            drawPanelSmall(ctx, d.x, d.y, 32, 32);
            ctx.fillStyle = UI.text;
            ctx.font = 'bold 16px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(d.l, d.x + 16, d.y + 22);
            ctx.textAlign = 'left';
        }
    }

    // ── Win Overlay ──────────────────────────────────────────────────────────

    _drawWinOverlay(game) {
        const { ctx } = this;
        const ui = this.uiSheet;

        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);

        const w = 280, h = 120;
        const px = (CANVAS_PX - w) / 2, py = (CANVAS_PX - h) / 2;

        if (ui?.loaded) {
            drawPanelBig(ctx, ui, px, py, w, h);
        } else {
            drawPanelSmall(ctx, px, py, w, h);
        }

        ctx.textAlign = 'center';

        ctx.fillStyle = UI.panelBorder;
        ctx.font = 'bold 18px monospace';
        ctx.fillText('BOSS ROOM REACHED', CANVAS_PX / 2, py + 50);

        ctx.fillStyle = UI.text;
        ctx.font = '12px monospace';
        ctx.fillText(`${game.turn} turns`, CANVAS_PX / 2, py + 74);

        ctx.fillStyle = UI.textLight;
        ctx.font = '10px monospace';
        ctx.fillText('press N for new game', CANVAS_PX / 2, py + 96);

        ctx.textAlign = 'left';
    }

    // ── Vignette (subtle edge darkening) ────────────────────────────────────

    _drawVignette() {
        const { ctx } = this;
        const s = CANVAS_PX;
        const g = ctx.createRadialGradient(s/2, s/2, s * 0.35, s/2, s/2, s * 0.55);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(0,0,0,0.3)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, s, s);
    }

    // ── Flash ────────────────────────────────────────────────────────────────

    flash(color = 'rgba(200,50,20,0.3)') {
        this.ctx.fillStyle = color;
        this.ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);
    }
}
