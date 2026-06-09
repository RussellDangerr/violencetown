// main.js — Game orchestrator
// Pixel Dungeon-style: one input = one action = world advances.
// Bump-to-attack. 1-9 select item, Space uses with canvas overlay.

import { Renderer } from './renderer.js';
import { loadMap } from './map.js';
import { loadAllSprites } from './sprites.js';
import { BitmapFont } from './bitmap-font.js';
import { DIR_NAMES, PLAYER_MAX_HP, PLAYER_MAX_MP, SLUDGE_DOT, INVENTORY_SIZE, MAX_STACK } from './data.js';
import { ITEMS, resolveUse, resolveThrow, tickTempEquips } from './items.js';
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
    RADIAL_CENTER_X, RADIAL_CENTER_Y, LOG_STRIP_RECT, LOG_MODAL_RECT,
    RING_HUB_R, RING_ACTION_R, RING_ITEM_R, RING_AIM_R,
} from './layout.js';
import { startSewerEscape, onSewerEnemyKilled, hitBarricade } from './sewer-setpiece.js';
import { audio } from './audio.js'; // [audio] procedural SFX + ambient music (no asset files)
import {
    WHEEL_ACTIONS, CARDINALS, DIR_VEC, RING_ACTION, RING_ITEM, RING_AIM,
    createWheelState, currentAction, ringsFor, moveGrip, spinRing, compose, autoAimDir,
} from './action-wheel.js'; // (action-wheel overhaul) pure three-ring model
import * as Settings from './settings.js'; // [settings] options/accessibility store

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
    // (Legacy WIN state retired with the tile-7 boss-trigger trap — fix/critical-path.)
    ENDING:          'ending',          // End of Chapter One — main-quest outro + credits (fix/critical-path)
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

        // (action-wheel overhaul) Three-ring action wheel — opened anywhere by
        // Space / the touch ACTION button (no bump-to-attack). The pure model in
        // action-wheel.js holds the rings + last-used persistence.
        this.wheel = createWheelState();
        this._lastWheelOpenAt = 0; // double-tap-Open window for express-repeat

        // Screen shake (Phase F) — triggered on damage >= threshold. The
        // renderer applies a per-frame random offset to world rendering
        // (HUD stays fixed) while the timestamp is in the future. Magnitude
        // decays linearly to zero as remaining time approaches zero.
        this._screenShakeUntil = 0;
        this._screenShakeMagnitude = 0;

        // [settings] Turn-based pause. When true, _bindInput swallows gameplay
        // keys until RESUME. Set/cleared by the pause overlay (_setPaused).
        this._paused = false;

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

        // Debug/dev flag — OFF by default so cheats never ship enabled. Opt in
        // with ?debug / ?debug=1 in the URL (or window.VIOLENCETOWN_DEBUG=true
        // before construction). Gates the Codeball nuke. (fix/critical-path)
        this._debug = this._detectDebugFlag();

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

        // Sewer-escape set-piece state (Phase D). null until the gauntlet fires;
        // persisted in the save so a mid-gauntlet reload reconstructs it.
        this._sewerEscape = null;
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
        // [settings] Load options from their own localStorage key before any
        // system reads them (reduceMotion gates screenshake/flash, volumes feed
        // audio after merge). Validated/clamped inside; never throws.
        Settings.load();

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
        this._bindOptionsModal(); // [settings] options/accessibility UI
        this._bindPauseOverlay(); // [settings] turn-based pause overlay

        // (action-wheel overhaul) Touch ACTION button: open the wheel when idle,
        // fire it when open. Two quick taps repeat the last action via the same
        // _lastWheelOpenAt window the Space key uses.
        const actionBtn = document.getElementById('action-btn');
        if (actionBtn) actionBtn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            if (this.state === STATE.IDLE) this._openWheel();
            else if (this.state === STATE.RADIAL_MENU) this._fireWheel();
        });

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
        // [audio] swap the ambient bed to match the zone (no-op pre-init / if
        // the same track is already playing). SEWER gets the darker loop.
        audio.playMusic(this.map.zoneName === 'SEWER' ? 'sewer' : 'town');
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
        if (this.questEngine) {
            // [audio] Snapshot quest progress so we can fire a stinger when this
            // event advances a stage or completes a quest — without modifying
            // quests.js. stageIndex resets to 0 on completion, so we also watch
            // the completed-count to catch the final advance.
            const qs = this.questEngine.state;                       // [audio]
            const beforeStage = qs.stageIndex;                       // [audio]
            const beforeDone  = qs.completed.length;                 // [audio]
            this.questEngine.emit(type, payload);
            if (qs.stageIndex !== beforeStage || qs.completed.length !== beforeDone) { // [audio]
                audio.playSfx('quest-advance');                      // [audio]
            }                                                        // [audio]
        }
    }

    // Start the main quest DETERMINISTICALLY (fix/critical-path). Called on a
    // fresh game start and on RESTART so fix_car can never be missed — the old
    // adjacency-bark trigger could be skipped entirely, dead-stalling the game.
    // No-op if the quest is already active or already completed (so a CONTINUE'd
    // save keeps its restored progress instead of being reset to stage 0).
    _startMainQuest() {
        if (!this.questEngine) return;
        if (this.questEngine.isActive('fix_car') || this.questEngine.isComplete('fix_car')) return;
        this.questEngine.start('fix_car');
    }

    // ── Splash ───────────────────────────────────────────────────────────────

    _bindSplash() {
        const splash = document.getElementById('splash');
        const wrapper = document.getElementById('game-wrapper');
        const start = () => {
            audio.init();                 // [audio] first user gesture — unlock Web Audio
            this._applyAudioSettings();   // [settings] apply persisted volume/mute on boot
            audio.playMusic('town');      // [audio] start the ambient bed for the town hub
            splash.classList.add('gone');
            wrapper.classList.remove('hidden');
            this.state = STATE.IDLE;
            this._startMainQuest();   // deterministic fix_car start (fix/critical-path)
            this._render();
            this._log('[Entered the town]');
        };
        // CONTINUE loads the autosave into the live game. GAME START / Space
        // begins fresh (the existing save survives until the fresh run's first
        // autosave overwrites it, so a stray reload can still resume).
        const continueGame = async () => {
            audio.init();                 // [audio] first user gesture — unlock Web Audio
            this._applyAudioSettings();   // [settings] apply persisted volume/mute on boot
            audio.playMusic('town');      // [audio] start the ambient bed (zone music re-syncs on map load)
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
            // [settings] While paused, swallow all gameplay keys. P / Escape
            // resume (so the player isn't trapped); everything else is eaten.
            // The pause overlay's own RESUME button also clears the flag.
            if (this._paused) {
                if (e.code === 'KeyP' || e.code === 'Escape') { e.preventDefault(); this._setPaused(false); }
                return;
            }
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
                // (action-wheel overhaul) Up/Down move the grip between rings
                // (action -> item -> aim, skipping dimmed rings); Left/Right spin
                // the held ring; Space fires; Esc steps back toward walking.
                if (e.code === 'ArrowUp'    || e.code === 'KeyW') { moveGrip(this.wheel, -1); this._render(); return; }
                if (e.code === 'ArrowDown'  || e.code === 'KeyS') { moveGrip(this.wheel, +1); this._render(); return; }
                if (e.code === 'ArrowLeft'  || e.code === 'KeyA') { spinRing(this.wheel, -1, this._wheelValidItemSlots()); this._render(); return; }
                if (e.code === 'ArrowRight' || e.code === 'KeyD') { spinRing(this.wheel, +1, this._wheelValidItemSlots()); this._render(); return; }
                if (e.code === 'Space'      || e.code === 'Enter') { this._fireWheel(); return; }
                if (e.code === 'Escape') { this._closeWheel(); return; }
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

            // ── ENDING (End of Chapter One): N / Space / Enter restarts ──
            // (fix/critical-path) Matches the on-screen "PRESS N TO PLAY AGAIN"
            // prompt; Space/Enter accepted too since the player's hands are
            // likely on those after the outro.
            if (this.state === STATE.ENDING) {
                if (e.code === 'KeyN' || e.code === 'Space' || e.code === 'Enter') {
                    e.preventDefault();
                    this._fullReset();
                }
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

            // Space = open the action wheel (the universal "act" button). A fast
            // double-tap repeats your last action without drawing the wheel.
            // (action-wheel overhaul; bump-to-attack retired)
            if (e.code === 'Space') { e.preventDefault(); this._openWheel(); return; }
            // T = wait a turn (Space used to wait; it now opens the wheel).
            if (e.code === 'KeyT') { e.preventDefault(); this._log('[Wait]'); this._advanceWorld(); return; }

            // L = open the log history modal
            if (e.code === 'KeyL') { e.preventDefault(); this._openLogModal(); return; }

            // [settings] P = pause (turn-based; blocks input until resumed)
            if (e.code === 'KeyP') { e.preventDefault(); this._setPaused(true); return; }

            // E = examine the faced / adjacent point of interest (free action)
            if (e.code === 'KeyE') { e.preventDefault(); doExamine(this); this._render(); return; }

            // Codeball — dev nuke, only when the debug flag is on (never ships
            // enabled). Silently ignored otherwise. (fix/critical-path)
            if (e.code === 'Backquote') {
                if (this._debug) { e.preventDefault(); this._codeball(); }
                return;
            }

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
        // Digit1..Digit9 → slots 0..8. Digit0 was dropped with the 10th
        // inventory slot — it selected a phantom slot that the 9-cell hotbar
        // never rendered. (fix/critical-path)
        const keys = ['Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','Digit7','Digit8','Digit9'];
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
                    case 'options': // [settings]
                        this._openOptionsModal();
                        break;
                    case 'restart':
                        // Confirm before wiping — RESTART clears the save and
                        // reseeds, so an accidental tap shouldn't be able to
                        // destroy a run. (fix/critical-path)
                        if (typeof confirm !== 'function'
                            || confirm('Restart from the beginning? This erases your current save.')) {
                            this._fullReset();
                        }
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

    // ── [settings] Options / accessibility modal ──────────────────────────────
    //
    // Reads/writes game/settings.js (persisted to its own localStorage key).
    // Two volume sliders, a mute toggle, a reduce-motion toggle, and a
    // Fullscreen toggle (Fullscreen API). The modal overlays game state but
    // gates none of it, like the help modal — safe to open/close any time. If
    // an audio manager is present on the game (window.__game.audio after
    // feat/audio merges), volume changes are pushed to it defensively; absent
    // that, values just persist for audio to read post-merge.

    _openOptionsModal() {
        const modal = document.getElementById('options-modal');
        if (!modal) return;
        this._syncOptionsUI(); // reflect current settings before showing
        modal.classList.remove('hidden');
    }
    _closeOptionsModal() {
        const modal = document.getElementById('options-modal');
        if (modal) modal.classList.add('hidden');
    }

    // Push the live settings into the DOM controls. Called on open and after a
    // reset so the UI never drifts from the store.
    _syncOptionsUI() {
        const s = Settings.getSettings();
        const music    = document.getElementById('opt-music');
        const musicVal = document.getElementById('opt-music-val');
        const sfx      = document.getElementById('opt-sfx');
        const sfxVal   = document.getElementById('opt-sfx-val');
        if (music)    music.value = Math.round(s.musicVolume * 100);
        if (musicVal) musicVal.textContent = Math.round(s.musicVolume * 100);
        if (sfx)      sfx.value = Math.round(s.sfxVolume * 100);
        if (sfxVal)   sfxVal.textContent = Math.round(s.sfxVolume * 100);
        this._setToggleUI('opt-muted',         s.muted);
        this._setToggleUI('opt-reduce-motion', s.reduceMotion);
        // Fullscreen reflects the actual document state, not a stored value.
        this._setToggleUI('opt-fullscreen', !!document.fullscreenElement);
    }

    // Flip an on/off toggle button's label + class + ARIA to match `on`.
    _setToggleUI(id, on) {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.toggle('is-on', !!on);
        el.setAttribute('aria-checked', on ? 'true' : 'false');
        el.textContent = on ? 'ON' : 'OFF';
    }

    // Push the persisted volume/mute into the audio manager. `audio` is the
    // module-level singleton imported at the top (this.audio was never assigned).
    // applyToAudio stays duck-typed/defensive, so this is safe pre-init too.
    _applyAudioSettings() {
        Settings.applyToAudio(audio);
    }

    _bindOptionsModal() {
        const modal = document.getElementById('options-modal');
        if (!modal) return;
        const backdrop = document.getElementById('options-modal-backdrop');
        const closeBtn = document.getElementById('options-close');
        backdrop?.addEventListener('click', () => this._closeOptionsModal());
        closeBtn?.addEventListener('click', () => this._closeOptionsModal());

        // Volume sliders — live-update the readout + store on input. The store
        // clamps/validates; we feed 0..1 (slider is 0..100).
        const wireSlider = (sliderId, valId, key) => {
            const slider = document.getElementById(sliderId);
            const val    = document.getElementById(valId);
            if (!slider) return;
            slider.addEventListener('input', () => {
                const pct = Number(slider.value);
                if (val) val.textContent = pct;
                Settings.set(key, pct / 100);
                this._applyAudioSettings();
            });
        };
        wireSlider('opt-music', 'opt-music-val', 'musicVolume');
        wireSlider('opt-sfx',   'opt-sfx-val',   'sfxVolume');

        // Mute toggle.
        document.getElementById('opt-muted')?.addEventListener('click', () => {
            const next = !Settings.get('muted');
            Settings.set('muted', next);
            this._setToggleUI('opt-muted', next);
            this._applyAudioSettings();
        });

        // Reduce-motion toggle — read live by _triggerScreenShake / _flash, so
        // toggling it takes effect on the very next hit; nothing else to wire.
        document.getElementById('opt-reduce-motion')?.addEventListener('click', () => {
            const next = !Settings.get('reduceMotion');
            Settings.set('reduceMotion', next);
            this._setToggleUI('opt-reduce-motion', next);
        });

        // Fullscreen toggle — drives the Fullscreen API on #game-wrapper (or
        // documentElement as a fallback). Not a persisted setting: browsers
        // reject programmatic fullscreen without a user gesture, so we can't
        // restore it on boot; the toggle just mirrors/controls the live state.
        document.getElementById('opt-fullscreen')?.addEventListener('click', () => {
            this._toggleFullscreen();
        });
        // Keep the fullscreen toggle honest if the user exits via Esc/F11.
        document.addEventListener('fullscreenchange', () => {
            this._setToggleUI('opt-fullscreen', !!document.fullscreenElement);
        });

        // Esc closes the modal without falling through to game state. Capture
        // phase beats _bindInput's bubble handler, matching the help modal.
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Escape' && !modal.classList.contains('hidden')) {
                e.stopPropagation();
                e.preventDefault();
                this._closeOptionsModal();
            }
        }, true);
    }

    _toggleFullscreen() {
        try {
            if (document.fullscreenElement) {
                document.exitFullscreen?.();
            } else {
                const el = document.getElementById('game-wrapper') || document.documentElement;
                el.requestFullscreen?.();
            }
        } catch (e) {
            // Some browsers/contexts (iframes without allowfullscreen, etc.)
            // reject the request — fail quietly, the rest of the modal works.
            console.warn('[settings] fullscreen toggle failed', e);
        }
    }

    // ── [settings] Pause overlay ──────────────────────────────────────────────
    //
    // A turn-based "stop the world" scrim. _setPaused(true) shows the overlay
    // and raises this._paused, which _bindInput checks to swallow gameplay
    // keys (P / Esc still resume so the player can't get stuck). RESUME or the
    // pause hotkey clears it. No real-time loop to freeze in a turn-based game,
    // so this is purely an input gate plus a visible state.

    _setPaused(paused) {
        this._paused = !!paused;
        const overlay = document.getElementById('pause-overlay');
        if (overlay) overlay.classList.toggle('hidden', !this._paused);
        // Stop any auto-repeat walk in flight so releasing keys post-resume
        // doesn't leave a phantom held direction.
        if (this._paused) {
            this._stopAutoRepeat?.();
            this._heldDirKeys = [];
        }
    }

    _bindPauseOverlay() {
        const overlay = document.getElementById('pause-overlay');
        if (!overlay) return;
        const backdrop = document.getElementById('pause-overlay-backdrop');
        // Backdrop tap resumes — the scrim is the "click anywhere to continue"
        // affordance common to turn-based pauses.
        backdrop?.addEventListener('click', () => this._setPaused(false));
        document.getElementById('pause-resume')?.addEventListener('click', () => this._setPaused(false));
        // OPTIONS from the pause screen: open settings without un-pausing, so
        // the player tweaks options and returns to the paused world.
        document.getElementById('pause-options')?.addEventListener('click', () => this._openOptionsModal());
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
        return false;
    }

    _onCanvasPointerDown(e) {
        // Mirror the keyboard gate: don't process taps during the move
        // animation or while the world is resolving. Splash has its own
        // handler (DOM button). Dead is a non-interactive end state; Ending
        // is handled just below (tap to restart).
        if (this.state === STATE.SPLASH || this.state === STATE.RESOLVING) return;
        if (this.state === STATE.DEAD) return;   // non-interactive end state
        // ENDING (End of Chapter One): a tap anywhere restarts — touch parity
        // with the keyboard "play again" prompt. (fix/critical-path)
        if (this.state === STATE.ENDING) { e.preventDefault(); this._fullReset(); return; }
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
        // (action-wheel overhaul) Polar hit-test against the three rings. Tap a
        // slice to select it; tap the hub to fire; tap outside to cancel. The
        // compass (aim) ring doubles as a directional d-pad. Slice 0 is at the
        // top of each ring, going clockwise — matching renderer._drawWheel.
        const lx = pt.x - RADIAL_CENTER_X;
        const ly = pt.y - RADIAL_CENTER_Y;
        const r  = Math.hypot(lx, ly);
        if (r <= RING_HUB_R) { this._fireWheel(); return; }                // hub = fire
        if (r > RING_AIM_R[1] + HIT_SLOP) { this._closeWheel(); return; }   // outside = cancel

        const TAU = Math.PI * 2;
        let clock = Math.atan2(ly, lx) + Math.PI / 2; // 0 = top, clockwise
        clock = ((clock % TAU) + TAU) % TAU;
        const slice = (count) => Math.round(clock / (TAU / count)) % count;

        const rings = ringsFor(currentAction(this.wheel));

        if (r >= RING_ACTION_R[0] - HIT_SLOP && r <= RING_ACTION_R[1] + HIT_SLOP) {
            this.wheel.actionIndex = slice(WHEEL_ACTIONS.length);
            this.wheel.grip = RING_ACTION;
            audio.playSfx('menu-confirm');
            this._render();
            return;
        }
        if (rings.item && r >= RING_ITEM_R[0] - HIT_SLOP && r <= RING_ITEM_R[1] + HIT_SLOP) {
            const slots = this._wheelValidItemSlots();
            if (slots.length) {
                this.wheel.itemSlot = slots[slice(slots.length)];
                this.wheel.grip = RING_ITEM;
                audio.playSfx('menu-confirm');
                this._render();
            }
            return;
        }
        if (rings.aim && r >= RING_AIM_R[0] - HIT_SLOP && r <= RING_AIM_R[1] + HIT_SLOP) {
            this.wheel.aim = CARDINALS[slice(4)];
            this.wheel.grip = RING_AIM;
            audio.playSfx('menu-confirm');
            this._render();
            return;
        }
        // Tapped a dimmed/gap region — no-op.
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
            // (action-wheel overhaul) Walking into a hostile is a silent no-op
            // now — bump-to-attack is retired; combat goes through the wheel
            // (Space / the ACTION button). Unwalkable like a wall, no turn.
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

        // Bump the broken-down car → examine / install the converter (it's a
        // non-walkable CAR tile, so this intercepts before the wall check).
        if (this.map.getTile(nx, ny) === 19) { this._interactCar(); return; }

        // Bump a barricade → tear at it (the sewer-escape gate; costs a turn).
        if (this.map.getTile(nx, ny) === 23) {
            hitBarricade(this, nx, ny);
            this._render();
            this._advanceWorld();
            return;
        }

        // Wall?
        if (!this.map.isWalkable(nx, ny)) { audio.playSfx('bump-wall'); return; } // [audio] thud on wall bump

        audio.playSfx('move'); // [audio] footstep on a successful step
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

            // (Legacy tile-7 "BOSS ROOM REACHED" win hook removed — fix/critical-path.
            // Tile 7 was a stale wrong-win trap one cell east of the Wererat; it's
            // gone from sewer-map.json and the real ending is fix_car's onComplete.)

            this._advanceWorld();
        });
    }

    // Interact with the broken-down car in town. Before the converter: a hint
    // to examine it. Holding the converter at the return stage: install it and
    // complete the quest. Otherwise a flavor line.
    _interactCar() {
        const idx = this.inventory.findIndex(s => s && s.itemDef.id === 'catalytic_converter');
        const atReturn = this.questEngine.currentStageId() === 'return_to_car';
        if (idx >= 0 && atReturn) {
            this._removeFromSlot(idx);
            this._log('[You wrench the cataclysmic converter back into place.]', 'pickup');
            this.emitGameEvent('interact_car', {});   // completes fix_car (onComplete fires)
        } else if (idx >= 0) {
            this._log("[You've got the converter - but get clear of the sewer first.]");
        } else if (this.questEngine.getFlag('carFixed')) {
            this._log('[The car purrs. Time to make that delivery.]');
        } else {
            this._log("[The car won't start. Pop the hood and examine it (E).]");
        }
        this._render();
    }

    // The fix_car escape stage's onEnter delegates here (see quests.js).
    _sewerEscapeSetpiece() {
        startSewerEscape(this);
    }

    // ── Auto-Repeat (hold direction key = move once per second) ─────────────

    _startAutoRepeat(code, dir) {
        this._stopAutoRepeat();
        this._autoRepeatKey = code;
        this._autoRepeatDir = dir;
        this._autoRepeatInterval = setInterval(() => {
            if (this.state !== STATE.IDLE) { this._stopAutoRepeat(); return; }
            // Stop auto-repeat BEFORE a step that commits to something the player
            // should decide on deliberately — otherwise a held direction key
            // sails through map transitions, vacuums up pickups (e.g. the quest
            // converter), bumps the car/barricade, or walks into a hazard tile.
            // The player must release and re-press to take that step. The manual
            // _doMove path is unaffected. (fix/critical-path)
            if (this._autoRepeatShouldStop(dir)) {
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

    // True when held-key auto-walking should HALT before stepping in `dir` —
    // i.e. the next tile would commit to a consequential, deliberate action.
    // Covers: any blocker (wall / enemy / container / the car tile / a barricade),
    // a map transition, a ground-item pickup, or a hazard tile. The first manual
    // press already happened (it started auto-repeat); this only gates the
    // AUTOMATIC follow-up steps. (fix/critical-path)
    _autoRepeatShouldStop(dir) {
        const nx = this.playerX + dir.dx;
        const ny = this.playerY + dir.dy;

        // Blockers that _doMove intercepts as bump-interactions or walls.
        if (!this.map.isWalkable(nx, ny)) return true;            // wall, car (19), barricade (23), etc.
        if (this.enemies.some(e => e.entity.isAlive() && e.x === nx && e.y === ny)) return true;
        if (this.containers.some(c => c.x === nx && c.y === ny)) return true;

        // Consequential walkable steps the player should opt into deliberately.
        if (this.map.getTransition(nx, ny)) return true;          // map transition
        if (this.groundItems.some(g => g.x === nx && g.y === ny)) return true; // pickup (incl. the converter)
        const td = this.map.getTileDef(nx, ny);
        if (td && td.hazard) return true;                         // sludge / future hazards

        return false;
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

        // Quest items are held, not used/thrown/smashed/given — bail before
        // building the overlay so the converter can't be lost.
        if (item.questItem) {
            this._log('[Best hold onto that.]');
            this.state = STATE.ITEM_SELECTED;
            this._render();
            return;
        }

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

        // (action-wheel overhaul) Throw moved to the action wheel — the hotbar
        // overlay now keeps Use / Smash / Give only (no 'right' option).

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

        audio.playSfx('menu-open'); // [audio] item use/throw/give overlay opened
        this.state = STATE.ITEM_OVERLAY;
        this._overlayOpenedAt = performance.now();
        this._ensureParticleLoop(); // animate the slide-in (Phase D)
        this._render();
    }

    _pickOverlay(direction) {
        const opt = this.overlayOptions[direction];
        if (!opt) return; // no option in that direction
        audio.playSfx('menu-confirm'); // [audio] picked an overlay option

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
        if (item.effect === 'heal') audio.playSfx('heal'); // [audio] healing item used

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
        audio.playSfx('throw'); // [audio] item thrown

        const stackCount = stack.count;
        // Throw ALWAYS throws — call resolveThrow directly. Routing through
        // resolveUse switched on useType, so a consumable 'self' item (burger,
        // bandage, soap) would heal/apply and be consumed while the throw
        // direction was discarded. (fix/critical-path)
        const msg = resolveThrow(this, stack.itemDef, { dx: dir.dx, dy: dir.dy }, stackCount);
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

    // ── Three-ring action wheel (action × item × direction) ───────────────────
    //
    // Opened anywhere by Space / the touch ACTION button (no bump-to-attack).
    // The pure model lives in action-wheel.js; this layer wires open, auto-aim,
    // double-tap-repeat, and fire-routing to the existing combat resolvers.

    _openWheel() {
        // Fast double-tap of Open = repeat the last action without drawing the
        // wheel (if still valid). Otherwise open the wheel normally.
        const now = performance.now();
        const fast = now - (this._lastWheelOpenAt || 0) < 250;
        this._lastWheelOpenAt = now;
        if (fast && this._repeatLastAction()) return;

        this._stopAutoRepeat();
        this._heldDirKeys = [];
        this.wheel.grip = RING_ACTION;
        // Pre-aim at the nearest hostile; fall back to the player's facing.
        const aim = autoAimDir(this.playerX, this.playerY, this._wheelHostileTargets());
        this.wheel.aim = aim || this._facingToCardinal();
        this.state = STATE.RADIAL_MENU;
        audio.playSfx('menu-open');
        this._overlayOpenedAt = now;
        this._ensureParticleLoop();
        this._render();
    }

    _closeWheel() {
        this.state = STATE.IDLE;
        audio.playSfx('menu-cancel');
        this._render();
    }

    _facingToCardinal() {
        return this.facing === 'up' ? 'N'
             : this.facing === 'right' ? 'E'
             : this.facing === 'down' ? 'S' : 'W';
    }

    // Live hostiles anywhere on the map, as {x,y} auto-aim candidates.
    _wheelHostileTargets() {
        return this.enemies
            .filter(e => e.entity.isAlive() && (!e.behavior || e.behavior.includes('HOSTILE')))
            .map(e => ({ x: e.x, y: e.y }));
    }

    // Inventory slot indices valid for the current action's item ring.
    // Throw/Give use any non-quest item; other actions have no item ring.
    _wheelValidItemSlots() {
        const action = currentAction(this.wheel);
        if (action !== 'Throw' && action !== 'Give') return [];
        const out = [];
        for (let i = 0; i < this.inventory.length; i++) {
            const s = this.inventory[i];
            if (s && !s.itemDef.questItem) out.push(i);
        }
        return out;
    }

    // Re-fire the last action without drawing the wheel (express double-tap).
    // Returns true if it fired, false if there was nothing valid to repeat.
    _repeatLastAction() {
        const last = this.wheel.lastFired;
        if (!last) return false;
        if (last.action === 'Throw' && !this.inventory[last.itemSlot]) return false;
        this.wheel.actionIndex = WHEEL_ACTIONS.indexOf(last.action);
        this.wheel.itemSlot = last.itemSlot;
        this.wheel.aim = last.aim;
        this.state = STATE.RADIAL_MENU; // _fireWheel reads/sets state itself
        this._fireWheel();
        // If the fire bailed (no target in that tile), _fireWheel left us in
        // RADIAL_MENU — surface the wheel so the player can adjust.
        if (this.state === STATE.RADIAL_MENU) {
            audio.playSfx('menu-open');
            this._overlayOpenedAt = performance.now();
            this._ensureParticleLoop();
            this._render();
        }
        return true;
    }

    // Compose the wheel selection and route to the existing combat resolvers.
    _fireWheel() {
        const { action, itemSlot, aim } = compose(this.wheel);
        const v = DIR_VEC[aim];
        const nx = this.playerX + v.dx, ny = this.playerY + v.dy;

        if (action === 'Attack') {
            const enemy = this.enemies.find(e => e.entity.isAlive() && e.x === nx && e.y === ny
                && (!e.behavior || e.behavior.includes('HOSTILE')));
            if (!enemy) { this._log('[Nothing to hit that way]'); return; } // no turn; wheel stays
            this.wheel.lastFired = { action, itemSlot, aim };
            const weapon = this.equipment.weapon;
            this.combatAttack(enemy, weapon ? weapon.damage : 1);
            this.state = STATE.IDLE;
            this._advanceWorld();
            return;
        }
        if (action === 'Throw') {
            const slots = this._wheelValidItemSlots();
            if (!slots.includes(itemSlot)) { this._log('[Nothing to throw]'); return; }
            this.wheel.lastFired = { action, itemSlot, aim };
            this.selectedSlot = itemSlot;
            this._doThrow(v); // sets state IDLE + advances + consumes the item
            return;
        }
        if (action === 'Give') {
            const npc = this.enemies.find(e => e.entity.isAlive() && e.x === nx && e.y === ny);
            if (!npc) { this._log('[No one there to give to]'); return; }
            if (!this.inventory[itemSlot]) { this._log('[Nothing to give]'); return; }
            this.wheel.lastFired = { action, itemSlot, aim };
            this.selectedSlot = itemSlot;
            this._doGive(npc); // sets state IDLE + advances
            return;
        }
        if (action === 'Defend') {
            this.wheel.lastFired = { action, itemSlot, aim };
            this.addBuff('guard', 'Guard', 2, 'buff');
            this._log('[Bracing — incoming damage halved.]');
            this.state = STATE.IDLE;
            this._advanceWorld();
            return;
        }
        if (action === 'Run') {
            this.wheel.lastFired = { action, itemSlot, aim };
            const blocked = !this.map.isWalkable(nx, ny)
                || this.enemies.some(e => e.entity.isAlive() && e.x === nx && e.y === ny);
            this.state = STATE.IDLE;
            if (blocked) { this._log('[Cannot run that way.]'); }
            else { this.playerX = nx; this.playerY = ny; this._log('[Backed away.]'); }
            this._advanceWorld();
            return;
        }
        // Skill — placeholder until creature abilities land.
        this._log('[No skills yet — try transforming first]'); // no turn consumed
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
                audio.playSfx('pickup'); // [audio] item picked up off the ground
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
            audio.playSfx('enemy-killed'); // [audio] K.O. sting on a kill
            this._spawnEventWord(enemyObj.x, enemyObj.y, 'K.O.!', '#ff8822', 22);
            this._log(`[Defeated ${enemyObj.entity.name}]`);
            this.emitGameEvent('enemy_killed', {
                type: enemyObj.type, id: enemyObj.id, x: enemyObj.x, y: enemyObj.y, tag: enemyObj.tag,
            });
            // The Were-Rat drops the converter; rat kills feed the escape waves.
            if (enemyObj.tag === 'wererat_boss' && ITEMS.catalytic_converter) {
                this.groundItems.push({ type: 'catalytic_converter', x: enemyObj.x, y: enemyObj.y, def: ITEMS.catalytic_converter });
                this._log('[The Were-Rat drops your cataclysmic converter!]', 'pickup');
            }
            onSewerEnemyKilled(this, enemyObj);
        } else {
            audio.playSfx('attack-hit'); // [audio] impact on a non-lethal hit
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
        audio.playSfx('take-damage'); // [audio] player got hit

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

    // True only when debug mode is explicitly requested — never in a shipped
    // build. Checks ?debug / ?debug=1 in the URL and a window global escape
    // hatch. Wrapped in try/catch so a non-browser/edge env can't throw.
    _detectDebugFlag() {
        try {
            if (typeof window !== 'undefined' && window.VIOLENCETOWN_DEBUG === true) return true;
            if (typeof location !== 'undefined' && location.search) {
                const v = new URLSearchParams(location.search).get('debug');
                return v === '' || v === '1' || v === 'true';
            }
        } catch { /* non-browser env — stay off */ }
        return false;
    }

    _codeball() {
        if (!this._debug) return;   // dev-only cheat; hard gate even if called directly
        let kills = 0;
        for (const e of this.enemies) {
            if (!e.entity.isAlive()) continue;
            if (manhattan(e.x, e.y, this.playerX, this.playerY) <= 100) {
                e.entity.takeDamage(1337);
                if (e.entity.isDead()) kills++;
            }
        }
        this._flash('rgba(51, 255, 51, 0.5)'); // [settings] reduce-motion aware
        this._log(`[CODEBALL — ${kills} eliminated]`);
        this._render();
    }

    // ── Death / Respawn / Win ────────────────────────────────────────────────

    _die() {
        this._stopAutoRepeat();
        this._heldDirKeys = [];   // drop held keys so respawn doesn't phantom-walk
        this.state = STATE.DEAD;
        audio.playSfx('death'); // [audio] death sting
        this._flash('rgba(255, 0, 0, 0.4)'); // [settings] reduce-motion aware (wraps renderer.flash)
        this._log('[You died — respawning...]');
        setTimeout(() => this._respawn(), 500);
    }

    _respawn() {
        // Respawn to a GUARANTEED-WALKABLE cell. map.spawn isn't always safe —
        // during the sewer escape the spawn (1,10) is sealed under a BARRICADE
        // tile, so the old code dropped the player inside a wall. (fix/critical-path)
        const cell = this._safeRespawnCell();
        this.playerX = cell.x;
        this.playerY = cell.y;
        this.playerHp = this.playerMaxHp;
        this.playerMp = this.playerMaxMp;
        this.buffs = [];
        // Preserve quest items (questItem:true) across death — wiping the whole
        // inventory deleted the catalytic converter and soft-locked the main
        // quest. Everything else is still cleared. (fix/critical-path)
        for (let i = 0; i < this.inventory.length; i++) {
            const s = this.inventory[i];
            if (!(s && s.itemDef.questItem)) this.inventory[i] = null;
        }
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

    // The cell to respawn into: map.spawn when it's currently walkable, else the
    // nearest walkable cell found by an outward ring scan (preferring a non-hazard
    // tile, falling back to any walkable one). Guarantees the player never wakes
    // up inside a wall/barricade after death. (fix/critical-path)
    _safeRespawnCell() {
        const sx = this.map.spawn.x, sy = this.map.spawn.y;
        const walkable = (x, y) => this.map.isInBounds(x, y) && this.map.isWalkable(x, y);
        const safe = (x, y) => walkable(x, y) && !(this.map.getTileDef(x, y).hazard);
        if (safe(sx, sy)) return { x: sx, y: sy };
        let fallback = null;
        const maxR = Math.max(this.map.width, this.map.height);
        for (let r = 1; r <= maxR; r++) {
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; // ring only
                    const x = sx + dx, y = sy + dy;
                    if (safe(x, y)) return { x, y };
                    if (!fallback && walkable(x, y)) fallback = { x, y };
                }
            }
            if (fallback) return fallback; // nearest walkable (even if hazardous) beats searching forever
        }
        return { x: sx, y: sy }; // degenerate map — nothing walkable; spawn anyway
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
        this._startMainQuest();   // deterministic fix_car start (fix/critical-path)
        this._log('[New game]');
    }

    // End of Chapter One — the real ending for the main quest (fix/critical-path).
    // Driven from fix_car's onComplete: the burger courier finally gets his car
    // running. Freezes input into a tasteful canvas outro (renderer
    // ._drawEndingOverlay) that offers a restart. Persist first so a reload after
    // the ending resumes a completed-quest world rather than replaying it.
    _endChapterOne() {
        this._stopAutoRepeat();
        this._heldDirKeys = [];
        this._endingTurns = this.turn;     // shown on the credits card
        this.state = STATE.ENDING;
        this.autosave({ force: true });
        this._render();
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
            // Seeded RNG (not Math.random) so the scatter is deterministic and
            // save/replay-stable, like all other gameplay-driven randomness. The
            // renderer's per-frame screen-shake jitter deliberately stays on
            // Math.random (see rng.js) — it's frame-rate-bound and never touches
            // game state. (fix/critical-path)
            vx: (this.rng.float() - 0.5) * 30, // px/sec horizontal scatter
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
        // [settings] Reduce-motion accessibility: suppress screenshake entirely
        // when enabled. The shake is pure juice (HUD/world readability are
        // unaffected by skipping it), so dropping it is the safe a11y choice.
        if (Settings.get('reduceMotion')) return;
        const now = performance.now();
        const newEnd = now + duration;
        if (newEnd > (this._screenShakeUntil ?? 0)) this._screenShakeUntil = newEnd;
        if (magnitude > (this._screenShakeMagnitude ?? 0)) this._screenShakeMagnitude = magnitude;
        this._ensureParticleLoop();
    }

    // [settings] Full-screen color flash that honors reduce-motion. Unlike
    // screenshake, a flash can be a load-bearing cue (e.g. death), so we
    // dampen rather than drop it: reduce-motion scales the alpha down to a
    // soft tint instead of a harsh strobe. Routes to renderer.flash, which is
    // a one-frame fill; callers pass an rgba() string as before.
    _flash(color) {
        if (Settings.get('reduceMotion')) {
            // Cut the alpha (4th rgba component) to ~35% for a gentle tint.
            color = color.replace(/rgba\(([^,]+),([^,]+),([^,]+),\s*([\d.]+)\s*\)/,
                (_, r, g, b, a) => `rgba(${r},${g},${b},${(parseFloat(a) * 0.35).toFixed(3)})`);
        }
        this.renderer.flash(color);
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
