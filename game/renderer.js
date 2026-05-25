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
            shakeX = (Math.random() - 0.5) * mag * 2;
            shakeY = (Math.random() - 0.5) * mag * 2;
        }

        ctx.save();
        ctx.translate(shakeX, shakeY);

        this._drawTiles(game);
        this._drawContainers(game);
        this._drawGroundItems(game);
        this._drawEnemies(game);
        this._drawPlayer(game);

        // Floating damage numbers float above the world but under the HUD
        // so the HP panel + hotbar are never occluded by spammy combat.
        this._drawDamageNumbers(game);

        ctx.restore();

        // HUD — rendered AFTER restore so screen shake doesn't affect it
        this._drawHPPanel(game);
        this._drawZoneLabel(game);
        this._drawBuffBar(game);
        this._drawLogStrip(game);
        this._drawHotbar(game);

        // Subtle vignette border
        this._drawVignette();

        // Modals
        if (game.state === 'item_overlay')    this._drawItemOverlay(game);
        if (game.state === 'radial_menu')     this._drawRadialMenu(game);
        if (game.state === 'item_throw_dir')  this._drawThrowPrompt(game);
        if (game.state === 'item_give_dir')   this._drawThrowPrompt(game);
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

    // ── Enemies ──────────────────────────────────────────────────────────────

    _drawEnemies(game) {
        const { ctx, half, sprites } = this;
        const now = performance.now();
        for (const e of game.enemies) {
            const vx = e.x - game.playerX + half;
            const vy = e.y - game.playerY + half;
            if (vx < -2 || vx > VIEW_TILES + 1 || vy < -2 || vy > VIEW_TILES + 1) continue;

            const isAlive = e.entity.isAlive();

            // Hit-flash + stagger (Phase C) only animate while alive —
            // corpses are static after death.
            const flashing = isAlive && (e._hitFlashUntil ?? 0) > now;
            const staggerRemaining = isAlive ? (e._staggerUntil ?? 0) - now : 0;
            const staggerProgress = staggerRemaining > 0 ? staggerRemaining / 80 : 0;
            const offsetX = staggerProgress > 0 ? (e._staggerDx ?? 0) * staggerProgress : 0;
            const offsetY = staggerProgress > 0 ? (e._staggerDy ?? 0) * staggerProgress : 0;

            const px = vx * TILE_PX - this._scrollX + offsetX;
            const py = vy * TILE_PX - this._scrollY + offsetY;

            // Sprite — same draw for alive and dead; the death state is
            // expressed via the gray tint overlay below, not via a different
            // sprite. Future polish swap could pull a fallen-character
            // sprite from the Kenney pack if one is appropriate.
            let ok = false;
            const info = ENEMY_SPRITES[e.type];
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

            if (isAlive) {
                // Hit-flash overlay
                if (flashing) {
                    ctx.fillStyle = 'rgba(255, 60, 40, 0.45)';
                    ctx.fillRect(px + 4, py + 4, TILE_PX - 8, TILE_PX - 8);
                }

                // HP bar above living enemy (with border)
                const frac = e.entity.hp / e.entity.maxHp;
                const bx = px + 4, by = py - 6, bw = TILE_PX - 8, bh = 5;
                ctx.fillStyle = '#000000cc';
                ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
                ctx.fillStyle = UI.hpBg;
                ctx.fillRect(bx, by, bw, bh);
                ctx.fillStyle = UI.hpRed;
                ctx.fillRect(bx, by, bw * frac, bh);

                // Debuff / buff badges — one-letter colored markers stacked
                // horizontally above the HP bar. Buffs (positive) show in
                // UI.buff green; debuffs (negative) show in UI.debuff red.
                // Letter = first character of the buff name uppercased
                // (Blind → 'B', future Poison → 'P', Stun → 'S').
                if (e.buffs && e.buffs.length > 0) {
                    const badgeY = py - 16;
                    let badgeX = px + 2;
                    ctx.font = 'bold 9px monospace';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    for (const b of e.buffs) {
                        // Background pill — black so the colored letter stays
                        // readable over any sprite underneath
                        ctx.fillStyle = '#000000cc';
                        ctx.fillRect(badgeX, badgeY - 5, 9, 10);
                        ctx.fillStyle = b.type === 'buff' ? UI.buff : UI.debuff;
                        ctx.fillText((b.name?.[0] ?? '?').toUpperCase(), badgeX + 4.5, badgeY);
                        badgeX += 11;
                    }
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'alphabetic';
                }
            } else {
                // Corpse — gray tint overlay turns the sprite into a faded
                // version of itself, marking it as "defeated" without
                // requiring a separate corpse sprite. Combined with the
                // K.O. tag below, it reads as a clear "this enemy is done"
                // without removing them from the world entirely. Mother 3
                // and Persona both leave defeated enemies as visible body
                // markers; this is the cheap version of that move.
                ctx.fillStyle = 'rgba(60, 60, 60, 0.55)';
                ctx.fillRect(px + 4, py + 4, TILE_PX - 8, TILE_PX - 8);

                // K.O. tag below — small, faded, semi-respectful. The tag
                // is the player's permanent record of "you fought this
                // person here." Future merchant/loot features could read
                // the corpse and let the player pick it up.
                ctx.fillStyle = '#9a8a78';
                ctx.font = 'bold 8px monospace';
                ctx.textAlign = 'center';
                ctx.fillText(`[K.O.] ${e.type}`, px + TILE_PX / 2, py + TILE_PX + 2);
                ctx.textAlign = 'left';
            }
        }
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

            const t = age / 1000; // seconds
            const vx = dn.tileX - game.playerX + half;
            const vy = dn.tileY - game.playerY + half;
            const px = vx * TILE_PX + TILE_PX / 2 - this._scrollX + dn.vx * t;
            const py = vy * TILE_PX + TILE_PX / 4 - this._scrollY + dn.vy * t;

            const alpha = 1 - age / dn.maxAge;
            ctx.font = `bold ${dn.size}px monospace`;
            ctx.textAlign = 'center';

            // Drop shadow for readability against any tile color
            ctx.fillStyle = `rgba(0, 0, 0, ${alpha * 0.8})`;
            ctx.fillText(dn.text, px + 1, py + 1);

            // Main color — translate the dn.color (#rrggbb) to rgba with
            // our computed alpha so the fade applies cleanly
            ctx.fillStyle = hexToRgba(dn.color, alpha);
            ctx.fillText(dn.text, px, py);
        }
        ctx.textAlign = 'left'; // reset for downstream HUD draws
    }

    // ── Player ───────────────────────────────────────────────────────────────

    _drawPlayer(game) {
        const { ctx, half, sprites } = this;
        const now = performance.now();

        // Hit-flash + stagger (Phase C) — same pattern as enemies, but
        // reading from game._playerHitFlashUntil et al.
        const flashing = (game._playerHitFlashUntil ?? 0) > now;
        const staggerRemaining = (game._playerStaggerUntil ?? 0) - now;
        const staggerProgress = staggerRemaining > 0 ? staggerRemaining / 80 : 0;
        const offsetX = staggerProgress > 0 ? (game._playerStaggerDx ?? 0) * staggerProgress : 0;
        const offsetY = staggerProgress > 0 ? (game._playerStaggerDy ?? 0) * staggerProgress : 0;

        const ppx = half * TILE_PX + offsetX;
        const ppy = half * TILE_PX + offsetY;

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

        // Hit-flash overlay — red tint when the player just took damage.
        // Sharper alpha than the enemy flash since the player sprite tends
        // to be more visually prominent on a dark sewer floor.
        if (flashing) {
            ctx.fillStyle = 'rgba(255, 50, 30, 0.5)';
            ctx.fillRect(ppx + 4, ppy + 4, TILE_PX - 8, TILE_PX - 8);
        }
    }

    // ── HP Panel (top-left, parchment style) ─────────────────────────────────

    _drawHPPanel(game) {
        const { ctx } = this;
        const x = 6, y = 6, w = 170, h = 62;

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

        // Gold
        ctx.fillStyle = UI.gold;
        ctx.font = 'bold 10px monospace';
        ctx.fillText(`$ ${game.gold}`, x + 8, y + 52);
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

    // ── In-canvas Log Strip (above hotbar) ──────────────────────────────────
    //
    // Persistent 3-slot rolling log rendered as a parchment strip above the
    // hotbar. Mirrors _log() messages from main.js's _logStripMessages ring
    // buffer (newest at end). Newest sits at the bottom of the strip (chat-
    // window convention); older messages dim with position so the eye lands
    // on the freshest line first. Hotbar tooltip is allowed to overlay this
    // strip via z-order — _drawHotbar runs after _drawLogStrip in _drawScene.
    //
    // Color per category uses the parchment-panel palette (UI.text base);
    // combat/pickup/gold tints make different message types visually distinct
    // without needing to read every line.

    _drawLogStrip(game) {
        const messages = game._logStripMessages;
        if (!messages || messages.length === 0) return;

        const { ctx } = this;
        const SX = 6;
        const SW = 300;
        const SH = 44;
        const HOTBAR_OY = CANVAS_PX - 42 - 20;
        const SY = HOTBAR_OY - SH - 6;

        drawPanelSmall(ctx, SX, SY, SW, SH);

        ctx.font = '10px monospace';
        ctx.textAlign = 'left';

        // Newest message bottom-aligned at line 3; older messages climb up.
        const baselines = [SY + 16, SY + 27, SY + 38];
        const alphas    = [0.5, 0.75, 1.0]; // oldest → newest position

        const visible = messages.slice(-3);              // last N entries
        const offset  = 3 - visible.length;              // top-align if fewer than 3

        for (let i = 0; i < visible.length; i++) {
            const m = visible[i];
            const slot = i + offset;
            const baseColor = this._logStripColor(m.category);
            ctx.fillStyle = hexToRgba(baseColor, alphas[slot]);
            // Truncate to fit width — rough char-budget for 10px monospace
            // at 300px-16px-padding = ~284px usable, ~6px/char → ~47 chars.
            let text = m.text;
            if (text.length > 47) text = text.slice(0, 46) + '…';
            ctx.fillText(text, SX + 8, baselines[slot]);
        }
    }

    // Map a log-strip message category to a parchment-palette tint. Falls
    // back to UI.text so unknown categories stay readable. Kept as its own
    // method so future categories slot in without touching _drawLogStrip.
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
        const sw = 42, sh = 42, gap = 3;
        const count = 9;
        const totalW = count * (sw + gap) - gap + 16;
        const ox = (CANVAS_PX - totalW) / 2;
        const oy = CANVAS_PX - sh - 20;

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

            drawPanelSmall(ctx, tx, ty, tw, th);

            ctx.textAlign = 'center';
            let lineY = ty + 13;

            // Name
            ctx.fillStyle = UI.gold;
            ctx.font = 'bold 10px monospace';
            ctx.fillText(itemName, CANVAS_PX / 2, lineY);
            lineY += 13;

            // Stat line
            if (hasStat) {
                ctx.fillStyle = itemDef.healAmount ? '#44ff88' : '#ffaa44';
                ctx.font = '9px monospace';
                ctx.fillText(statLine, CANVAS_PX / 2, lineY);
                lineY += 13;
            }

            // Description
            if (hasDesc) {
                ctx.fillStyle = UI.dim || '#8a8070';
                ctx.font = '9px monospace';
                const maxChars = Math.floor((tw - 12) / 5.5);
                const truncated = desc.length > maxChars ? desc.slice(0, maxChars - 2) + '..' : desc;
                ctx.fillText(truncated, CANVAS_PX / 2, lineY);
            }

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
            up:    { x: cx - 44, y: cy - TILE_PX - 38 },
            down:  { x: cx - 44, y: cy + TILE_PX + 8 },
            left:  { x: cx - TILE_PX - 84, y: cy - 16 },
            right: { x: cx + TILE_PX + 8,  y: cy - 16 },
        };
        const arr = { up: '↑', down: '↓', left: '←', right: '→' };
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

            drawPanelSmall(ctx, px, py, w, h);

            ctx.fillStyle = UI.text;
            ctx.font = 'bold 12px monospace';
            ctx.fillText(`${arr[dir]} ${opt.label}`, px + 8, py + 21);
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

    _drawRadialMenu(game) {
        const { ctx, half } = this;
        const cx = half * TILE_PX + TILE_PX / 2;
        const cy = half * TILE_PX + TILE_PX / 2;

        // Slide-in animation (Phase D convention — 80ms ease-in opacity)
        const elapsed = performance.now() - (game._overlayOpenedAt ?? 0);
        const t = Math.min(1, elapsed / 80);

        // Slice order kept in sync with main.js RADIAL_SLICES module const.
        // Renderer keeps its own copy because the canvas drawing layer
        // shouldn't import from the game-logic module.
        const slices = ['Attack', 'Skill', 'Throw', 'Give', 'Run', 'Defend'];
        const N = slices.length;
        const sliceAngle = (Math.PI * 2) / N;

        // Inner wheel: radius from 36 (just outside the 32px player tile) to 80
        const rInner0 = 36;
        const rInner1 = 80;
        // Outer arc (sub-wheel): radius from 84 to 120
        const rOuter0 = 84;
        const rOuter1 = 120;

        // Helper: center angle of slice i in the wheel's LOCAL frame, with 12
        // o'clock = -π/2 in canvas coords (y axis flipped, angles clockwise).
        // The wheel's outer rotation transform maps local → world.
        const sliceCenterAngle = (i) => i * sliceAngle - Math.PI / 2;

        const prevAlpha = ctx.globalAlpha;
        ctx.globalAlpha = t;

        // Current rotation from the ease-out lerp. Game owns the math so
        // animation state is single-sourced.
        const innerRotation = game._currentRadialRotation
            ? game._currentRadialRotation()
            : -sliceAngle * (game.radialInnerIndex ?? 0);

        // ── Inner wheel (slices + labels) ────────────────────────────────────
        // Wrap the entire wheel draw in a rotation transform so the wheel
        // itself spins around the player center. Labels rotate WITH their
        // slices via per-label ctx.rotate — combined with the wheel rotation,
        // the label of the slice currently at 12 o'clock ends up upright
        // and the slice opposite (6 o'clock) is upside-down. That's the
        // chosen design ("Rotate with the wheel").
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(innerRotation);
        ctx.translate(-cx, -cy);

        // Draw slice wedges (local frame — the rotate above maps them to world)
        for (let i = 0; i < N; i++) {
            const a0 = sliceCenterAngle(i) - sliceAngle / 2;
            const a1 = sliceCenterAngle(i) + sliceAngle / 2;
            const isActive = !game.radialDrilled && i === game.radialInnerIndex;

            ctx.beginPath();
            ctx.arc(cx, cy, rInner1, a0, a1);
            ctx.arc(cx, cy, rInner0, a1, a0, true);
            ctx.closePath();
            ctx.fillStyle = isActive ? UI.gold : UI.panelBg;
            ctx.fill();
            ctx.strokeStyle = UI.panelBorder;
            ctx.lineWidth = isActive ? 3 : 1;
            ctx.stroke();
        }

        // Draw slice labels, each with a per-label rotation so the active
        // slice's text is upright when it lands at 12 o'clock under the
        // pointer. Math: label-i's local rotation = i*sliceAngle. Combined
        // with the wheel's world rotation R = -activeIndex*sliceAngle, the
        // total world rotation of label-i is (i - activeIndex)*sliceAngle —
        // which is 0 (upright) when i == activeIndex.
        ctx.fillStyle = UI.text;
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const rLabel = (rInner0 + rInner1) / 2;
        for (let i = 0; i < N; i++) {
            const ang = sliceCenterAngle(i);
            const lx = cx + Math.cos(ang) * rLabel;
            const ly = cy + Math.sin(ang) * rLabel;
            ctx.save();
            ctx.translate(lx, ly);
            ctx.rotate(i * sliceAngle); // per-label rotation (see math comment)
            ctx.fillText(slices[i], 0, 0);
            ctx.restore();
        }

        ctx.restore(); // pop inner wheel rotation

        // ── Sub-wheel (outer arc) — same rotating-wheel treatment ────────────
        const cat = slices[game.radialInnerIndex];
        const subCapable = cat === 'Attack' || cat === 'Throw' || cat === 'Give' || cat === 'Skill';
        if (subCapable) {
            const subOptions = game._radialSubItems ? game._radialSubItems(cat) : [];
            const subLabels = subOptions.length > 0
                ? subOptions.map(o => o.label)
                : ['—'];
            const subItems = subOptions;

            const M = subLabels.length;
            // Sub-arc slice size — kept in sync with main.js _animateSubRotation
            // so the rotation math matches the layout math exactly.
            const span = Math.min(M * sliceAngle, Math.PI);
            const subSliceAngle = span / M;
            // Sub-slice layout (parallel to inner wheel): slice j is centered
            // at angle -π/2 + j*subSliceAngle in the LOCAL frame. With
            // subRotation = -subSliceAngle * subIndex applied, the SELECTED
            // sub-slice lands at -π/2 (12 o'clock) under the pointer.
            const subCenter = (j) => -Math.PI / 2 + j * subSliceAngle;

            const subRotation = game._currentRadialSubRotation
                ? game._currentRadialSubRotation()
                : -subSliceAngle * (game.radialSubIndex?.[cat] ?? 0);

            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(subRotation);
            ctx.translate(-cx, -cy);

            // Sub-wheel wedges
            for (let j = 0; j < M; j++) {
                const a0 = subCenter(j) - subSliceAngle / 2;
                const a1 = subCenter(j) + subSliceAngle / 2;
                const isSubActive = game.radialDrilled && j === (game.radialSubIndex?.[cat] ?? 0);

                ctx.beginPath();
                ctx.arc(cx, cy, rOuter1, a0, a1);
                ctx.arc(cx, cy, rOuter0, a1, a0, true);
                ctx.closePath();
                ctx.fillStyle = isSubActive ? UI.gold : (subItems.length === 0 ? UI.panelBgDark : UI.panelBg);
                ctx.fill();
                ctx.strokeStyle = UI.panelBorder;
                ctx.lineWidth = isSubActive ? 3 : 1;
                ctx.stroke();
            }

            // Sub-wheel labels — same per-label upright-at-pointer math as
            // the inner wheel: label-j gets local rotation j*subSliceAngle so
            // the selected sub-slice's text is upright at 12 o'clock.
            ctx.fillStyle = subItems.length === 0 ? UI.textLight : UI.text;
            ctx.font = subItems.length === 0 ? '11px monospace' : 'bold 10px monospace';
            const rSubLabel = (rOuter0 + rOuter1) / 2;
            for (let j = 0; j < M; j++) {
                const ang = subCenter(j);
                const lx = cx + Math.cos(ang) * rSubLabel;
                const ly = cy + Math.sin(ang) * rSubLabel;
                ctx.save();
                ctx.translate(lx, ly);
                ctx.rotate(j * subSliceAngle);
                ctx.fillText(subLabels[j], 0, 0);
                ctx.restore();
            }

            ctx.restore(); // pop sub-wheel rotation
        }

        // ── Static pointer triangle at 12 o'clock (OUTSIDE any rotation) ────
        // Small gold triangle pointing DOWN at the wheel, anchored above the
        // wheel's top edge. Drawn after restoring rotations so it never spins
        // with the wheel — its fixed position is what makes the spinning-wheel
        // metaphor work.
        const tipY = cy - rInner1 - 4;
        const baseY = cy - rInner1 - 14;
        ctx.beginPath();
        ctx.moveTo(cx, tipY);            // tip pointing down at the wheel
        ctx.lineTo(cx - 7, baseY);       // top-left
        ctx.lineTo(cx + 7, baseY);       // top-right
        ctx.closePath();
        ctx.fillStyle = UI.gold;
        ctx.fill();
        ctx.strokeStyle = UI.panelBorder;
        ctx.lineWidth = 1;
        ctx.stroke();

        // Restore default text alignment for whatever renders next
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.globalAlpha = prevAlpha;
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
