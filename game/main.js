// main.js — Game orchestrator
// Pixel Dungeon-style: one input = one action = world advances.
// Bump-to-attack. 1-9 select item, Space uses with canvas overlay.

import { Renderer } from './renderer.js';
import { loadMap } from './map.js';
import { loadAllSprites } from './sprites.js';
import { DIR_NAMES, PLAYER_MAX_HP, SLUDGE_DOT, INVENTORY_SIZE, MAX_STACK } from './data.js';
import { ITEMS, resolveUse, tickTempEquips } from './items.js';
import { attack, formatDamageNumber } from './combat.js';
import { Enemy, resolveEnemyTurns } from './enemies.js';
import { applyGive } from './give-action.js';
import { escapeHtml, manhattan, clamp } from './utils.js';

// ── States ───────────────────────────────────────────────────────────────────

const STATE = {
    SPLASH:          'splash',
    IDLE:            'idle',            // waiting for input
    ITEM_SELECTED:   'item_selected',   // 1-9 pressed, slot highlighted
    ITEM_OVERLAY:    'item_overlay',    // Space pressed, showing use/throw/smash/give
    ITEM_THROW_DIR:  'item_throw_dir',  // chose Throw, waiting for direction
    ITEM_GIVE_DIR:   'item_give_dir',   // chose Give with multiple adjacent NPCs
    COMBAT_OVERLAY:  'combat_overlay',  // bumped a hostile enemy — Attack/Defend choice
    RESOLVING:       'resolving',
    DEAD:            'dead',
    WIN:             'win',
};

// ── Directions ───────────────────────────────────────────────────────────────

const DIRS = {
    'KeyW': { dx: 0, dy: -1 }, 'ArrowUp':    { dx: 0, dy: -1 },
    'KeyS': { dx: 0, dy:  1 }, 'ArrowDown':  { dx: 0, dy:  1 },
    'KeyA': { dx: -1, dy: 0 }, 'ArrowLeft':  { dx: -1, dy: 0 },
    'KeyD': { dx: 1, dy:  0 }, 'ArrowRight': { dx: 1, dy:  0 },
};

// ── Starting equipment ───────────────────────────────────────────────────────

const WEAPONS = {
    wooden_sword: {
        id: 'wooden_sword', name: '[Wooden Sword]', damage: 10, equipSlot: 'weapon',
    },
};

const SLUDGE_DURATION = 3;

// ── Game ─────────────────────────────────────────────────────────────────────

class Game {
    constructor() {
        this.state    = STATE.SPLASH;
        this.renderer = null;
        this.map      = null;
        this.turn     = 0;

        // Player
        this.playerX     = 0;
        this.playerY     = 0;
        this.playerHp    = PLAYER_MAX_HP;
        this.playerMaxHp = PLAYER_MAX_HP;
        this.extraMoves  = 0; // future: Goo, abilities, etc.
        this.facing      = 'down'; // 'down' | 'left' | 'right' | 'up'

        // Animation: 100ms slide between tiles
        this._animating   = false;
        this._animStart   = 0;
        this._animFromX   = 0;
        this._animFromY   = 0;
        this._animToX     = 0;
        this._animToY     = 0;
        this._animDuration = 100; // ms
        this._animCallback = null;
        this._animFrame   = null; // requestAnimationFrame ID

        // Equipment
        this.equipment = {
            weapon: WEAPONS.wooden_sword,
            top: null, bottom: null, front: null, back: null, sides: null,
        };
        this.tempEquips = [];

        // Buffs: [{ id, name, turns, type, ...extra }]
        this.buffs = [];
        this._soapUsedThisTurn = false;

        // Auto-repeat: hold a direction key to move once per second
        this._autoRepeatKey = null;
        this._autoRepeatInterval = null;
        this._autoRepeatDir = null;
        this._AUTO_REPEAT_MS = 120; // slightly longer than 100ms animation

        // Inventory: 10 stackable slots, each { itemDef, count } or null
        this.inventory = new Array(INVENTORY_SIZE).fill(null);
        this.selectedSlot = -1; // -1 = none selected

        // Item overlay options (populated when overlay shows)
        this.overlayOptions = {}; // { up: {...}, right: {...}, left: {...}, down: {...} }

        // Combat overlay target — the enemy the player just bumped. Set by
        // _openCombatOverlay, cleared after _pickCombat resolves or on Esc.
        this._combatTarget = null;

        // Floating damage numbers — particle list. Each entry:
        //   { tileX, tileY, text, color, size, vx, vy, bornAt, maxAge }
        // Particles age in real time (performance.now()) and animate
        // independently of turn ticks via a requestAnimationFrame loop
        // started by _spawnDamageNumber. The loop ends when the array is
        // empty, so the game returns to its idle 4fps redraw cadence.
        this._damageNumbers = [];
        this._particleLoopRunning = false;

        // Player hit-flash + stagger — short-lived visual feedback when
        // damage lands on the player. Timestamps are performance.now()
        // values; the renderer checks them each frame. Enemy equivalents
        // live as properties on the Enemy instances (set in combatAttack).
        this._playerHitFlashUntil = 0;
        this._playerStaggerUntil  = 0;
        this._playerStaggerDx     = 0;
        this._playerStaggerDy     = 0;

        // World
        this.groundItems = [];
        this.enemies = [];
        this.containers = []; // [{ id, type, x, y, contents: [...] }] — live, mutable
        this._pendingTransition = null;
    }

