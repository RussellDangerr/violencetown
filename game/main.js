// main.js — Game orchestrator
// Pixel Dungeon-style: one input = one action = world advances.
// Bump-to-attack. 1-9 select item, Space uses with canvas overlay.

import { Renderer } from './renderer.js';
import { loadMap } from './map.js';
import { loadAllSprites } from './sprites.js';
import { BitmapFont } from './bitmap-font.js';
import { DIR_NAMES, PLAYER_MAX_HP, PLAYER_MAX_MP, SLUDGE_DOT, INVENTORY_SIZE, MAX_STACK } from './data.js';
import { ITEMS, resolveUse, tickTempEquips } from './items.js';
import { attack, formatDamageNumber } from './combat.js';
import { Enemy, resolveEnemyTurns } from './enemies.js';
import { applyGive } from './give-action.js';
import { escapeHtml, manhattan, clamp } from './utils.js';
import { RNG } from './rng.js';
import { hasSave, readSaveRaw, writeSave, loadInto, clearSave } from './save.js';
import { QuestEngine } from './quests.js';
import { doExamine } from './examine.js';
import {
    CANVAS_INTERNAL_PX, HIT_SLOP, OVERLAY_RECTS, THROW_RECTS,
    HOTBAR_X_START, HOTBAR_Y, HOTBAR_SLOT_W, HOTBAR_SLOT_H, HOTBAR_STRIDE, HOTBAR_SLOTS,
    RADIAL_CENTER_X, RADIAL_CENTER_Y, RADIAL_INNER_R_MIN, RADIAL_INNER_R_MAX,
    RADIAL_OUTER_R_MIN, RADIAL_OUTER_R_MAX, LOG_STRIP_RECT, LOG_MODAL_RECT,
} from './layout.js';

// ── States ───────────────────────────────────────────────────────────────────