    // ── Buff System ──────────────────────────────────────────────────────────

    addBuff(id, name, turns, type = 'buff', extra = {}) {
        const existing = this.buffs.find(b => b.id === id);
        if (existing) { existing.turns = turns; return; }
        this.buffs.push({ id, name, turns, type, ...extra });
    }
    removeBuff(id) { this.buffs = this.buffs.filter(b => b.id !== id); }
    hasBuff(id) { return this.buffs.some(b => b.id === id); }

    _tickBuffs() {
        const expired = [];
        for (const b of this.buffs) { b.turns--; if (b.turns <= 0) expired.push(b); }
        for (const b of expired) {
            this.removeBuff(b.id);
            this._log(`[${b.name} expired]`);
            if (b.id === 'recover' && b.pendingHeal) {
                const before = this.playerHp;
                this.playerHp = clamp(this.playerHp + b.pendingHeal, 0, this.playerMaxHp);
                this._log(`[Recover — healed ${this.playerHp - before} HP]`);
            }
        }
    }

    // ── Boot ─────────────────────────────────────────────────────────────────

    async init() {
        const canvas = document.getElementById('game-canvas');
        this.renderer = new Renderer(canvas);

        const spriteResult = await loadAllSprites();
        this.renderer.sprites = spriteResult.sheets;
        this._log(spriteResult.fail > 0
            ? `[Sprites: ${spriteResult.ok} loaded, ${spriteResult.fail} missing]`
            : `[All ${spriteResult.ok} spritesheets loaded]`);

        // Render splash screen with pixel art
        const splashCanvas = document.getElementById('splash-canvas');
        if (splashCanvas) this.renderer.renderSplash(splashCanvas);

        await this._loadMap('sewer-map.json');
        this._bindSplash();
        this._bindInput();
        this._bindTouchControls();
        document.getElementById('new-game').addEventListener('click', () => this._fullReset());

        // Populate version badge from <meta name="version"> — single source of truth.
        // Lives in index.html as #version-badge, styled bottom-right in style.css.
        const versionMeta = document.querySelector('meta[name="version"]');
        const versionBadge = document.getElementById('version-badge');
        if (versionMeta && versionBadge) {
            versionBadge.textContent = 'v' + versionMeta.getAttribute('content');
        }

        // Idle animation loop — redraws at ~4fps for sprite bobble
        this._idleTick = 0;
        setInterval(() => {
            if (this.state !== STATE.SPLASH && !this._animating) {
                this._idleTick++;
                this._render();
            }
        }, 250);

        this._log('[Sewer demo prototype loaded]');
    }

    // ── Map Loading ──────────────────────────────────────────────────────────

    async _loadMap(url, spawnX, spawnY) {
        this.map = await loadMap(url);
        this.playerX = spawnX ?? this.map.spawn.x;
        this.playerY = spawnY ?? this.map.spawn.y;

        this.groundItems = [];
        for (const s of this.map.itemSpawns) {
            const def = ITEMS[s.type];
            if (def) this.groundItems.push({ type: s.type, x: s.x, y: s.y, def });
        }
        this.enemies = [];
        for (const s of this.map.enemySpawns) this.enemies.push(new Enemy(s));

        // Live containers — copy from spawn data so opening/depositing mutates
        // the live instance, not the map definition. Map reload re-snapshots
        // contents from JSON, mirroring how items/enemies behave today.
        this.containers = [];
        for (const c of this.map.containerSpawns) {
            this.containers.push({
                id: c.id,
                type: c.type,
                x: c.x,
                y: c.y,
                contents: Array.isArray(c.contents) ? c.contents.slice() : []
            });
        }

        const zoneEl = document.getElementById('zone-label');
        if (zoneEl) zoneEl.textContent = this.map.zoneName;

        this.renderer.zone = this.map.zoneName;
        this._render();
    }

    // ── Splash ───────────────────────────────────────────────────────────────

    _bindSplash() {
        const splash = document.getElementById('splash');
        const wrapper = document.getElementById('game-wrapper');
        const start = () => {
            splash.classList.add('gone');
            wrapper.classList.remove('hidden');
            this.state = STATE.IDLE;
            this._render();
            this._log('[Entered the town]');
        };
        document.getElementById('splash-go').addEventListener('click', start);
        document.addEventListener('keydown', (e) => {
            if (this.state === STATE.SPLASH && e.code === 'Space') { e.preventDefault(); start(); }
        });
    }

    // ── Input ────────────────────────────────────────────────────────────────