const STATE = {
    SPLASH:          'splash',
    IDLE:            'idle',            // waiting for input
    ITEM_SELECTED:   'item_selected',   // 1-9 pressed, slot highlighted
    ITEM_OVERLAY:    'item_overlay',    // Space pressed, showing use/throw/smash/give
    ITEM_THROW_DIR:  'item_throw_dir',  // chose Throw, waiting for direction
    ITEM_GIVE_DIR:   'item_give_dir',   // chose Give with multiple adjacent NPCs
    RADIAL_MENU:     'radial_menu',     // bumped a hostile enemy — Omnitrix-style wheel
    RESOLVING:       'resolving',
    DEAD:            'dead',
    WIN:             'win',
    LOG_MODAL:       'log_modal',       // [L] — full scrollable message history
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

// ── Radial menu (Omnitrix-style combat wheel) ───────────────────────────────
// Inner-wheel slice names in clockwise order from 12 o'clock. The renderer
// and Game class both reference this — kept module-level so it's a single
// source of truth.
const RADIAL_SLICES = ['Attack', 'Skill', 'Throw', 'Give', 'Run', 'Defend'];
const RADIAL_SLICE_ANGLE = (Math.PI * 2) / RADIAL_SLICES.length; // 60° per slice
const RADIAL_ANIM_MS = 120; // ease-out duration for wheel rotation

// ── Canvas hit-test geometry ─────────────────────────────────────────────────
// All in-canvas UI geometry now lives in layout.js (imported above), the
// single source shared with renderer.js so tap zones and drawn panels can't
// drift. Origin top-left; the player tile is centered at (304, 304).

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
        // MP — Magic / Skill points. Currently inert (nothing spends from it
        // yet); rendered in the HUD so the resource is visible as the skill
        // system catches up. Every creature gets the same 100/100 baseline
        // via DEFAULT_MP in combat.js.
        this.playerMp    = PLAYER_MAX_MP;
        this.playerMaxMp = PLAYER_MAX_MP;
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
        this._AUTO_REPEAT_MS = 100; // match animation duration so held-key walking has no dead frames between tiles

        // Held-key stack — direction-key codes currently physically held, in
        // press-order with most-recent at the end. Lets keyup fall back to a
        // still-held key instead of stopping movement entirely. Fixes the
        // "release one direction while another is held = freeze" bug.
        this._heldDirKeys = [];

        // In-canvas log strip (Phase 1B of overhead-dialogue plan). Mirrors
        // every _log() call into a fixed-size ring buffer that the renderer
        // draws above the hotbar. Newest message at the bottom; old ones
        // dim with position. The full scrollable history lives in _logHistory
        // (below), surfaced by the [L] log modal.
        this._logStripMessages = [];
        this._STRIP_MAX = 3;

        // Full message history for the [L] log modal. The strip above only
        // keeps the last 3 lines; this is the scrollable archive (newest at
        // end). Capped so a long session can't grow it unbounded. Session-only
        // — not persisted in the save blob (the log resets on reload, like a
        // roguelike message feed). _logModalScroll is how many display-lines
        // we've scrolled up from the newest; the renderer clamps the upper bound.
        this._logHistory = [];
        this._LOG_HISTORY_MAX = 300;
        this._logModalScroll = 0;

        // Inventory: 10 stackable slots, each { itemDef, count } or null
        this.inventory = new Array(INVENTORY_SIZE).fill(null);
        this.selectedSlot = -1; // -1 = none selected

        // Item overlay options (populated when overlay shows)
        this.overlayOptions = {}; // { up: {...}, right: {...}, left: {...}, down: {...} }

        // Overlay slide-in animation timestamp (Phase D). Set when either
        // ITEM_OVERLAY or RADIAL_MENU opens; renderer lerps option
        // positions from center → final over 80ms after this time.
        this._overlayOpenedAt = 0;

        // Radial combat menu (Omnitrix-style wheel). Six inner slices in
        // clockwise order from 12 o'clock: Attack, Skill, Throw, Give, Run,
        // Defend. The cursor index persists across encounters so muscle
        // memory carries (the wheel "starts where you left it"). Sub-wheel
        // picks ALSO persist per category — if you last threw a Rock, opening
        // Throw again has the Rock pre-selected.
        this.radialInnerIndex = 0;  // 0..5 — defaults to Attack
        this.radialSubIndex = {};   // { 'Throw': 2, 'Give': 0, ... } — last sub-pick per category name
        this.radialDrilled = false; // false = cursor on inner wheel, true = on sub-wheel
        this._radialTarget = null;  // the bumped enemy this menu is engaging

        // Wheel rotation animation state — Plan A. The wheel itself rotates
        // around a fixed pointer at 12 o'clock instead of a moving cursor
        // highlight. radialRotationFrom/Target are angles in radians; the
        // current displayed angle is the eased lerp between them based on
        // (now - StartedAt) / RADIAL_ANIM_MS. Sub-wheel has its own parallel
        // set so drilling and sub-rotation animate independently.
        this.radialRotationFrom      = 0;
        this.radialRotationTarget    = 0;
        this.radialRotationStartedAt = 0;
        this.radialSubRotationFrom      = 0;
        this.radialSubRotationTarget    = 0;
        this.radialSubRotationStartedAt = 0;

        // Screen shake (Phase F) — triggered on damage >= threshold. The
        // renderer applies a per-frame random offset to world rendering
        // (HUD stays fixed) while the timestamp is in the future. Magnitude
        // decays linearly to zero as remaining time approaches zero.
        this._screenShakeUntil = 0;
        this._screenShakeMagnitude = 0;

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

        // Economy
        this.gold = 0;

        // Seeded RNG — the single source of gameplay randomness, deterministic
        // and resumable across saves (see rng.js). Reseeded fresh here; the
        // save restores the live stream position via setState.
        this.rng = new RNG();

        // Runtime tile mutations (portcullis / barricade / cleared cells)
        // recorded as diffs vs the map JSON so a save can re-apply them — the
        // map is re-snapshotted from JSON on every _loadMap.
        this._tileDiffs = [];

        // Autosave throttle — write at most every few turns unless forced.
        this._lastAutosaveTurn = -999;

        // Quest tracking (data-driven; see quests.js). Always present so the
        // save system and event emits can reference it unconditionally.
        this.questEngine = new QuestEngine(this);

        // Examinables for the current map — points of interest the Examine
        // skill inspects. Repopulated per map in _loadMap.
        this.examinables = [];
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

        // Bitmap font for all in-canvas UI text. Loaded once and stashed on
        // the renderer so any draw method can call `this.font.drawText(...)`
        // without re-importing. Falls back gracefully if the atlas is
        // missing (renderer's text helpers check `this.font` before using).
        try {
            this.renderer.font = await BitmapFont.load('assets/font_8x8.png');
        } catch (e) {
            console.warn('[bitmap-font] failed to load atlas, falling back to ctx.fillText', e);
            this.renderer.font = null;
        }

        // Render splash screen with pixel art
        const splashCanvas = document.getElementById('splash-canvas');
        if (splashCanvas) this.renderer.renderSplash(splashCanvas);

        await this._loadMap('town-map.json');
        this._bindSplash();
        this._bindInput();
        this._bindTouchControls();
        this._bindCanvasTap(canvas);
        this._bindMenuSheet();
        this._bindHelpModal();

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
            if (this.state !== STATE.SPLASH && !this._animating && !this._particleLoopRunning) {
                this._idleTick++;
                this._render();
            }
        }, 250);

        this._log('[Violencetown loaded — Town hub ready]');
    }

    // ── Map Loading ──────────────────────────────────────────────────────────

    async _loadMap(url, spawnX, spawnY) {
        this.map = await loadMap(url);
        this.playerX = spawnX ?? this.map.spawn.x;
        this.playerY = spawnY ?? this.map.spawn.y;

        // Fresh map = no runtime tile mutations yet. loadInto re-applies saved
        // diffs after this returns.
        this._tileDiffs = [];

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

        // Examinables for this map (live copy of the spawn data).
        this.examinables = this.map.examinableSpawns.map(e => ({ ...e }));

        const zoneEl = document.getElementById('zone-label');
        if (zoneEl) zoneEl.textContent = this.map.zoneName;

        this.renderer.zone = this.map.zoneName;
        this._render();
    }

    // ── Persistence helpers ────────────────────────────────────────────────────

    // Resolve an item id to its definition. Weapons live in WEAPONS, everything
    // else in ITEMS. Used by the save system to rehydrate equipment/inventory
    // (we persist ids, not whole defs).
    _resolveItemDef(id) {
        if (!id) return null;
        if (WEAPONS[id]) return WEAPONS[id];
        return ITEMS[id] || null;
    }

    // Mutate a map tile at runtime AND record the change as a diff so the save
    // can re-apply it (the map JSON is re-snapshotted on every _loadMap).
    setTile(x, y, id) {
        if (!this.map || !this.map.isInBounds(x, y)) return;
        this.map.tiles[y * this.map.width + x] = id;
        const existing = this._tileDiffs.find(d => d.x === x && d.y === y);
        if (existing) existing.id = id;
        else this._tileDiffs.push({ x, y, id });
    }

    // Persist the game. Debounced to every few turns unless forced (forced on
    // map transitions and respawn; quest milestones force it in later phases).
    autosave(opts = {}) {
        if (this.state === STATE.SPLASH || this.state === STATE.DEAD) return;
        if (!opts.force && (this.turn - (this._lastAutosaveTurn ?? -999)) < 5) return;
        this._lastAutosaveTurn = this.turn;
        writeSave(this);
    }

    // Forward a game event to the quest engine (and future subscribers, e.g.
    // the Witness Log journal). Null-safe so early frames never crash on it.
    emitGameEvent(type, payload = {}) {
        if (this.questEngine) this.questEngine.emit(type, payload);
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
        // CONTINUE loads the autosave into the live game. GAME START / Space
        // begins fresh (the existing save survives until the fresh run's first
        // autosave overwrites it, so a stray reload can still resume).
        const continueGame = async () => {
            const raw = readSaveRaw();
            if (!raw) { start(); return; }
            splash.classList.add('gone');
            wrapper.classList.remove('hidden');
            await loadInto(this, raw);
            this._log('[Save loaded]', 'transition');
        };

        document.getElementById('splash-go').addEventListener('click', start);
        const continueBtn = document.getElementById('splash-continue');
        if (continueBtn && hasSave()) {
            continueBtn.classList.remove('hidden');
            continueBtn.addEventListener('click', continueGame);
        }
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

            // ── RADIAL_MENU: just bumped a hostile, drive the Omnitrix wheel ──
            // Left/Right spins the cursor around the wheel (one slice per press).
            // Up (or Space) confirms — either fires the action or drills into the
            // sub-wheel for categories that have sub-options (Throw/Give/Skill).
            // Down (or Esc) cancels — drops back from sub-wheel to inner, or
            // closes the menu entirely without consuming a turn.
            if (this.state === STATE.RADIAL_MENU) {
                e.preventDefault();
                if (e.code === 'ArrowLeft'  || e.code === 'KeyA') { this._radialRotate('left');  return; }
                if (e.code === 'ArrowRight' || e.code === 'KeyD') { this._radialRotate('right'); return; }
                if (e.code === 'ArrowUp'    || e.code === 'KeyW' || e.code === 'Space') { this._radialConfirm(); return; }
                if (e.code === 'ArrowDown'  || e.code === 'KeyS' || e.code === 'Escape') { this._radialCancel(); return; }
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

            // ── LOG_MODAL: scrollable message history ([L]) ──
            // L or Esc closes; up/down (or W/S) scroll one line; PageUp/Down
            // scroll a screenful. Positive scroll = toward older lines; the
            // renderer clamps the upper bound to the history length.
            if (this.state === STATE.LOG_MODAL) {
                e.preventDefault();
                if (e.code === 'KeyL' || e.code === 'Escape')    { this._closeLogModal(); return; }
                if (e.code === 'ArrowUp'   || e.code === 'KeyW')  { this._scrollLogModal(1);   return; }
                if (e.code === 'ArrowDown' || e.code === 'KeyS')  { this._scrollLogModal(-1);  return; }
                if (e.code === 'PageUp')                          { this._scrollLogModal(10);  return; }
                if (e.code === 'PageDown')                        { this._scrollLogModal(-10); return; }
                return;
            }

            // ── WIN: N starts a new game (matches the on-screen prompt) ──
            if (this.state === STATE.WIN) {
                if (e.code === 'KeyN') { e.preventDefault(); this._fullReset(); }
                return;
            }

            // ── IDLE: main input ──
            if (this.state !== STATE.IDLE) return;

            // Arrow/WASD = move (or bump-attack) + start auto-repeat
            const dir = DIRS[e.code];
            if (dir) {
                e.preventDefault();
                // Push onto the held-key stack (de-duplicate so re-pressing
                // an already-held key just brings it back to the top instead
                // of stacking duplicates). On keyup we'll fall back to the
                // new top, which fixes the "releasing one direction key
                // while another is held freezes movement" bug.
                const heldIdx = this._heldDirKeys.indexOf(e.code);
                if (heldIdx >= 0) this._heldDirKeys.splice(heldIdx, 1);
                this._heldDirKeys.push(e.code);
                this._doMove(dir);
                this._startAutoRepeat(e.code, dir);
                return;
            }

            // 1-9 = select item
            const slot = this._digitToSlot(e.code);
            if (slot >= 0) { e.preventDefault(); this._selectItem(slot); return; }

            // Space (no item) = wait turn
            if (e.code === 'Space') { e.preventDefault(); this._log('[Wait]'); this._advanceWorld(); return; }

            // L = open the log history modal
            if (e.code === 'KeyL') { e.preventDefault(); this._openLogModal(); return; }

            // E = examine the faced / adjacent point of interest (free action)
            if (e.code === 'KeyE') { e.preventDefault(); doExamine(this); this._render(); return; }

            // Codeball
            if (e.code === 'Backquote') { e.preventDefault(); this._codeball(); return; }

            // Any other key stops auto-repeat
            this._stopAutoRepeat();
        });

        // Direction-key release: pop from held stack, then either fall back
        // to whichever direction key is still physically held (top of stack)
        // or stop entirely if no held keys remain. Non-direction key releases
        // are no-ops here — they were never in the stack.
        document.addEventListener('keyup', (e) => {
            const heldIdx = this._heldDirKeys.indexOf(e.code);
            if (heldIdx >= 0) this._heldDirKeys.splice(heldIdx, 1);

            if (this._autoRepeatKey !== e.code) return; // not driving movement

            // Released the key currently driving auto-repeat. Pick a fallback
            // from the held stack — most-recently-pressed-still-held wins.
            // Only resume in IDLE state; menus/overlays handle their own input.
            if (this._heldDirKeys.length > 0 && this.state === STATE.IDLE) {
                const fallbackCode = this._heldDirKeys[this._heldDirKeys.length - 1];
                const fallbackDir  = DIRS[fallbackCode];
                if (fallbackDir) {
                    // Restart auto-repeat with the held key now on top of
                    // the stack. We deliberately don't fire _doMove here —
                    // that would feel like a "stutter step" since the player
                    // didn't press anything new. Auto-repeat picks it up on
                    // its next 120ms tick, which feels like a smooth
                    // continuation of the held direction.
                    this._startAutoRepeat(fallbackCode, fallbackDir);
                    return;
                }
            }
            this._stopAutoRepeat();
        });

        // Window blur clears the held stack — browsers don't always fire
        // keyup events for keys held when the window loses focus, so we'd
        // otherwise end up with phantom held keys. Cheap defensive cleanup.
        window.addEventListener('blur', () => {
            this._heldDirKeys = [];
            this._stopAutoRepeat();
        });
    }

    _bindTouchControls() {
        // Direction keys held on touch should auto-repeat the way they do on
        // desktop — holding ArrowDown walks continuously, releasing stops.
        // The original implementation dispatched keydown+keyup back-to-back
        // on pointerdown which killed _startAutoRepeat (it sees the keyup
        // before the next interval fires). We now mirror real keyboard
        // semantics: pointerdown → keydown (which the IDLE handler routes
        // into _startAutoRepeat), pointerup/cancel/leave → keyup (which the
        // held-key stack uses to either fall back to another held direction
        // or stop). Non-direction keys (Space → WAIT) keep the original
        // tap-fires-once behavior; they don't participate in auto-repeat.
        const buttons = document.querySelectorAll('#touch-controls .tc-btn');
        const HOLD_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

        buttons.forEach(btn => {
            const code = btn.dataset.key;
            const isHold = HOLD_KEYS.has(code);
            let down = false;

            const fireDown = (e) => {
                if (e) e.preventDefault();
                if (down) return;            // ignore duplicate enter/down from same finger
                down = true;
                document.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
                if (!isHold) {
                    // One-shot key (Space): release immediately so the input
                    // model sees a clean tap, not a held key.
                    document.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
                    down = false;
                }
            };
            const fireUp = (e) => {
                if (e) e.preventDefault();
                if (!down) return;
                down = false;
                if (isHold) {
                    document.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
                }
            };

            btn.addEventListener('pointerdown',   fireDown);
            btn.addEventListener('pointerup',     fireUp);
            btn.addEventListener('pointercancel', fireUp);
            // Pointer dragged out of the button is treated as a release — the
            // user has clearly stopped holding *this* direction. Without this
            // a finger sliding off the button would leave it stuck.
            btn.addEventListener('pointerleave',  fireUp);
            btn.addEventListener('contextmenu',   e => e.preventDefault());
        });
    }

    _digitToSlot(code) {
        const keys = ['Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','Digit7','Digit8','Digit9','Digit0'];
        return keys.indexOf(code);
    }

    // ── Canvas tap input ─────────────────────────────────────────────────────
    //
    // The keyboard-only paths (Digit1-9 for inventory, Esc to cancel, arrow
    // keys to drive radial / overlay) don't exist on touch. Rather than
    // duplicate every UI surface as a DOM button — which would steal screen
    // space and drift out of sync with the renderer — we hit-test pointerdown
    // events on the canvas against the same pixel rects the renderer drew.
    //
    // All UI elements (hotbar, item overlay, radial menu, throw/give prompt)
    // have known canvas-local coordinates declared as module constants at the
    // top of this file. The renderer reads the same constants conceptually;
    // any layout change must update both halves. We don't actually share the
    // constants between renderer.js and main.js to keep them independently
    // testable — drift would surface as a "I tapped where I saw the button
    // but nothing happened" bug, easy to catch in QA.
    //
    // Also works on desktop (mouse clicks), so the same code path covers
    // both pointer-fine and pointer-coarse users.

    _bindCanvasTap(canvas) {
        canvas.addEventListener('pointerdown', (e) => this._onCanvasPointerDown(e));
        // Prevent text selection / drag from a click-drag on the canvas.
        canvas.addEventListener('dragstart', e => e.preventDefault());
    }

    // ── Menu sheet (replaces standalone NEW + WAIT buttons) ─────────────────
    //
    // One DOM button (#menu-btn, "☰") opens an overlay action sheet with the
    // four functions that used to live as separate UI: Wait (advance turn),
    // Cancel (Escape), Help (open the controls modal), and Restart. The
    // sheet is dismissed by tapping the backdrop, hitting Close, or pressing
    // Escape. On desktop this collapses noise in the corner; on touch it
    // also serves as the discoverability anchor for help — without it a
    // first-time mobile player has no way to find the controls reference.

    _bindMenuSheet() {
        const menuBtn   = document.getElementById('menu-btn');
        const sheet     = document.getElementById('menu-sheet');
        const backdrop  = document.getElementById('menu-sheet-backdrop');
        if (!menuBtn || !sheet) return;

        const open  = () => { sheet.classList.remove('hidden'); };
        const close = () => { sheet.classList.add('hidden'); };

        menuBtn.addEventListener('click', open);
        backdrop?.addEventListener('click', close);
        // Esc closes the sheet without falling through to game state (where
        // it would also cancel things). Captured before _bindInput's handler
        // by checking the sheet's visibility first.
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Escape' && !sheet.classList.contains('hidden')) {
                e.stopPropagation();
                e.preventDefault();
                close();
            }
        }, true); // capture phase — beat _bindInput's bubble-phase handler

        sheet.querySelectorAll('.menu-item').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.action;
                close();
                switch (action) {
                    case 'wait':
                        // Same as pressing Space in IDLE: log a wait line and
                        // advance the world. Mirrors the previous WAIT
                        // button's behavior so muscle memory carries.
                        if (this.state === STATE.IDLE) {
                            this._log('[Wait]');
                            this._advanceWorld();
                        }
                        break;
                    case 'cancel':
                        // Synthetic Escape — routes through the same paths
                        // the keyboard Escape does (close overlay, abort
                        // throw, back out of radial menu, etc.).
                        document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));
                        break;
                    case 'help':
                        this._openHelpModal();
                        break;
                    case 'restart':
                        // Match the previous NEW button's behavior — it had
                        // no confirm, so we don't add one here. Consistency
                        // beats friction for a < 30s playthrough demo.
                        this._fullReset();
                        break;
                    case 'close':
                        // No-op beyond the close() above.
                        break;
                }
            });
        });
    }

    // ── Help modal ──────────────────────────────────────────────────────────
    //
    // Controls reference overlay. Triggered by `?` on desktop and the Help
    // item in the menu sheet on touch. Content lives in index.html (#help-
    // modal) so editing the controls list is a single-place change. The
    // modal is purely informational — it gates no game state, so it can
    // safely overlay any state and be dismissed without consequence.

    _openHelpModal() {
        const modal = document.getElementById('help-modal');
        if (modal) modal.classList.remove('hidden');
    }
    _closeHelpModal() {
        const modal = document.getElementById('help-modal');
        if (modal) modal.classList.add('hidden');
    }
    _bindHelpModal() {
        const modal = document.getElementById('help-modal');
        if (!modal) return;
        const backdrop = document.getElementById('help-modal-backdrop');
        const closeBtn = document.getElementById('help-close');
        backdrop?.addEventListener('click', () => this._closeHelpModal());
        closeBtn?.addEventListener('click', () => this._closeHelpModal());
        // ? opens (Slash on US layouts also fires `?` via shift), Esc closes.
        // Use capture phase to beat _bindInput's bubble-phase handler so Esc
        // closes the modal instead of cancelling game state behind it.
        document.addEventListener('keydown', (e) => {
            // Skip when typing in an input (defensive — no inputs exist today)
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (e.key === '?' || (e.code === 'Slash' && e.shiftKey)) {
                e.preventDefault();
                if (modal.classList.contains('hidden')) this._openHelpModal();
                else                                    this._closeHelpModal();
            }
            if (e.code === 'Escape' && !modal.classList.contains('hidden')) {
                e.stopPropagation();
                e.preventDefault();
                this._closeHelpModal();
            }
        }, true); // capture
    }

    // Convert a pointer event's clientX/clientY into the canvas's internal
    // 608×608 coordinate space. The canvas is CSS-scaled to fit the viewport
    // (aspect-ratio:1, height:100% on desktop, viewport-bounded on mobile),
    // so we scale by the bounding rect ratio. Returns null if the canvas
    // hasn't laid out yet (extremely rare; defensive).
    _canvasLocalCoords(e, canvas) {
        const rect = canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return null;
        return {
            x: (e.clientX - rect.left) * (CANVAS_INTERNAL_PX / rect.width),
            y: (e.clientY - rect.top)  * (CANVAS_INTERNAL_PX / rect.height),
        };
    }

    // True while a transient UI animation is in flight (overlay slide-in or
    // radial wheel rotation). Mirrors the keyboard input gate at line 313 —
    // taps during animations would land on a visually-empty position or
    // mid-rotation slice and feel buggy. Gate them out cleanly.
    _uiAnimating() {
        const now = performance.now();
        if (this.state === STATE.ITEM_OVERLAY || this.state === STATE.RADIAL_MENU) {
            if (now - (this._overlayOpenedAt ?? 0) < 80) return true;
        }
        if (this.state === STATE.RADIAL_MENU) {
            if (now - (this.radialRotationStartedAt    ?? 0) < RADIAL_ANIM_MS) return true;
            if (now - (this.radialSubRotationStartedAt ?? 0) < RADIAL_ANIM_MS) return true;
        }
        return false;
    }

    _onCanvasPointerDown(e) {
        // Mirror the keyboard gate: don't process taps during the move
        // animation or while the world is resolving. Splash has its own
        // handler (DOM button). Dead/Win are non-interactive end states.
        if (this.state === STATE.SPLASH || this.state === STATE.RESOLVING) return;
        if (this.state === STATE.DEAD   || this.state === STATE.WIN)        return;
        if (this._animating || this._uiAnimating()) return;

        const canvas = e.currentTarget;
        const pt = this._canvasLocalCoords(e, canvas);
        if (!pt) return;
        e.preventDefault();

        // Log modal is fully modal — route taps to it and nothing behind it.
        if (this.state === STATE.LOG_MODAL) { this._tapLogModal(pt); return; }

        // Priority order is by modality: the most exclusive overlay wins. A
        // tap while the radial menu is open should drive the radial menu,
        // not fall through to the hotbar visible behind/under it.
        if (this.state === STATE.ITEM_THROW_DIR || this.state === STATE.ITEM_GIVE_DIR) {
            this._tapThrowPrompt(pt);
            return;
        }
        if (this.state === STATE.RADIAL_MENU) {
            this._tapRadialMenu(pt);
            return;
        }
        if (this.state === STATE.ITEM_OVERLAY) {
            this._tapItemOverlay(pt);
            return;
        }
        // Tapping the on-canvas log strip opens the full history modal — the
        // touch equivalent of pressing L. IDLE only; in a menu the tap should
        // drive the menu, not pop the log.
        if (this.state === STATE.IDLE && this._pointInRect(pt, LOG_STRIP_RECT, HIT_SLOP)) {
            this._openLogModal();
            return;
        }

        // IDLE or ITEM_SELECTED → hotbar tap. Outside the hotbar = no-op (we
        // could route "tap on world tile" to movement here in a future pass,
        // but PD-style discrete tile taps aren't part of the current scope).
        this._tapHotbar(pt);
    }

    _pointInRect(p, r, slop = 0) {
        return p.x >= r.x - slop && p.x <= r.x + r.w + slop
            && p.y >= r.y - slop && p.y <= r.y + r.h + slop;
    }

    _tapHotbar(pt) {
        // 9 slots in a row at y=546. Inflate hit zone by HIT_SLOP each side
        // (so the visual stays 42×42 but the effective tap zone is 54×54),
        // clearing Apple's 44pt minimum touch target without changing layout.
        for (let i = 0; i < HOTBAR_SLOTS; i++) {
            const r = {
                x: HOTBAR_X_START + i * HOTBAR_STRIDE,
                y: HOTBAR_Y,
                w: HOTBAR_SLOT_W,
                h: HOTBAR_SLOT_H,
            };
            if (!this._pointInRect(pt, r, HIT_SLOP)) continue;
            // Mirror the keyboard idiom:
            //   - tap a slot when nothing's selected → select it (state ITEM_SELECTED)
            //   - tap the same slot again            → open the use overlay
            //   - tap a different slot               → switch selection
            if (this.state === STATE.ITEM_SELECTED && this.selectedSlot === i) {
                this._openItemOverlay();
            } else {
                this._selectItem(i);
            }
            return;
        }
        // Tap outside the hotbar while a slot is selected = cancel selection
        // (matches Escape behavior). Keeps the UI escapable on touch.
        if (this.state === STATE.ITEM_SELECTED) {
            this.selectedSlot = -1;
            this.state = STATE.IDLE;
            this._render();
        }
    }

    _tapItemOverlay(pt) {
        for (const dir of ['up', 'right', 'down', 'left']) {
            if (this.overlayOptions[dir] && this._pointInRect(pt, OVERLAY_RECTS[dir], HIT_SLOP)) {
                this._pickOverlay(dir);
                return;
            }
        }
        // Tap outside the four options = cancel back to ITEM_SELECTED.
        this.state = STATE.ITEM_SELECTED;
        this._render();
    }

    _tapThrowPrompt(pt) {
        const dirVecs = {
            up:    { dx:  0, dy: -1 },
            down:  { dx:  0, dy:  1 },
            left:  { dx: -1, dy:  0 },
            right: { dx:  1, dy:  0 },
        };
        for (const dir of ['up', 'right', 'down', 'left']) {
            if (this._pointInRect(pt, THROW_RECTS[dir], HIT_SLOP)) {
                const vec = dirVecs[dir];
                if (this.state === STATE.ITEM_THROW_DIR) this._doThrow(vec);
                else                                     this._doGiveDir(vec);
                return;
            }
        }
        // Tap outside the four cardinals = cancel (no turn consumed).
        this.state = STATE.IDLE;
        this.selectedSlot = -1;
        this._render();
    }

    _tapRadialMenu(pt) {
        // Polar hit-test. Inner ring picks a top-level slice; outer ring
        // picks a sub-wheel slice (only valid when drilled). Tap outside
        // both rings = cancel.
        const lx = pt.x - RADIAL_CENTER_X;
        const ly = pt.y - RADIAL_CENTER_Y;
        const r  = Math.hypot(lx, ly);

        if (r < RADIAL_INNER_R_MIN) {
            // Tapped the wheel's dead center — treat as no-op rather than
            // accidental cancel; the visual hub is non-interactive.
            return;
        }
        if (r > RADIAL_OUTER_R_MAX + HIT_SLOP) {
            // Tap clearly outside the wheel = cancel.
            this._radialCancel();
            return;
        }

        // Convert atan2 (math convention: 0=+x, CCW positive, +y is down so
        // visually it reads as CW) into "clock angle" (0=12, CW positive).
        // The wheel slices are addressed by clock angle.
        const TAU = Math.PI * 2;
        let clockAngle = Math.atan2(ly, lx) + Math.PI / 2;
        clockAngle = ((clockAngle % TAU) + TAU) % TAU;

        const drilled = this.radialDrilled;
        const inInner = r >= RADIAL_INNER_R_MIN - HIT_SLOP && r <= RADIAL_INNER_R_MAX + HIT_SLOP;
        const inOuter = r >= RADIAL_OUTER_R_MIN - HIT_SLOP && r <= RADIAL_OUTER_R_MAX + HIT_SLOP;

        if (drilled && inOuter) {
            // Sub-wheel hit. Span is min(M*sliceAngle, π) so a tap can land
            // outside the visible arc — bail if so. The renderer agent's
            // spec said sub-slices may not cover a full circle.
            const cat   = RADIAL_SLICES[this.radialInnerIndex];
            const items = this._radialSubItems(cat);
            if (items.length === 0) return;
            const span         = Math.min(items.length * RADIAL_SLICE_ANGLE, Math.PI);
            const subAngle     = span / items.length;
            const subRotation  = this._currentRadialSubRotation();
            // Same math as inner wheel but using sub-slice geometry.
            let rel = clockAngle - subRotation;
            rel = ((rel % TAU) + TAU) % TAU;
            // The sub-wheel is centered at 12 o'clock (clock angle 0) and
            // spans `span` total. Slice 0 is at the center; slices spread
            // out symmetrically (renderer renders them centered on the
            // pointer). Re-fold rel into (-π, π] then check it's in the span.
            let foldedRel = rel;
            if (foldedRel > Math.PI) foldedRel -= TAU;
            // The renderer draws sub-slice i at offset `i * subAngle` from
            // the sub-rotation pivot, so once we've removed the rotation
            // the slice index is round(foldedRel / subAngle), modulo M.
            // (Same shape as inner-wheel math; the sub-wheel just has more
            // or fewer slices than 6.)
            const subIdx = Math.round(foldedRel / subAngle);
            if (subIdx < -items.length / 2 || subIdx >= items.length / 2 + 1) return;
            const wrapped = ((subIdx % items.length) + items.length) % items.length;
            if (wrapped === this.radialSubIndex[cat]) {
                // Tap on the already-pointed sub-slice = confirm.
                this._radialConfirm();
            } else {
                // Jump-to-slice. Bypass _radialRotate's 1-slice-step idiom
                // (a keyboard convention) and animate directly to the tapped
                // index. _animateSubRotation reads radialSubIndex so set it
                // first.
                this.radialSubIndex[cat] = wrapped;
                this._animateSubRotation(items.length);
                this._ensureParticleLoop();
                this._render();
            }
            return;
        }

        if (!drilled && inInner) {
            // Inner-wheel hit. 6 slices, RADIAL_SLICE_ANGLE apart, rotation
            // = -RADIAL_SLICE_ANGLE * radialInnerIndex (so slice i sits at
            // the pointer when innerIndex === i).
            const innerRotation = this._currentRadialRotation();
            let rel = clockAngle - innerRotation;
            rel = ((rel % TAU) + TAU) % TAU;
            const idx = Math.round(rel / RADIAL_SLICE_ANGLE) % RADIAL_SLICES.length;
            const wrapped = ((idx % RADIAL_SLICES.length) + RADIAL_SLICES.length) % RADIAL_SLICES.length;
            if (wrapped === this.radialInnerIndex) {
                // Tap on the already-pointed slice = confirm.
                this._radialConfirm();
            } else {
                // Jump to the tapped slice. Match the muscle-memory model:
                // tap = "select that slice now."
                this.radialInnerIndex = wrapped;
                this._animateInnerRotation();
                this._ensureParticleLoop();
                this._render();
            }
            return;
        }

        // Inside the wheel envelope but in the gap between rings (r ~80..84
        // when not drilled, or otherwise off-target). Treat as no-op so a
        // misfire doesn't accidentally cancel the whole encounter.
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

            // Bumping a hostile enemy opens the radial wheel (Omnitrix-style)
            // instead of attacking immediately. The wheel exposes Attack,
            // Skill, Throw, Give, Run, Defend in a static layout so muscle
            // memory works, with cursor persistence across encounters.
            // Down/Esc backs out without consuming a turn — protects against
            // accidental bumps.
            this._openRadialMenu(enemy);
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

        // Up = primary use (eat/drink/apply/use)
        if (item.useType === 'self') {
            let label = 'Use';
            if (item.effect === 'heal') label = item.category === 'ambro' ? 'Eat' : 'Drink';
            else if (item.effect === 'cure_sludge') label = 'Use';
            this.overlayOptions.up = { label, action: 'use' };
        } else {
            this.overlayOptions.up = { label: 'Use', action: 'use' };
        }

        // Right = throw (always available)
        this.overlayOptions.right = { label: 'Throw', action: 'throw' };

        // Adjacent NPCs — partitioned into hostile-eligible vs non-hostile.
        // Smash uses the canonical _adjacentHostiles helper so the gate
        // semantics live in one place. Give targets ALL adjacent NPCs
        // (including non-hostile ones like Carrion), so it uses the broader
        // inline filter — Give is the one combat-adjacent action that
        // legitimately targets friendlies.
        const adjAll = this.enemies.filter(e =>
            e.entity.isAlive() && manhattan(e.x, e.y, this.playerX, this.playerY) === 1
        );
        const adjHostile = this._adjacentHostiles();

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
        this._overlayOpenedAt = performance.now();
        this._ensureParticleLoop(); // animate the slide-in (Phase D)
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
                // Friendly filtering routed through the canonical helper.
                const adjHostile = this._adjacentHostiles();
                adjHostile.sort((a, b) => a.entity.hp - b.entity.hp);
                if (adjHostile.length === 0) {
                    // Target gone between opening the overlay and confirming —
                    // don't waste the item or a turn; drop back to selected.
                    this._log('[Nothing to smash.]');
                    this.state = STATE.ITEM_SELECTED;
                    this._render();
                    return;
                }
                const dmg = 10 * stack.count;
                const result = this.combatAttack(adjHostile[0], dmg);
                this._log(`[Smashed ${item.name} on ${adjHostile[0].entity.name} — ${result}]`);
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

    // ── Radial Menu (Omnitrix-style combat wheel) ─────────────────────────────
    //
    // Bumping a hostile enemy opens a six-slice wheel centered on the player
    // (Attack, Skill, Throw, Give, Run, Defend, clockwise from 12 o'clock).
    // Left/Right spins the cursor around the wheel one slice at a time.
    // Up (or Space) confirms — fires the action directly, or drills into a
    // sub-wheel for categories that have sub-options. Down (or Esc) cancels —
    // backs out of the sub-wheel, or closes the menu entirely.
    //
    // The cursor positions (inner index AND last sub-pick per category)
    // persist across encounters so the wheel "starts where you left it" —
    // muscle memory carries even though the wheel exposes more options than
    // the player's 4 arrow keys would otherwise allow.
    //
    // Reuses existing combat / item resolution paths (combatAttack, doThrow,
    // doGive, addBuff) by setting selectedSlot before delegating — keeps this
    // method focused on menu state, not action mechanics.

    _openRadialMenu(enemy) {
        // Halt any in-flight walk cleanly. Auto-repeat would otherwise keep
        // firing _doMove until the next tick's state-check catches up (up to
        // 120ms later), which would feel like a residual lurch into the
        // enemy you're now in combat with. Clear the held stack too — the
        // player needs to release-and-re-press to walk again after combat,
        // which is the safe default given they were aiming at this enemy.
        this._stopAutoRepeat();
        this._heldDirKeys = [];

        this._radialTarget = enemy;
        this.radialDrilled = false;
        // radialInnerIndex preserved from last open (or 0 default in constructor)
        // Snap rotation to that index — no animation on open, the wheel just
        // appears already oriented to the last-used slice.
        const snap = -RADIAL_SLICE_ANGLE * this.radialInnerIndex;
        this.radialRotationFrom      = snap;
        this.radialRotationTarget    = snap;
        this.radialRotationStartedAt = 0; // way in the past → eased lerp = 1
        this.state = STATE.RADIAL_MENU;
        this._overlayOpenedAt = performance.now();
        this._ensureParticleLoop(); // reuse the existing slide-in animation pump
    }

    // ── Wheel rotation interpolation ─────────────────────────────────────────
    //
    // The renderer calls these to get the current displayed angle each frame.
    // Lives on Game so both main.js (mid-animation snapshot) and renderer.js
    // (per-frame draw) can compute the same value without duplicating the
    // ease-out cubic math.

    _currentRadialRotation() {
        const t = Math.min(1, (performance.now() - (this.radialRotationStartedAt || 0)) / RADIAL_ANIM_MS);
        const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
        return this.radialRotationFrom + (this.radialRotationTarget - this.radialRotationFrom) * eased;
    }

    _currentRadialSubRotation() {
        const t = Math.min(1, (performance.now() - (this.radialSubRotationStartedAt || 0)) / RADIAL_ANIM_MS);
        const eased = 1 - Math.pow(1 - t, 3);
        return this.radialSubRotationFrom + (this.radialSubRotationTarget - this.radialSubRotationFrom) * eased;
    }

    // Shortest signed angular distance — chooses the direction that wraps less
    // than half a turn. Used to make Right-from-Defend-to-Attack feel like one
    // slice step (60°) instead of a 5-slice spin (300° the wrong way).
    _shortestAngularPath(from, target) {
        while (target - from >  Math.PI) target -= 2 * Math.PI;
        while (target - from < -Math.PI) target += 2 * Math.PI;
        return target;
    }

    _closeRadialMenu() {
        this._radialTarget = null;
        this.radialDrilled = false;
        this.state = STATE.IDLE;
        this._render();
    }

    _radialRotate(direction) {
        const delta = direction === 'right' ? 1 : -1;
        if (this.radialDrilled) {
            const cat = RADIAL_SLICES[this.radialInnerIndex];
            const items = this._radialSubItems(cat);
            if (items.length === 0) return; // empty sub-wheel — nothing to rotate
            const cur = this.radialSubIndex[cat] ?? 0;
            this.radialSubIndex[cat] = (cur + delta + items.length) % items.length;
            this._animateSubRotation(items.length);
        } else {
            const n = RADIAL_SLICES.length;
            this.radialInnerIndex = (this.radialInnerIndex + delta + n) % n;
            this._animateInnerRotation();
        }
        this._ensureParticleLoop(); // keep the renderer running during the 120ms lerp
        this._render();
    }

    _animateInnerRotation() {
        // Snapshot the angle currently DISPLAYED (could be mid-animation if the
        // player is spamming arrows) as the new `From`. Then compute the new
        // `Target` for the updated index, picking the shortest angular path so
        // wrap-around (e.g., Defend → Attack at the boundary) feels like one
        // slice step rather than a 5-slice unwind.
        this.radialRotationFrom = this._currentRadialRotation();
        const naive = -RADIAL_SLICE_ANGLE * this.radialInnerIndex;
        this.radialRotationTarget = this._shortestAngularPath(this.radialRotationFrom, naive);
        this.radialRotationStartedAt = performance.now();
    }

    _animateSubRotation(itemCount) {
        // Sub-wheel slice angle depends on how many items fit in the outer arc.
        // Renderer caps the span at π (a half-circle) — mirror that math here
        // so the rotation animation lines up exactly with where the renderer
        // draws each sub-slice.
        const span = Math.min(itemCount * RADIAL_SLICE_ANGLE, Math.PI);
        const subSliceAngle = span / itemCount;
        const cat = RADIAL_SLICES[this.radialInnerIndex];
        const subIdx = this.radialSubIndex[cat] ?? 0;
        this.radialSubRotationFrom = this._currentRadialSubRotation();
        const naive = -subSliceAngle * subIdx;
        this.radialSubRotationTarget = this._shortestAngularPath(this.radialSubRotationFrom, naive);
        this.radialSubRotationStartedAt = performance.now();
    }

    _radialCancel() {
        if (this.radialDrilled) {
            // Pop sub-wheel, back to inner cursor (no turn consumed)
            this.radialDrilled = false;
            this._render();
        } else {
            // Close menu (no turn consumed) — protects accidental bumps
            this._closeRadialMenu();
        }
    }

    _radialConfirm() {
        const cat = RADIAL_SLICES[this.radialInnerIndex];

        // Target check — enemy might have died mid-menu (DOT, ally hit, etc.)
        const enemy = this._radialTarget;
        if (!enemy || !enemy.entity.isAlive()) {
            this._closeRadialMenu();
            return;
        }

        if (this.radialDrilled) {
            this._fireSubAction(cat);
            return;
        }

        // Inner-wheel confirm. Defend and Run fire immediately (single verb).
        // Attack / Throw / Give / Skill all have sub-wheels — drill in.
        if (cat === 'Defend') { this._radialDefend(); return; }
        if (cat === 'Run')    { this._radialRun();    return; }

        if (cat === 'Attack' || cat === 'Throw' || cat === 'Give' || cat === 'Skill') {
            // Pre-flight: Throw/Give need at least one usable item. Attack
            // always has at least the Basic move available. Skill can be
            // empty (player hasn't transformed yet) — we still drill in so
            // the player sees the empty-slot feedback explicitly.
            const items = this._radialSubItems(cat);
            if (items.length === 0 && cat !== 'Skill') {
                this._log(`[Nothing to ${cat.toLowerCase()}]`);
                return; // stay on inner cursor — easier to recover
            }
            // Initialize / clamp sub-cursor to a valid index for this category
            const curSub = this.radialSubIndex[cat] ?? 0;
            this.radialSubIndex[cat] = Math.min(curSub, Math.max(0, items.length - 1));
            this.radialDrilled = true;
            // Snap sub-wheel rotation to current sub-index (no animation on
            // drill-in — the sub-wheel just appears already oriented). Skill's
            // empty placeholder uses M=1 so the angle math doesn't divide by 0.
            const M = Math.max(1, items.length);
            const span = Math.min(M * RADIAL_SLICE_ANGLE, Math.PI);
            const subSliceAngle = span / M;
            const snap = -subSliceAngle * this.radialSubIndex[cat];
            this.radialSubRotationFrom      = snap;
            this.radialSubRotationTarget    = snap;
            this.radialSubRotationStartedAt = 0;
            this._render();
        }
    }

    // ── Inner-wheel action firing ────────────────────────────────────────────

    _radialAttack(enemy) {
        const weapon = this.equipment.weapon;
        if (weapon) {
            this.combatAttack(enemy, weapon.damage);
        } else {
            enemy.entity.takeDamage(1);
            this._spawnDamageNumber(enemy.x, enemy.y, '-1', '#ffdd44', 14);
            this._spawnEventWord(enemy.x, enemy.y, 'TAP!', '#ffaa44', 14);
        }
        this._radialTarget = null;
        this.state = STATE.IDLE;
        this._advanceWorld();
    }

    _radialDefend() {
        // Guard for 2 turns so the buff covers the upcoming enemy turn
        this.addBuff('guard', 'Guard', 2, 'buff');
        this._log('[Bracing — incoming damage halved.]');
        this._radialTarget = null;
        this.state = STATE.IDLE;
        this._advanceWorld();
    }

    _radialRun() {
        // Instant exit — no turn consumed. Cursor stays on Run for next open
        // (Caelan's "starts where you left it" — if Running was the last
        // pick, the menu opens already on Run).
        this._log('[Backed away.]');
        this._closeRadialMenu();
    }

    // ── Sub-wheel action firing ──────────────────────────────────────────────

    // Sub-options available for a given category. Returns an array of
    // { label, key } pairs where:
    //   - label: string the renderer draws in the outer arc
    //   - key:   payload _fireSubAction uses to dispatch (slot index for
    //            Throw/Give, move name string for Attack)
    //
    // Throw filters to non-self-use items; Give accepts every occupied slot.
    // Attack has a fixed list of move variants (Basic = standard weapon swing,
    // Cleave = AOE all cardinal hostiles at 0.75× damage). Skill returns
    // empty for now — reserved for future creature abilities (Wererat
    // squeeze, Robot override, etc., per cosmology canon).
    _radialSubItems(cat) {
        if (cat === 'Attack') {
            return [
                { label: 'Basic',  key: 'basic'  },
                { label: 'Cleave', key: 'cleave' },
                { label: 'Poke',   key: 'poke'   },
            ];
        }
        if (cat === 'Throw') {
            const out = [];
            for (let i = 0; i < this.inventory.length; i++) {
                const s = this.inventory[i];
                if (s && s.itemDef.useType !== 'self') {
                    const name = s.itemDef.name.replace(/[\[\]]/g, '');
                    out.push({ label: s.count > 1 ? `${name} ×${s.count}` : name, key: i });
                }
            }
            return out;
        }
        if (cat === 'Give') {
            const out = [];
            for (let i = 0; i < this.inventory.length; i++) {
                const s = this.inventory[i];
                if (s) {
                    const name = s.itemDef.name.replace(/[\[\]]/g, '');
                    out.push({ label: s.count > 1 ? `${name} ×${s.count}` : name, key: i });
                }
            }
            return out;
        }
        return []; // Skill (or unknown) — empty
    }

    _fireSubAction(cat) {
        if (cat === 'Skill') {
            this._log('[No skills available — try transforming first]');
            this.radialDrilled = false;
            this._render();
            return;
        }

        const items = this._radialSubItems(cat);
        if (items.length === 0) {
            // Defensive — Throw/Give pre-flight should catch this, but in case
            // inventory changed mid-menu (e.g., consumed item via a buff tick)
            this._log(`[Nothing to ${cat.toLowerCase()}]`);
            this.radialDrilled = false;
            this._render();
            return;
        }

        const subIdx = Math.min(this.radialSubIndex[cat] ?? 0, items.length - 1);
        this.radialSubIndex[cat] = subIdx; // clamp the persisted value too
        const sub = items[subIdx];

        const enemy = this._radialTarget;
        if (!enemy || !enemy.entity.isAlive()) {
            this._closeRadialMenu();
            return;
        }

        this.radialDrilled = false;
        this._radialTarget = null;

        // Attack moves — variant dispatch by sub-key. Basic reuses the
        // existing single-target weapon swing (_radialAttack). Cleave is
        // AOE: every cardinal-adjacent hostile takes 0.75× weapon damage.
        // The 0.75× multiplier is Caelan's call from the design discussion —
        // tradeoff is targets vs. per-target damage.
        if (cat === 'Attack') {
            if (sub.key === 'basic')  { this._radialAttack(enemy); return; }
            if (sub.key === 'cleave') { this._radialCleave();      return; }
            if (sub.key === 'poke')   { this._radialPoke(enemy);   return; }
            return; // unknown attack key — defensive no-op
        }

        // Throw / Give — sub.key is the inventory slot index. Set selectedSlot
        // so the existing _doThrow / _doGive paths consume the right item.
        // Both methods reset selectedSlot and state→IDLE on their own.
        this.selectedSlot = sub.key;

        if (cat === 'Throw') {
            // Auto-direction toward the bumped enemy (Math.sign yields the
            // unit step on each axis — works for cardinal-adjacent enemies,
            // which is the only kind the radial menu opens against)
            const dir = {
                dx: Math.sign(enemy.x - this.playerX),
                dy: Math.sign(enemy.y - this.playerY),
            };
            this._doThrow(dir);
            return;
        }
        if (cat === 'Give') {
            this._doGive(enemy);
            return;
        }
    }

    _radialCleave() {
        // Hit every cardinal-adjacent hostile-eligible enemy. Friendly NPCs
        // (Carrion, flipped allies) are filtered out by the canonical helper.
        const hostiles = this._adjacentHostiles();
        const weapon = this.equipment.weapon;
        const baseDmg = weapon ? weapon.damage : 1;
        const cleaveDmg = Math.max(1, Math.floor(baseDmg * 0.75));

        if (hostiles.length === 0) {
            // Defensive — radial target died mid-menu and no other hostiles
            // around. Close without consuming a turn.
            this._closeRadialMenu();
            return;
        }

        for (const e of hostiles) {
            this.combatAttack(e, cleaveDmg);
        }
        // Spawn a "CLEAVE!" event word at the player position so the player
        // sees the move name fire — distinguishes Cleave from Basic visually
        // (same damage numbers but extra event word above the player tile)
        this._spawnEventWord(this.playerX, this.playerY, 'CLEAVE!', '#ffaa44', 16);

        this.state = STATE.IDLE;
        this._advanceWorld();
    }

    _radialPoke(enemy) {
        // Trade damage for guaranteed Blind. Deterministic — no RNG, matches
        // combat.js's "no miss" contract. Effect: halved enemy outgoing damage
        // for 2 turns (read by resolveEnemyTurns via enemy.hasBuff('blind')).
        const weapon = this.equipment.weapon;
        const baseDmg = weapon ? weapon.damage : 1;
        const pokeDmg = Math.max(1, Math.floor(baseDmg * 0.5));

        this.combatAttack(enemy, pokeDmg);
        // Apply Blind. addBuff refreshes turns if already present (so a
        // double-Poke just resets the timer to 2 — no stacking).
        enemy.addBuff('blind', 'Blind', 2, 'debuff');
        this._spawnEventWord(enemy.x, enemy.y, 'POKE!', '#ffaa44', 14);

        this.state = STATE.IDLE;
        this._advanceWorld();
    }

    // ── Canonical adjacent-hostile filter ────────────────────────────────────
    //
    // Returns cardinal-adjacent enemies that are (a) alive and (b) pass the
    // behavior-whitelist HOSTILE gate. The gate's semantics: an enemy with
    // no behavior array is a legacy hostile (back-compat with pre-FSM data);
    // an enemy with a behavior array is hostile only if 'HOSTILE' appears
    // in that array. Flipped allies (disposition flip removed HOSTILE) and
    // dialogue NPCs like Carrion (behavior: [IDLE]) are both filtered out.
    //
    // Every combat verb (bump-attack, Smash, Cleave, Poke, future verbs)
    // should route through this helper so the friendly-protection invariant
    // can't be accidentally broken by a future verb forgetting to filter.

    _adjacentHostiles() {
        return this.enemies.filter(e =>
            e.entity.isAlive()
            && manhattan(e.x, e.y, this.playerX, this.playerY) === 1
            && (!e.behavior || e.behavior.includes('HOSTILE'))
        );
    }

    // ── World Advance (after any action) ─────────────────────────────────────

    _advanceWorld() {
        this.turn++;

        // Enemies act. Messages come back as either plain strings (legacy:
        // FSM activity reports, tickTempEquips) or tuples (overhead-dialogue
        // v1: barks, adjacency-barks, "spotted you!"). Tuples carry their
        // source enemy and a category — spoken lines float above the speaker;
        // strings fall through to the side log.
        const msgs = resolveEnemyTurns(this);
        for (const m of msgs) {
            if (typeof m === 'string') {
                this._log(m);
            } else if (m && (m.category === 'bark' || m.category === 'adjacency-bark' || m.category === 'spotted')) {
                this._spawnOverheadDialogue(m.sourceEnemy.x, m.sourceEnemy.y, m.text, {
                    sourceRef: m.sourceEnemy,   // groups per-speaker for the stack
                });
                if (m.category === 'adjacency-bark') {
                    this.emitGameEvent('npc_adjacent', { id: m.sourceEnemy.id, type: m.sourceEnemy.type });
                }
            } else {
                // Unknown tuple shape — fail safe to the log so nothing gets
                // dropped silently if a future category lands without a route.
                this._log(m.text ?? String(m));
            }
        }
        if (this.playerHp <= 0) { this.playerHp = 0; this._die(); return; }

        // Temp equips tick
        const equipMsgs = tickTempEquips(this);
        for (const m of equipMsgs) this._log(m);

        // Soap cancels sludge at end of turn. The flag is set in _doItemUse
        // BEFORE this runs, so the reset MUST come after the check — resetting
        // at the top of _advanceWorld wiped it before it could be consumed.
        if (this._soapUsedThisTurn && this.hasBuff('sludge')) {
            this.removeBuff('sludge');
            this._log('[Soap neutralized sludge]');
        }
        this._soapUsedThisTurn = false;

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
            // Block input during the async map load — stay RESOLVING until the
            // new map is in place (the .then() restores IDLE). Prevents acting
            // against the old map mid-fetch.
            this.state = STATE.RESOLVING;
            this._loadMap(t.toMap, t.toX, t.toY).then(() => {
                this._log(`[Entered ${this.map.zoneName}]`);
                this.state = STATE.IDLE;
                this.emitGameEvent('map_entered', { map: t.toMap });
                this.autosave({ force: true });
                this._render();
            });
            return;
        }

        this._render();
        this.autosave();
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
                this.emitGameEvent('item_pickup', { id: this.groundItems[idx].def.id });
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
        const dmgSize = 14 + Math.min(10, Math.floor(result.dealt / 5));
        const color = result.killed ? '#ffaa22' : '#ffdd44';
        this._spawnDamageNumber(enemyObj.x, enemyObj.y, `-${result.dealt}`, color, dmgSize);

        // Hit flash + stagger — Phase C, polished in B6. Flash duration
        // and stagger distance now scale with damage so light taps feel
        // light and heavy hits feel heavy. Range: 80ms→200ms flash,
        // 80ms→160ms stagger, 3px→6px push.
        const now = performance.now();
        const heaviness = Math.min(1, result.dealt / 25);  // 0..1
        const flashMs   = 80  + Math.round(heaviness * 120);
        const staggerMs = 80  + Math.round(heaviness * 80);
        const pushPx    = 3   + heaviness * 3;
        enemyObj._hitFlashUntil = now + flashMs;
        enemyObj._staggerUntil  = now + staggerMs;
        const dx = enemyObj.x - this.playerX;
        const dy = enemyObj.y - this.playerY;
        const len = Math.abs(dx) + Math.abs(dy);
        enemyObj._staggerDx = len > 0 ? (dx / len) * pushPx : 0;
        enemyObj._staggerDy = len > 0 ? (dy / len) * pushPx : 0;
        this._ensureParticleLoop(); // keep rendering through the 100ms window

        // Screen shake on heavy hits or kills — Phase F. Threshold is 15
        // damage given the small-numbers cosmology (HP 100-200, damage
        // mostly 5-30). Kills shake regardless of damage magnitude since
        // a killing blow is a milestone event worth a beat.
        if (result.dealt >= 15 || result.killed) {
            const mag = result.killed ? 5 : 3 + Math.min(4, (result.dealt - 15) / 5);
            this._triggerScreenShake(150, mag);
        }

        // Event word particle — Phase E. Persona-style onomatopoeia pops
        // out alongside the damage number. Kill events override the random
        // hit-word with a fixed "K.O.!" so the beat reads as a milestone.
        if (result.killed) {
            this._spawnEventWord(enemyObj.x, enemyObj.y, 'K.O.!', '#ff8822', 22);
            this._log(`[Defeated ${enemyObj.entity.name}]`);
            this.emitGameEvent('enemy_killed', {
                type: enemyObj.type, id: enemyObj.id, x: enemyObj.x, y: enemyObj.y, tag: enemyObj.tag,
            });
        } else {
            const hitWords = ['POW!', 'WHACK!', 'BAM!', 'SLAM!', 'CRACK!'];
            const word = this.rng.pick(hitWords);
            const hitSize = result.dealt >= 15 ? 20 : 16;
            this._spawnEventWord(enemyObj.x, enemyObj.y, word, '#ffaa44', hitSize);
        }

        return formatDamageNumber(result);
    }

    applyDamageToPlayer(rawDamage) {
        let dmg = rawDamage;
        if (this.hasBuff('guard')) dmg = Math.max(1, Math.floor(dmg / 2));
        this.playerHp = Math.max(0, this.playerHp - dmg);

        // Floating damage number — Phase B
        const dmgSize = 16 + Math.min(10, Math.floor(dmg / 5));
        this._spawnDamageNumber(this.playerX, this.playerY, `-${dmg}`, '#ff4444', dmgSize);

        // Hit flash + stagger on the player — Phase C. Stagger direction
        // is randomized for the player (any adjacent enemy might have
        // landed the hit; we don't track which), making the player jolt
        // slightly without committing to a specific source.
        const now = performance.now();
        this._playerHitFlashUntil = now + 100;
        this._playerStaggerUntil  = now + 80;
        const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
        const [sdx, sdy] = this.rng.pick(dirs);
        this._playerStaggerDx = sdx * 3;
        this._playerStaggerDy = sdy * 3;
        this._ensureParticleLoop(); // keep rendering through the 100ms window

        // Screen shake when the player takes a meaningful hit — Phase F.
        // Slightly more aggressive than the enemy version because the
        // player's own pain should disrupt more of their perception. A
        // killing blow shakes with full magnitude.
        if (dmg >= 10 || this.playerHp <= 0) {
            const mag = this.playerHp <= 0 ? 6 : 3 + Math.min(4, (dmg - 10) / 4);
            this._triggerScreenShake(180, mag);
        }

        // Event word particle — Phase E. Player-side onomatopoeia in red
        // to read as alarm. Heavy hits or near-death moments get a bigger
        // word; otherwise rotates through the playerHitWords pool.
        const playerHitWords = ['OUCH!', 'ARGH!', 'OOF!', 'AGH!'];
        const word = this.playerHp <= 0
            ? '...!'
            : this.rng.pick(playerHitWords);
        const wordSize = dmg >= 15 ? 20 : 16;
        this._spawnEventWord(this.playerX, this.playerY, word, '#ff5544', wordSize);

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
        this._heldDirKeys = [];   // drop held keys so respawn doesn't phantom-walk
        this.state = STATE.DEAD;
        this.renderer.flash('rgba(255, 0, 0, 0.4)');
        this._log('[You died — respawning...]');
        setTimeout(() => this._respawn(), 500);
    }

    _respawn() {
        this.playerX = this.map.spawn.x;
        this.playerY = this.map.spawn.y;
        this.playerHp = this.playerMaxHp;
        this.playerMp = this.playerMaxMp;
        this.buffs = [];
        this.inventory.fill(null);
        this.tempEquips = [];
        this.selectedSlot = -1;
        this.equipment = { weapon: WEAPONS.wooden_sword, top: null, bottom: null, front: null, back: null, sides: null };
        // Clear any transition queued before death so the first post-respawn
        // action doesn't ghost-load a map.
        this._pendingTransition = null;
        this.state = STATE.IDLE;
        this._render();
        this._log('[Respawned]');
        this.autosave({ force: true });
    }

    async _fullReset() {
        // RESTART begins a brand-new game: drop the save and reseed the RNG so
        // the new run is independent of the old one.
        clearSave();
        this.rng = new RNG();
        this.questEngine = new QuestEngine(this);
        this._lastAutosaveTurn = -999;
        this.turn = 0;
        this.playerHp = this.playerMaxHp;
        this.playerMp = this.playerMaxMp;
        this.buffs = [];
        this.inventory.fill(null);
        this.tempEquips = [];
        this.selectedSlot = -1;
        this.equipment = { weapon: WEAPONS.wooden_sword, top: null, bottom: null, front: null, back: null, sides: null };
        this._pendingTransition = null;
        this.gold = 0;
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

    // Spawn an event-word particle ("POW!", "K.O.!", "OUCH!") — Persona-style
    // emphasis text that pops out alongside the damage number. Larger, bolder,
    // with a brief horizontal scatter so multiple words don't stack vertically
    // when several hits land in the same beat.
    _spawnEventWord(tileX, tileY, text, color, size = 18) {
        this._damageNumbers.push({
            tileX, tileY, text, color, size,
            vx: (Math.random() - 0.5) * 30, // px/sec horizontal scatter
            vy: -28,                          // slightly slower than damage numbers
            bornAt: performance.now(),
            maxAge: 700,
        });
        this._ensureParticleLoop();
    }

    // Spawn an overhead-dialogue particle above an NPC tile — for barks,
    // adjacency barks, "spotted you!" lines. Distinct from event words:
    // longer-lived (NPCs say sentences, not exclamations), no horizontal
    // scatter (a single source speaks), and gentler rise. Strips bracket
    // wrappers ("[Foo bar]" → "Foo bar") so dialogue reads as speech, not
    // log fragment. Reuses the _damageNumbers array + renderer pipeline.
    //
    // Per-source stacking: when a new message lands from the same source
    // (opts.sourceRef), existing dialogue from that source bumps up one
    // slot. Slot 0 = newest at speaker's head, slot N = oldest near the
    // top of the visible column. Slots beyond OVERHEAD_MAX_SLOTS accelerate
    // their fadeout so the column stays bounded — chat-window behavior
    // where old lines scroll off the top as new ones arrive.
    //
    // opts: { color, size, effect, sourceRef, maxAge } overrides. `effect`
    // is reserved for future wave/shake/typewriter animations (RuneScape-
    // style); v1 ignores anything other than 'normal' / 'bold' but accepts
    // the param so callers can be future-proofed. `sourceRef` is the
    // identity used for stacking — object reference, compared by ===.
    _spawnOverheadDialogue(tileX, tileY, text, opts = {}) {
        const cleanText = text.replace(/^\[|\]$/g, ''); // strip wrapping brackets
        const sourceRef = opts.sourceRef ?? null;
        const OVERHEAD_MAX_SLOTS = 3;
        const OVERHEAD_FADEOUT_MS = 400;

        // Push existing dialogue from this source up one slot. Without a
        // sourceRef we can't group (skip the bump). Same-source particles
        // beyond OVERHEAD_MAX_SLOTS get an accelerated fadeout so they
        // visibly "scroll off" rather than piling indefinitely.
        if (sourceRef) {
            const now = performance.now();
            for (const p of this._damageNumbers) {
                if (p.sourceRef !== sourceRef) continue;
                p.stackSlot = (p.stackSlot ?? 0) + 1;
                if (p.stackSlot >= OVERHEAD_MAX_SLOTS) {
                    const age = now - p.bornAt;
                    p.maxAge = Math.min(p.maxAge, age + OVERHEAD_FADEOUT_MS);
                }
            }
        }

        this._damageNumbers.push({
            tileX, tileY,
            text:  cleanText,
            color: opts.color ?? '#e8d090',  // parchment gold — matches HUD vocabulary
            size:  opts.size  ?? 11,
            vx: 0,                            // no scatter — single source
            vy: -4,                           // very gentle drift; stack does primary upward motion
            bornAt: performance.now(),
            maxAge: opts.maxAge ?? 2200,     // dialogue lingers; players need read time
            effect: opts.effect ?? 'normal', // hook for future wave/shake/typewriter
            sourceRef,                        // identity for stack grouping
            stackSlot: 0,                     // newest sits at the speaker's head
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
        if ((this._screenShakeUntil    ?? 0) > now) return true;
        // Overlay slide-in animation is active (Phase D)
        const overlayOpen = this.state === STATE.ITEM_OVERLAY
                         || this.state === STATE.RADIAL_MENU;
        if (overlayOpen && now - (this._overlayOpenedAt ?? 0) < 80) return true;
        // Radial wheel — always re-render while the wheel is open. The active
        // slice has a 2Hz pulse animation (renderer reads performance.now()
        // each frame), plus the rotation easing during spins. Cheaper to
        // keep the loop alive throughout the menu's lifetime than to gate
        // it by which sub-animation is running.
        if (this.state === STATE.RADIAL_MENU) return true;
        // Hotbar selected-slot pulse — same 2Hz heartbeat as the radial wheel.
        // Only runs while ITEM_SELECTED so the loop stops once the player
        // moves on or opens the overlay.
        if (this.state === STATE.ITEM_SELECTED) return true;
        for (const e of this.enemies) {
            if ((e._hitFlashUntil ?? 0) > now) return true;
            if ((e._staggerUntil  ?? 0) > now) return true;
        }
        return false;
    }

    // Trigger a screen shake of the given duration (ms) and magnitude (px).
    // Subsequent calls during an active shake replace the parameters if
    // the new shake is bigger or longer — keeping a heavy hit dominant
    // over a smaller subsequent hit.
    _triggerScreenShake(duration, magnitude) {
        const now = performance.now();
        const newEnd = now + duration;
        if (newEnd > (this._screenShakeUntil ?? 0)) this._screenShakeUntil = newEnd;
        if (magnitude > (this._screenShakeMagnitude ?? 0)) this._screenShakeMagnitude = magnitude;
        this._ensureParticleLoop();
    }

    // ── Log modal ([L]) ──────────────────────────────────────────────────────

    _openLogModal() {
        if (this.state !== STATE.IDLE) return;
        this._logModalScroll = 0;        // open pinned to the newest line
        this.state = STATE.LOG_MODAL;
        this._render();
    }

    _closeLogModal() {
        if (this.state !== STATE.LOG_MODAL) return;
        this.state = STATE.IDLE;
        this._render();
    }

    // delta > 0 scrolls toward older lines. Lower bound clamped here; the
    // renderer clamps the upper bound (it alone knows the wrapped line count)
    // and writes the clamped value back to _logModalScroll.
    _scrollLogModal(delta) {
        if (this.state !== STATE.LOG_MODAL) return;
        this._logModalScroll = Math.max(0, this._logModalScroll + delta);
        this._render();
    }

    // Touch routing for the open modal: top third scrolls older, bottom third
    // newer, elsewhere (incl. outside the panel) closes.
    _tapLogModal(pt) {
        if (!this._pointInRect(pt, LOG_MODAL_RECT)) { this._closeLogModal(); return; }
        const third = LOG_MODAL_RECT.h / 3;
        const rel = pt.y - LOG_MODAL_RECT.y;
        if (rel < third)          this._scrollLogModal(5);
        else if (rel > 2 * third) this._scrollLogModal(-5);
        else                      this._closeLogModal();
    }

    // ── Log ──────────────────────────────────────────────────────────────────

    _log(msg, category = 'system') {
        // Normalize common Unicode punctuation to ASCII for the bitmap-font
        // surfaces (the canvas strip and the [L] log modal both only know
        // printable ASCII 32-126). Em-dash, en-dash, ellipsis, smart-quotes —
        // all collapse to ASCII equivalents.
        const ascii = msg
            .replace(/[—–]/g, '-')   // em-dash, en-dash → hyphen
            .replace(/…/g, '...')         // ellipsis → three dots
            .replace(/[‘’]/g, "'")   // smart single quotes
            .replace(/[“”]/g, '"');  // smart double quotes

        // Mirror into the in-canvas strip (ring buffer, newest at end).
        this._logStripMessages.push({ text: ascii, category, bornAt: performance.now() });
        if (this._logStripMessages.length > this._STRIP_MAX) {
            this._logStripMessages.shift();
        }

        // Full history for the [L] log modal (newest at end, capped).
        this._logHistory.push({ text: ascii, category });
        if (this._logHistory.length > this._LOG_HISTORY_MAX) {
            this._logHistory.shift();
        }
    }
}

// ── Boot ─────────────────────────────────────────────────────────────────────

function boot() {
    const game = new Game();
    // Expose for in-page debugging (preview verification, console poking).
    // Harmless in production — the global is never read by gameplay code.
    if (typeof window !== 'undefined') window.__game = game;
    game.init();
}
// Module scripts can occasionally execute after DOMContentLoaded has already
// fired (preview-tool reloads, bf-cache restoration, etc.). Check readyState
// up front and run boot inline if the DOM is already ready; otherwise wait
// for the event as before.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
} else {
    boot();
}