    _bindInput() {
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (this.state === STATE.SPLASH || this.state === STATE.RESOLVING) return;
            if (this._animating) return; // block all input during move animation

            // Auto-repeat: ignore browser key repeat events (we handle our own timer)
            if (e.repeat) return;

            // ── ITEM_THROW_DIR: waiting for throw direction ──
            if (this.state === STATE.ITEM_THROW_DIR) {
                const dir = DIRS[e.code];
                if (dir) { e.preventDefault(); this._doThrow(dir); return; }
                if (e.code === 'Escape') { e.preventDefault(); this.state = STATE.IDLE; this.selectedSlot = -1; this._render(); return; }
                return;
            }

            // ── ITEM_GIVE_DIR: waiting for give direction ──
            // Same input shape as ITEM_THROW_DIR; differs only in where it
            // dispatches. The shared direction-prompt UI in renderer.js
            // (_drawThrowPrompt) renders the same arrows for both states.
            if (this.state === STATE.ITEM_GIVE_DIR) {
                const dir = DIRS[e.code];
                if (dir) { e.preventDefault(); this._doGiveDir(dir); return; }
                if (e.code === 'Escape') { e.preventDefault(); this.state = STATE.IDLE; this.selectedSlot = -1; this._render(); return; }
                return;
            }

            // ── COMBAT_OVERLAY: just bumped a hostile, pick how to engage ──
            // Up/Right/Left/Down (or WASD) routes to the chosen action.
            // Escape backs out without consuming a turn — important so a
            // mistaken bump doesn't lock the player into combat.
            if (this.state === STATE.COMBAT_OVERLAY) {
                e.preventDefault();
                if (e.code === 'ArrowUp'    || e.code === 'KeyW') { this._pickCombat('up');    return; }
                if (e.code === 'ArrowRight' || e.code === 'KeyD') { this._pickCombat('right'); return; }
                if (e.code === 'ArrowDown'  || e.code === 'KeyS') { this._pickCombat('down');  return; }
                if (e.code === 'ArrowLeft'  || e.code === 'KeyA') { this._pickCombat('left');  return; }
                if (e.code === 'Escape') {
                    this.state = STATE.IDLE;
                    this._combatTarget = null;
                    this._render();
                    return;
                }
                return;
            }

            // ── ITEM_OVERLAY: pick an option ──
            if (this.state === STATE.ITEM_OVERLAY) {
                e.preventDefault();
                if (e.code === 'ArrowUp' || e.code === 'KeyW')    { this._pickOverlay('up'); return; }
                if (e.code === 'ArrowRight' || e.code === 'KeyD')  { this._pickOverlay('right'); return; }
                if (e.code === 'ArrowDown' || e.code === 'KeyS')   { this._pickOverlay('down'); return; }
                if (e.code === 'ArrowLeft' || e.code === 'KeyA')   { this._pickOverlay('left'); return; }
                if (e.code === 'Escape') { this.state = STATE.ITEM_SELECTED; this._render(); return; }
                return;
            }

            // ── ITEM_SELECTED: item highlighted, waiting for Space or change ──
            if (this.state === STATE.ITEM_SELECTED) {
                // Space = open use overlay
                if (e.code === 'Space') { e.preventDefault(); this._openItemOverlay(); return; }
                // 1-9 = switch selection
                const slot = this._digitToSlot(e.code);
                if (slot >= 0) { e.preventDefault(); this._selectItem(slot); return; }
                // Esc = deselect
                if (e.code === 'Escape') { e.preventDefault(); this.selectedSlot = -1; this.state = STATE.IDLE; this._render(); return; }
                // Arrow = deselect and move
                const dir = DIRS[e.code];
                if (dir) { e.preventDefault(); this.selectedSlot = -1; this.state = STATE.IDLE; this._doMove(dir); return; }
                return;
            }

            // ── IDLE: main input ──
            if (this.state !== STATE.IDLE) return;

            // Arrow/WASD = move (or bump-attack) + start auto-repeat
            const dir = DIRS[e.code];
            if (dir) {
                e.preventDefault();
                this._doMove(dir);
                this._startAutoRepeat(e.code, dir);
                return;
            }

            // 1-9 = select item
            const slot = this._digitToSlot(e.code);
            if (slot >= 0) { e.preventDefault(); this._selectItem(slot); return; }

            // Space (no item) = wait turn
            if (e.code === 'Space') { e.preventDefault(); this._log('[Wait]'); this._advanceWorld(); return; }

            // Codeball
            if (e.code === 'Backquote') { e.preventDefault(); this._codeball(); return; }

            // Any other key stops auto-repeat
            this._stopAutoRepeat();
        });

        // Stop auto-repeat when key released
        document.addEventListener('keyup', (e) => {
            if (this._autoRepeatKey === e.code) {
                this._stopAutoRepeat();
            }
        });
    }

    _bindTouchControls() {
        const buttons = document.querySelectorAll('#touch-controls .tc-btn');
        buttons.forEach(btn => {
            const code = btn.dataset.key;
            const fire = (e) => {
                e.preventDefault();
                document.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
                document.dispatchEvent(new KeyboardEvent('keyup',   { code, bubbles: true }));
            };
            btn.addEventListener('pointerdown', fire);
            btn.addEventListener('contextmenu', e => e.preventDefault());
        });
    }

    _digitToSlot(code) {
        const keys = ['Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','Digit7','Digit8','Digit9','Digit0'];
        return keys.indexOf(code);
    }

    // ── Animation ─────────────────────────────────────────────────────────────

    _animateMove(fromX, fromY, toX, toY, callback) {
        this._animating = true;
        this._animFromX = fromX;
        this._animFromY = fromY;
        this._animToX = toX;
        this._animToY = toY;
        this._animStart = performance.now();
        this._animCallback = callback;

        const tick = (now) => {
            const elapsed = now - this._animStart;
            const t = Math.min(1, elapsed / this._animDuration);

            // Interpolated position for rendering
            this._animProgress = t;
            this._render();

            if (t < 1) {
                this._animFrame = requestAnimationFrame(tick);
            } else {
                // Animation done
                this._animating = false;
                this._animProgress = 0;
                this._animFrame = null;
                if (this._animCallback) this._animCallback();
            }
        };

        this._animFrame = requestAnimationFrame(tick);
    }

    // ── Move / Bump Attack ───────────────────────────────────────────────────

    _doMove(dir) {
        if (this._animating) return; // block input during animation

        // Set facing direction
        if (dir.dy < 0) this.facing = 'up';
        else if (dir.dy > 0) this.facing = 'down';
        else if (dir.dx < 0) this.facing = 'left';
        else if (dir.dx > 0) this.facing = 'right';

        const nx = this.playerX + dir.dx;
        const ny = this.playerY + dir.dy;

        // Bump attack?
        const enemy = this.enemies.find(e => e.entity.isAlive() && e.x === nx && e.y === ny);
        if (enemy) {
            // Non-hostile NPCs — those with a behavior whitelist that omits
            // HOSTILE — are unwalkable but unattackable. Bumping them is a
            // silent no-op (same as bumping a wall). Their adjacency bark
            // mechanic delivers any dialogue when the player moves adjacent
            // from another direction.
            if (enemy.behavior && !enemy.behavior.includes('HOSTILE')) {
                return; // silent, no turn advance
            }

            // Bumping a hostile enemy opens the combat overlay rather than
            // attacking immediately. The overlay lets the player choose
            // Attack, Defend, or back out — turning a reflexive bump into a
            // deliberate decision. The previous behavior (instant attack on
            // bump) became too thin once the disposition system created
            // contexts where the player might want to defuse instead of
            // commit. Esc from the overlay backs out without consuming the
            // turn — protects against accidental bumps.
            this._openCombatOverlay(enemy);
            this._render();
            return;
        }

        // Bump-to-open? Mirrors bump-to-attack — containers are unwalkable
        // entities you interact with by bumping rather than moving onto.
        const container = this.containers.find(c => c.x === nx && c.y === ny);
        if (container) {
            this._openContainer(container);
            this._render();
            this._advanceWorld();
            return;
        }

        // Wall?
        if (!this.map.isWalkable(nx, ny)) return; // silent, no turn advance

        // Animate: DON'T update playerX/playerY yet — wait until animation finishes
        this._animateMove(this.playerX, this.playerY, nx, ny, () => {
            // NOW snap the grid position
            this.playerX = nx;
            this.playerY = ny;

            // Hazards
            const tileDef = this.map.getTileDef(nx, ny);
            if (tileDef.hazard === 'sludge' && !this.hasBuff('sludge')) {
                this.addBuff('sludge', 'Sludge', SLUDGE_DURATION, 'debuff');
                this._log('[Stepped in sludge — 3 turns]');
            }

            // Pickup
            this._tryPickup();

            // Transition?
            const transition = this.map.getTransition(nx, ny);
            if (transition) { this._pendingTransition = transition; }

            // Win?
            if (this.map.getTile(nx, ny) === 7) { this._win(); return; }

            this._advanceWorld();
        });
    }

    // ── Auto-Repeat (hold direction key = move once per second) ─────────────

    _startAutoRepeat(code, dir) {
        this._stopAutoRepeat();
        this._autoRepeatKey = code;
        this._autoRepeatDir = dir;
        this._autoRepeatInterval = setInterval(() => {
            if (this.state !== STATE.IDLE) { this._stopAutoRepeat(); return; }
            // Check if next tile is blocked (wall or enemy or any collision)
            const nx = this.playerX + dir.dx;
            const ny = this.playerY + dir.dy;
            const blocked = !this.map.isWalkable(nx, ny);
            const enemyThere = this.enemies.some(e => e.entity.isAlive() && e.x === nx && e.y === ny);
            if (blocked || enemyThere) {
                this._stopAutoRepeat();
                return;
            }
            this._doMove(dir);
        }, this._AUTO_REPEAT_MS);
    }

    _stopAutoRepeat() {
        if (this._autoRepeatInterval) {
            clearInterval(this._autoRepeatInterval);
            this._autoRepeatInterval = null;
        }
        this._autoRepeatKey = null;
        this._autoRepeatDir = null;
    }

    // ── Item Selection & Overlay ──────────────────────────────────────────────

    _selectItem(slot) {
        if (!this.inventory[slot]) {
            this._log(`[Slot ${slot + 1} empty]`);
            return;
        }
        this.selectedSlot = slot;
        this.state = STATE.ITEM_SELECTED;
        this._render();
    }

    _openItemOverlay() {
        const stack = this.inventory[this.selectedSlot];
        if (!stack) { this.state = STATE.IDLE; return; }
        const item = stack.itemDef;

        // Build contextual options
        this.overlayOptions = {};

        // Up = primary use (drink/apply/use)
        if (item.useType === 'self') {
            const label = item.effect === 'heal' ? 'Drink' : item.effect === 'cure_sludge' ? 'Use' : 'Use';
            this.overlayOptions.up = { label, action: 'use' };
        } else {
            this.overlayOptions.up = { label: 'Use', action: 'use' };
        }

        // Right = throw (always available)
        this.overlayOptions.right = { label: 'Throw', action: 'throw' };

        // Adjacent NPCs — partitioned into hostile-eligible vs non-hostile.
        // The behavior whitelist primitive from feature/sewer-npc-skeleton
        // is the source of truth here: an NPC without a behavior field is
        // assumed to be a legacy hostile (back-compat with the original
        // chasing fungi); an NPC with a behavior list is hostile only if
        // HOSTILE appears in it.
        const adjAll = this.enemies.filter(e =>
            e.entity.isAlive() && manhattan(e.x, e.y, this.playerX, this.playerY) === 1
        );
        const adjHostile = adjAll.filter(e =>
            !e.behavior || e.behavior.includes('HOSTILE')
        );

        // Left = smash (only if adjacent HOSTILE-eligible enemy — prevents
        // smashing Carrion-like non-hostiles, the same way bump-attack now
        // refuses to attack them)
        if (adjHostile.length > 0) {
            this.overlayOptions.left = { label: 'Smash', action: 'smash' };
        }

        // Down = give (if ANY adjacent NPC exists). Bribery-immune NPCs
        // reject the offering visibly; already-flipped ones still accept
        // for loyalty boost. The Give action is the one item interaction
        // that targets non-hostiles, which is why it doesn't filter by
        // HOSTILE eligibility.
        if (adjAll.length > 0) {
            const label = adjAll.length === 1 ? `Give to ${adjAll[0].type}` : 'Give';
            this.overlayOptions.down = { label, action: 'give' };
        }

        this.state = STATE.ITEM_OVERLAY;
        this._render();
    }

    _pickOverlay(direction) {
        const opt = this.overlayOptions[direction];
        if (!opt) return; // no option in that direction

        const stack = this.inventory[this.selectedSlot];
        if (!stack) { this.state = STATE.IDLE; this._render(); return; }
        const item = stack.itemDef;

        switch (opt.action) {
            case 'use':
                this._doItemUse(item);
                break;
            case 'throw':
                this.state = STATE.ITEM_THROW_DIR;
                this._log(`[Throw ${item.name} — pick a direction]`);
                this._render();
                return; // don't advance yet
            case 'smash': {
                // Melee smash on nearest adjacent HOSTILE-eligible enemy.
                // Filters non-hostile NPCs (Carrion-type) out of the target
                // pool — the bump-attack fix from step 7 extended to item-
                // based attacks.
                const adjHostile = this.enemies.filter(e =>
                    e.entity.isAlive()
                    && manhattan(e.x, e.y, this.playerX, this.playerY) === 1
                    && (!e.behavior || e.behavior.includes('HOSTILE'))
                );
                adjHostile.sort((a, b) => a.entity.hp - b.entity.hp);
                if (adjHostile.length > 0) {
                    const dmg = 10 * stack.count;
                    const result = this.combatAttack(adjHostile[0], dmg);
                    this._log(`[Smashed ${item.name} on ${adjHostile[0].entity.name} — ${result}]`);
                }
                this._removeFromSlot(this.selectedSlot);
                this.selectedSlot = -1;
                this.state = STATE.IDLE;
                this._advanceWorld();
                return;
            }
            case 'give': {
                // If exactly one adjacent NPC, give to them directly. If
                // multiple, enter direction-pick state — same pattern as
                // Throw, but selecting an NPC by adjacency rather than a
                // tile by direction.
                const adjAll = this.enemies.filter(e =>
                    e.entity.isAlive() && manhattan(e.x, e.y, this.playerX, this.playerY) === 1
                );
                if (adjAll.length === 1) {
                    this._doGive(adjAll[0]);
                } else {
                    this.state = STATE.ITEM_GIVE_DIR;
                    this._log(`[Give ${item.name} — pick a direction]`);
                    this._render();
                }
                return;
            }
        }
    }

    _doItemUse(item) {
        if (item.effect === 'cure_sludge') this._soapUsedThisTurn = true;

        const msg = resolveUse(this, item, null);
        if (msg) this._log(msg);

        if (item.consumable) this._removeFromSlot(this.selectedSlot);
        this.selectedSlot = -1;
        this.state = STATE.IDLE;
        this._advanceWorld();
    }

    _doThrow(dir) {
        const stack = this.inventory[this.selectedSlot];
        if (!stack) { this.state = STATE.IDLE; this._render(); return; }

        const stackCount = stack.count;
        const msg = resolveUse(this, stack.itemDef, { dx: dir.dx, dy: dir.dy }, stackCount);
        if (msg) this._log(msg);

        if (stack.itemDef.consumable) this._removeFromSlot(this.selectedSlot);
        this.selectedSlot = -1;
        this.state = STATE.IDLE;
        this._advanceWorld();
    }

    // ── Give Action ──────────────────────────────────────────────────────────
    //
    // Resolve a give to a specific recipient NPC. Delegates the disposition
    // math + flip handling to give-action.js::applyGive; main.js's job is
    // inventory consumption, log emission, and turn advancement.
    //
    // Item is consumed only if accepted (bribery-immune NPCs reject — the
    // player tried to bribe, the NPC refused, the item stays in hand).

    _doGive(recipient) {
        const stack = this.inventory[this.selectedSlot];
        if (!stack) { this.state = STATE.IDLE; this._render(); return; }

        const result = applyGive(stack.itemDef, recipient);
        this._log(result.log);

        if (result.accepted) {
            this._removeFromSlot(this.selectedSlot);
        }

        this.selectedSlot = -1;
        this.state = STATE.IDLE;
        this._advanceWorld();
    }

    // Handle the direction-pick step when multiple adjacent NPCs exist.
    // Looks up the NPC at (player + dir) and calls _doGive on them, or
    // emits a "no one there" message if no NPC is at that tile.
    _doGiveDir(dir) {
        const tx = this.playerX + dir.dx;
        const ty = this.playerY + dir.dy;
        const recipient = this.enemies.find(e =>
            e.entity.isAlive() && e.x === tx && e.y === ty
        );
        if (!recipient) {
            this._log('[No one there to give to.]');
            this.selectedSlot = -1;
            this.state = STATE.IDLE;
            this._render();
            return;
        }
        this._doGive(recipient);
    }

    // ── Combat Overlay ───────────────────────────────────────────────────────
    //
    // When the player bumps a hostile enemy, instead of an immediate attack
    // a four-direction overlay appears: Up=Attack, Left=Defend. The other
    // two slots are reserved for Phase B additions (Throw, Give quick-paths
    // that pre-target the bumped enemy). For Phase A, Attack is the default
    // commit, Defend adds a one-turn Guard buff, Esc backs out without
    // consuming a turn.
    //
    // Reuses the existing _drawItemOverlay rendering by populating the same
    // game.overlayOptions object — the renderer doesn't care whether the
    // menu is for items or combat, just what options to draw.

    _openCombatOverlay(enemy) {
        this._combatTarget = enemy;
        this.overlayOptions = {};

        // Up = Attack — commit to bump-attacking with the equipped weapon.
        // Label includes the weapon name so the player sees what they're
        // about to swing.
        const weapon = this.equipment.weapon;
        const attackLabel = weapon
            ? `Attack (${weapon.name.replace(/[\[\]]/g, '')})`
            : 'Punch';
        this.overlayOptions.up = { label: attackLabel, action: 'attack' };

        // Left = Defend — adds Guard buff for one turn, advances world.
        // The Guard buff halves incoming damage (existing buff in main.js
        // applyDamageToPlayer logic).
        this.overlayOptions.left = { label: 'Defend', action: 'defend' };

        // Right and Down reserved for Phase B (Throw, Give quick-paths).
        // Player can still use the existing item-overlay flow to throw or
        // give — Esc out of this menu and use 1-9 + Space.

        this.state = STATE.COMBAT_OVERLAY;
    }

    _pickCombat(direction) {
        const opt = this.overlayOptions[direction];
        if (!opt) return; // no option in that direction — ignore the keypress

        const enemy = this._combatTarget;
        if (!enemy || !enemy.entity.isAlive()) {
            // Target died (e.g., DOT, or weird race condition) — close menu
            // without consuming a turn.
            this.state = STATE.IDLE;
            this._combatTarget = null;
            this._render();
            return;
        }

        switch (opt.action) {
            case 'attack': {
                const weapon = this.equipment.weapon;
                if (weapon) {
                    const result = this.combatAttack(enemy, weapon.damage);
                    this._log(`[${weapon.name} hits ${enemy.entity.name} — ${result}]`);
                } else {
                    this._log('[No weapon — punched for 1]');
                    enemy.entity.takeDamage(1);
                }
                this._combatTarget = null;
                this.state = STATE.IDLE;
                this._advanceWorld();
                return;
            }
            case 'defend': {
                // Guard for 2 turns so the buff covers the upcoming enemy
                // turn (buffs tick down at end of _advanceWorld). One turn
                // would expire before the enemy hits.
                this.addBuff('guard', 'Guard', 2, 'buff');
                this._log('[Bracing — incoming damage halved.]');
                this._combatTarget = null;
                this.state = STATE.IDLE;
                this._advanceWorld();
                return;
            }
        }
    }

    // ── World Advance (after any action) ─────────────────────────────────────

    _advanceWorld() {
        this.turn++;
        this._soapUsedThisTurn = false;

        // Enemies act
        const msgs = resolveEnemyTurns(this);
        for (const m of msgs) this._log(m);
        if (this.playerHp <= 0) { this.playerHp = 0; this._die(); return; }

        // Temp equips tick
        const equipMsgs = tickTempEquips(this);
        for (const m of equipMsgs) this._log(m);

        // Soap cancels sludge at end of turn
        if (this._soapUsedThisTurn && this.hasBuff('sludge')) {
            this.removeBuff('sludge');
            this._log('[Soap neutralized sludge]');
        }

        // Sludge DoT
        if (this.hasBuff('sludge')) {
            this.playerHp -= SLUDGE_DOT;
            this._log(`[Sludge — ${SLUDGE_DOT} damage]`);
            if (this.playerHp <= 0) { this.playerHp = 0; this._die(); return; }
        }

        // Tick buffs
        this._tickBuffs();

        // Transition?
        if (this._pendingTransition) {
            const t = this._pendingTransition;
            this._pendingTransition = null;
            this._log(t.label || '[Transitioning...]');
            this._loadMap(t.toMap, t.toX, t.toY).then(() => {
                this._log(`[Entered ${this.map.zoneName}]`);
                this.state = STATE.IDLE;
                this._render();
            });
            return;
        }

        this._render();
    }

    // ── Inventory ────────────────────────────────────────────────────────────

    _addToInventory(itemDef) {
        for (let i = 0; i < INVENTORY_SIZE; i++) {
            const s = this.inventory[i];
            if (s && s.itemDef.id === itemDef.id && s.count < MAX_STACK) { s.count++; return true; }
        }
        for (let i = 0; i < INVENTORY_SIZE; i++) {
            if (!this.inventory[i]) { this.inventory[i] = { itemDef, count: 1 }; return true; }
        }
        return false;
    }

    _removeFromSlot(slot) {
        const s = this.inventory[slot];
        if (!s) return;
        s.count--;
        if (s.count <= 0) this.inventory[slot] = null;
    }

    _tryPickup() {
        let go = true;
        while (go) {
            go = false;
            const idx = this.groundItems.findIndex(gi => gi.x === this.playerX && gi.y === this.playerY);
            if (idx === -1) break;
            if (this._addToInventory(this.groundItems[idx].def)) {
                this._log(`[Picked up ${this.groundItems[idx].def.name}]`);
                this.groundItems.splice(idx, 1);
                go = true;
            } else { this._log('[Inventory full]'); break; }
        }
    }

    // ── Containers ───────────────────────────────────────────────────────────
    //
    // Open a chest (or other container) the player has bumped into. Empty
    // chests log a one-liner; full ones transfer their contents into the
    // player's inventory item-by-item (respecting inventory-full case the
    // same way _tryPickup does).
    //
    // Contents entries may be strings ('rock') OR objects ({ type: 'rock' })
    // for forward-compat — the soap-mine workers in step 4 will deposit
    // typed entries.

    _openContainer(container) {
        if (container.contents.length === 0) {
            this._log(`[The ${container.type} is empty.]`);
            return;
        }

        const summary = container.contents
            .map(c => (typeof c === 'string' ? c : c.type))
            .join(', ');
        this._log(`[You open the ${container.type}: ${summary}.]`);

        const remaining = [];
        for (const entry of container.contents) {
            const itemType = typeof entry === 'string' ? entry : entry.type;
            const def = ITEMS[itemType];
            if (!def) continue; // unknown item type; drop silently
            if (this._addToInventory(def)) {
                this._log(`[+ ${def.name}]`);
            } else {
                this._log('[Inventory full — the rest stays in the chest.]');
                remaining.push(entry);
            }
        }
        container.contents = remaining;
    }

    // ── Combat ───────────────────────────────────────────────────────────────

    combatAttack(enemyObj, damage) {
        const playerEntity = { name: '[Player]', isDead: () => false };
        const result = attack(playerEntity, enemyObj.entity, damage);

        // Floating damage number — Phase B
        const size = 14 + Math.min(10, Math.floor(result.damage / 5));
        const color = result.killed ? '#ffaa22' : '#ffdd44';
        this._spawnDamageNumber(enemyObj.x, enemyObj.y, `-${result.damage}`, color, size);

        // Hit flash + stagger — Phase C. Tints the enemy sprite red for
        // 100ms and offsets it 3px in the direction away from the player
        // (the visual "push back" of being struck). The stagger eases out
        // over 80ms via the renderer's progress interpolation.
        const now = performance.now();
        enemyObj._hitFlashUntil = now + 100;
        enemyObj._staggerUntil  = now + 80;
        const dx = enemyObj.x - this.playerX;
        const dy = enemyObj.y - this.playerY;
        const len = Math.abs(dx) + Math.abs(dy);
        enemyObj._staggerDx = len > 0 ? (dx / len) * 3 : 0;
        enemyObj._staggerDy = len > 0 ? (dy / len) * 3 : 0;
        this._ensureParticleLoop(); // keep rendering through the 100ms window

        return formatDamageNumber(result);
    }

    applyDamageToPlayer(rawDamage) {
        let dmg = rawDamage;
        if (this.hasBuff('guard')) dmg = Math.max(1, Math.floor(dmg / 2));
        this.playerHp = Math.max(0, this.playerHp - dmg);

        // Floating damage number — Phase B
        const size = 16 + Math.min(10, Math.floor(dmg / 5));
        this._spawnDamageNumber(this.playerX, this.playerY, `-${dmg}`, '#ff4444', size);

        // Hit flash + stagger on the player — Phase C. Stagger direction
        // is randomized for the player (any adjacent enemy might have
        // landed the hit; we don't track which), making the player jolt
        // slightly without committing to a specific source.
        const now = performance.now();
        this._playerHitFlashUntil = now + 100;
        this._playerStaggerUntil  = now + 80;
        const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
        const [sdx, sdy] = dirs[Math.floor(Math.random() * dirs.length)];
        this._playerStaggerDx = sdx * 3;
        this._playerStaggerDy = sdy * 3;
        this._ensureParticleLoop(); // keep rendering through the 100ms window

        return dmg;
    }

    // ── Codeball ─────────────────────────────────────────────────────────────

    _codeball() {
        let kills = 0;
        for (const e of this.enemies) {
            if (!e.entity.isAlive()) continue;
            if (manhattan(e.x, e.y, this.playerX, this.playerY) <= 100) {
                e.entity.takeDamage(1337);
                if (e.entity.isDead()) kills++;
            }
        }
        this.renderer.flash('rgba(51, 255, 51, 0.5)');
        this._log(`[CODEBALL — ${kills} eliminated]`);
        this._render();
    }

    // ── Death / Respawn / Win ────────────────────────────────────────────────

    _die() {
        this._stopAutoRepeat();
        this.state = STATE.DEAD;
        this.renderer.flash('rgba(255, 0, 0, 0.4)');
        this._log('[You died — respawning...]');
        setTimeout(() => this._respawn(), 500);
    }

    _respawn() {
        this.playerX = this.map.spawn.x;
        this.playerY = this.map.spawn.y;
        this.playerHp = this.playerMaxHp;
        this.buffs = [];
        this.inventory.fill(null);
        this.tempEquips = [];
        this.selectedSlot = -1;
        this.equipment = { weapon: WEAPONS.wooden_sword, top: null, bottom: null, front: null, back: null, sides: null };
        this.state = STATE.IDLE;
        this._render();
        this._log('[Respawned]');
    }

    async _fullReset() {
        this.turn = 0;
        this.playerHp = this.playerMaxHp;
        this.buffs = [];
        this.inventory.fill(null);
        this.tempEquips = [];
        this.selectedSlot = -1;
        this.equipment = { weapon: WEAPONS.wooden_sword, top: null, bottom: null, front: null, back: null, sides: null };
        this._pendingTransition = null;
        await this._loadMap('town-map.json');
        this.state = STATE.IDLE;
        this._log('[New game]');
    }

    _win() {
        this.state = STATE.WIN;
        this._render();
        this._log(`[Boss room reached in ${this.turn} turns — you win!]`);
    }

    // ── Render ───────────────────────────────────────────────────────────────

    _render() {
        this.renderer.renderFrame(this);
    }

    // ── Floating damage numbers ──────────────────────────────────────────────
    //
    // Spawn a particle at a tile coordinate that floats upward and fades
    // over 600ms. Replaces the "damage as log line" pattern with "damage as
    // visible event in the world." Called from combatAttack and
    // applyDamageToPlayer when damage is dealt.
    //
    // Coordinates are tile-space (not pixel); the renderer converts to
    // screen-space each frame so particles track the camera if the player
    // moves mid-particle (rare but possible during animation overlap).

    _spawnDamageNumber(tileX, tileY, text, color, size = 16) {
        this._damageNumbers.push({
            tileX, tileY, text, color, size,
            vx: 0,
            vy: -40, // pixels per second upward
            bornAt: performance.now(),
            maxAge: 600,
        });
        this._ensureParticleLoop();
    }

    // Start a requestAnimationFrame loop that re-renders the game until all
    // active visual effects have expired (damage numbers, hit flashes,
    // staggers). Idempotent — calling while a loop is already running is a
    // no-op. Despite the historical name "particle loop", this is really a
    // "transient visual effects" loop.
    _ensureParticleLoop() {
        if (this._particleLoopRunning) return;
        this._particleLoopRunning = true;
        const loop = () => {
            // Drop expired particles up front so the renderer never sees them.
            const now = performance.now();
            this._damageNumbers = this._damageNumbers.filter(
                dn => now - dn.bornAt < dn.maxAge
            );
            if (!this._hasActiveEffects()) {
                this._particleLoopRunning = false;
                this._render(); // final clean frame with no effects
                return;
            }
            this._render();
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }

    // True if any transient visual effect is currently in flight. The
    // particle loop continues until this returns false. Cheap to compute
    // because the enemy count is small (single digits typically).
    _hasActiveEffects() {
        if (this._damageNumbers.length > 0) return true;
        const now = performance.now();
        if ((this._playerHitFlashUntil ?? 0) > now) return true;
        if ((this._playerStaggerUntil  ?? 0) > now) return true;
        for (const e of this.enemies) {
            if ((e._hitFlashUntil ?? 0) > now) return true;
            if ((e._staggerUntil  ?? 0) > now) return true;
        }
        return false;
    }

    // ── Log ──────────────────────────────────────────────────────────────────

    _log(msg) {
        const log = document.getElementById('text-log');
        const line = document.createElement('div');
        line.className = 'log-line';
        line.textContent = msg;
        log.appendChild(line);
        log.scrollTop = log.scrollHeight;
        while (log.children.length > 200) log.removeChild(log.firstChild);
    }
}

// ── Boot ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => new Game().init());
