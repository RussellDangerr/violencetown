// main.js — Game orchestrator
// Pixel Dungeon-style: one input = one action = world advances.
// Bump-to-attack. 1-9 select item, Space uses with canvas overlay.

import { Renderer } from './renderer.js';
import { loadMap } from './map.js';
import { loadAllSprites } from './sprites.js';
import { BitmapFont } from './bitmap-font.js';
import { PLAYER_MAX_HP, PLAYER_MAX_MP, INVENTORY_SIZE, MAX_STACK } from './data.js';
import { ITEMS, itemTier, resolveUse, resolveThrow, tickTempEquips, unequipItem, ownedItemDefs, hasItemDef } from './items.js';
import { WEAPONS } from './weapons.js';
import { tickBuffList, BUFF_DEFS } from './buffs.js';
import { SKILL_SLOTS, mergeKnown, isActive, learnInto, equipSkill, unequipSkill } from './skills.js';
import { isBoss, pickScenario, partitionInventory, matchTake, DEFEAT_SCENARIOS } from './defeat-scenarios.js';
import { SPELLS } from './spells.js'; // FIGHT → Magic catalog (debug Fireball for now)
import { TRICKS } from './tricks.js'; // FIGHT → Trick catalog — GP-costed skills
import { attack, formatDamageNumber } from './combat.js';
import { Enemy, resolveEnemyTurns, resolveAmbientTurns } from './enemies.js';
import { isHostile } from './ai.js';
import { getGreedyStep, stepEntity, findPath } from './pathing.js'; // pathfinding (greedy chase + BFS click-to-move); stepEntity = shove a character aside
import { applyDispositionDelta, reactToTransaction } from './give-action.js';
import { getDialogue } from './dialogue.js';
import { manhattan, clamp } from './utils.js';
import { RNG } from './rng.js';
import { hasSave, readSaveRaw, writeSave, loadInto, clearSave } from './save.js';
import { QuestEngine } from './quests.js';
import { doExamine } from './examine.js';
import {
    CANVAS_INTERNAL_PX, HIT_SLOP, OVERLAY_RECTS, THROW_RECTS,
    HOTBAR_X_START, HOTBAR_Y, HOTBAR_SLOT_W, HOTBAR_SLOT_H, HOTBAR_STRIDE, HOTBAR_SLOTS,
    RADIAL_CENTER_X, RADIAL_CENTER_Y, WHEEL_HUB_R, wheelRingR, QUESTLOG_RECT, LOG_MODAL_RECT, targetListRowRect,
    TRADE_MODAL_RECT, TRADE_BUY_ORIGIN, TRADE_SELL_ORIGIN, TRADE_BUYBACK_ORIGIN, TRADE_BRIBE_RECT,
    TRADE_COLS, tradeCellRect,
    EQUIPMENT_MODAL_RECT, EQUIP_SLOT_RECTS,
    DEVICE_TABS, deviceTabRect, cycleDeviceTab, deviceBodyRect, deviceEquipLayout, deviceSkillsLayout,
} from './layout.js';
import { canTrade, buyPrice, sellPrice, bribeStepCost, BRIBE_STEP, transferGold } from './trade.js'; // pricing + the transaction spine
import { startSewerEscape, onSewerEnemyKilled, hitBarricade } from './sewer-setpiece.js';
import { audio } from './audio.js'; // [audio] procedural SFX + ambient music (no asset files)
import {
    createWheelState, cycle, drill, back, compose, autoAimTile,
    needsFriendlyConfirm, aimRange, affectedTiles, selectedNode, restoreLastCategory, verbApplies,
    orderedTargetVerbs, isCombatActive, defaultVerb,
} from './wheel-model.js'; // (sunburst wheel) node-tree model
import * as Settings from './settings.js'; // [settings] options/accessibility store

// Chebyshev (king-move) distance — used by the wheel reticle's range clamp.
const cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));

// ── States ───────────────────────────────────────────────────────────────────

const STATE = {
    SPLASH:          'splash',
    IDLE:            'idle',            // waiting for input
    ITEM_SELECTED:   'item_selected',   // 1-9 pressed, slot highlighted
    ITEM_OVERLAY:    'item_overlay',    // Space pressed, showing use/throw/smash
    ITEM_THROW_DIR:  'item_throw_dir',  // chose Throw, waiting for direction
    // (Phase 6a) ITEM_GIVE_DIR retired — Give folded into the Trade window.
    RADIAL_MENU:     'radial_menu',     // bumped a hostile enemy — Omnitrix-style wheel
    TARGET_LIST:     'target_list',     // (Target List) tapped/focused a target — RuneScape-style verb menu
    RESOLVING:       'resolving',
    DEAD:            'dead',
    // (Legacy WIN state retired with the tile-7 boss-trigger trap — fix/critical-path.)
    ENDING:          'ending',          // End of Chapter One — main-quest outro + credits (fix/critical-path)
    LOG_MODAL:       'log_modal',       // [L] — full scrollable message history
    TRADE:           'trade',           // (trade slice 1) Puck's shop window — buy/sell/bribe
    DIALOGUE:        'dialogue',        // (Step 4) disposition dialogue with an NPC
    INSPECT:         'inspect',         // (§12.3) Examine → a layered inspect panel
    DEVICE:          'device',          // (Slice 3) the Remoticon — one tabbed, soft-pausing device (ITEMS·GEAR·QUESTS·MAP; absorbs the retired EQUIPMENT + JOURNAL states)
};

// (zone pursuit) A wedged door's starting integrity. Trapped pursuers pound it
// for ~their `damage` each turn, so stronger / more numerous enemies break in
// faster — a reprieve that scales with the threat. Tuning knob.
const PIPE_JAM_INTEGRITY = 30;

// Town Clock (feature/town-clock): the free-running world heartbeat period, in
// ms. Ambient NPCs get one step opportunity per beat while the player is idle,
// so the town lives without waiting for player input. Combat is unaffected — it
// stays on the per-player-turn loop. ~500ms reads as alive but calm (faster than
// OSRS's 0.6s tile step); tunable.
const WORLD_TICK_MS = 500;

// (Phase 6c) The reversible economy. A vendor window keeps a BUYBACK ledger for
// BUYBACK_MS: everything you buy can be sold back for what you paid, and
// everything you sell can be re-bought for what you got — locked prices, so you
// can freely test item+gold combos to manage disposition, then undo. The same
// timer is the disposition "tick clock": moods drift back toward a resting value
// (0) on a slow cadence, so a bribe is a repeated cost, not a one-time trivialize
// (gold-weighting research). Decay never un-allies (allies stay bought) and never
// touches an ally's loyalty — only transient mood. All tunable.
const BUYBACK_MS               = 5 * 60 * 1000;  // reversible-trade window (~5 min)
const DISPOSITION_DECAY_MS     = 20000;          // free-roam: nudge one step this often
const DISPOSITION_DECAY_TURNS  = 40;             // combat: nudge one step every N turns
const DISPOSITION_DECAY_STEP   = 1;              // points toward resting per nudge

// Town Clock day/night cycle. The overworld eases day → dusk → night → dawn on
// its own clock, driving the lighting grade (renderer._drawLighting). DAY_LENGTH_MS
// is a full round trip; the cosine bell below keeps most of it daytime with a
// dusk/night/dawn stretch around "midnight." NIGHT_MAX < 1 so deep night stays a
// cool blue rather than pitch black (the player aura + lamps keep it readable).
// All tunable; set DAY_LENGTH_MS huge (or _nightLevel by hand) to effectively
// freeze the cycle.
const DAY_LENGTH_MS = 30 * 60 * 1000;  // 30 min per full day↔night↔day (tunable; relaxed/lore-first, starts at noon)
const NIGHT_MAX     = 0.85;

// ── Directions ───────────────────────────────────────────────────────────────

const DIRS = {
    'KeyW': { dx: 0, dy: -1 }, 'ArrowUp':    { dx: 0, dy: -1 },
    'KeyS': { dx: 0, dy:  1 }, 'ArrowDown':  { dx: 0, dy:  1 },
    'KeyA': { dx: -1, dy: 0 }, 'ArrowLeft':  { dx: -1, dy: 0 },
    'KeyD': { dx: 1, dy:  0 }, 'ArrowRight': { dx: 1, dy:  0 },
};

// ── Starting equipment ───────────────────────────────────────────────────────

// Spells the player always knows. Equipped weapons grant MORE on top (see
// _refreshGrantedSkills); the real spell-learning system is later work.
const BASE_SPELLS = ['fireball', 'coneOfCold'];

const SLUDGE_DURATION = 3;
const DIALOGUE_HOSTILE_AT = -40;   // (Step 4) disposition at/below which a conversation turns into a fight
const MP_REGEN = 2;                // MP recovered per world-turn — FIGHT → Magic spells spend it

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
        this.worldTick = 0;   // Town Clock — free-running ambient world beat (see WORLD_TICK_MS)
        this._nightLevel = 0; // Town Clock day/night — 0 = full day (lighting off), 1 = deep night
        this._dayClockMs = 0; // accumulated overworld time driving _nightLevel (see _advanceDayClock)

        // Player
        this.playerX     = 0;
        this.playerY     = 0;
        this.playerHp    = PLAYER_MAX_HP;
        this.playerMaxHp = PLAYER_MAX_HP;
        // MP — Magic / Skill points. FIGHT → Magic spells (Fireball, Cone of
        // Cold) spend from it; it trickles back MP_REGEN per turn in
        // _advanceWorld. Every creature gets the same 100/100 baseline via
        // DEFAULT_MP in combat.js.
        this.playerMp    = PLAYER_MAX_MP;
        this.playerMaxMp = PLAYER_MAX_MP;
        // Known spells for FIGHT → Magic (base set; equipped weapons grant more
        // via _refreshGrantedSkills). Granted TRICKS (GP skills) live in a
        // parallel list the Trick ring reads.
        this.knownSpells   = [...BASE_SPELLS];
        this.grantedTricks = [];
        // Ring-builds ability axis (learned POOL + capped EQUIPPED subset — the
        // loadout IS the build). The pools are append-only and persisted; the
        // loadouts are the player's choice and persisted. suppressedSkills is
        // transient (NH-2 `blocked`), never saved. _refreshGrantedSkills merges
        // these into knownSpells/grantedTricks.
        this.learnedTricks    = new Set();
        this.learnedSpells    = new Set();
        this.equippedTricks   = [];
        this.equippedSpells   = [];
        this.suppressedSkills = new Set();
        this._lastHitTarget = null;   // (fear) id of the enemy the last Melee-Hit struck
        this._lastDefeatedBy = null;   // the enemy or {cause} that last damaged the player — read by _die
        this.extraMoves  = 0; // future: Goo, abilities, etc.
        this.facing      = 'down'; // 'down' | 'left' | 'right' | 'up'

        // Movement feel (DQM/Pokémon overworld) — see plans/movement-feel.md.
        // _MOVE_MS is the single tunable for per-tile slide duration (kept
        // LINEAR — constant velocity is correct for chained grid walking;
        // ease-out per tile would stutter, per architecture-and-game-feel.md
        // §4). Canon datapoint: 100ms felt brisk-but-OK once the auto-repeat
        // dead-frame was removed; 150 is a touch more grounded. Dial freely.
        this._MOVE_MS = 150;
        this._TURN_MS = 70;  // tap-to-face vs hold-to-walk threshold (standstill).
                             // 110 felt like a hitch on every direction change;
                             // 70 keeps a deliberate quick-tap-to-turn but lets a
                             // hold start walking promptly. Set 0 to always step.

        // Animation: one linear tile slide, _MOVE_MS long.
        this._animating   = false;
        this._animStart   = 0;
        this._animFromX   = 0;
        this._animFromY   = 0;
        this._animToX     = 0;
        this._animToY     = 0;
        this._animDuration = this._MOVE_MS; // ms (driven by _MOVE_MS)
        this._animCallback = null;
        this._animFrame   = null; // requestAnimationFrame ID
        this._stepIndex   = 0;    // ++ per completed step → walk-anim foot parity

        // Equipment
        this.equipment = {
            weapon: WEAPONS.wooden_sword,
            top: null, bottom: null, front: null, back: null, sides: null,
        };
        this._refreshGrantedSkills();   // derive Magic/Trick grants from the equipped weapon
        this.tempEquips = [];

        // Buffs: [{ id, name, turns, type, ...extra }]
        this.buffs = [];
        this._soapUsedThisTurn = false;

        // Continuous walking (replaces the old setInterval auto-repeat, which
        // raced the rAF slide and dropped ~every other step). We now chain the
        // next step from the slide-completion callback (_onStepSettled), so
        // held-key walking has zero dead frames and a dead-uniform cadence.
        // See plans/movement-feel.md (Finding 1).
        this._queuedMoveDir = null; // one-deep input buffer (Finding 2): a dir
                                    // pressed mid-slide, applied on completion.
        this._turnTimer     = null; // setTimeout id for tap-to-face → hold-to-walk
        this._pendingWalkDir = null;// dir armed by a turn-in-place pivot

        // Held-key stack — direction-key codes currently physically held, in
        // press-order with most-recent at the end. _onStepSettled reads the
        // top each tile to decide whether to keep walking; keyup just pops, so
        // releasing one direction while another is held continues seamlessly.
        this._heldDirKeys = [];

        // Physical held-key set — the raw truth of what direction keys are down
        // RIGHT NOW, independent of the walk stack. Every scene/state teardown
        // empties _heldDirKeys (map load, wheel/menu/pause/death clears), so a
        // key physically held across a transition fires no fresh keydown in the
        // new scene and walking dies until you re-press. _physicalHeld survives
        // those teardowns (mutated only by real keydown/keyup, cleared only on
        // blur) so _resumeHeldWalk can rebuild the walk stack and keep you
        // walking with no re-press. (movement-feel resume-fix, 2026-07-03)
        this._physicalHeld = new Set();

        // Click-to-walk path (pointer model): a BFS tile list the Hero walks one
        // step per settle, plus an optional action fired on arrival (path-then-
        // act). Consumed in _onStepSettled; cleared by _stopAutoRepeat (same-map
        // interrupts: keypress/menu/pause/blur/death) and _resumeHeldWalk (a path
        // never survives a zone change — it just stops at the seam).
        this._pathQueue = [];
        this._pathArrive = null;
        this._pressTimer = null;    // touch long-press timer → full Target List
        this._pressStart = null;    // pointerdown client pos, to cancel the press on drag

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
        this._tradeNpc = null;           // (trade slice 1) the vendor whose shop is open, or null
        this._dialogueNpc = null;        // (Step 4) the NPC we're talking to, or null
        this._dialogueReply = '';        // the NPC's current line shown in the dialogue modal
        this._dialogueCursor = 0;        // selected choice row (keyboard)
        this._tradeSell = null;          // (trade slice 1) snapshot of the sellable bag while shopping
        this._tradeCursor = null;        // (menu grammar) keyboard / d-pad cursor over the trade grid
        this._tradeTimer = null;         // (Phase 6c) 1s re-render while trading so the buyback countdown ticks
        this._dispositionDecayAccMs = 0; // (Phase 6c) free-roam decay accumulator (ms)
        this._dispositionDecayTurns = 0; // (Phase 6c) combat decay turn counter

        // Inventory: 10 stackable slots, each { itemDef, count } or null
        this.inventory = new Array(INVENTORY_SIZE).fill(null);
        this.selectedSlot = -1; // -1 = none selected

        // Item overlay options (populated when overlay shows)
        this.overlayOptions = {}; // { up: {...}, right: {...}, left: {...}, down: {...} }

        // (combat-wheel rework) Verb-tree combat wheel — opened anywhere by
        // Space / the touch ACTION button (no bump-to-attack). The pure model in
        // wheel-model.js holds the layer/category/sub-verb/item cursor, the aim
        // reticle, and last-fired persistence.
        this.wheel = createWheelState();
        this.targetList = { x: 0, y: 0, target: null, verbs: [], sel: 0 };   // (Target List) RuneScape-style verb menu
        this._lastActKeyAt = 0; // double-tap-Act window for express-repeat
        this._wheelOpenedByHold = false; // (Slice 2) true only between a HOLD-mode open and its release; cleared by every wheel close
        this._deviceTab = 'items';       // (Slice 3) the Remoticon's active tab (ITEMS·GEAR·QUESTS·MAP)

        // Screen shake (Phase F) — triggered on damage >= threshold. The
        // renderer applies a per-frame random offset to world rendering
        // (HUD stays fixed) while the timestamp is in the future. Magnitude
        // decays linearly to zero as remaining time approaches zero.
        this._screenShakeUntil = 0;
        this._screenShakeMagnitude = 0;

        // [settings] Turn-based pause. When true, _bindInput swallows gameplay
        // keys until RESUME. Set/cleared by the pause overlay (_setPaused).
        this._paused = false;

        // Floating-text particle list — two kinds share the array:
        //   • hit-splats (_spawnHitSplat): { tileX, tileY, text, type, crit,
        //     dir, slot, bornAt, maxAge } — typed RuneScape-style badges with
        //     per-type motion + a directional/omni fan (combat-feel-pass).
        //   • event words / overhead dialogue (_spawnEventWord /
        //     _spawnOverheadDialogue): { ..., color, size, vx, vy, [sourceRef,
        //     stackSlot] } — the original rise-and-fade text.
        // All age in real time (performance.now()) and animate independently of
        // turn ticks via a requestAnimationFrame loop. The loop ends when the
        // array is empty, so the game returns to its idle 4fps redraw cadence.
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
        // (zone pursuit) Hostiles that follow you through a door, captured before
        // _loadMap wipes the old zone and re-injected at the door you arrive at.
        this._pendingFollowers = null;
        this._pendingFollowersFrom = null;   // url of the zone they're chasing you OUT of
        this._zonePursuit = false;           // (playtest) monsters don't follow you through doors for now
        this._collectedItems = new Set();    // "map|x|y|type" of ground items already taken, so they don't respawn on zone re-entry
        this._mapUrl = null;                 // url of the currently-loaded map
        this._cameFrom = null;               // url of the zone you ENTERED this one from (for the pipe-jam)
        this._jammedDoor = null;             // {x,y,toMap,integrity,max,intruders[]} while a door is wedged shut

        // Economy
        this.gold = 0;
        // (Phase 2) Car fuel. The Cataclysmic Converter runs the fixed car too
        // HOT ('raw' → it punches straight through the North bridge into the
        // Canyon). Pouring a bottle of alcohol in the tank slows it ('alcohol' →
        // it ramps the bridge clean into Downtown). Set at the car (_interactCar),
        // read at the bridge (_playBridgeCutscene).
        this.carFuel = 'raw';

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

    // De-smeared behind the shared buff table (PD-4): decrement, fire each buff's
    // onTick while active, then on expiry log + fire onExpire (e.g. the recover
    // heal). See game/buffs.js — Enemy.tickBuffs runs the same helper.
    _tickBuffs() {
        tickBuffList(this.buffs, this, this, (b) => this._log(`[${b.name} expired]`));
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
            this.renderer.font = await BitmapFont.load('assets/fonts/VT323.ttf');
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
        this._bindCanvasTap(canvas);
        this._bindMenuSheet();
        this._bindHelpModal();
        this._bindOptionsModal(); // [settings] options/accessibility UI
        this._bindPauseOverlay(); // [settings] turn-based pause overlay

        // (sunburst wheel) Touch ACTION button: open the wheel when idle; while
        // open, drill into the current selection (firing once it's a ready leaf).
        const actionBtn = document.getElementById('action-btn');
        if (actionBtn) actionBtn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            if (this.state === STATE.IDLE) { this._wheelOpenerDown(); return; }   // (Slice 2) hold vs tap-toggle
            if (this.state === STATE.RADIAL_MENU) {
                const w = this.wheel;
                if (w.confirming || w.aiming) { this._wheelCommit(); return; }
                this._wheelDrill();
            }
        });
        // (Slice 2) Release of the touch ACTION button — closes the wheel in
        // 'hold' mode (mirrors Space keyup); pointercancel covers a lost pointer.
        if (actionBtn) {
            const releaseWheel = (e) => { e.preventDefault(); this._wheelOpenerUp(); };
            actionBtn.addEventListener('pointerup', releaseWheel);
            actionBtn.addEventListener('pointercancel', releaseWheel);
        }
        // (Slice 3) The on-screen Remoticon opener — pull out / pocket the tabbed
        // device. One symbol (_toggleDevice) so Slice 4's gamepad Back binds to it.
        const remoticonBtn = document.getElementById('remoticon-btn');
        if (remoticonBtn) remoticonBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); this._toggleDevice(); });

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

        // World heartbeat — the Town Clock (feature/town-clock), now the FREE-ROAM
        // half of the unified beat. A free-running timer winds the world beat so
        // the town lives while the player stands still: day/night eases and ambient
        // NPCs wander/chatter. In COMBAT this timer lets go (gated by _inCombat) so
        // the player gets unhurried turn-based thinking time — the beat is wound
        // one-per-committed-turn from _advanceWorld instead, so the world keeps
        // advancing in lockstep with the fight rather than freezing (supersedes M1).
        setInterval(() => {
            // Free-roam DRIVER (CD-5): the timer lets go on the splash and in combat
            // (the per-turn hand-wind in _advanceWorld takes over there). Otherwise
            // wind exactly one world beat, gating ambient to a settled idle frame and
            // decaying dispositions on the wall-clock (ms) cadence.
            if (this.state === STATE.SPLASH || this._inCombat()) return;
            this._dispositionDecayAccMs += WORLD_TICK_MS;
            const decayDue = this._dispositionDecayAccMs >= DISPOSITION_DECAY_MS;
            if (decayDue) this._dispositionDecayAccMs = 0;
            this._worldBeat({
                ambient: this.state === STATE.IDLE && !this._animating,
                decayDue,
            });
        }, WORLD_TICK_MS);

        this._log('[Violencetown loaded — Town hub ready]');
    }

    // ── Map Loading ──────────────────────────────────────────────────────────

    async _loadMap(url, spawnX, spawnY) {
        this.map = await loadMap(url);
        this._mapUrl = url;
        this._jammedDoor = null;   // per-zone: any wedged door is left behind when you leave
        this.playerX = spawnX ?? this.map.spawn.x;
        this.playerY = spawnY ?? this.map.spawn.y;

        // Fresh map = no runtime tile mutations yet. loadInto re-applies saved
        // diffs after this returns.
        this._tileDiffs = [];

        this.groundItems = [];
        for (const s of this.map.itemSpawns) {
            // Skip items the player already picked up here — they don't respawn.
            if (this._collectedItems.has(`${url}|${s.x}|${s.y}|${s.type}`)) continue;
            const def = this._resolveItemDef(s.type);   // resolves WEAPONS too, so weapons can drop as loot
            if (def) this.groundItems.push({ type: s.type, x: s.x, y: s.y, def });
        }
        this.enemies = [];
        for (const s of this.map.enemySpawns) this.enemies.push(new Enemy(s));

        // (zone pursuit) Re-inject any hostiles that chased you through the door.
        // They spawn at the door leading back where you came from — visible in
        // the threshold, not out of thin air — and get one "emerging" beat
        // before they act. Skipped on initial load / respawn / save-restore
        // (no pending followers then).
        if (this._pendingFollowers && this._pendingFollowers.length) {
            this._injectFollowers();
        }
        this._pendingFollowers = null;

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
        // (ending) If the car's already fixed, re-open the North bridge — derives
        // from the persistent flag so it's open again on every town re-entry.
        this._openBridgeIfCarFixed();
        this._render();
    }

    // ── Zone pursuit (enemies follow you through doors) ────────────────────────

    // Hostiles "on your heels" as you flee through transition `t`: alive, not an
    // ally, and either actively chasing or within FOLLOW_RANGE of the door / you.
    // These get carried into the next zone. (Allies don't pursue — abandoning
    // them on a zone change is a separate, future nicety.)
    _captureFollowers(t) {
        // (playtest) Door-pursuit is paused — monsters don't chase you between
        // zones for now. The capture logic stays for when it's re-enabled via
        // _zonePursuit.
        if (!this._zonePursuit) return [];
        const FOLLOW_RANGE = 3;
        const out = [];
        for (const e of this.enemies) {
            if (!e.entity.isAlive() || e._ally) continue;
            const hostile = isHostile(e);
            if (!hostile) continue;
            const onYourHeels = e.state === 'chasing'
                || manhattan(e.x, e.y, t.x, t.y) <= FOLLOW_RANGE
                || manhattan(e.x, e.y, this.playerX, this.playerY) <= FOLLOW_RANGE;
            if (onYourHeels) out.push(e);
        }
        return out;
    }

    // Place the captured followers in the freshly-loaded zone at the door that
    // leads back where they came from (so they pour in through the threshold you
    // just used, in plain sight). Each gets a one-turn emerge delay so you get a
    // beat to react. Falls back to your arrival tile if no matching door exists.
    _injectFollowers() {
        const followers = this._pendingFollowers || [];
        const door = (this.map.transitions || []).find(tr => tr.toMap === this._pendingFollowersFrom);
        const dx = door ? door.x : this.playerX;
        const dy = door ? door.y : this.playerY;
        const spots = this._spreadSpots(dx, dy, followers.length);
        let placed = 0;
        for (let i = 0; i < followers.length; i++) {
            const spot = spots[i];
            if (!spot) break;                 // ran out of room at the threshold — the rest are lost
            const f = followers[i];
            f.x = spot.x; f.y = spot.y;
            f.state = 'chasing';              // they came through locked onto you
            f._emergeDelay = 1;               // one beat to climb through before they act
            f._intruder = true;               // marks them jammable while still near the door
            this.enemies.push(f);
            placed++;
        }
        if (placed > 0) this._log('[They shoulder through the door after you!]', 'combat');
    }

    // Up to `n` walkable, unoccupied tiles in expanding rings from (cx,cy) —
    // nearest-the-door first. Skips the player's tile and any live enemy.
    _spreadSpots(cx, cy, n) {
        const out = [];
        const taken = new Set();
        const occupied = (x, y) =>
            (x === this.playerX && y === this.playerY)
            || this.enemies.some(e => e.entity.isAlive() && e.x === x && e.y === y)
            || taken.has(x + ',' + y);
        for (let r = 0; r <= 4 && out.length < n; r++) {
            for (let oy = -r; oy <= r && out.length < n; oy++) {
                for (let ox = -r; ox <= r && out.length < n; ox++) {
                    if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;   // current ring shell only
                    const x = cx + ox, y = cy + oy;
                    if (!this.map.isWalkable(x, y) || occupied(x, y)) continue;
                    taken.add(x + ',' + y);
                    out.push({ x, y });
                }
            }
        }
        return out;
    }

    // ── Pipe-jam (wedge the door you came through — AGGRO/world feel) ───────────

    // Try to wedge the door leading back to the zone you came from. Succeeds (and
    // consumes the pipe) only if that door exists and you're within reach of it.
    // Pursuers still near the door are pulled back behind it and start pounding
    // (see _tickJammedDoor). Returns true if a door was jammed.
    _tryJamDoor() {
        const door = (this.map.transitions || []).find(tr => tr.toMap === this._cameFrom);
        if (!door) { this._log('[No door behind you to wedge.]'); return false; }
        if (manhattan(this.playerX, this.playerY, door.x, door.y) > 3) {
            this._log('[Get closer to the door to wedge it shut.]');
            return false;
        }
        if (this._jammedDoor) { this._log('[That door is already wedged.]'); return false; }

        // Pull intruders still hanging at the threshold back behind the door.
        const trapped = this.enemies.filter(e =>
            e._intruder && e.entity.isAlive() && manhattan(e.x, e.y, door.x, door.y) <= 3);
        this.enemies = this.enemies.filter(e => !trapped.includes(e));

        this._jammedDoor = { x: door.x, y: door.y, toMap: door.toMap, integrity: PIPE_JAM_INTEGRITY, max: PIPE_JAM_INTEGRITY, intruders: trapped };
        audio.playSfx('bump-wall');
        if (this._triggerScreenShake) this._triggerScreenShake(150, 3);
        this._log(trapped.length
            ? '[You wedge the pipe through the door. It holds — and they start POUNDING.]'
            : '[You wedge the pipe through the door. Sealed behind you.]', 'combat');
        return true;
    }

    // Each turn, the trapped pursuers pound the wedged door for ~their damage.
    // When its integrity breaks, the door bursts and they pour through (re-using
    // the pursuit injector). Called from _advanceWorld after the enemy turns.
    _tickJammedDoor() {
        const j = this._jammedDoor;
        if (!j) return;
        const alive = j.intruders.filter(e => e.entity.isAlive());
        if (alive.length === 0) { this._jammedDoor = null; return; }

        const pound = alive.reduce((s, e) => s + Math.max(2, e.damage || 4), 0);
        j.integrity -= pound;

        if (j.integrity <= 0) {
            this._jammedDoor = null;
            this._pendingFollowers = alive;
            this._pendingFollowersFrom = j.toMap;
            this._injectFollowers();          // they burst back in at the same door, emerging one beat
            this._pendingFollowers = null;
            if (this._triggerScreenShake) this._triggerScreenShake(260, 5);
            this._log('[The door BURSTS off its frame — they pour through!]', 'combat');
        } else {
            if (this._triggerScreenShake) this._triggerScreenShake(90, 2);
            this._log('[The door SHUDDERS under the pounding...]');
        }
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

    // (ending) Once the car's fixed, the North-bridge barricade is clear — and
    // driving across the bridge ends Chapter One (the win-trigger lives in
    // _doMove). Derived from the PERSISTENT `carFixed` flag rather than the
    // per-map `_tileDiffs` (which reset on every _loadMap), so the bridge re-opens
    // whenever the town reloads — surviving leaving + returning, and CONTINUE.
    // Safe to call anytime: no-ops unless we're in town with the car fixed.
    _openBridgeIfCarFixed() {
        if (!this.questEngine || !this.map || this.map.zoneName !== 'TOWN') return;
        if (!this.questEngine.getFlag('carFixed')) return;
        // Swap the barricade fence (tile 17) at the bridge mouth (rows 0-1,
        // x14-19 — the 2x-scaled bridge gap) to walkable road (tile 12) so the
        // player can drive across.
        for (let x = 14; x <= 19; x++) { this.setTile(x, 0, 12); this.setTile(x, 1, 12); }
        const br = (this.examinables || []).find(e => e.id === 'bridge');
        if (br) br.text = "[The barricade's down and the engine's warm. North across the bridge, out of Violencetown for good. Drive.]";
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

    // (Phase 4) Main Quest 2 — the burger delivery. Started deterministically the
    // first time the player reaches Downtown, from BOTH arrival paths (the
    // canyon-grapple climb-out via canyon_escape.onComplete, and the alcohol-ramp
    // via _rampToDowntown). Guarded so it never clobbers an active quest or restarts.
    _startMainQuest2() {
        const qe = this.questEngine; if (!qe) return;
        if (qe.state.activeId || qe.isComplete('deliver_burger')) return;
        qe.start('deliver_burger');
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
            this._maybeShowFirstRunHint();
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
            this._maybeShowFirstRunHint();
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

    // (pointer model) One-time onboarding line, shown on the first ever run and
    // dismissed by the first tap/keypress (which still flows through to the game)
    // or after ~6s. Gated by a persisted Settings flag so it never repeats.
    _maybeShowFirstRunHint() {
        if (Settings.get('firstRunHintSeen')) return;
        const el = document.getElementById('first-run-hint');
        if (!el) return;
        Settings.set('firstRunHintSeen', true);
        el.classList.remove('hidden');
        let done = false;
        const hide = () => {
            if (done) return; done = true;
            el.classList.add('hidden');
            clearTimeout(timer);
            document.removeEventListener('pointerdown', hide, true);
            document.removeEventListener('keydown', hide, true);
        };
        const timer = setTimeout(hide, 6000);
        // Capture so the hint clears on the FIRST input; we never preventDefault,
        // so that same tap/key still reaches the game (moves the player, etc.).
        document.addEventListener('pointerdown', hide, true);
        document.addEventListener('keydown', hide, true);
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
            // Record the raw physical key state BEFORE any state-specific early
            // return, so a direction held while a menu/wheel is open (or during a
            // slide, or on OS key-repeat) is remembered and _resumeHeldWalk can
            // pick it up when we return to IDLE. Gated exactly like the walk stack
            // (past SPLASH/RESOLVING/paused), never cleared by scene teardown.
            if (DIRS[e.code]) this._physicalHeld.add(e.code);
            if (this._animating) {
                // Mid-slide: don't throw the press away (the old hard return
                // read as "the game ignored me" at direction changes). Buffer
                // the latest movement intent; _onStepSettled applies it the
                // instant this tile finishes. Non-movement keys and OS key-
                // repeat are still ignored mid-slide. (movement-feel Finding 2)
                if (!e.repeat && this.state === STATE.IDLE) {
                    const d = DIRS[e.code];
                    if (d) { e.preventDefault(); this._queuedMoveDir = d; this._noteHeld(e.code); }
                }
                return;
            }

            // Ignore browser key-repeat events — continuous walking is driven
            // by our own step-chaining, not the OS repeat rate.
            if (e.repeat) return;

            // (menu grammar) UNIVERSAL CANCEL — Escape closes / backs out of any menu
            // through the one _closeCurrentMenu hook, so exit is consistent everywhere.
            // The wheel returns false (its Esc = back-one-level, with confirming/aiming
            // nuance) and falls through to its own block below.
            if (e.code === 'Escape' && this._closeCurrentMenu()) { e.preventDefault(); return; }

            // (§12.3 / menu grammar) INSPECT is a PROMPT, not a Menu — ANY key
            // dismisses it, and if that key is a held direction, _closeInspect's
            // _resumeHeldWalk starts the walk, so one press both clears the panel
            // and moves you. (Do not turn this into arrow-navigation.)
            if (this.state === STATE.INSPECT) { e.preventDefault(); this._closeInspect(); return; }

            // ── DEVICE (Remoticon): modal tabbed device; world is soft-paused ──
            // Esc already closed it via the universal Cancel above. Here: Tab pockets
            // it, [ ] cycle tabs, C/J/M/K jump to a tab; everything else is swallowed.
            if (this.state === STATE.DEVICE) {
                e.preventDefault();
                if (e.code === 'Tab')          { this._closeDevice();   return; }
                if (e.code === 'BracketLeft')  { this._deviceCycleTab(-1); return; }
                if (e.code === 'BracketRight') { this._deviceCycleTab(1);  return; }
                if (e.code === 'KeyC') { this._deviceTab = 'gear';   this._render(); return; }
                if (e.code === 'KeyJ') { this._deviceTab = 'quests'; this._render(); return; }
                if (e.code === 'KeyM') { this._deviceTab = 'map';    this._render(); return; }
                if (e.code === 'KeyK') { this._deviceTab = 'skills'; this._render(); return; }
                if (this._deviceTab === 'quests' && (e.code === 'ArrowUp'   || e.code === 'KeyW')) { this._scrollJournal(1);  return; }
                if (this._deviceTab === 'quests' && (e.code === 'ArrowDown' || e.code === 'KeyS')) { this._scrollJournal(-1); return; }
                return;
            }

            // ── ITEM_THROW_DIR: waiting for throw direction ──
            if (this.state === STATE.ITEM_THROW_DIR) {
                const dir = DIRS[e.code];
                if (dir) { e.preventDefault(); this._doThrow(dir); return; }
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
                const w = this.wheel;
                const UP   = (e.code === 'ArrowUp'   || e.code === 'KeyW' || e.code === 'Space' || e.code === 'Enter');
                const DOWN = (e.code === 'ArrowDown' || e.code === 'KeyS' || e.code === 'Escape');
                // "Plus Ultra" friendly-confirm intercept.
                if (w.confirming) {
                    if (UP)   { this._wheelCommit(); return; }
                    if (DOWN) { w.confirming = false; audio.playSfx('menu-cancel'); this._render(); return; }
                    return;
                }
                if (w.aiming) { this._reticleKey(e.code); return; }
                if (e.code === 'ArrowLeft'  || e.code === 'KeyA') { this._wheelCycle(-1); return; }
                if (e.code === 'ArrowRight' || e.code === 'KeyD') { this._wheelCycle(+1); return; }
                if (DOWN) { this._wheelBack(); return; }
                if (UP)   { this._wheelDrill(); return; }
                return;
            }

            // ── TARGET_LIST: drive the RuneScape-style verb menu ──
            if (this.state === STATE.TARGET_LIST) {
                e.preventDefault();
                const n = this.targetList.verbs.length;
                if (e.code === 'ArrowUp'   || e.code === 'KeyW') { this.targetList.sel = (this.targetList.sel - 1 + n) % n; audio.playSfx('menu-tick'); this._render(); return; }
                if (e.code === 'ArrowDown' || e.code === 'KeyS') { this.targetList.sel = (this.targetList.sel + 1) % n; audio.playSfx('menu-tick'); this._render(); return; }
                if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') { this._fireTargetVerb(this.targetList.verbs[this.targetList.sel]); return; }
                if (e.code === 'Escape' || e.code === 'KeyF') { this._closeTargetList(); return; }
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

            // (Slice 3) JOURNAL in-state keydown retired — the DEVICE block above owns QUESTS/MAP.

            // ── TRADE: Puck's shop window (trade slice 1) ──
            // E / Esc closes; B bribes (raise the vendor's mood for one step's
            // GP). Buying/selling is by tapping (or clicking) the grid cells —
            // the canvas pointer handler routes those to _tapTrade.
            if (this.state === STATE.TRADE) {
                e.preventDefault();
                if (e.code === 'KeyE' || e.code === 'Escape') { this._closeTrade(); return; }
                if (e.code === 'KeyB') { this._bribeVendor(); return; }
                // (menu grammar) keyboard / d-pad navigation: arrows move the cursor
                // over the grid slots; Space/Enter activates the SAME action a tap
                // would (shared _tradeActivate). Cancel is Esc / ✕ / tap-outside.
                const slots = this._tradeSlots();
                if (slots.length) {
                    this._tradeCursor = this._clampTradeCursor(this._tradeCursor);
                    let ci = slots.findIndex(s => s.zone === this._tradeCursor.zone && s.index === this._tradeCursor.index);
                    if (ci < 0) ci = 0;
                    if (e.code === 'ArrowLeft'  || e.code === 'KeyA') { this._tradeCursor = slots[Math.max(0, ci - 1)]; audio.playSfx('menu-tick'); this._render(); return; }
                    if (e.code === 'ArrowRight' || e.code === 'KeyD') { this._tradeCursor = slots[Math.min(slots.length - 1, ci + 1)]; audio.playSfx('menu-tick'); this._render(); return; }
                    if (e.code === 'ArrowUp'    || e.code === 'KeyW') { this._tradeCursor = slots[Math.max(0, ci - TRADE_COLS)]; audio.playSfx('menu-tick'); this._render(); return; }
                    if (e.code === 'ArrowDown'  || e.code === 'KeyS') { this._tradeCursor = slots[Math.min(slots.length - 1, ci + TRADE_COLS)]; audio.playSfx('menu-tick'); this._render(); return; }
                    if (e.code === 'Space' || e.code === 'Enter') { this._tradeActivate(this._tradeCursor.zone, this._tradeCursor.index); this._tradeCursor = this._clampTradeCursor(this._tradeCursor); this._render(); return; }
                }
                return;
            }

            // ── DIALOGUE: pick a line (Step 4) ──
            // ↑/↓ (or W/S) move the cursor over the choices + Leave; Space/Enter
            // picks; number keys jump straight to a choice; E/Esc leaves.
            if (this.state === STATE.DIALOGUE) {
                e.preventDefault();
                const choices = this._dialogueChoices();
                const rows = choices.length + 1; // +1 for the Leave row
                if (e.code === 'KeyE' || e.code === 'Escape') { this._closeDialogue(); return; }
                if (e.code === 'ArrowUp'   || e.code === 'KeyW') { this._dialogueCursor = (this._dialogueCursor - 1 + rows) % rows; audio.playSfx('menu-tick'); this._render(); return; }
                if (e.code === 'ArrowDown' || e.code === 'KeyS') { this._dialogueCursor = (this._dialogueCursor + 1) % rows; audio.playSfx('menu-tick'); this._render(); return; }
                if (e.code === 'Space' || e.code === 'Enter') {
                    if (this._dialogueCursor >= choices.length) { this._closeDialogue(); return; } // Leave row
                    this._pickDialogueChoice(choices[this._dialogueCursor]); return;
                }
                const n = this._digitToSlot(e.code);
                if (n >= 0 && n < choices.length) { this._dialogueCursor = n; this._pickDialogueChoice(choices[n]); return; }
                return;
            }

            // ── EQUIPMENT: read-only Vitruvian screen (Stage 3) ──
            // (Slice 3) EQUIPMENT in-state keydown retired — the DEVICE block above owns GEAR.

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

            // Arrow/WASD = turn-in-place (tap toward a new direction) or walk
            // (already facing that way, or hold past _TURN_MS). The held-key
            // stack tracks what's physically down so _onStepSettled can chain
            // continuous walking and keyup can fall back to another held dir.
            const dir = DIRS[e.code];
            if (dir) {
                e.preventDefault();
                this._noteHeld(e.code);
                this._beginMoveOrTurn(dir);
                return;
            }

            // 1-9 = select item
            const slot = this._digitToSlot(e.code);
            if (slot >= 0) { e.preventDefault(); this._selectItem(slot); return; }

            // Space = open the combat wheel (the universal "act" button). A fast
            // double-tap repeats your last action without drawing the wheel.
            // (combat-wheel rework; bump-to-attack retired)
            if (e.code === 'Space') {
                e.preventDefault();
                const now = performance.now();
                if (now - (this._lastActKeyAt || 0) < 250 && this._canRepeatLast()) this._repeatLastAction();
                else this._wheelOpenerDown();   // (Slice 2) hold vs tap-toggle open mode
                this._lastActKeyAt = now;
                return;
            }
            // T = wait a turn (Space used to wait; it now opens the wheel).
            if (e.code === 'KeyT') { e.preventDefault(); this._log('[Wait]'); this._advanceWorld(); return; }

            // Tab = pull out the Remoticon device (opens to ITEMS). preventDefault
            // early so focus never leaves the canvas. (Slice 3)
            if (e.code === 'Tab') { e.preventDefault(); this._openDevice('items'); return; }

            // L = open the log history modal
            if (e.code === 'KeyL') { e.preventDefault(); this._openLogModal(); return; }
            if (e.code === 'KeyJ') { e.preventDefault(); this._openJournal(); return; }
            if (e.code === 'KeyM') { e.preventDefault(); this._openWorldMap(); return; }

            // C = open the (read-only) equipment / Vitruvian screen
            if (e.code === 'KeyC') { e.preventDefault(); this._openEquipmentScreen(); return; }

            // [settings] P = pause (turn-based; blocks input until resumed)
            if (e.code === 'KeyP') { e.preventDefault(); this._setPaused(true); return; }

            // E = trade with an adjacent vendor (Puck's till) if one's there;
            // otherwise examine the faced / adjacent point of interest. Both are
            // free actions (no turn cost).
            // (Target Wheel) F = focus the faced target → its verb wheel.
            if (e.code === 'KeyF') {
                e.preventDefault();
                this._openTargetListFaced();
                return;
            }
            if (e.code === 'KeyE') {
                e.preventDefault();
                const vendor = this._findAdjacentVendor();
                if (vendor) { this._openTrade(vendor); return; }
                const talker = this._findAdjacentDialogueNpc();
                if (talker) { this._openDialogue(talker); return; }
                doExamine(this); this._render(); return;
            }

            // Codeball — dev nuke, only when the debug flag is on (never ships
            // enabled). Silently ignored otherwise. (fix/critical-path)
            if (e.code === 'Backquote') {
                if (this._debug) { e.preventDefault(); this._codeball(); }
                return;
            }

            // Any other key stops auto-repeat
            this._stopAutoRepeat();
        });

        // Direction-key release: just pop from the held stack. Continuous
        // walking reads the stack on every step settle (_onStepSettled), so
        // there's nothing to restart — if another direction is still held the
        // next tile picks it up seamlessly, and if none remain, walking stops.
        // A released tap (turn-in-place pivot) is handled by the turn-timer's
        // still-held guard. Non-direction releases were never in the stack.
        document.addEventListener('keyup', (e) => {
            const heldIdx = this._heldDirKeys.indexOf(e.code);
            if (heldIdx >= 0) this._heldDirKeys.splice(heldIdx, 1);
            // Physical release always drops from the raw set (the source of truth
            // that survives scene teardown), even if the walk stack was already
            // cleared by a transition.
            this._physicalHeld.delete(e.code);
            // (Slice 2) Wheel opener release — closes the wheel in 'hold' mode
            // (a no-op in 'tap-toggle'; the mode guard lives in _wheelOpenerUp).
            if (e.code === 'Space') this._wheelOpenerUp();
        });

        // Window blur clears the held stack — browsers don't always fire
        // keyup events for keys held when the window loses focus, so we'd
        // otherwise end up with phantom held keys. Cheap defensive cleanup.
        window.addEventListener('blur', () => {
            this._heldDirKeys = [];
            this._stopAutoRepeat();
            // Blur is the SOLE place _physicalHeld is cleared — a key held while
            // focus is lost may never fire its keyup, so we forget it here to
            // avoid a phantom held key resuming a walk on refocus.
            this._physicalHeld.clear();
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
        // Long-press bookkeeping: releasing / dragging / cancelling before the timer
        // fires means it was a normal tap (default action already ran) — drop it.
        const cancelPress = () => { if (this._pressTimer) { clearTimeout(this._pressTimer); this._pressTimer = null; } };
        canvas.addEventListener('pointerup', cancelPress);
        canvas.addEventListener('pointercancel', cancelPress);
        canvas.addEventListener('pointerleave', cancelPress);
        canvas.addEventListener('pointermove', (e) => {
            if (!this._pressTimer || !this._pressStart) return;
            const dx = e.clientX - this._pressStart.x, dy = e.clientY - this._pressStart.y;
            if (dx * dx + dy * dy > 100) cancelPress();   // moved >10px → a drag, not a press
        });
        // Desktop: right-click a thing → the full Target List (all verbs, ungated;
        // a needsAdjacent pick then walks-then-fires). The equivalent of long-press.
        canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (this.state !== STATE.IDLE) return;
            const pt = this._canvasLocalCoords(e, canvas);
            if (!pt) return;
            const tile = this._screenToTile(pt);
            if (this._targetAt(tile.x, tile.y)) this._openTargetList(tile.x, tile.y);
        });
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
                    // (Slice 3) the 'equipment' menu-sheet action was retired with its row — Tab / the ▤ button open the Remoticon (GEAR tab).
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
        this._setWheelOpenUI(s.wheelOpenMode);   // (Slice 2) HOLD / TAP
    }

    // Flip an on/off toggle button's label + class + ARIA to match `on`.
    _setToggleUI(id, on) {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.toggle('is-on', !!on);
        el.setAttribute('aria-checked', on ? 'true' : 'false');
        el.textContent = on ? 'ON' : 'OFF';
    }

    // (Slice 2) WHEEL OPEN is a 2-value ENUM (HOLD/TAP), not on/off, so it can't
    // use _setToggleUI (which forces ON/OFF text). aria-checked=true means HOLD.
    _setWheelOpenUI(mode) {
        const el = document.getElementById('opt-wheel-open');
        if (!el) return;
        const hold = (mode === 'hold');
        el.classList.toggle('is-on', hold);
        el.setAttribute('aria-checked', hold ? 'true' : 'false');
        el.textContent = hold ? 'HOLD' : 'TAP';
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

        // (Slice 2) WHEEL OPEN toggle — flips 'tap-toggle' ↔ 'hold'. The opener
        // (_wheelOpenerDown/Up) reads Settings live, so this applies immediately
        // with no reload. Settings.set persists it per-device.
        document.getElementById('opt-wheel-open')?.addEventListener('click', () => {
            const next = Settings.get('wheelOpenMode') === 'hold' ? 'tap-toggle' : 'hold';
            Settings.set('wheelOpenMode', next);
            this._setWheelOpenUI(next);
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
        } else {
            // On resume, keep walking if a direction is still physically held.
            this._resumeHeldWalk?.();
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

    // (menu grammar) The single "Cancel / get out of this menu" hook — routes each
    // menu state to its EXISTING close method, so exit behavior lives in one place.
    // Called by the universal Escape, the ✕/tap-outside affordance, and (later) the
    // gamepad B button. Returns true if it closed something. RADIAL_MENU returns
    // false on purpose: its Esc/back grammar (confirming/aiming/depth) stays in the
    // wheel's own keydown block, and a tap outside the ring calls _closeWheel directly.
    _closeCurrentMenu() {
        switch (this.state) {
            case STATE.INSPECT:        this._closeInspect(); return true;
            case STATE.TARGET_LIST:    this._closeTargetList(); return true;
            case STATE.LOG_MODAL:      this._closeLogModal(); return true;
            case STATE.TRADE:          this._closeTrade(); return true;
            case STATE.DIALOGUE:       this._closeDialogue(); return true;
            case STATE.DEVICE:         this._closeDevice(); return true;
            case STATE.ITEM_OVERLAY:   this.state = STATE.ITEM_SELECTED; this._render(); return true;
            case STATE.ITEM_SELECTED:  this.selectedSlot = -1; this.state = STATE.IDLE; this._render(); this._resumeHeldWalk(); return true;
            case STATE.ITEM_THROW_DIR: this.selectedSlot = -1; this.state = STATE.IDLE; this._render(); this._resumeHeldWalk(); return true;
            default: return false;
        }
    }

    _onCanvasPointerDown(e) {
        // Only the PRIMARY button (left mouse / touch / pen) drives taps. A right
        // or middle click also fires a pointerdown, but that's the context-menu
        // gesture (the full Target List) — handled by the contextmenu listener in
        // _bindCanvasTap. Letting it through here would fire the default action
        // first, then the menu would bail because the state left IDLE.
        if (e.button >= 1) return;
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

        // (menu grammar) Universal ✕ / tap-outside close. The renderer stashed the
        // open Menu's panel rect + ✕ rect; a tap on the ✕ or anywhere OUTSIDE the
        // panel closes it via the one Cancel hook. In-panel taps (rows / grid cells /
        // choices) fall through to the per-state handlers below. Wheel: a tap well
        // outside the ring closes it.
        const _mpr = this.renderer._menuPanelRect, _cbr = this.renderer._closeBtnRect;
        if (_mpr) {
            if (_cbr && this._pointInRect(pt, _cbr, HIT_SLOP)) { this._closeCurrentMenu(); return; }
            if (!this._pointInRect(pt, _mpr)) { this._closeCurrentMenu(); return; }
        } else if (this.state === STATE.RADIAL_MENU) {
            // (Slice 2) Depth-dynamic cull: close on a tap beyond the wheel's real
            // outer extent for the CURRENT depth. The old fixed 230px left the small
            // shallow wheel un-closable by a nearby tap (a 160px tap was neither a
            // quadrant hit nor an outside-close). Mirrors the far-tap ignore in
            // _tapRadialMenu (wheelRingR(path.length)[1] + 12), plus HIT_SLOP.
            const _dx = pt.x - RADIAL_CENTER_X, _dy = pt.y - RADIAL_CENTER_Y;
            const _cull = wheelRingR(this.wheel.path.length)[1] + HIT_SLOP + 12;
            if (_dx * _dx + _dy * _dy > _cull * _cull) { this._closeWheel(); return; }
        }

        // Log modal is fully modal — route taps to it and nothing behind it.
        if (this.state === STATE.INSPECT) { this._closeInspect(); return; }
        if (this.state === STATE.LOG_MODAL) { this._tapLogModal(pt); return; }

        // Trade window is fully modal too — route taps to the shop.
        if (this.state === STATE.TRADE) { this._tapTrade(pt); return; }
        if (this.state === STATE.DIALOGUE) { return; }   // (Step 4) dialogue is keyboard-driven; ignore stray taps
        if (this.state === STATE.DEVICE) { this._tapDevice(pt); return; }   // (Slice 3) in-panel tab/body taps (✕ + outside handled above)

        // Priority order is by modality: the most exclusive overlay wins. A
        // tap while the radial menu is open should drive the radial menu,
        // not fall through to the hotbar visible behind/under it.
        if (this.state === STATE.ITEM_THROW_DIR) {
            this._tapThrowPrompt(pt);
            return;
        }
        if (this.state === STATE.RADIAL_MENU) {
            this._tapRadialMenu(pt);
            return;
        }
        if (this.state === STATE.TARGET_LIST) {
            this._tapTargetList(pt);
            return;
        }
        if (this.state === STATE.ITEM_OVERLAY) {
            this._tapItemOverlay(pt);
            return;
        }
        // Tapping the on-canvas Quest Log panel opens the full history modal —
        // the touch equivalent of pressing L. IDLE only; in a menu the tap
        // should drive the menu, not pop the log.
        if (this.state === STATE.IDLE && this._pointInRect(pt, QUESTLOG_RECT, HIT_SLOP)) {
            this._openLogModal();
            return;
        }

        // (Target Wheel) An IDLE tap on the world focuses the tapped tile's
        // target; nothing there → fall through to the hotbar.
        if (this.state === STATE.IDLE) {
            const tile = this._screenToTile(pt);
            // Bare tap on a thing → walk adjacent (if needed) → fire its DEFAULT
            // verb (Take/Talk/Hit/Examine). The full Target List is on long-press /
            // right-click (see _bindCanvasTap) or the F key.
            const target = this._targetAt(tile.x, tile.y);
            if (target) {
                const v = defaultVerb(target, this);
                if (v) { this._actOnTarget(v, target); this._armLongPress(tile, e); return; }
            }
            // Click-to-move: empty walkable ground → BFS-path the Hero there.
            if (this.map.isWalkable(tile.x, tile.y) && !(tile.x === this.playerX && tile.y === this.playerY)) {
                const path = findPath(this, { x: this.playerX, y: this.playerY }, tile);
                if (path && path.length) { this._walkPath(path); return; }
            }
        }
        // IDLE or ITEM_SELECTED → hotbar tap.
        this._tapHotbar(pt);
    }

    // Touch long-press: a quick tap already fired the default action; if the finger
    // stays put over a thing ~450ms, open the full Target List instead (opening it
    // halts the walk the tap just started). Cancelled on pointerup / drag / cancel
    // (see _bindCanvasTap) and by _stopAutoRepeat. Desktop uses right-click.
    _armLongPress(tile, e) {
        if (this._pressTimer) clearTimeout(this._pressTimer);
        this._pressStart = e ? { x: e.clientX, y: e.clientY } : null;
        this._pressTimer = setTimeout(() => {
            this._pressTimer = null;
            if (this.state === STATE.IDLE) this._openTargetList(tile.x, tile.y);
        }, 450);
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
                this._doThrow(vec);   // (Phase 6a) throw-only now — give left this prompt
                return;
            }
        }
        // Tap outside the four cardinals = cancel (no turn consumed).
        this.state = STATE.IDLE;
        this.selectedSlot = -1;
        this._render();
    }

    _tapRadialMenu(pt) {
        // Touch parity with the keyboard d-pad: the active ring is a COMPASS, so a
        // tap in the TOP quadrant drills, LEFT/RIGHT spin to prev/next, and the
        // BOTTOM quadrant (or the hub) goes BACK. AIM/CONFIRM overlays don't draw
        // the compass, so they keep the interim hub-cancels / tap-commits behaviour.
        const w = this.wheel;
        const dx = pt.x - RADIAL_CENTER_X, dy = pt.y - RADIAL_CENTER_Y;
        const r = Math.hypot(dx, dy);

        if (w.confirming || w.aiming) {
            if (r < WHEEL_HUB_R + 8) {
                if (w.confirming) w.confirming = false; else { w.aiming = false; w.reticle = null; }
                audio.playSfx('menu-cancel'); this._render(); return;
            }
            this._wheelCommit(); return;
        }

        // Hub = back / close.
        if (r < WHEEL_HUB_R + 8) { this._wheelBack(); return; }
        // Ignore taps beyond the wheel (preview band outer + slop) so a stray far
        // tap doesn't misfire a quadrant.
        if (r > wheelRingR(w.path.length)[1] + 12) return;

        // Cardinal by angle: atan2 → right=0, down=π/2, left=±π, up=-π/2. Bucket the
        // full turn into four quadrants centred on each cardinal.
        const a = (Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2); // 0..2π
        if      (a >= Math.PI * 0.25 && a < Math.PI * 0.75) this._wheelBack();     // BOTTOM → back
        else if (a >= Math.PI * 0.75 && a < Math.PI * 1.25) this._wheelCycle(-1);  // LEFT → prev
        else if (a >= Math.PI * 1.25 && a < Math.PI * 1.75) this._wheelDrill();    // TOP → drill
        else                                                this._wheelCycle(+1);  // RIGHT → next
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
            // (shove) Walking into a character no longer walls you off (the old
            // silent no-op). You barge through: the character is knocked to an
            // open side tile and you take their spot — or, if they're cornered,
            // you swap places. Tough "heavy" characters (captains, the Sewer
            // Merchant, bosses — flagged per type in the shopkeeper pass) can't
            // be budged: you bounce off with a recoil. Combat stays deliberate
            // (Space / the wheel) — a shove only displaces, it doesn't attack.
            // Applies to everyone (hostiles + NPCs); the cast is one unified type.
            if (this._isHeavy(enemy)) {
                audio.playSfx('bump-wall');
                this._bounceOff(dir);
                return; // immovable — no step, no turn
            }
            const dest = this._shoveDestination(enemy, dir);
            if (!dest) {
                audio.playSfx('bump-wall');
                this._bounceOff(dir);
                return; // boxed in — nowhere to put them
            }
            stepEntity(enemy, dest.x, dest.y, this._MOVE_MS); // knock aside / swap (animates)
            // fall through: (nx,ny) is now vacated, so the normal move below
            // advances the player into it with full hazard/pickup/turn handling.
        }

        // Bump-to-open? Mirrors bump-to-attack — containers are unwalkable
        // entities you interact with by bumping rather than moving onto.
        // (Phase 6b) Opening a chest now pops the Trade window (loot mode) — a
        // PAUSED menu like shopping, so it does NOT advance the world here.
        const container = this.containers.find(c => c.x === nx && c.y === ny);
        if (container) {
            this._openContainer(container);
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
            this._stepIndex++;   // alternates the walk-anim foot/weight-shift
            // (ending) Drive north across the now-open bridge → End of Chapter One.
            // The bridge mouth (row 0, x7-9) is only walkable once the car's fixed
            // (_openBridgeIfCarFixed), so reaching it here is the deliberate finale,
            // not the instant-on-fix cut that used to happen.
            if (ny === 0 && nx >= 14 && nx <= 19 && this.questEngine.getFlag('carFixed')) {
                this._playBridgeCutscene();   // (Phase 2) fuel decides: crash → Canyon, or ramp → Downtown
                return;
            }

            // Hazards
            const tileDef = this.map.getTileDef(nx, ny);
            if (tileDef.hazard === 'sludge' && !this.hasBuff('sludge')) {
                if (this._hasSludgeImmunity()) {
                    this._log('[The sludge slides right off your bagged feet.]');
                } else {
                    this.addBuff('sludge', 'Sludge', SLUDGE_DURATION, 'debuff');
                    this._log('[Stepped in sludge — 3 turns]');
                }
            }

            // Pickup
            this._tryPickup();

            // Transition? A transition may `require` an item (e.g. the canyon
            // escape needs the grappling hook) — data-driven so any door can gate.
            const transition = this.map.getTransition(nx, ny);
            if (transition) {
                if (transition.requires && !(this.inventory || []).some(s => s && s.itemDef.id === transition.requires)) {
                    this._log(transition.requiresMsg || '[You need something to get through here.]');
                } else {
                    this._pendingTransition = transition;
                }
            }

            // (Legacy tile-7 "BOSS ROOM REACHED" win hook removed — fix/critical-path.
            // Tile 7 was a stale wrong-win trap one cell east of the Wererat; it's
            // gone from sewer-map.json and the real ending is fix_car's onComplete.)

            this._advanceWorld();

            // Chain the next tile if a direction is still held or was buffered
            // mid-slide. Skipped across a map transition so a held key doesn't
            // auto-walk you straight into the new zone. (movement-feel Finding 1)
            if (!transition) this._onStepSettled();
        });
    }

    // ── Shove (barge through characters) ─────────────────────────────────────

    // Tough characters that can't be pushed — you bounce off instead. No types
    // are flagged heavy yet; the shopkeeper-refinement pass populates this
    // (bandit captains, the Sewer Merchant, bosses) via a `heavy: true` spawn
    // field or a future strength/tier check.
    _isHeavy(ch) {
        return ch.heavy === true;
    }

    // Where to knock `target` when the player barges in moving `dir`: a clear
    // tile perpendicular to the push ("one way or the other"); if neither side
    // is open, swap into the tile the player is leaving (handles a cornered
    // shopkeeper); null if truly boxed in.
    _shoveDestination(target, dir) {
        const ex = target.x, ey = target.y;
        const sides = dir.dx !== 0
            ? [{ x: ex, y: ey - 1 }, { x: ex, y: ey + 1 }]   // pushing horizontally → up/down
            : [{ x: ex - 1, y: ey }, { x: ex + 1, y: ey }];  // pushing vertically → left/right
        for (const s of sides) {
            if (this._tileFreeForShove(s.x, s.y, target)) return s;
        }
        // Cornered → swap: the character takes the tile the player is leaving.
        if (this._tileFreeForShove(this.playerX, this.playerY, target)) {
            return { x: this.playerX, y: this.playerY };
        }
        return null;
    }

    // A tile a shoved character may land on: walkable, no wall, not occupied by
    // another living character or a container. `exclude` is the character being
    // shoved (so it doesn't block its own destination check).
    _tileFreeForShove(x, y, exclude = null) {
        if (!this.map.isWalkable(x, y)) return false;
        if (this.enemies.some(e => e !== exclude && e.entity.isAlive() && e.x === x && e.y === y)) return false;
        if (this.containers.some(c => c.x === x && c.y === y)) return false;
        return true;
    }

    // Recoil feedback when you bump something immovable — reuses the player
    // stagger offset the renderer already draws, nudged back along the push.
    _bounceOff(dir) {
        this._playerStaggerUntil = performance.now() + 80;
        this._playerStaggerDx = -dir.dx * 6;
        this._playerStaggerDy = -dir.dy * 6;
        this._ensureParticleLoop();
        this._render();
    }

    // Interact with the broken-down car in town. Before the converter: a hint
    // to examine it. Holding the converter at the return stage: install it and
    // complete the quest. Otherwise a flavor line.
    _interactCar() {
        if (this.questEngine.getFlag('carFixed')) {
            // (Phase 2) The Cataclysmic Converter runs the car way too hot — floor
            // it at the bridge and you punch straight through. Pouring a bottle of
            // alcohol in the tank burns fast and weak, taming the engine just
            // enough to make the ramp.
            const alc = this.inventory.findIndex(s => s && s.itemDef.id === 'alcohol');
            if (this.carFuel !== 'alcohol' && alc >= 0) {
                this._removeFromSlot(alc);
                this.carFuel = 'alcohol';
                audio.playSfx('pickup');
                this._log('[You empty the whole bottle into the tank. The engine coughs, then drops into a slower, meaner idle. That should tame the jump.]', 'pickup');
                this._render();
                return;
            }
            this._log(this.carFuel === 'alcohol'
                ? '[The car idles low and steady now — the alcohol is doing its work. Ready for the bridge.]'
                : '[The car SNARLS, revving way past redline. At this speed you will never make the ramp — you will go straight through the bridge. There has to be a way to slow it down.]');
            this._render();
            return;
        }
        const idx = this.inventory.findIndex(s => s && s.itemDef.id === 'catalytic_converter');
        if (idx >= 0) {
            // Holding the converter AT the car installs it and finishes the quest,
            // no matter which stage the engine is on. The old gate required the exact
            // 'return_to_car' stage, which a dropped sewer→town map_entered event can
            // leave un-reached — soft-locking the finale on "get clear of the sewer
            // first" forever. Tolerant, mirroring the quest's own autoSatisfy rule.
            // (There's only one car, in town, so reaching here means we're home.)
            this._removeFromSlot(idx);
            this._sewerEscape = null;
            this._log('[You wrench the cataclysmic converter back into place. The engine turns over!]', 'pickup');
            this.emitGameEvent('interact_car', {});                       // advances return_to_car if we're there
            if (!this.questEngine.getFlag('carFixed')) this.questEngine.forceComplete('fix_car'); // else force it home
            this._render();
            return;
        }
        this._log("[The car won't start. Pop the hood and examine it (E).]");
        this._render();
    }

    // The fix_car escape stage's onEnter delegates here (see quests.js).
    _sewerEscapeSetpiece() {
        startSewerEscape(this);
    }

    // ── Continuous Walking & Turn-in-Place ──────────────────────────────────
    //
    // Held-key walking is chained from the slide-completion callback rather
    // than a timer (the old setInterval raced the 100ms rAF slide and dropped
    // ~every other step — the "jarry" stutter). See plans/movement-feel.md.

    // Track a physically-held direction key, most-recent last (de-duplicated).
    _noteHeld(code) {
        const i = this._heldDirKeys.indexOf(code);
        if (i >= 0) this._heldDirKeys.splice(i, 1);
        this._heldDirKeys.push(code);
    }

    _faceOf(dir) {
        if (dir.dy < 0) return 'up';
        if (dir.dy > 0) return 'down';
        if (dir.dx < 0) return 'left';
        return 'right';
    }

    _clearTurnTimer() {
        if (this._turnTimer) { clearTimeout(this._turnTimer); this._turnTimer = null; }
        this._pendingWalkDir = null;
    }

    // A direction press from the IDLE state. From a standstill, a tap toward a
    // NEW facing just pivots (free — no turn cost); holding past _TURN_MS
    // commits to walking. If already facing that way (or mid-walk), step now.
    _beginMoveOrTurn(dir) {
        this._clearTurnTimer();
        const standing = !this._animating;
        if (standing && this.facing !== this._faceOf(dir)) {
            this.facing = this._faceOf(dir);   // pivot only — no step, no _advanceWorld
            this._render();
            this._pendingWalkDir = dir;
            this._turnTimer = setTimeout(() => {
                this._turnTimer = null;
                this._pendingWalkDir = null;
                // Re-poll the LIVE held-key set rather than trusting the key that
                // armed this timer. During the 70ms window the player may have
                // pressed (and released) a second direction; if ANY direction is
                // still physically held, commit to walking it — most-recent wins.
                // (The old `top === code` guard dropped the walk when the arming
                // key was released but another stayed held: the "game ignored me"
                // feel. See plans/movement-feel.md.)
                const intent = this._intendedWalkDir();
                if (intent && this.state === STATE.IDLE && !this._animating) {
                    this._doMove(this._resolveWalkStep(intent));
                }
            }, this._TURN_MS);
        } else {
            this._doMove(dir);
        }
    }

    // Combine the live held-key set into an 8-way walk vector — the most-recent
    // held key on each axis wins, so W+A reads as up-left and adding D while
    // holding W flips to up-right. Folds in the one-deep mid-slide buffer so a
    // quick tap during a slide isn't lost (movement-feel Finding 2). Returns
    // null when nothing is held or buffered.
    _intendedWalkDir() {
        let h = 0, v = 0;
        for (const code of this._heldDirKeys) {
            const d = DIRS[code];
            if (!d) continue;
            if (d.dx) h = d.dx;
            if (d.dy) v = d.dy;
        }
        if (this._queuedMoveDir) {
            if (this._queuedMoveDir.dx) h = this._queuedMoveDir.dx;
            if (this._queuedMoveDir.dy) v = this._queuedMoveDir.dy;
        }
        if (!h && !v) return null;
        return { dx: h, dy: v };
    }

    // Resolve an intended (possibly diagonal) walk vector into the actual step.
    // A diagonal is taken only when both orthogonal component tiles AND the
    // diagonal tile are open — never cut through a wall seam. If a component is
    // blocked, slide along whichever axis is open so a diagonal into a wall
    // keeps you moving instead of stopping dead. Cardinals pass through.
    _resolveWalkStep(dir) {
        if (dir.dx === 0 || dir.dy === 0) return dir;
        const px = this.playerX, py = this.playerY;
        const horizOpen = this.map.isWalkable(px + dir.dx, py);
        const vertOpen  = this.map.isWalkable(px, py + dir.dy);
        const destOpen  = this.map.isWalkable(px + dir.dx, py + dir.dy);
        if (horizOpen && vertOpen && destOpen) return dir;   // clean diagonal
        if (vertOpen)  return { dx: 0, dy: dir.dy };          // slide vertically
        if (horizOpen) return { dx: dir.dx, dy: 0 };          // slide horizontally
        return { dx: 0, dy: dir.dy };                         // boxed in → cardinal bump
    }

    // Called at the end of every completed tile slide. Decides the next step
    // from the combined held-key vector (8-way), resolved against wall seams.
    // The _autoRepeatShouldStop gate is preserved verbatim so held-walking
    // still halts before consequential tiles (walls/enemies/pickups/
    // transitions/hazards) — only the first deliberate press may take such a
    // step. (fix/critical-path safety intact)
    _onStepSettled() {
        if (this.state !== STATE.IDLE) return;
        // Manual input always OVERRIDES a click-to-walk: a held / just-pressed
        // direction cancels the path and takes over (press WASD mid-path to grab
        // the wheel back). Read the intent (folds in the one-deep buffer) first.
        const intent = this._intendedWalkDir();
        this._queuedMoveDir = null;
        if (intent) {
            this._pathQueue = [];
            this._pathArrive = null;
            const step = this._resolveWalkStep(intent);
            if (this._autoRepeatShouldStop(step)) return;
            this._doMove(step);
            return;
        }
        // No manual input → advance the click-to-walk path one tile, reusing the
        // same halt gate as held-walk. When the queue drains, the next settle fires
        // the deferred action (path-then-act). A blocked tile (wall/hostile/hazard)
        // aborts BOTH the path and its pending action.
        if (this._pathQueue.length) {
            const node = this._pathQueue.shift();
            const step = this._resolveWalkStep({ dx: node.x - this.playerX, dy: node.y - this.playerY });
            if (this._autoRepeatShouldStop(step)) { this._pathQueue = []; this._pathArrive = null; }
            else { this._doMove(step); return; }
        } else if (this._pathArrive) {
            const arrive = this._pathArrive; this._pathArrive = null; arrive();
        }
    }

    // Start a click-to-walk along a BFS path (from pathing.findPath). onArrive, if
    // given, fires once the Hero reaches the end (path-then-act). Returns false on
    // a null path; fires onArrive immediately for an empty (already-there) path.
    _walkPath(path, onArrive = null) {
        if (!path) return false;
        this._stopAutoRepeat();               // cancel any held-walk / prior path first
        if (path.length === 0) { if (onArrive) onArrive(); return true; }
        this._pathQueue = path.slice();
        this._pathArrive = onArrive;
        this._onStepSettled();                // kick the first step now
        return true;
    }

    // Re-arm continuous walking from the physically-held keys after a scene or
    // state change emptied the walk stack. Call this at every point the world
    // returns to a live IDLE (map transition, wheel/menu/pause/dialogue close,
    // respawn): if a direction is still physically down, rebuild _heldDirKeys
    // from _physicalHeld and kick one step so the player keeps walking with NO
    // re-press. Routed through _onStepSettled, so the FIRST step in the new
    // scene still respects _autoRepeatShouldStop (the transition/hazard gate —
    // no blind auto-walk into the next screen) and _animating (no double-step).
    // Only ever acts in IDLE, so a key held while a menu is open can't step
    // until the menu actually closes. (movement-feel resume-fix, 2026-07-03)
    _resumeHeldWalk() {
        // A click-to-walk path never survives a scene boundary — drop it so a
        // stale (old-map-coords) path can't auto-walk you after a zone load. Held-
        // key walking still resumes below from the physical-held set.
        this._pathQueue = [];
        this._pathArrive = null;
        // Never auto-walk a dead / zero-HP player: _closeWheel (and friends) force
        // state=IDLE synchronously even when the fire that opened them just killed
        // the player via _advanceWorld→_die, and resuming here would step the 0-HP
        // player and re-enter _die. Guard on HP. (pre-prod review fix)
        if (this.state !== STATE.IDLE || this._animating || this.playerHp <= 0) return;
        const held = [...this._physicalHeld].filter(code => DIRS[code]);
        if (held.length === 0) return;
        // Set iteration is insertion order → roughly press order, good enough
        // for the same-axis tie-break _intendedWalkDir does.
        this._heldDirKeys = held;
        this._onStepSettled();
    }

    // Stop all continuous walking and clear pending movement intent. Named for
    // its many existing call sites (blur, pause, map load, death, resets); it
    // is the single "halt the walker" entry point.
    _stopAutoRepeat() {
        this._clearTurnTimer();
        this._queuedMoveDir = null;
        this._heldDirKeys = [];
        this._pathQueue = [];       // cancel any click-to-walk in progress
        this._pathArrive = null;
        if (this._pressTimer) { clearTimeout(this._pressTimer); this._pressTimer = null; }
    }

    // True when held-key auto-walking should HALT before stepping in `dir` —
    // i.e. the next tile would commit to a consequential, deliberate action.
    // Covers: any blocker (wall / enemy / container / the car tile / a barricade),
    // a map transition, or a hazard tile. Ground items are intentionally NOT
    // covered — held-walk now flows over and auto-picks-them-up (movement-feel
    // feel pass). The first manual press already happened; this only gates the
    // AUTOMATIC follow-up steps. (fix/critical-path)
    _autoRepeatShouldStop(dir) {
        const nx = this.playerX + dir.dx;
        const ny = this.playerY + dir.dy;

        // Blockers that _doMove intercepts as bump-interactions or walls.
        if (!this.map.isWalkable(nx, ny)) return true;            // wall, car (19), barricade (23), etc.
        // Held-walk barges through non-hostile NPCs (the shove handles them) — only
        // a HOSTILE in the way halts auto-walk now. (playtest: townsfolk stopping
        // your walk read as a bug.)
        if (this.enemies.some(e => e.x === nx && e.y === ny && this._isHostileToPlayer(e))) return true;
        if (this.containers.some(c => c.x === nx && c.y === ny)) return true;

        // (2026-07-04, Caelan's call) Zone transitions NO LONGER halt held-walk —
        // a held direction now walks you smoothly THROUGH the doorway (Pokémon/DQM
        // seamless-zone feel), then the async load's .then() re-arms the walk
        // (_resumeHeldWalk) so you keep going in the new zone with no re-press. The
        // old halt made you stop one tile short of every exit and re-tap. Removing
        // it loosens a deliberate safety (the movement-feel plan flagged this as an
        // explicit decision) — accepted for the feel. The Chapter-One bridge ending
        // is a separate hardcoded tile check (gated on carFixed), not a
        // getTransition, so it is unaffected.
        // NOTE: ground items also deliberately do NOT stop held-walk (auto-pickup
        // while walking is the norm). Hazards still DO stop — stepping into sludge
        // is a real consequence you should opt into.
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
        // overlay now keeps Use / Smash only. (Phase 6a) Give left the overlay
        // too — handing an item to an NPC is now the Trade window's offer mode
        // (Target-Wheel → Trade on any adjacent NPC).

        const adjHostile = this._adjacentHostiles();

        // Left = smash (only if adjacent HOSTILE-eligible enemy — prevents
        // smashing Carrion-like non-hostiles, the same way bump-attack now
        // refuses to attack them)
        if (adjHostile.length > 0) {
            this.overlayOptions.left = { label: 'Smash', action: 'smash' };
        }

        audio.playSfx('menu-open'); // [audio] item use/throw overlay opened
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
        }
    }

    _doItemUse(item) {
        // (zone pursuit) The pipe's Use jams the door you came through, slamming
        // it on pursuers mid-breach. Only consumes the pipe + the turn if a door
        // was actually wedged; otherwise fall through (it has no normal Use).
        if (item.canJamDoors) {
            if (this._tryJamDoor()) {
                this._removeFromSlot(this.selectedSlot);   // the pipe stays wedged in the door
                this.selectedSlot = -1;
                this.state = STATE.IDLE;
                this._advanceWorld();
            } else {
                this.state = STATE.ITEM_SELECTED;          // nothing to jam — don't waste it
                this._render();
            }
            return;
        }

        if (item.effect === 'cure_sludge') this._soapUsedThisTurn = true;
        if (item.effect === 'heal') audio.playSfx('heal'); // [audio] healing item used

        const msg = resolveUse(this, item, null);
        if (msg) this._log(msg);
        this._refreshGrantedSkills();   // a weapon may have changed → refresh Magic/Trick grants

        // Consumables are spent; a persistent equip (armor) moves out of the bag
        // and onto the body, so it leaves the hotbar slot too.
        if (item.consumable || item.useType === 'equip') this._removeFromSlot(this.selectedSlot);
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

    // (Phase 6a) The internal give routine — now only called from the Target
    // Wheel's Trade verb (which routes a lone-item give straight through) and,
    // going forward, the Trade window's offer mode (_offerFromTrade). Consumes
    // the selected slot, delegates disposition math + flip to applyGive, and
    // advances the world. Kept even though the give VERB/UI died: the MATH is
    // what folds into trade.
    _doGive(recipient) {
        const stack = this.inventory[this.selectedSlot];
        if (!stack) { this.state = STATE.IDLE; this._render(); return; }

        const result = reactToTransaction(recipient, 'give', { item: stack.itemDef });
        this._log(result.log);

        if (result.accepted) {
            this._removeFromSlot(this.selectedSlot);
        }

        this.selectedSlot = -1;
        this.state = STATE.IDLE;
        this._advanceWorld();
    }

    // Offer the bag item at `slot` to the currently-open trade NPC — the Trade
    // window's give path (Phase 6a: give folds into trade). Unlike _doGive this
    // is a PAUSED-MENU action: it does NOT advance the world and it keeps the
    // window OPEN (like buy/sell), so the player can hand over several items and
    // watch the mood-face move. Routes through the spine's reactToTransaction seam
    // (records giftLog + delegates disposition/flip to applyGive), same as _doGive.
    _offerFromTrade(slot) {
        const npc = this._tradeNpc;
        const stack = this.inventory[slot];
        if (!npc || !stack) return;
        const def = stack.itemDef;
        // (§delivery) The active quest stage may be a delivery expecting exactly
        // this item -> this NPC; then the hand-off IS the objective.
        const isDelivery = this.questEngine && this.questEngine.expectsDelivery(def.id, npc.id);
        // Quest items can't be handed away by default — there's no recovery, so
        // giving one (e.g. the sole car-fix Converter) would soft-lock the quest.
        // EXCEPTION: a sanctioned delivery. Matches the block on throw/smash/sell.
        if (def.questItem && !isDelivery) { this._log('[Best hold onto that.]'); this._render(); return; }
        if (isDelivery) {
            // Bypass the barter/disposition math — consume it, emit, let the quest react.
            this._removeFromSlot(slot);
            this._tradeSell = this._tradeSellList();
            audio.playSfx('pickup');
            this._log(`[You hand over the ${String(def.name || def.id).replace(/[\[\]]/g, '')}.]`);
            this.emitGameEvent('item_given', { npc: npc.id, item: def.id });
            this._render();
            return;
        }
        const result = reactToTransaction(npc, 'give', { item: def });
        this._log(result.log);
        if (result.accepted) {
            this._removeFromSlot(slot);
            this._tradeSell = this._tradeSellList();
            audio.playSfx('pickup');
            // (§delivery) make every hand-off quest-trackable — the trade-window idiom.
            this.emitGameEvent('item_given', { npc: npc.id, item: def.id });
        }
        this._render();
    }

    // ── Combat wheel (verb-tree: Fight/Trick/Treat/Flight → item → aim) ────────
    //
    // Opened anywhere by Space / the touch ACTION button (no bump-to-attack).
    // The pure model lives in wheel-model.js; this layer wires open/close, the
    // aim reticle, double-tap-repeat, and fire-routing to the existing
    // combat/item resolvers (combatAttack, resolveThrow, resolveUse, addBuff,
    // _doMove, _openTrade).

    _openWheel() {
        if (this.state !== STATE.IDLE) return;
        this._stopAutoRepeat();
        this._heldDirKeys = [];
        this.state = STATE.RADIAL_MENU;
        this.wheel.path = [0];
        this.wheel.aiming = false;
        this.wheel.confirming = false;
        this.wheel.reticle = null;
        this.wheel._spinAt = 0; this.wheel._drillAt = 0;   // clear stale juice timestamps
        restoreLastCategory(this.wheel);   // reopen on the last-used category
        audio.playSfx('menu-open');
        this._overlayOpenedAt = performance.now();
        this._ensureParticleLoop();
        this._render();
    }

    _closeWheel() {
        this.state = STATE.IDLE;
        this.wheel.reticle = null;
        this.wheel.aiming = false;
        this.wheel.confirming = false;
        // (Slice 2) Clear the HOLD latch on EVERY close path (Esc/_wheelBack, the
        // tap-outside cull, fire-then-close, or a hold-release) so a stale 'true'
        // can never survive a close and let a later Space/pointer release re-close
        // a freshly-opened wheel. _wheelOpenerUp reads the flag before this runs.
        this._wheelOpenedByHold = false;
        audio.playSfx('menu-cancel');
        this._render();
        this._resumeHeldWalk();   // resume walking if a dir was held through the wheel
    }

    // (Slice 2) The ONE opener seam for the wheel — Space, the touch ACTION
    // button, and (Slice 4) the gamepad shoulder button all route through this
    // pair, so the hold-vs-tap-toggle open mode lives in one place. tap-toggle =
    // today's behaviour (open + stay until Esc / tap-outside / ▼CLOSE). hold =
    // press-and-hold to keep it up, release to close — but a release mid-AIM or
    // mid-CONFIRM is ignored, so it can't nuke a half-placed reticle. Reads
    // Settings live, so the Options toggle applies immediately (no reload).
    _wheelOpenerDown() {
        if (this.state !== STATE.IDLE) return;
        this._openWheel();
        this._wheelOpenedByHold = (Settings.get('wheelOpenMode') === 'hold');
    }

    _wheelOpenerUp() {
        if (this._wheelOpenedByHold && this.state === STATE.RADIAL_MENU
            && !this.wheel.aiming && !this.wheel.confirming) {
            this._closeWheel();
        }
        this._wheelOpenedByHold = false;
    }

    // ── Target List (tap-a-target verb menu) ────────────────────────────────
    // Tap a target → a vertical LIST of the verbs valid for THAT thing (Examine,
    // Talk, Trade, Hit, Take…), colour-coded, alphabetical; picks route to the
    // existing resolvers. Only the ACTION wheel is radial, so the two never mix.

    // 608-space canvas point → world tile (camera inverse; tiles are
    // 608/(2·half+1) px, player centred at 304, scroll ~0 while idle).
    _screenToTile(pt) {
        const half = (this.renderer && this.renderer.half) || 9;
        const TILE = 608 / (2 * half + 1);
        const sx = (this.renderer && this.renderer._scrollX) || 0;
        const sy = (this.renderer && this.renderer._scrollY) || 0;
        return {
            x: Math.floor((pt.x + sx) / TILE - half + this.playerX),
            y: Math.floor((pt.y + sy) / TILE - half + this.playerY),
        };
    }

    // What's targetable at a tile: a live entity, else a ground item, else an
    // examinable. Returns { x, y, npc?, item?, examinable? } or null.
    _targetAt(x, y) {
        const npc = (this.enemies || []).find(e => e.entity.isAlive() && e.x === x && e.y === y);
        const item = (this.groundItems || []).find(gi => gi.x === x && gi.y === y);
        let examinable = (this.examinables || []).find(e => e.x === x && e.y === y);
        // The town car is a 2x2 block of non-walkable tiles (id 19) but its
        // examinable is a single point. Tapping ANY of its four tiles resolves to
        // the car, so Examine — the default verb for an examinable — is one easy
        // tap away: the intended first beat of the main quest.
        if (!npc && !item && !examinable && this.map.getTile(x, y) === 19) {
            examinable = (this.examinables || []).find(e => e.id === 'car') || null;
        }
        if (!npc && !item && !examinable) return null;
        return { x, y, npc: npc || null, item: item || null, examinable: examinable || null };
    }

    // (Target List) Open the RuneScape-style verb list on a target — same target
    // resolution as the retired Target Wheel, but ordered verbs + a Cancel row,
    // drawn as a vertical list. Static (no particle loop needed).
    _openTargetList(x, y) {
        if (this.state !== STATE.IDLE) return false;
        const target = this._targetAt(x, y);
        if (!target) return false;
        const verbs = orderedTargetVerbs(target, this);
        if (!verbs.length) return false;
        this._stopAutoRepeat();
        Object.assign(this.targetList, { x, y, target, verbs, sel: 0 });
        this.state = STATE.TARGET_LIST;
        audio.playSfx('menu-open');
        this._render();
        return true;
    }

    _closeTargetList() {
        this.state = STATE.IDLE;
        this.targetList.target = null;
        audio.playSfx('menu-cancel');
        this._render();
        this._resumeHeldWalk();
    }

    // (§12.3) Examine → a modal inspect panel. Builds the normalized descriptor
    // (brackets stripped from the body for panel display), shows it, and blocks
    // until any key/tap. Callers still log the line + emit the examine event;
    // this is the legible presentation layer over that same read.
    _openInspect(desc) {
        if (!desc) return;
        this.inspect = {
            title: String(desc.title || 'Examine').replace(/[\[\]]/g, '').trim(),
            tierName: desc.tierName || null,
            tierColor: desc.tierColor || null,
            body: String(desc.body || '').replace(/[\[\]]/g, '').trim(),
        };
        this._stopAutoRepeat();
        this._heldDirKeys = [];
        this.state = STATE.INSPECT;
        audio.playSfx('menu-confirm');
        this._render();
    }

    _closeInspect() {
        this.inspect = null;
        this.state = STATE.IDLE;
        audio.playSfx('menu-cancel');
        this._render();
        this._resumeHeldWalk();
    }

    // Open the Target List on the target the player is FACING (keyboard/pad path).
    _openTargetListFaced() {
        const FACE = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
        const [dx, dy] = FACE[this.facing] || [0, 1];
        return this._openTargetList(this.playerX + dx, this.playerY + dy);
    }

    // (Target List) Tap a row: first tap on a non-selected row selects it, a tap on
    // the selected row fires it, a tap off any row cancels. Reuses targetListRowRect.
    _tapTargetList(pt) {
        const tl = this.targetList;
        for (let i = 0; i < tl.verbs.length; i++) {
            if (this._pointInRect(pt, targetListRowRect(i), 4)) {
                if (i === tl.sel) { this._fireTargetVerb(tl.verbs[i]); return; }
                tl.sel = i; audio.playSfx('menu-tick'); this._render(); return;
            }
        }
        this._closeTargetList();
    }

    // Route the chosen verb (from the Target List) to the existing resolvers; the
    // `cancel` row just closes the list. Adjacency-requiring verbs walk the Hero
    // adjacent FIRST (path-then-act) — see _actOnTarget.
    _fireTargetVerb(verb) {
        if (verb.resolver === 'cancel') { this._closeTargetList(); return; }
        this.state = STATE.IDLE;   // the resolvers + click-walk assume IDLE
        this._actOnTarget(verb, this.targetList.target);
    }

    // Perform `verb` on `t`, walking the Hero adjacent FIRST when the verb needs
    // adjacency and we're not there yet (path-then-act: BG3 × RuneScape). Shared by
    // the Target List and a bare tap's default action. Rangeless verbs (examine /
    // throw) fire in place.
    _actOnTarget(verb, t) {
        if (!verb || !t) { this._render(); return; }
        // The car is a 2x2 non-walkable block whose examinable is a single point,
        // and only some of its sides are open — so "walk up and examine" means
        // pathing to the nearest open tile beside the WHOLE block, not the tapped
        // tile (whose own neighbours may all be walls or other car tiles).
        if (verb.resolver === 'examine' && t.examinable && t.examinable.id === 'car') {
            const path = this._carApproachPath();
            if (path && path.length) { this._walkPath(path, () => this._fireResolver(verb, t)); return; }
            this._fireResolver(verb, t); return;   // already beside it (or boxed in) → examine now
        }
        const near = Math.max(Math.abs(this.playerX - t.x), Math.abs(this.playerY - t.y)) <= 1;
        if (verb.needsAdjacent && !near) {
            const path = findPath(this, { x: this.playerX, y: this.playerY }, { x: t.x, y: t.y }, { adjacent: true });
            if (path) { this._walkPath(path, () => this._fireResolver(verb, t)); return; }
            this._render(); return;   // unreachable — can't get adjacent to act
        }
        this._fireResolver(verb, t);
    }

    // Shortest path ending on an open tile beside the town car (a 2x2 non-walkable
    // block). Tries adjacency of each of the car's own tiles and keeps the
    // shortest, so it finds whichever side is actually open; returns [] if the
    // Hero is already beside the car, or null if it's boxed in.
    _carApproachPath() {
        const carEx = (this.examinables || []).find(e => e.id === 'car');
        if (!carEx) return null;
        let best = null;
        for (let dy = -1; dy <= 2; dy++) for (let dx = -1; dx <= 2; dx++) {
            const cx = carEx.x + dx, cy = carEx.y + dy;
            if (this.map.getTile(cx, cy) !== 19) continue;
            const p = findPath(this, { x: this.playerX, y: this.playerY }, { x: cx, y: cy }, { adjacent: true });
            if (p && p.length === 0) return [];   // already beside a car tile
            if (p && (best === null || p.length < best.length)) best = p;
        }
        return best;
    }

    // Fire a verb's resolver on `t`, assuming the Hero is already positioned for it.
    _fireResolver(verb, t) {
        const npc = t && t.npc;
        this.state = STATE.IDLE;
        switch (verb.resolver) {
            case 'examine': {
                // (Phase 6d) An item's examine names its value tier — the legible
                // "how good/valuable is this" read (Grey→Orange).
                const itemDef = t.item && t.item.def;
                const tier = itemDef ? itemTier(itemDef) : null;
                const itemTxt = itemDef && `[${itemDef.name || t.item.type} (${tier.name}). ${itemDef.description || ''}]`;
                const txt = (t.examinable && t.examinable.text)
                    || (npc && `[${(npc.name || npc.type)}. ${isHostile(npc) ? 'Looks like trouble.' : 'Minding their own business.'}]`)
                    || itemTxt
                    || '[Nothing worth examining.]';
                this._log(txt);
                if (t.examinable) this.emitGameEvent('examine', { targetId: t.examinable.id });
                // (§12.3) Surface it as a layered inspect panel: an item wears its
                // value tier + colour; NPC/examinable fall back to a gold title.
                const desc = itemDef
                    ? { title: itemDef.name || t.item.type, tierName: tier.name, tierColor: tier.color, body: itemDef.description || txt }
                    : npc
                        ? { title: npc.name || npc.type, body: txt }
                        : { title: (t.examinable && t.examinable.id) ? String(t.examinable.id).replace(/_/g, ' ') : 'Examine', body: txt };
                this._openInspect(desc);
                break;
            }
            case 'talk':  if (npc) this._openDialogue(npc); break;
            case 'trade': if (npc) this._openTrade(npc); break;   // (Phase 6a) any adjacent NPC → shop or offer window
            case 'bribe': if (npc) this._bribeTarget(npc); break;
            case 'hit':   if (npc) { this.combatAttack(npc, this.equipment.weapon.damage); this._advanceWorld(); this._render(); } break;
            case 'throw': { const th = this._resolveThrowable(); if (th) { const msg = resolveThrow(this, th.itemDef, null, th.count, { x: t.x, y: t.y }); if (msg) this._log(msg); th.consume(); this._advanceWorld(); } else this._log('[Nothing to throw.]'); this._render(); break; }
            case 'take':  this._takeItemAt(t.x, t.y); this._render(); break;
            default: this._render();
        }
    }

    _bribeTarget(npc) {
        if (npc.bribeable === false) { this._log(`[The ${npc.type || 'stranger'} won't take your money.]`); this._render(); return; }
        const cost = bribeStepCost(npc.disposition ?? 0);
        if ((this.gold ?? 0) < cost) { this._log(`[Not enough gold to bribe — needs ${cost}g.]`); this._render(); return; }
        transferGold(this, npc, cost, 'bribe');   // (spine) gold → the NPC's pocket
        applyDispositionDelta(npc, BRIBE_STEP);
        this._log(`[You slip the ${npc.type || 'stranger'} ${cost}g. (+${BRIBE_STEP} disposition.)]`);
        this._advanceWorld(); this._render();
    }

    // Take a specific ground item at a tile (not _tryPickup, which is player-tile only).
    _takeItemAt(x, y) {
        const idx = (this.groundItems || []).findIndex(gi => gi.x === x && gi.y === y);
        if (idx === -1) { this._log('[Nothing to take there.]'); return; }
        const gi = this.groundItems[idx];
        const def = ITEMS[gi.type];
        if (!def) { this.groundItems.splice(idx, 1); return; }
        if (!this._addToInventory(def)) { this._log('[Your bag is full.]'); return; }
        this._collectedItems.add(`${this._mapUrl}|${x}|${y}|${gi.type}`);
        this.groundItems.splice(idx, 1);
        audio.playSfx('pickup');
        this._log(`[Took ${def.name}.]`, 'pickup');
    }

    // Spin the active ring one slot and stamp the spin so the renderer sweeps it.
    _wheelCycle(dir) {
        const w = this.wheel;
        cycle(w, dir);
        w._spinAt = performance.now(); w._spinDir = dir;
        audio.playSfx('menu-tick'); this._render();
    }

    // Collapse one level (or close at the root) and stamp the re-center pop.
    _wheelBack() {
        const w = this.wheel;
        if (back(w) === 'close') { this._closeWheel(); return; }
        w._drillAt = performance.now(); w._drillDir = -1;
        audio.playSfx('menu-cancel'); this._render();
    }

    // Drill the highlighted node: grey-out gate (placeholder / unavailable), then
    // act on the drill sentinel — fire a leaf, enter AIM, or descend a sub-wheel.
    _wheelDrill() {
        const w = this.wheel;
        const node = selectedNode(w);
        if (node.placeholder) { audio.playSfx('bump-wall'); return; }
        if (node.available && !node.available(this)) { audio.playSfx('bump-wall'); return; }
        if (!verbApplies(node, this)) { audio.playSfx('bump-wall'); return; }   // (Phase 1) no valid target → bump
        const r = drill(w, this);
        if (r === 'bump') { audio.playSfx('bump-wall'); return; }
        if (r === 'fire') { this._wheelCommit(); return; }
        if (r === 'aim')  { if (!w.reticle) w.reticle = autoAimTile(selectedNode(w), this); audio.playSfx('menu-tick'); this._render(); return; }
        w._drillAt = performance.now(); w._drillDir = +1;
        audio.playSfx('menu-tick'); this._render();   // 'push' / descended into a sub-wheel
    }

    // Commit the composed action — surfacing the Plus-Ultra confirm if it would
    // clip a friendly. _fireWheel (via _closeWheel) clears the confirm flag.
    _wheelCommit() {
        const w = this.wheel;
        if (!w.confirming && needsFriendlyConfirm(w, this)) { w.confirming = true; audio.playSfx('menu-tick'); this._render(); return; }
        this._fireWheel();
    }

    // The reticle's reach for the current leaf: adjacent verbs lock to range 1,
    // Throw uses the selected item's range (fallback 5), everything else 1.
    _aimRange(leaf) { return aimRange(leaf, this); }

    // Drive the reticle while in the AIM layer: d-pad nudges it (clamped to the
    // leaf's range + walkability), Space/Enter fires, Esc backs out.
    _reticleKey(code) {
        const w = this.wheel, leaf = selectedNode(w), range = this._aimRange(leaf);
        const mv = {
            ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1],
            ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0],
        }[code];
        if (mv) {
            // SNAPPY: for range-1 verbs (melee/cleave/run/trade) a direction is the
            // whole gesture — point that way and it commits (firing, or drilling to
            // the Plus-Ultra confirm if it'd clip a friendly). No separate Space.
            // Press Space alone to commit the pre-seeded nearest target instead.
            // A reach weapon (Lion Whip, reach>1) turns single-target Hit into a
            // placed reticle within reach — it falls through to the nudge path
            // below. Range-1 verbs keep the snappy "point-and-commit" gesture.
            const reachyHit = leaf.resolver === 'combatAttack' && range > 1;
            if (leaf.aimType === 'adjacent' && !reachyHit) {
                w.reticle = { x: this.playerX + mv[0], y: this.playerY + mv[1] };
                // Cleave RE-AIMS on a direction (so you see the arc + highlighted
                // enemies) and waits for Space; single-target adjacent verbs
                // (melee/run/trade) commit on the direction press itself.
                if (leaf.resolver === 'cleaveAttack') { audio.playSfx('menu-tick'); this._render(); return; }
                this._wheelCommit();
                return;
            }
            // Ranged / Throw / Magic / reach-melee: nudge the reticle for precise placement.
            if (!w.reticle) w.reticle = autoAimTile(leaf, this) || { x: this.playerX, y: this.playerY };
            const nx = w.reticle.x + mv[0], ny = w.reticle.y + mv[1];
            if (cheb(this.playerX, this.playerY, nx, ny) <= range && this.map.isWalkable(nx, ny)) {
                w.reticle = { x: nx, y: ny }; this._render();
            }
            return;
        }
        if (code === 'Space' || code === 'Enter') {
            this._wheelCommit();   // surfaces the Plus-Ultra confirm if it'd clip a friendly
            return;
        }
        if (code === 'Escape') { w.aiming = false; w.reticle = null; audio.playSfx('menu-cancel'); this._render(); return; }
    }

    // Direction (sign vector) from the player toward a tile, or null.
    _aimDir(tile) { if (!tile) return null; return { dx: Math.sign(tile.x - this.playerX), dy: Math.sign(tile.y - this.playerY) }; }

    // Throw inventory `slot` onto the exact reticle `tile` (real placement — the
    // burst centres on that tile, not a collapsed cardinal direction).
    _throwAt(slot, tile) {
        if (!tile) { this._log('[Nothing to throw at]'); this.state = STATE.IDLE; return; }
        this.selectedSlot = slot;
        this._doThrowAt(tile); // consumes item + advances world + sets state IDLE
    }

    // Resolve a throw onto an exact tile (wheel reticle path). Mirrors _doThrow
    // but passes the target tile through to resolveThrow instead of a direction.
    _doThrowAt(tile) {
        const stack = this.inventory[this.selectedSlot];
        if (!stack) { this.state = STATE.IDLE; this._render(); return; }
        audio.playSfx('throw');
        const msg = resolveThrow(this, stack.itemDef, null, stack.count, tile);
        if (msg) this._log(msg);
        if (stack.itemDef.consumable) this._removeFromSlot(this.selectedSlot);
        this.selectedSlot = -1;
        this.state = STATE.IDLE;
        this._advanceWorld();
    }

    // True if the last-fired action can be repeated as-is (express double-tap).
    _canRepeatLast() {
        const lf = this.wheel.lastFired; if (!lf) return false;
        if (lf.itemSlot >= 0 && !this.inventory[lf.itemSlot]) return false;
        if (lf.aimTile && lf.nodeKey === 'hit') {
            return this.enemies.some(e => e.entity.isAlive() && e.x === lf.aimTile.x && e.y === lf.aimTile.y);
        }
        return true;
    }

    // Restore the last selection into the wheel and fire it without drawing.
    _repeatLastAction() {
        const lf = this.wheel.lastFired; if (!lf || !lf.path) { this._openWheel(); return; }
        this.wheel.path = lf.path.slice();
        this.wheel.itemIndex = lf.itemSlot >= 0 ? lf.itemSlot : this.wheel.itemIndex;
        this.wheel.aiming = false;
        this.wheel.confirming = false;
        this.wheel.reticle = lf.aimTile || autoAimTile(selectedNode(this.wheel), this);
        // Re-clamp the restored reticle to the CURRENT player position (they may
        // have walked since), so confirm/preview/damage all agree on the tile.
        if (this.wheel.reticle) {
            const range = aimRange(selectedNode(this.wheel), this);
            const dx = this.wheel.reticle.x - this.playerX, dy = this.wheel.reticle.y - this.playerY;
            if (Math.max(Math.abs(dx), Math.abs(dy)) > range) {
                this.wheel.reticle = {
                    x: this.playerX + Math.max(-range, Math.min(range, dx)),
                    y: this.playerY + Math.max(-range, Math.min(range, dy)),
                };
            }
        }
        this.state = STATE.RADIAL_MENU; // _fireWheel + _closeWheel return us to IDLE
        if (needsFriendlyConfirm(this.wheel, this)) { this.wheel.confirming = true; audio.playSfx('menu-tick'); this._render(); return; }
        this._fireWheel();
    }

    // Compose the wheel selection and route to the existing resolvers.
    // Apply `damage` to every alive entity standing on any of `tiles`. Each hit
    // routes through combatAttack (typed splat, death, reaction bus). Returns the
    // count struck. Hits friendlies too — the Plus-Ultra confirm gated that.
    _aoeStrike(tiles, damage, opts = {}) {
        let hit = 0;
        for (const t of tiles) {
            const e = this.enemies.find(en => en.entity.isAlive() && en.x === t.x && en.y === t.y);
            if (e) { this.combatAttack(e, damage, opts); hit++; }
        }
        return hit;
    }

    _fireWheel() {
        const w = this.wheel;
        const { node, itemSlot, spellId, aimTile } = compose(w, this);
        w.lastFired = { path: w.path.slice(), nodeKey: node.key, itemSlot, spellId, aimTile };
        audio.playSfx('menu-confirm');
        switch (node.resolver) {
            case 'combatAttack': {
                const enemy = aimTile && this.enemies.find(e => e.entity.isAlive() && e.x === aimTile.x && e.y === aimTile.y);
                if (enemy) {
                    const wpn = this.equipment.weapon;
                    // (fear) Fearmur fears an enemy struck twice in a row — check
                    // BEFORE the hit (which may kill it and reset the tracker).
                    const repeat = wpn && wpn.onHit === 'fearOnRepeat' && this._lastHitTarget === enemy.id;
                    this.combatAttack(enemy, wpn.damage);
                    if (enemy.entity.isAlive()) {
                        if (repeat) { this._applyFear(enemy, 3); this._log('[The Fearmur cracks bone — it recoils in terror!]', 'combat'); }
                        if (wpn && wpn.pullDistance) this._pullEnemyToward(enemy, wpn.pullDistance);   // (Lion Whip) yank it closer
                        this._lastHitTarget = enemy.id;
                    } else {
                        this._lastHitTarget = null;   // dead → streak broken
                    }
                    this._advanceWorld();
                }
                else { this._log('[Nothing to hit there]'); }
                break;
            }
            case 'cleaveAttack': {
                this._lastHitTarget = null;   // (fear) AoE breaks the Fearmur single-target streak
                // Fixed 3-tile frontal arc, 2/3 weapon damage to everything in it.
                const dmg = Math.max(1, Math.round(this.equipment.weapon.damage * 2 / 3));
                const hit = this._aoeStrike(affectedTiles(w, this), dmg);
                if (hit) { this._log(`[Cleave! ${hit} caught.]`, 'combat'); this._advanceWorld(); }
                else this._log('[Cleave hits only air]');
                break;
            }
            case 'spinAttack': {
                this._lastHitTarget = null;   // (fear) AoE breaks the Fearmur single-target streak
                // Sweep all 8 tiles, 2/5 weapon damage to everything around you.
                const dmg = Math.max(1, Math.round(this.equipment.weapon.damage * 2 / 5));
                const hit = this._aoeStrike(affectedTiles(w, this), dmg);
                if (hit) { this._log(`[Spin! ${hit} caught.]`, 'combat'); this._advanceWorld(); }
                else this._log('[You spin, hitting nothing]');
                break;
            }
            case 'castSpell': {
                // The selected spell's AoE (3×3 burst or cardinal cone) hits every
                // entity in it for full damage. Plus Ultra already gated a friendly.
                const spell = SPELLS[spellId] || SPELLS[(this.knownSpells || [])[0]];
                if (!spell) { this._log("[You don't know any spells.]"); break; }
                if ((this.playerMp || 0) < spell.mpCost) { this._log(`[Not enough MP — ${spell.name} needs ${spell.mpCost}.]`); break; }
                this.playerMp = Math.max(0, this.playerMp - spell.mpCost);
                const hit = this._aoeStrike(affectedTiles(w, this), spell.damage, { type: spell.damageType });
                if (hit) this._log(`[${spell.name}! ${spell.damage} ${spell.damageType} to ${hit}.]`, 'combat');
                else this._log(`[${spell.name} fizzles — nothing caught.]`);
                this._advanceWorld();
                break;
            }
            case 'castTrick': {
                // Trick skills cost GP, not MP — "turning tricks for money".
                // Granted by tech gear (the Ray Gun grants Ray Blast). Same AoE
                // path as spells; the gold guard mirrors the bribe idiom above.
                if (!this.hasTrick(node.trickId)) { this._log("[You don't have that trick.]"); break; }
                const trick = TRICKS[node.trickId];
                if (!trick) { this._log("[That trick isn't ready yet]"); break; }
                if ((this.gold ?? 0) < trick.gpCost) { this._log(`[Not enough GP — ${trick.name} needs ${trick.gpCost}g.]`); break; }
                this.gold = Math.max(0, (this.gold ?? 0) - trick.gpCost);
                if (trick.summon) {
                    // Summon trick (Hire a Lion) — no damage; spawn a temporary ally.
                    this._spawnSummon(trick.summon, trick.summonTurns || 2, trick);
                    this._advanceWorld();
                    break;
                }
                const hit = this._aoeStrike(affectedTiles(w, this), trick.damage, { type: trick.damageType });
                if (hit) this._log(`[${trick.name}! ${trick.damage} ${trick.damageType} to ${hit}. (-${trick.gpCost}g)]`, 'combat');
                else this._log(`[${trick.name} fizzles — nothing caught. (-${trick.gpCost}g)]`);
                this._advanceWorld();
                break;
            }
            case 'castBoo': {
                // Fear everyone around you — no damage. MP-costed, granted by the
                // Fearmur. Uses the self-burst from affectedTiles; _applyFear skips
                // allies/townsfolk (so `feared` counts only real routs).
                const spell = SPELLS[spellId];
                if (!spell) { this._log("[You don't know that spell.]"); break; }
                if ((this.playerMp || 0) < spell.mpCost) { this._log(`[Not enough MP — ${spell.name} needs ${spell.mpCost}.]`); break; }
                this.playerMp = Math.max(0, this.playerMp - spell.mpCost);
                const tiles = affectedTiles(w, this);
                let feared = 0;
                for (const e of this.enemies) {
                    if (!e.entity.isAlive()) continue;
                    if (tiles.some(t => t.x === e.x && t.y === e.y) && this._applyFear(e, spell.fear || 3)) feared++;
                }
                if (feared) this._log(`[BOO! ${feared} flee in terror!]`, 'combat');
                else this._log('[Boo! ...nothing flinches.]');
                this._advanceWorld();
                break;
            }
            case 'resolveThrow': { if (itemSlot >= 0 && aimTile) { this._throwAt(itemSlot, aimTile); } break; }
            case 'resolveUse':   { const stack = itemSlot >= 0 ? this.inventory[itemSlot] : null; if (stack) { this.selectedSlot = itemSlot; this._doItemUse(stack.itemDef); } else this._log('[Nothing to use]'); break; }
            case 'guard':        { this.addBuff('guard', 'Guard', 2, 'buff'); this._log('[Bracing — incoming damage reduced.]'); this._advanceWorld(); break; }
            case 'wait':         { this._log('[Wait]'); this._advanceWorld(); break; }
            case 'run':          { const d = this._aimDir(aimTile); if (d) { this._closeWheel(); this._doMove(d); return; } break; }
            case 'trade': {
                // (Phase 6a) Trade opens for ANY adjacent NPC now — vendors get
                // the shop columns, non-vendors get offer mode (hand over items).
                const npc = aimTile && this.enemies.find(e => e.entity.isAlive() && e.x === aimTile.x && e.y === aimTile.y);
                this.state = STATE.IDLE;                 // _openTrade requires IDLE
                // (give-fold, Caelan's call) ANY adjacent NPC opens the window —
                // vendors get the shop, non-vendors get offer mode. Not gated on
                // npc.vendor (that would regress the give-into-trade fold).
                if (npc) { this._openTrade(npc); return; }
                this._log('[No one to trade with there]');
                break;
            }
            case 'bribe': {
                const npc = aimTile && this.enemies.find(e => e.entity.isAlive() && e.x === aimTile.x && e.y === aimTile.y);
                if (!npc) { this._log('[No one to bribe there]'); break; }
                if (npc.bribeable === false) { this._log(`[The ${npc.type || 'stranger'} won't take your money.]`); break; }
                const cost = bribeStepCost(npc.disposition ?? 0);
                if ((this.gold ?? 0) < cost) { this._log(`[Not enough gold to bribe — needs ${cost}g.]`); break; }
                transferGold(this, npc, cost, 'bribe');                        // gold → the NPC's pocket
                reactToTransaction(npc, 'bribe', { delta: BRIBE_STEP, gold: cost });
                this._log(`[You slip the ${npc.type || 'stranger'} ${cost}g. (+${BRIBE_STEP} disposition.)]`);
                this._advanceWorld();
                break;
            }
            case 'hide': {
                // Stub — no stealth system yet. Graceful no-op that spends the turn.
                this._log('[You try to keep a low profile... (no effect yet)]');
                this._advanceWorld();
                break;
            }
            default: this._log(`[${node.label} isn't ready yet]`); // dep stub — never crash
        }
        this._closeWheel();
    }

    // ── Canonical adjacent-hostile filter ────────────────────────────────────
    //
    // Returns adjacent enemies — 8-way, orthogonally or diagonally (Chebyshev
    // distance 1) — that are (a) alive and (b) pass the behavior-whitelist
    // HOSTILE gate. The gate's semantics: an enemy with
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
            && cheb(e.x, e.y, this.playerX, this.playerY) === 1
            && isHostile(e)
        );
    }

    // Live entities within a Chebyshev radius of a tile — the shared AoE
    // primitive for thrown bursts (r=1 → the 3×3) and future area verbs.
    _entitiesInRadius(cx, cy, r) {
        return this.enemies.filter(e => e.entity.isAlive()
            && Math.abs(e.x - cx) <= r && Math.abs(e.y - cy) <= r);
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
        this._routeWorldMessages(msgs);

        // (summon) Temporary summoned allies (the hired lion) act above in
        // resolveEnemyTurns, THEN their timer ticks — so a fresh summon still
        // gets its turn. At zero they melt away.
        if (this.enemies.some(e => e._isSummon)) {
            for (const e of this.enemies) if (e._isSummon) e._summonTurnsLeft--;
            const gone = this.enemies.filter(e => e._isSummon && e._summonTurnsLeft <= 0);
            for (const e of gone) this._log(`[${e.type || 'The summon'} slinks back into the crowd.]`);
            if (gone.length) this.enemies = this.enemies.filter(e => !(e._isSummon && e._summonTurnsLeft <= 0));
        }

        // Enemies/NPCs may have just begun a one-tile slide (stepEntity). Kick
        // the render loop so those glides animate even if the player took a
        // single step and stopped. Idempotent + self-stopping via
        // _hasActiveEffects. (plans/movement-feel.md #6)
        this._ensureParticleLoop();
        if (this.playerHp <= 0) { this.playerHp = 0; this._die(); return; }

        // Combat DRIVER (CD-5): the free-roam timer lets go so the player gets
        // unhurried turn-based thinking time, so each committed combat turn hand-
        // winds exactly one world beat here — keeping the town alive (ambient NPCs
        // step, the day eases one tick) in lockstep with the fight instead of
        // freezing it. Ambient runs every combat turn; decay counts turns. Same
        // dual-clock split as free-roam, one shared seam (_worldBeat).
        if (this._inCombat()) {
            const decayDue = ++this._dispositionDecayTurns >= DISPOSITION_DECAY_TURNS;
            if (decayDue) this._dispositionDecayTurns = 0;
            this._worldBeat({ ambient: true, decayDue });
        }

        // (zone pursuit) A wedged door takes a pounding from the pursuers trapped
        // behind it; it bursts when their blows break it.
        this._tickJammedDoor();

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

        // Tick buffs — the sludge DoT now lives in its buff def's onTick (buffs.js).
        // Its death check moves right after the tick so a sludge death still skips
        // the rest of the beat (MP regen, etc.), exactly as the inline block did.
        this._tickBuffs();
        if (this.playerHp <= 0) { this.playerHp = 0; this._die(); return; }

        // MP trickles back each turn — FIGHT → Magic spells spend it, this refills.
        if (this.playerMp < this.playerMaxMp) {
            this.playerMp = Math.min(this.playerMaxMp, this.playerMp + MP_REGEN);
        }

        // Transition?
        if (this._pendingTransition) {
            const t = this._pendingTransition;
            this._pendingTransition = null;
            this._log(t.label || '[Transitioning...]');
            // (zone pursuit) Snapshot the hostiles on your heels BEFORE _loadMap
            // wipes them, plus which zone they're chasing you out of, so they can
            // be re-injected at the matching door in the new zone.
            this._pendingFollowers = this._captureFollowers(t);
            this._pendingFollowersFrom = this._mapUrl;
            this._cameFrom = this._mapUrl;   // the zone behind you — the pipe-jam targets its door
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
                // Keep walking into the new zone if a direction is still held —
                // the first step still passes the transition/hazard gate, so no
                // double-warp. (movement-feel resume-fix)
                this._resumeHeldWalk();
            });
            return;
        }

        this._render();
        this.autosave();
    }

    // Route world-advance messages: plain strings → side log; spoken tuples
    // (barks, adjacency-barks, "spotted") → overhead dialogue above the speaker.
    // Shared by _advanceWorld (combat-path enemies) and _ambientTick (heartbeat-
    // driven ambient NPCs) so both speak through the same pipe.
    _routeWorldMessages(msgs) {
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
    }

    // Unified clock — the "in combat?" gate (was the M1 freeze predicate). True
    // while any hostile is actively engaged: a non-ambient enemy in the legacy
    // 'chasing' state (set by resolveEnemyTurns on aggro / line-of-sight); ambient
    // townsfolk never count. It no longer FREEZES the world — instead it switches
    // the world beat from timer-wound (free-roam) to one-per-committed-turn
    // (combat), so the real-time heartbeat lets go and the player gets unhurried
    // turn-based thinking time. Derived, not stored, so it can't drift out of sync.
    // The world locks (turn-based combat) whenever a non-ambient enemy is chasing.
    // Shared with the wheel's §12.5 combat re-skin via the pure wheel-model helper.
    _inCombat() { return isCombatActive(this); }

    // ── Ambient world heartbeat (Town Clock) ─────────────────────────────────
    //
    // Fired on the free-running world tick (WORLD_TICK_MS) while the player is
    // idle, so ambient NPCs (spawned with `ambient: true`) wander and chatter
    // even when the player stands still. Runs on game.worldTick — it never
    // increments game.turn and never ticks combat buffs, so combat clarity is
    // untouched. The eureka made concrete: the world is paused for you only
    // during a fight, never waiting on you in town. resolveEnemyTurns skips
    // ambient NPCs, so this is their sole driver.
    _ambientTick() {
        this.worldTick++;
        const msgs = resolveAmbientTurns(this);
        this._routeWorldMessages(msgs);
        // Kick the render loop so any wander-slides / barks started this beat
        // animate smoothly. Idempotent + self-stopping via _hasActiveEffects.
        this._ensureParticleLoop();
    }

    // (CD-5) One beat of the living world: ease the day clock, optionally step
    // ambient life, and (when its cadence is due) decay dispositions. The two
    // DRIVERS stay separate — the free-roam heartbeat timer and the per-combat-turn
    // hand-wind (the dual-clock is deliberate) — but this SEQUENCE is the single
    // place both call, so "works in combat, not free-roam" drift can't creep in.
    // `ambient` gates the ambient step (free-roam only on a settled idle frame,
    // combat every turn); `decayDue` is the caller's cadence verdict (free-roam
    // accumulates ms, combat counts turns).
    _worldBeat({ ambient, decayDue }) {
        this._advanceDayClock();
        if (ambient) this._ambientTick();
        if (decayDue) this._tickDispositionDecay();
    }

    // Town Clock day/night — advance the overworld day clock one beat and derive
    // the lighting grade's _nightLevel. A cosine bell peaks at "midnight" and the
    // (raw - 0.6)/0.4 lift keeps most of the cycle as full day, with a smooth
    // dusk → night → dawn stretch in between. The idle re-render / rAF loops pick
    // up the new level, so the light shifts even while the player stands still.
    _advanceDayClock() {
        this._dayClockMs = (this._dayClockMs + WORLD_TICK_MS) % DAY_LENGTH_MS;
        const p   = this._dayClockMs / DAY_LENGTH_MS;        // 0..1 phase of the day
        const raw = (1 - Math.cos(p * 2 * Math.PI)) / 2;     // 0 → 1 → 0 bell, peak at midnight
        this._nightLevel = Math.max(0, (raw - 0.6) / 0.4) * NIGHT_MAX;
    }

    // (Phase 6c) The disposition tick clock — one nudge of every non-ally NPC's
    // mood toward its resting value (0 = neutral), so bribes/gifts and insults
    // both fade over time (a bribe becomes a repeated cost, not a one-time
    // trivialize; a slight fades). Wound on the free-roam heartbeat (time) and
    // per-turn in combat (see the call sites). DELIBERATELY does not route through
    // applyDispositionDelta: that fires the upward ally-flip whenever disposition
    // ≥ threshold, which a downward decay must NOT re-trigger — and per the locked
    // decision allies stay bought (decay never un-allies). So it mutates the mood
    // directly, clamped, and leaves _ally/_wasFlipped untouched. Resting value is
    // 0 for all NPCs today; a per-NPC `restingDisposition` can drive it later.
    _tickDispositionDecay() {
        const step = DISPOSITION_DECAY_STEP;
        for (const e of this.enemies) {
            if (!e || !e.entity || !e.entity.isAlive()) continue;
            if (e._ally) continue;                 // loyalty is locked once flipped
            const d = e.disposition;
            if (d == null || d === 0) continue;    // no mood tracked / already resting
            const rest = e.restingDisposition ?? 0;
            if (d === rest) continue;
            e.disposition = d > rest ? Math.max(rest, d - step) : Math.min(rest, d + step);
        }
    }

    // Military-time readout (HH:MM) derived from the day-clock phase. The cycle
    // starts at NOON — phase 0 = full day = 12:00 — and the cosine night-peak
    // lands at midnight (phase 0.5 = 00:00): clock = (12:00 + phase·24h) wrapped.
    // Decoupled from combat turns (a fight only nudges it imperceptibly), so the
    // sky never lurches mid-fight. Purely derived from _dayClockMs — no state.
    _timeOfDay() {
        const p = this._dayClockMs / DAY_LENGTH_MS;            // 0..1 phase of the day
        const totalMin = Math.floor(12 * 60 + p * 24 * 60) % (24 * 60);
        const hh = Math.floor(totalMin / 60);
        const mm = totalMin % 60;
        return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
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

    // Read-only ownership lens (PD-2). Walks inventory + equipment + temp-equips
    // as one sequence (items.js) — the single "do I own item X" answer, so a
    // check can't miss equipped gear the way an inventory-only scan did.
    ownedItems() { return ownedItemDefs(this); }
    hasItem(pred) { return hasItemDef(this, pred); }

    // Find a throwable the player has ANYWHERE (inventory first, else an equipped
    // one — e.g. a rock stowed in the 'sides' slot), returning { itemDef, count,
    // consume }. consume() removes exactly that source: a bag-slot decrement, or
    // clearing the equip slot (unequip-and-throw) so the Throw verb never lies.
    _resolveThrowable() {
        const isThrow = d => d && d.useType && String(d.useType).includes('throw');
        const slot = (this.inventory || []).findIndex(s => s && isThrow(s.itemDef));
        if (slot >= 0) {
            const st = this.inventory[slot];
            return { itemDef: st.itemDef, count: st.count, consume: () => this._removeFromSlot(slot) };
        }
        const eq = this.equipment || {};
        for (const k of Object.keys(eq)) {
            if (isThrow(eq[k])) {
                const def = eq[k];
                return { itemDef: def, count: 1, consume: () => { this.equipment[k] = null; this._refreshGrantedSkills?.(); } };
            }
        }
        return null;
    }

    _tryPickup() {
        let go = true;
        while (go) {
            go = false;
            const idx = this.groundItems.findIndex(gi => gi.x === this.playerX && gi.y === this.playerY);
            if (idx === -1) break;
            const gi = this.groundItems[idx];
            if (this._addToInventory(gi.def)) {
                audio.playSfx('pickup'); // [audio] item picked up off the ground
                this._log(`[Picked up ${gi.def.name}]`);
                this.emitGameEvent('item_pickup', { id: gi.def.id });
                // Remember it so re-entering this zone doesn't respawn it.
                this._collectedItems.add(`${this._mapUrl}|${gi.x}|${gi.y}|${gi.type}`);
                this.groundItems.splice(idx, 1);
                go = true;
            } else { this._log('[Inventory full]'); break; }
        }
    }

    // An examinable that yields a one-time item (the Red Cape wedged in a grate).
    // Called from doExamine when the target has a `grants` id. Adds the item once,
    // remembers it in _collectedItems (same key as ground pickups) so it survives
    // reload, and shows the `spentText` on later examines. Returns true (examined).
    _grantFromExaminable(target) {
        const key = `${this._mapUrl}|${target.x}|${target.y}|${target.grants}`;
        if (this._collectedItems.has(key)) {
            this._log(target.spentText || '[Nothing left here now.]');
            return true;
        }
        const def = ITEMS[target.grants];
        if (!def) { this._log(target.text || `[You examine the ${target.id}.]`); return true; }
        if (!this._addToInventory(def)) { this._log('[Your bag is full — leave it for now.]'); return true; }
        this._collectedItems.add(key);
        this._log(target.text || `[You take the ${def.name}.]`);
        this._log(`[+ ${def.name}]`, 'pickup');
        audio.playSfx('pickup');
        return true;
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

    // (Phase 6b) A chest opens the SAME Trade window as a merchant — no separate
    // loot UI. It's modelled as a zero-cost "vendor" whose stock is its contents
    // and whose buy = TAKE (move an item into the bag for 0 GP, decrement the
    // chest). A chest has no disposition, so the pricing/canTrade guards are
    // bypassed. This is also the window buyback (6c) will ride.
    _openContainer(container) {
        if (this.state !== STATE.IDLE) return;
        if (!container || container.contents.length === 0) {
            this._log(`[The ${container ? container.type : 'container'} is empty.]`);
            return;
        }
        this._tradeNpc = {
            type: container.type,
            vendor: true,          // shop-style layout (buy column), not offer mode
            bribeable: false,
            disposition: 100,      // benign value for any mood()/canTrade() call
            _container: container, // the marker the buy/tap/render paths branch on
            stock: this._containerStock(container),
            entity: { isAlive: () => true },
        };
        this._tradeSell = this._tradeSellList();
        this.state = STATE.TRADE;
        audio.playSfx('pickup');
        this._log(`[You pry open the ${container.type}.]`, 'transition');
        this._render();
    }

    // Normalize a container's mixed string-or-{type} contents into an array of
    // item-id strings — the shape the Trade BUY column + _tapTrade read. Unknown
    // / undefined ids drop out (they'd render nothing anyway).
    _containerStock(container) {
        return (container.contents || [])
            .map(e => (typeof e === 'string' ? e : e && e.type))
            .filter(id => id && ITEMS[id]);
    }

    // ── Combat ───────────────────────────────────────────────────────────────

    combatAttack(enemyObj, damage, opts = {}) {
        const playerEntity = { name: '[Player]', isDead: () => false };
        const result = attack(playerEntity, enemyObj.entity, damage);

        // (AGGRO behavior bands) Friendly fire — hitting your own bribed ally
        // re-flips them to hostile. The blow still lands (below); they just turn
        // on you for it. Skip if the hit killed them (nothing to re-flip).
        if (enemyObj._ally && enemyObj.entity.isAlive()) {
            this._revertAlly(enemyObj);
        } else if (enemyObj.entity.isAlive()) {
            // Reaction bus: any non-ally you harm reacts. Already-hostile chasers
            // are unchanged; a struck friendly/neutral turns on you.
            this._onEntityHarmed(enemyObj, { kind: opts.omni ? 'splash' : 'attack' });
        }

        // (combat-feel-pass) Typed hit-splat. Direction = player→enemy for a
        // direct swing/bump so the splat fans that way; AoE callers (the thrown
        // 3×3 burst) pass opts.omni so it bursts around the target instead.
        const splatDir = { dx: enemyObj.x - this.playerX, dy: enemyObj.y - this.playerY };
        this._spawnHitSplat(enemyObj.x, enemyObj.y, `-${result.dealt}`, opts.type || 'physical',
            { dir: splatDir, omni: !!opts.omni, crit: !!opts.crit });

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
            this._handleEnemyDeath(enemyObj);
        } else {
            audio.playSfx('attack-hit'); // [audio] impact on a non-lethal hit
            // (combat-feel-pass) The per-hit onomatopoeia ("POW!") is retired —
            // the typed splat carries the feedback now. Words are reserved for
            // milestone beats like the K.O. above.
        }

        return formatDamageNumber(result);
    }

    // Shared "an enemy just died" side-effects — the K.O. beat, the kill event,
    // the Were-Rat converter drop, and the sewer-escape wave counter. Called
    // from combatAttack (player kills) AND _allyTakeTurn (ally kills) so a bribed
    // ally landing the finishing blow still drops the converter / feeds the
    // gauntlet instead of soft-locking the quest. (AGGRO behavior bands)
    _handleEnemyDeath(enemyObj) {
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
        // Pike guards his climbing rope with his life — take it off his body.
        if (enemyObj.tag === 'pike_boss' && ITEMS.grappling_hook) {
            this.groundItems.push({ type: 'grappling_hook', x: enemyObj.x, y: enemyObj.y, def: ITEMS.grappling_hook });
            this._log('[Pike crumples. His big coil of rope — the grappling hook — thuds to the stone.]', 'pickup');
        }
        // Pike's deal (his dialogue onPick set the flag): clearing the LAST canyon
        // critter earns the rope — no coin, no killing Pike.
        if (enemyObj.tag === 'canyon_critter' && this.questEngine && this.questEngine.getFlag('pikeDeal')
            && !this.questEngine.getFlag('pikeDealPaid')
            && !this.enemies.some(e => e.tag === 'canyon_critter' && e.entity.isAlive())) {
            this.questEngine.state.flags.pikeDealPaid = true;
            this._grantItem('grappling_hook', '["Deal\'s a deal." Pike coils the big rope into your pack — the grappling hook is yours.]');
        }
        onSewerEnemyKilled(this, enemyObj);
    }

    // Grant an item straight into the bag (quest rewards, dialogue gifts). Emits
    // item_pickup so quests + HUD react exactly like a ground pickup.
    _grantItem(id, msg) {
        const def = ITEMS[id];
        if (!def) return false;
        if (!this._addToInventory(def)) { this._log('[Your bag is full — no room for it.]'); return false; }
        if (msg) this._log(msg, 'pickup');
        this.emitGameEvent('item_pickup', { id });
        this._render();
        return true;
    }

    // ── Allies (bribe-flipped — AGGRO behavior bands) ──────────────────────────

    // Is `e` a hostile the player's allies should hunt? Alive, not itself an
    // ally, and either a legacy chaser (no behavior whitelist) or an explicit
    // HOSTILE FSM entry. Non-hostile FSM NPCs (vendors, idle wanderers) and
    // other allies are excluded.
    _isHostileToPlayer(e) {
        return e.entity.isAlive() && isHostile(e);
    }

    // One turn for a bribed ALLY (dispatched from npc.js's ALLIED state). Hunt
    // the nearest hostile within SEEK tiles — attack if adjacent, else step
    // toward it. With no hostile in range, leash-follow the player (close in only
    // when more than LEASH tiles away) so allies neither wander off nor crowd you.
    _allyTakeTurn(ally) {
        const SEEK = 8, LEASH = 3;

        let target = null, bestDist = Infinity;
        for (const e of this.enemies) {
            if (!this._isHostileToPlayer(e)) continue;
            const d = manhattan(ally.x, ally.y, e.x, e.y);
            if (d <= SEEK && d < bestDist) { bestDist = d; target = e; }
        }

        if (target) {
            if (cheb(ally.x, ally.y, target.x, target.y) <= 1) {
                const result = attack(ally.entity, target.entity, ally.damage);
                if (result) {
                    this._spawnHitSplat(target.x, target.y, `-${result.dealt}`, 'physical', { omni: true });
                    target._hitFlashUntil = performance.now() + 120;
                    this._ensureParticleLoop();
                    if (result.killed) this._handleEnemyDeath(target);
                }
            } else {
                const step = getGreedyStep(this, { x: ally.x, y: ally.y }, { x: target.x, y: target.y }, { self: ally });
                if (step) { ally.x = step.x; ally.y = step.y; }
            }
            return [];
        }

        // No hostile in range — leash-follow the player.
        if (manhattan(ally.x, ally.y, this.playerX, this.playerY) > LEASH) {
            const step = getGreedyStep(this, { x: ally.x, y: ally.y }, { x: this.playerX, y: this.playerY }, { self: ally });
            if (step) { ally.x = step.x; ally.y = step.y; }
        }
        return [];
    }

    // Friendly fire (or any player damage) snaps a bribed ally back to hostile.
    // They drop into the HOSTILE chase locked onto the player — the simplest
    // "enraged" reversion, reusing the shared chase FSM (npc.js).
    _revertAlly(enemyObj) {
        enemyObj._ally = false;
        enemyObj.allegiance = 'hostile'; // authoritative — routes to the HOSTILE chase (npc.js)
        enemyObj.fsmState = 'HOSTILE';
        enemyObj.state = 'chasing';     // immediately hostile, no re-acquire delay
        enemyObj.disposition = -50;     // betrayed: head-meter goes angry + re-bribing costs more
        enemyObj._wasFlipped = false;   // ...but they CAN be won back if you make amends
        this._log(`[The ${enemyObj.type} turns on you!]`, 'combat');
    }

    // ── Reaction bus ──────────────────────────────────────────────────────────
    // Single entry point for "the player just harmed this entity." A non-hostile
    // (idle/dialogue NPC, vendor) you strike turns on you — it drops into the
    // HOSTILE chase locked onto the player (the same reversion _revertAlly uses),
    // so the shared chase FSM carries it. Already-hostile chasers and bribed
    // allies (handled by _revertAlly) are left alone. This is what makes the
    // wheel's offensive verbs actually land on the people around you.
    _onEntityHarmed(target, { kind = 'attack' } = {}) {
        if (!target || !target.entity || !target.entity.isAlive() || target._ally) return;
        if (isHostile(target)) return;               // already after you — nothing to provoke
        target.allegiance = 'hostile';               // authoritative — routes to the HOSTILE chase (npc.js)
        target.fsmState = 'HOSTILE';
        target.state = 'chasing';                    // aggro now, skip the LOS re-acquire beat
        if (target.vendor) target.vendor = false;    // a vendor you struck won't keep shop
        if (target.ambient) target.ambient = false;  // a provoked townsperson fights for real, not as ambient
        if (typeof target.disposition === 'number') target.disposition = Math.min(target.disposition, -50);
        this._log(`[The ${target.type || target.entity.name} turns on you!]`, 'combat');
    }

    // Total damage-reduction from worn armor. Flat MVP: every equipped body-zone
    // piece's `armor` sums into one number (per-zone hit-location comes later).
    // The weapon slot is excluded — a sword isn't armor.
    _playerArmor() {
        const eq = this.equipment || {};
        let total = 0;
        for (const key of ['top', 'bottom', 'front', 'back', 'sides']) {
            const it = eq[key];
            if (it && it.armor) total += it.armor;
        }
        return total;
    }

    // True if any worn armor grants sludge immunity (Shoe Bags). Sludge is a raw
    // HP drain that bypasses the armor sum, so it gets its own gate.
    _hasSludgeImmunity() {
        const eq = this.equipment || {};
        return ['top', 'bottom', 'front', 'back', 'sides'].some(k => eq[k] && eq[k].sludgeImmune);
    }

    // The "gear reshapes the wheel" build loop, now three-source (NetHack struct
    // prop): the active rings = base ∪ the player's equipped loadout ∪ the
    // equipped weapon's grants. Spells feed the Magic ring
    // (knownSpells = base + equippedSpells + weapon.grantsSpells), tricks feed the
    // Trick ring (grantedTricks = equippedTricks + weapon.grantsTricks). Call
    // after any change to weapon OR loadout — equip, learn, slot, new game,
    // respawn, save-load. De-duped; suppression is applied at READ (hasSpell/
    // hasTrick), not here. With an empty loadout this equals the old base+gear.
    _refreshGrantedSkills() {
        const w = this.equipment && this.equipment.weapon;
        const gs = (w && w.grantsSpells) || [];
        const gt = (w && w.grantsTricks) || [];
        this.knownSpells   = mergeKnown(BASE_SPELLS, this.equippedSpells, gs);
        this.grantedTricks = mergeKnown([], this.equippedTricks, gt);
    }

    // The single gate for "can this skill fire right now" — present in the merged
    // list AND not suppressed. Cast paths and (the wheel) route through these.
    hasSpell(id) { return isActive(this.knownSpells   || [], this.suppressedSkills, id); }
    hasTrick(id) { return isActive(this.grantedTricks || [], this.suppressedSkills, id); }

    // Learn a skill into the pool from any source (tomes now; trainers/quests
    // reuse this hook). Auto-slots if there's room (generous — usable at once).
    // Idempotent — returns true only if newly learned. type: 'trick' | 'spell'.
    _learnSkill(id, type) {
        const pool     = type === 'trick' ? this.learnedTricks  : this.learnedSpells;
        const equipped = type === 'trick' ? this.equippedTricks : this.equippedSpells;
        const learned  = learnInto(pool, equipped, SKILL_SLOTS[type], id);
        this._refreshGrantedSkills();
        if (learned) {
            const def = type === 'trick' ? TRICKS[id] : SPELLS[id];
            this._log(`[Learned ${(def && def.name) || id}!]`, 'transition');
        }
        return learned;
    }

    // Slot / unslot a learned skill (the GEAR-tab loadout). Both refresh the
    // merged grants so the wheel updates immediately.
    _equipSkill(id, type) {
        const pool     = type === 'trick' ? this.learnedTricks  : this.learnedSpells;
        const equipped = type === 'trick' ? this.equippedTricks : this.equippedSpells;
        if (equipSkill(pool, equipped, SKILL_SLOTS[type], id)) this._refreshGrantedSkills();
    }
    _unequipSkill(id, type) {
        const equipped = type === 'trick' ? this.equippedTricks : this.equippedSpells;
        if (unequipSkill(equipped, id)) this._refreshGrantedSkills();
    }

    // (Hire a Lion) Spawn a temporary ally on a free tile beside the player. It
    // fights through the existing ally pipeline (_allyTakeTurn) and melts away
    // when its summon timer runs out (ticked in _advanceWorld). Returns true if
    // it found room to appear.
    _spawnSummon(type, turns, opts = {}) {
        const RING = [[0, -1], [1, 0], [0, 1], [-1, 0], [-1, -1], [1, -1], [1, 1], [-1, 1]];
        let spot = null;
        for (const [dx, dy] of RING) {
            const x = this.playerX + dx, y = this.playerY + dy;
            if (this._tileFreeForShove(x, y)) { spot = { x, y }; break; }
        }
        if (!spot) { this._log('[No room beside you to summon anything.]'); return false; }
        const name = opts.summonName || (type.charAt(0).toUpperCase() + type.slice(1));
        this._summonSeq = (this._summonSeq || 0) + 1;
        const ally = new Enemy({
            id: `summon_${type}_${this.turn}_${this._summonSeq}`,
            type: name, x: spot.x, y: spot.y,
            hp: opts.summonHp || 30, damage: opts.summonDamage || 12,
            behavior: ['ALLIED'],
        });
        ally._ally = true;
        ally.fsmState = 'ALLIED';
        ally.state = 'idle';
        ally._isSummon = true;
        ally._summonTurnsLeft = turns;
        this.enemies.push(ally);
        this._log(`[You whistle sharp — ${name} bounds out of the crowd, all teeth.]`, 'combat');
        return true;
    }

    // (Lion Whip) Yank a struck enemy up to `dist` tiles toward the player, one
    // hop at a time, stopping at the first blocked tile. Reuses the shove
    // occupancy check; never pulls the enemy onto the player's own tile.
    _pullEnemyToward(target, dist) {
        for (let i = 0; i < dist; i++) {
            const dx = Math.sign(this.playerX - target.x);
            const dy = Math.sign(this.playerY - target.y);
            if (dx === 0 && dy === 0) break;
            const nx = target.x + dx, ny = target.y + dy;
            if (nx === this.playerX && ny === this.playerY) break;   // already adjacent — don't overlap us
            if (!this._tileFreeForShove(nx, ny, target)) break;      // wall / occupied → stop
            stepEntity(target, nx, ny, this._MOVE_MS);
        }
    }

    // (fear) Fear an enemy for `turns`: while the buff is up it flees each turn
    // (the override in resolveEnemyTurns), then resumes normal logic. Allies and
    // ambient townsfolk are immune (they don't tick combat buffs, so fearing
    // them would strand a buff that never expires). Pops a '!' over its head.
    _applyFear(enemyObj, turns) {
        if (!enemyObj || !enemyObj.entity || !enemyObj.entity.isAlive()) return false;
        if (enemyObj._ally || enemyObj.ambient) return false;
        enemyObj.addBuff('feared', 'Feared', turns, 'debuff');
        if (this._spawnOverheadDialogue) this._spawnOverheadDialogue(enemyObj.x, enemyObj.y, '!', { color: '#e8c34a', size: 20 });
        return true;
    }

    applyDamageToPlayer(rawDamage, attacker = null) {
        if (attacker) this._lastDefeatedBy = attacker;
        let dmg = rawDamage;
        if (this.hasBuff('guard')) dmg = Math.max(1, Math.floor(dmg / 2));
        dmg = Math.max(1, dmg - this._playerArmor());   // worn armor soaks the hit (min 1 always lands)
        this.playerHp = Math.max(0, this.playerHp - dmg);
        audio.playSfx('take-damage'); // [audio] player got hit

        // (combat-feel-pass) Typed hit-splat, omni burst — the player's attacker
        // isn't tracked (any adjacent enemy may have landed it), so the splat
        // sprays around the player rather than from a single direction.
        this._spawnHitSplat(this.playerX, this.playerY, `-${dmg}`, 'physical', { omni: true });

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

        // (combat-feel-pass) Routine "OUCH!" word-spam is retired — the splat is
        // the feedback. Keep only the near-death gasp as a milestone beat.
        if (this.playerHp <= 0) {
            this._spawnEventWord(this.playerX, this.playerY, '...!', '#ff5544', 20);
        }

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
        if (this.state === STATE.DEAD) return;   // re-entry guard: never stack respawn timers (pre-prod review)
        this._stopAutoRepeat();
        this._heldDirKeys = [];   // drop held keys so respawn doesn't phantom-walk
        this._physicalHeld.clear();   // and drop the RAW held set so nothing re-arms a walk during the death window
        this.state = STATE.DEAD;
        audio.playSfx('death'); // [audio] death sting
        this._flash('rgba(255, 0, 0, 0.4)'); // [settings] reduce-motion aware (wraps renderer.flash)
        this._log('[You died — respawning...]');
        setTimeout(() => this._resolveDefeat(), 500);
    }

    _resolveDefeat() {
        const by = this._lastDefeatedBy;
        this._lastDefeatedBy = null;
        // Boss (Wererat) → reset the encounter and retry; no scenario, no loss.
        if (isBoss(by)) { this._runBossRetry(by); return; }
        // Otherwise pick a scenario, weighted by (zone × who-beat-you × state).
        // Task 3 swaps the runner stub for the full template; for now the generic
        // fallback delegates to _respawn so ordinary defeats are unchanged.
        const ctx = {
            zone: this.map && (this.map.zoneName || this.map.url),
            by: (by && by.entity) ? by : null,       // an Enemy has .entity; a {cause} does not
            cause: (by && by.cause) || 'unknown',
            quest: this.questEngine && this.questEngine.state,
        };
        const pick = pickScenario(ctx, DEFEAT_SCENARIOS, () => this.rng.float());
        this._runScenario(pick, ctx);
    }

    // Run a scenario's declarative consequence. The safe floor (quest items +
    // equipped weapon + essential) is NEVER touched — only the at-risk pool.
    _runScenario(pick, _ctx) {
        const c = (pick && pick.consequence) || {};
        const cell = this._resolveWakeCell(c.wakeAt);          // 1. wake location
        this.playerX = cell.x; this.playerY = cell.y;
        this.playerHp = Math.max(1, Math.round(this.playerMaxHp * (c.hp ?? 0.5)));  // 2. vitals
        this.playerMp = this.playerMaxMp;
        if (c.timeSkip) this._skipTime(c.timeSkip);            // 3. time
        if (c.status) this.addBuff(c.status, (BUFF_DEFS[c.status] && BUFF_DEFS[c.status].name) || c.status, 6, 'debuff'); // 4. status
        if (c.take) this._applyTake(c.take);                   // 5. taken
        if (c.gift && Array.isArray(c.gift.items)) for (const id of c.gift.items) this._addToInventory(this._resolveItemDef(id)); // 6. given
        if (c.gift && c.gift.heal) this.playerHp = this.playerMaxHp;
        this._pendingTransition = null;                        // 7. de-aggro + resume (mirror _respawn's tail)
        for (const e of this.enemies) {
            if (!e.entity.isAlive() || e._ally) continue;
            if (e.state === 'chasing') e.state = 'idle';
            e._intruder = false; e._emergeDelay = 0;
        }
        this.state = STATE.IDLE;
        if (c.log) this._log(c.log, 'transition');
        this._render();
        this._resumeHeldWalk();
        this.autosave({ force: true });
    }

    // Resolve a wakeAt spec to a walkable cell. { spot:{x,y} } → that tile if
    // walkable; missing/unknown → _safeRespawnCell (zone spawn).
    _resolveWakeCell(wakeAt) {
        if (wakeAt && wakeAt.spot && typeof wakeAt.spot === 'object'
            && this.map.isWalkable(wakeAt.spot.x, wakeAt.spot.y)) return wakeAt.spot;
        return this._safeRespawnCell();
    }

    // Advance the day/night clock a coarse amount (a scuffle vs. to-morning).
    _skipTime(kind) {
        const beats = kind === 'morning' ? 40 : 8;
        for (let i = 0; i < beats; i++) this._advanceDayClock();
        this.turn += beats;
    }

    // Apply a take-rule to the at-risk pool. The safe floor is never in `atRisk`.
    _applyTake(take) {
        const weapon = this.equipment && this.equipment.weapon;
        const { atRisk } = partitionInventory(this.inventory, weapon);
        const taken = matchTake(take, atRisk);
        let takenGold = 0;
        if (take.gold) { takenGold = Math.floor((this.gold || 0) * take.gold); this.gold -= takenGold; }
        for (const e of taken) this.inventory[e.i] = null;
        // Task 4 adds the recoverable stash; until it exists this is a safe no-op
        // via optional-chaining (recoverable items are simply removed for now).
        if (take.recoverable && (taken.length || takenGold)) {
            this._spawnStash?.(take.stashAt, taken.map(e => e.itemDef.id), takenGold);
        }
    }

    _runBossRetry(boss) {
        if (boss && boss.entity) boss.entity.hp = boss.entity.maxHp;   // reset the boss to full
        const cell = this._safeRespawnCell();
        this.playerX = cell.x; this.playerY = cell.y;
        this.playerHp = this.playerMaxHp; this.playerMp = this.playerMaxMp;
        this.addBuff('rattled', 'Rattled', 6, 'debuff');
        for (const e of this.enemies) {                 // de-aggro so the retry starts calm
            if (!e.entity.isAlive() || e._ally) continue;
            if (e.state === 'chasing') e.state = 'idle';
            e._intruder = false; e._emergeDelay = 0;
        }
        this.state = STATE.IDLE;
        this._log('[Down but not out. Regroup and finish it.]', 'transition');
        this._render();
        this._resumeHeldWalk();
        this.autosave({ force: true });
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
        this._refreshGrantedSkills();   // reset weapon → no granted skills
        // Clear any transition queued before death so the first post-respawn
        // action doesn't ghost-load a map.
        this._pendingTransition = null;
        // (playtest) De-aggro on respawn: drop every chaser out of the hunt so the
        // player gets a breather instead of dying on repeat. Monsters keep their
        // current positions (no teleport home) and fall back to loitering /
        // wandering via their normal ambient behavior.
        for (const e of this.enemies) {
            if (!e.entity.isAlive() || e._ally) continue;
            if (e.state === 'chasing') e.state = 'idle';
            e._intruder = false;
            e._emergeDelay = 0;
        }
        this.state = STATE.IDLE;
        this._render();
        this._resumeHeldWalk();   // resume walking only if a dir is genuinely still held
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
        this._refreshGrantedSkills();   // fresh weapon → no granted skills
        this._pendingTransition = null;
        this.gold = 0;
        this.carFuel = 'raw';
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

    // (Phase 2) Crossing the North bridge with the car fixed. The Cataclysmic
    // Converter runs the car TOO fast — you punch straight through the wooden
    // bridge into the Canyon — UNLESS you've poured alcohol in the tank to slow
    // it, in which case you ramp clean over into Downtown. Reuses the ending beat
    // pattern (input blocked via RESOLVING, shake + flash + logs), then a short
    // beat later loads the destination zone.
    _playBridgeCutscene() {
        this._stopAutoRepeat();
        this._heldDirKeys = [];
        this.state = STATE.RESOLVING;                 // block input through the beat
        if (this.carFuel === 'alcohol') {
            this._log('[You feed it the doctored fuel and floor it — the engine burbles, tamed —]', 'transition');
            this._log('[— you hit the ramp CLEAN and SAIL over the canyon. Downtown rises up to meet you.]', 'transition');
            audio.playSfx('quest-advance');
            this._flash('rgba(255, 220, 120, 0.35)');
            this._triggerScreenShake(280, 4);
            this._render();
            setTimeout(() => this._rampToDowntown(), 1100);
        } else {
            this._log('[The Cataclysmic Converter SCREAMS — too fast, WAY too fast —]', 'combat');
            this._log('[— you punch STRAIGHT THROUGH the wooden bridge and slam the far canyon wall. The world goes end over end.]', 'combat');
            audio.playSfx('take-damage');
            this._flash('rgba(200, 40, 40, 0.5)');
            this._triggerScreenShake(520, 9);
            this._render();
            setTimeout(() => this._crashToCanyon(), 1100);
        }
    }

    // Bridge FAIL (too fast) → wake at the bottom of the Canyon. (Phase 3 fills it
    // with Pike + the grappling hook + the fight out; for now it's a scaffold room
    // with a placeholder scramble-out exit.)
    async _crashToCanyon() {
        await this._loadMap('canyon-map.json');
        this.state = STATE.IDLE;
        this._log('[You come to at the bottom of the canyon, ears ringing and the car a write-off. No climbing back up the way you fell.]', 'transition');
        if (this.questEngine) this.questEngine.start('canyon_escape');
        this._render();
    }

    // Bridge SUCCESS (alcohol) → ramp over into Downtown. (Phase 4 builds Downtown
    // out + starts Main Quest 2; for now it's a scaffold street.)
    async _rampToDowntown() {
        await this._loadMap('downtown-map.json');
        this.state = STATE.IDLE;
        this._log('[You skid to a stop on a Downtown street, the engine ticking as it cools. The real part of town. Now — that delivery.]', 'transition');
        this._startMainQuest2();   // (Phase 4) MQ2 begins on arrival
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

    // (combat-feel-pass) RuneScape-style typed hit-splat. `type` picks the
    // color + per-type animation in the renderer; `opts.dir` ({dx,dy}) makes the
    // splat fan in the direction of the blow (a swing / a throw came from
    // somewhere), while omitting it (or opts.omni) bursts it around the target
    // (an AoE, or a hit with no tracked source). Simultaneous bits on one tile
    // get incrementing `slot`s so they pre-separate instead of stacking —
    // deterministic, so the same hit always looks the same.
    _spawnHitSplat(tileX, tileY, text, type = 'physical', opts = {}) {
        const born = performance.now();
        let slot = 0;
        for (const p of this._damageNumbers) {
            if (p.type && p.tileX === tileX && p.tileY === tileY && born - p.bornAt < 130) slot++;
        }
        let dir = null;
        if (!opts.omni && opts.dir && (opts.dir.dx || opts.dir.dy)) {
            const len = Math.hypot(opts.dir.dx, opts.dir.dy) || 1;
            dir = { x: opts.dir.dx / len, y: opts.dir.dy / len };
        }
        this._damageNumbers.push({
            tileX, tileY, text, type,
            crit: !!opts.crit,
            dir, slot,
            bornAt: born,
            maxAge: 620,
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
            // Mid-step glide — keep rendering so enemy/NPC slides animate even
            // when the player is standing still. (plans/movement-feel.md #6)
            if (e._slideStart != null && now < e._slideStart + (e._slideMs || 0)) return true;
        }
        // Combat arena bloom/release is mid-ease — keep the loop alive so the
        // lit-stage transition animates smoothly instead of stepping on the idle
        // tick. (renderer owns _arenaLevel; target is 1 in combat, 0 otherwise.)
        const r = this.renderer;
        if (r && r._arenaLevel != null) {
            const target = this._inCombat() ? 1 : 0;
            if (Math.abs(r._arenaLevel - target) > 0.01) return true;
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
        audio.playSfx('menu-cancel');
        this._render();
        this._resumeHeldWalk();   // (menu grammar) was dropping a held walk on close
    }

    // ── Journal ([J]) — quest checklist + completed + witness log (+ map tab) ──
    // (Slice 3) The Remoticon device — one tabbed, soft-pausing overlay. _openDevice
    // enters STATE.DEVICE on a tab and pauses the world; _closeDevice restores IDLE
    // (the pause release resumes any held walk, so we don't call _resumeHeldWalk
    // again). Tab / the on-screen button toggle it; [ ] cycle tabs; C/J/M jump to a
    // tab. The ✕ chip + tap-outside come from the Slice-1 CLOSE_PANEL machinery
    // (device is registered there), routing Cancel through _closeCurrentMenu.
    _openDevice(tab = 'items') {
        if (this.state !== STATE.IDLE && this.state !== STATE.DEVICE) return;
        this._deviceTab = DEVICE_TABS.includes(tab) ? tab : 'items';
        this.state = STATE.DEVICE;
        audio.playSfx('menu-open');
        this._render();
    }

    _closeDevice() {
        if (this.state !== STATE.DEVICE) return;
        this.state = STATE.IDLE;
        audio.playSfx('menu-cancel');
        this._render();
        this._resumeHeldWalk();   // resume a held walk (matches the other modal closers)
    }

    _toggleDevice() {
        if (this.state === STATE.DEVICE) this._closeDevice();
        else this._openDevice('items');
    }

    _deviceCycleTab(dir) {
        this._deviceTab = cycleDeviceTab(this._deviceTab, dir);
        audio.playSfx('menu-tick');
        this._render();
    }

    // Tap inside the open device: a tab-strip tap switches tabs. (Body taps — e.g.
    // GEAR unequip — arrive in S3-T2.) The ✕ chip + tap-outside close are handled
    // earlier by the CLOSE_PANEL block, so only IN-PANEL taps reach here.
    _tapDevice(pt) {
        // Tab strip → switch tabs.
        for (let i = 0; i < DEVICE_TABS.length; i++) {
            if (this._pointInRect(pt, deviceTabRect(i), HIT_SLOP)) {
                this._deviceTab = DEVICE_TABS[i];
                audio.playSfx('menu-tick');
                this._render();
                return;
            }
        }
        // SKILLS body → tap a learned chip to slot / unslot it (loadout edit).
        // Reads the SAME chips the renderer draws, so the tap can't drift.
        if (this._deviceTab === 'skills') {
            const { chips } = deviceSkillsLayout(deviceBodyRect(), this);
            for (const c of chips) {
                if (!this._pointInRect(pt, c)) continue;
                if (c.slotted) this._unequipSkill(c.id, c.type);
                else           this._equipSkill(c.id, c.type);
                audio.playSfx('menu-tick');
                this._render();
                return;
            }
            return;
        }
        // GEAR body → tap a filled plate to unequip (the weapon plate is inert).
        // Reads the SAME scaled slots the renderer draws, so the tap can't drift.
        if (this._deviceTab === 'gear') {
            const { slots } = deviceEquipLayout(deviceBodyRect());
            for (const s of slots) {
                if (s.key === 'weapon') continue;
                if (!this._pointInRect(pt, s)) continue;
                if (!this.equipment[s.key]) return;   // empty plate — nothing to remove
                const msg = unequipItem(this, s.key);
                if (msg) this._log(msg);
                this._render();
                return;
            }
        }
    }

    // (Slice 3) The old [J] / [M] openers now route into the Remoticon device on the
    // QUESTS / MAP tab (the standalone Journal state was retired). _scrollJournal
    // stays — the QUESTS tab reuses _journalScroll.
    _openJournal()  { this._journalScroll = 0; this._openDevice('quests'); }
    _openWorldMap() { this._journalScroll = 0; this._openDevice('map'); }

    _scrollJournal(delta) {
        this._journalScroll = Math.max(0, (this._journalScroll || 0) + delta);
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

    // ── Trade (Puck's shop — trade slice 1) ────────────────────────────────────

    // The vendor NPC the player is facing, then any adjacent one (mirrors
    // examine.js findExaminable). A vendor is an alive NPC flagged `vendor:true`.
    _findAdjacentVendor() {
        const FACE = { up: { dx: 0, dy: -1 }, down: { dx: 0, dy: 1 }, left: { dx: -1, dy: 0 }, right: { dx: 1, dy: 0 } };
        const fd = FACE[this.facing] || { dx: 0, dy: 0 };
        const isVendor = (e) => e && e.vendor && e.entity.isAlive();
        const faced = this.enemies.find(e => isVendor(e) && e.x === this.playerX + fd.dx && e.y === this.playerY + fd.dy);
        if (faced) return faced;
        return this.enemies.find(e => isVendor(e) && manhattan(e.x, e.y, this.playerX, this.playerY) === 1) || null;
    }

    // Open the trade window for `npc`. A pure menu — the world does NOT advance
    // (trading is paused, like the log modal), so nearby enemies don't get free
    // turns while you browse.
    // (Phase 6a) Two modes: a VENDOR opens the shop (buy/sell columns); a
    // NON-vendor opens OFFER mode (a single satchel→NPC column — hand items over
    // for 0 GP, the fold-in of the old Give verb). The renderer + _tapTrade
    // branch on `!npc.vendor`.
    _openTrade(npc) {
        if (this.state !== STATE.IDLE) return;
        if (!npc || !npc.entity || !npc.entity.isAlive()) return;
        this._tradeNpc = npc;
        this._tradeSell = this._tradeSellList();   // snapshot the bag layout for stable hit-testing
        this._tradeCursor = this._clampTradeCursor({ zone: 'buy', index: 0 });   // (menu grammar) cursor on the first cell
        // (Phase 6c) Vendors keep a reversible BUYBACK ledger, keyed to the NPC +
        // the moment the window opened. Reuse it while the ~5-min window is still
        // live (so closing/re-opening within the window keeps your locked prices);
        // re-lock a fresh one once it's expired. Non-vendors (offer mode) have no
        // buyback — a gift isn't a purchase.
        if (npc.vendor) {
            const now = performance.now();
            if (!npc._buyback || (now - npc._buyback.openedAt) >= BUYBACK_MS) {
                npc._buyback = { openedAt: now, entries: {} };   // entries[itemId] = { rebuy:[price…], refund:[price…] }
            }
            this._startTradeTimer();   // tick the countdown while the window is open
        }
        this.state = STATE.TRADE;
        audio.playSfx('pickup');                   // a little "ka-ching" cue (reuse the pickup blip)
        if (npc.vendor) this._log(`[${npc.type} opens the till. "What'll it be?"]`, 'transition');
        else            this._log(`[You open your satchel to ${npc.type}.]`, 'transition');
        this._render();
    }

    // (Phase 6c) A 1s re-render loop while a vendor window is open, so the buyback
    // countdown visibly ticks down (the modal is otherwise a static paused draw).
    // Self-stops the instant we leave the trade state; cleared on close.
    _startTradeTimer() {
        this._stopTradeTimer();
        this._tradeTimer = setInterval(() => {
            if (this.state !== STATE.TRADE) { this._stopTradeTimer(); return; }
            this._render();
        }, 1000);
    }
    _stopTradeTimer() {
        if (this._tradeTimer) { clearInterval(this._tradeTimer); this._tradeTimer = null; }
    }

    _closeTrade() {
        if (this.state !== STATE.TRADE) return;
        this._stopTradeTimer();   // (Phase 6c) stop the buyback-countdown re-render
        this.state = STATE.IDLE;
        this._tradeNpc = null;
        this._tradeSell = null;
        this._render();
        this._resumeHeldWalk();
    }

    // ── Dialogue (Step 4 — disposition dialogue) ─────────────────────────────

    // The faced / cardinal-adjacent NPC that has a dialogue, or null. Mirrors
    // _findAdjacentVendor (faced tile wins, else any adjacent one), skipping
    // current allies.
    _findAdjacentDialogueNpc() {
        const FACE = { up: { dx: 0, dy: -1 }, down: { dx: 0, dy: 1 }, left: { dx: -1, dy: 0 }, right: { dx: 1, dy: 0 } };
        const fd = FACE[this.facing] || { dx: 0, dy: 0 };
        const has = (e) => e && e.dialogueId && e.entity.isAlive() && !e._ally;
        const faced = this.enemies.find(e => has(e) && e.x === this.playerX + fd.dx && e.y === this.playerY + fd.dy);
        if (faced) return faced;
        return this.enemies.find(e => has(e) && manhattan(e.x, e.y, this.playerX, this.playerY) === 1) || null;
    }

    // Open a conversation with `npc`. A pure menu — the world does NOT advance
    // (talking is paused, like trade / the log modal). Choices move the same
    // disposition the give-engine and the over-head mood-face read.
    _openDialogue(npc) {
        if (this.state !== STATE.IDLE) return;
        const d = npc && getDialogue(npc.dialogueId);
        if (!d) return;
        this._dialogueNpc = npc;
        this._dialogueReply = d.greeting || '';
        this._dialogueCursor = 0;
        this.state = STATE.DIALOGUE;
        audio.playSfx('menu-open');
        this._render();
    }

    _closeDialogue() {
        if (this.state !== STATE.DIALOGUE) return;
        this.state = STATE.IDLE;
        this._dialogueNpc = null;
        this._dialogueReply = '';
        this._render();
        this._resumeHeldWalk();
    }

    // ── Equipment screen (Stage 3 — read-only Vitruvian dress-up) ────────────

    // Open the equipment screen. A pure menu — the world does NOT advance
    // (like trade / dialogue / the log modal). Read-only: it just reads
    // game.equipment (all armor slots null today → every plate shows EMPTY).
    // (Slice 3) [C] / the ☰ GEAR entry now open the Remoticon on the GEAR tab; the
    // standalone equipment screen + its close/tap handlers were retired — the device
    // owns close (_closeDevice) and unequip (_tapDevice, via deviceEquipLayout).
    _openEquipmentScreen() { this._openDevice('gear'); }

    // The choices on offer: every repeatable one, plus any `once` choice this
    // NPC hasn't spent yet (spent ids live on npc._dialogueDone).
    _dialogueChoices() {
        const npc = this._dialogueNpc;
        const d = npc && getDialogue(npc.dialogueId);
        if (!d) return [];
        const done = npc._dialogueDone || (npc._dialogueDone = new Set());
        return d.choices.filter(c => {
            if (!(c.repeatable || !done.has(c.id))) return false;
            // (§delivery / quest-gating) a choice can be conditional: `available(game,npc)`
            // gates on any state (quest stage, flags), and `requiresItem` shows it
            // only while the player holds that item. Makes deliveries + branching
            // dialogue authorable as data instead of hand-written filters.
            if (typeof c.available === 'function' && !c.available(this, npc)) return false;
            if (c.requiresItem && !(this.inventory || []).some(s => s && s.itemDef && s.itemDef.id === c.requiresItem)) return false;
            return true;
        });
    }

    // Resolve a chosen line: pay any GP cost, shift disposition (visible on the
    // mood-face), spend one-time choices, show the reply — and if the mood
    // craters, the speaker stops talking and turns on you (talk-down's failure).
    _pickDialogueChoice(choice) {
        const npc = this._dialogueNpc;
        if (!npc || !choice) return;
        if (choice.cost && (this.gold ?? 0) < choice.cost) {
            this._dialogueReply = `(You can't cover the ${choice.cost} GP.)`;
            audio.playSfx('bump-wall'); this._render(); return;
        }
        if (choice.cost) transferGold(this, npc, choice.cost, 'dialogue');
        if (choice.delta) applyDispositionDelta(npc, choice.delta);   // conversational shift (not a transaction)
        if (choice.once) (npc._dialogueDone || (npc._dialogueDone = new Set())).add(choice.id);
        // (Chapter Two) a choice can start a quest and/or run a side-effect — the
        // general dialogue-consequence hook every multi-path quest rides.
        if (choice.questId && this.questEngine && !this.questEngine.isActive(choice.questId) && !this.questEngine.isComplete(choice.questId)) {
            this.questEngine.start(choice.questId);
        }
        if (typeof choice.onPick === 'function') choice.onPick(this, npc);
        // (§delivery) a choice can consume a held item as part of the hand-off, and
        // it emits the same `item_given` event the trade-window give does — so one
        // quest stage (on: item_given) advances via EITHER idiom (dialogue or trade).
        if (choice.consumesItem) {
            const si = (this.inventory || []).findIndex(s => s && s.itemDef && s.itemDef.id === choice.consumesItem);
            if (si >= 0) {
                this._removeFromSlot(si);
                this.emitGameEvent('item_given', { npc: npc.id, item: choice.consumesItem });
            }
        }
        this._dialogueReply = choice.reply || '"..."';
        audio.playSfx((choice.delta ?? 0) < 0 ? 'bump-wall' : 'menu-confirm');
        if ((npc.disposition ?? 0) <= DIALOGUE_HOSTILE_AT) {
            this._log(`[${npc.name || npc.type} has heard enough.]`, 'combat');
            this._closeDialogue();
            this._onEntityHarmed(npc, { kind: 'insult' });
            return;
        }
        this._dialogueCursor = Math.min(this._dialogueCursor, this._dialogueChoices().length);
        this._render();
    }

    // The player's sellable bag as [{ slot, itemDef }] in slot order. Quest /
    // worthless items still appear (greyed, priced "—") so the bag reads true.
    _tradeSellList() {
        const out = [];
        for (let i = 0; i < this.inventory.length; i++) {
            const s = this.inventory[i];
            if (s) out.push({ slot: i, itemDef: s.itemDef });
        }
        return out;
    }

    // Buy one unit of `itemId` from the open vendor. No turn cost, no confirm.
    _buyFromVendor(itemId) {
        const npc = this._tradeNpc;
        if (!npc) return;
        const itemDef = ITEMS[itemId];
        if (!itemDef) return;
        // (Phase 6b) Container "buy" = TAKE: 0 GP, no disposition/price gate —
        // move one matching entry out of the chest and into the bag.
        if (npc._container) {
            const cont = npc._container;
            if (!this._addToInventory(itemDef)) { this._log('[Your bag is full — leave something.]'); this._render(); return; }
            const idx = cont.contents.findIndex(e => (typeof e === 'string' ? e : e && e.type) === itemId);
            if (idx >= 0) cont.contents.splice(idx, 1);
            npc.stock = this._containerStock(cont);
            audio.playSfx('pickup');
            this._log(`[Took ${itemDef.name}.]`, 'pickup');
            this._render();
            return;
        }
        // (Phase 6c) BUYBACK — re-buy something you sold this window at the LOCKED
        // price you got for it, not the current market rate. Consumes a rebuy
        // credit; bypasses the disposition/price gate (it's an undo, not a deal).
        const e = this._buybackEntry(npc, itemId);
        if (e && e.rebuy.length > 0 && this._buybackLive(npc)) {
            const price = e.rebuy[e.rebuy.length - 1];   // this unit's own locked price (LIFO)
            if ((this.gold ?? 0) < price) { this._log(`[Not enough GP to buy it back — needs ${price}.]`); this._render(); return; }
            if (!this._addToInventory(itemDef)) { this._log('[Your bag is full.]'); this._render(); return; }
            transferGold(this, npc, price, 'rebuy');   // (spine) player pays the vendor back
            e.rebuy.pop();
            this._tradeSell = this._tradeSellList();
            audio.playSfx('pickup');
            this._log(`[Bought back ${itemDef.name} for ${price} GP.]`, 'pickup');
            this._render();
            return;
        }
        if (!canTrade(npc.disposition)) { this._log(`[${npc.type} won't deal with you. Sweeten the mood first.]`); this._render(); return; }
        const price = buyPrice(itemDef, npc.disposition);
        if (price == null) { this._log(`[${npc.type} won't sell that.]`); this._render(); return; }
        if ((this.gold ?? 0) < price) { this._log(`[Not enough GP — ${itemDef.name} runs ${price}.]`); this._render(); return; }
        if (!this._addToInventory(itemDef)) { this._log('[Your bag is full.]'); this._render(); return; }
        // (fuse: spine + buyback) Move gold through the conserved choke-point into
        // the vendor's till, AND record a REFUND credit so the buy is reversible
        // for the window at exactly what you paid (Phase 6c).
        transferGold(this, npc, price, 'buy');
        this._buybackRecord(npc, itemId, 'refund', price);
        this._tradeSell = this._tradeSellList();
        audio.playSfx('pickup');
        this._log(`[Bought ${itemDef.name} for ${price} GP.]`, 'pickup');
        this._render();
    }

    // ── Buyback ledger (Phase 6c) ─────────────────────────────────────────────
    // npc._buyback.entries[itemId] = { rebuy: [price…], refund: [price…] } — a
    // LIFO stack of PER-UNIT locked prices, one per credit. A market BUY pushes a
    // refund credit (sell it back for what you paid); a market SELL pushes a rebuy
    // credit (buy it back for what you got). Undo pops the matching unit's own
    // price and creates no new credit (no ping-pong). Per-unit prices are the
    // anti-exploit: buying the same item cheap then dear no longer lets you refund
    // both at the dearer price (a gold-dup fixed in the pre-prod review). Self-
    // expires after BUYBACK_MS.
    _buybackLive(npc) {
        return !!(npc._buyback && (performance.now() - npc._buyback.openedAt) < BUYBACK_MS);
    }
    // Milliseconds left in the buyback window (0 when expired / no ledger). The
    // renderer reads this for the countdown so BUYBACK_MS stays in this module.
    _buybackRemainingMs(npc) {
        if (!npc._buyback) return 0;
        return Math.max(0, npc._buyback.openedAt + BUYBACK_MS - performance.now());
    }
    _buybackEntry(npc, itemId) {
        return npc._buyback && npc._buyback.entries[itemId];
    }
    _buybackRecord(npc, itemId, kind, price) {
        if (!npc._buyback) return;
        const e = npc._buyback.entries[itemId] ||
            (npc._buyback.entries[itemId] = { rebuy: [], refund: [] });
        if (kind === 'rebuy') e.rebuy.push(price);
        else                  e.refund.push(price);
    }
    // Sold items still buyable back this window (drives the buyback render row +
    // its tap targets). Returns [{ itemId, price }] — price is the NEXT unit's
    // locked re-buy price (LIFO: the top of the stack), for entries with a credit.
    _buybackList(npc) {
        if (!this._buybackLive(npc)) return [];
        const out = [];
        const entries = npc._buyback.entries;
        for (const id in entries) {
            const q = entries[id].rebuy;
            if (q && q.length > 0) out.push({ itemId: id, price: q[q.length - 1] });
        }
        return out;
    }

    // Sell the bag item at inventory `slot` to the open vendor.
    _sellToVendor(slot) {
        const npc = this._tradeNpc;
        if (!npc) return;
        const stack = this.inventory[slot];
        if (!stack) return;
        const itemDef = stack.itemDef;

        // (Phase 6c) REFUND — sell back something you bought this window for
        // exactly what you paid, bypassing the market sellPrice + disposition gate.
        // Consumes a refund credit; it's an undo, not a market sale (so it records
        // no rebuy credit).
        const e = this._buybackEntry(npc, itemDef.id);
        if (e && e.refund.length > 0 && this._buybackLive(npc)) {
            const refund = e.refund[e.refund.length - 1];   // peek this unit's locked buy price (LIFO)
            // (spine) vendor pays the refund from its till; only then consume the
            // credit + item (so a tapped-out till leaves everything untouched).
            if (!transferGold(npc, this, refund, 'refund')) { this._log(`[${npc.type} can't cover that refund right now.]`); this._render(); return; }
            e.refund.pop();
            this._removeFromSlot(slot);
            this._tradeSell = this._tradeSellList();
            audio.playSfx('pickup');
            this._log(`[Refunded ${itemDef.name} for ${refund} GP.]`, 'pickup');
            this._render();
            return;
        }

        // (Phase 6d) SPECIAL BUY — a vendor's `specialBuys` map overrides the
        // ordinary market: it pays a FIXED price for a listed item that sellPrice()
        // would otherwise ignore (e.g. a zero-baseValue oddment). The archetype is
        // Macc paying 500 for the Cataclysmic Converter no ordinary merchant wants.
        // (pre-prod review) QUEST ITEMS are EXCLUDED: on this build the Converter is
        // still the sole car-fix item, so a special-buy of it would soft-lock the
        // quest with no recovery. The guard is `!questItem`, so it AUTO-RE-ENABLES
        // once the Converter's role changes (stops being a questItem) in chapter two.
        const special = (!itemDef.questItem && npc.specialBuys) ? npc.specialBuys[itemDef.id] : null;
        if (special != null) {
            // (spine) the special-buyer pays from its till; conserve gold.
            if (!transferGold(npc, this, special, 'sell')) { this._log(`[${npc.type} is tapped out — can't buy that right now.]`); this._render(); return; }
            this._removeFromSlot(slot);
            this._buybackRecord(npc, itemDef.id, 'rebuy', special);
            this._tradeSell = this._tradeSellList();
            audio.playSfx('pickup');
            this._log(`[${npc.type} takes the ${itemDef.name.replace(/[\[\]]/g, '')} off your hands for ${special} GP.]`, 'pickup');
            this._render();
            return;
        }

        if (!canTrade(npc.disposition)) { this._log(`[${npc.type} won't deal with you. Sweeten the mood first.]`); this._render(); return; }
        const price = sellPrice(itemDef, npc.disposition);
        if (price == null) {
            this._log(itemDef.questItem ? `[You can't sell the ${itemDef.name.replace(/[\[\]]/g, '')} — you need it.]` : `[${npc.type} won't buy that.]`);
            this._render();
            return;
        }
        if (!transferGold(npc, this, price, 'sell')) {   // vendor pays from its till
            this._log(`[${npc.type} is tapped out — can't buy that right now.]`);
            this._render(); return;
        }
        this._removeFromSlot(slot);
        // (fuse: spine + buyback) Gold already moved vendor→player via transferGold
        // above (do NOT credit again). Just record a REBUY credit so the sale is
        // reversible for the window at exactly what you got (Phase 6c).
        this._buybackRecord(npc, itemDef.id, 'rebuy', price);
        this._tradeSell = this._tradeSellList();
        audio.playSfx('pickup');
        this._log(`[Sold ${itemDef.name} for ${price} GP.]`, 'pickup');
        this._render();
    }

    // Slip the vendor gold to nudge their disposition up one BRIBE_STEP. Rising
    // per-point cost (trade.js bribeStepCost). Disposition caps at +100.
    _bribeVendor() {
        const npc = this._tradeNpc;
        if (!npc) return;
        const disp = npc.disposition ?? 0;
        if (disp >= 100) { this._log(`[${npc.type} already loves you. Save your gold.]`); this._render(); return; }
        const cost = bribeStepCost(disp);
        if ((this.gold ?? 0) < cost) { this._log(`[Not enough GP to grease the wheels — needs ${cost}.]`); this._render(); return; }
        transferGold(this, npc, cost, 'bribe');
        reactToTransaction(npc, 'bribe', { delta: BRIBE_STEP, gold: cost });   // clamps + flips like the wheel bribe
        audio.playSfx('pickup');
        this._log(`[You slip ${npc.type} ${cost} GP. Their mood warms.]`, 'transition');
        this._render();
    }

    // Touch routing for the open shop: bribe button, a BUY cell, a SELL cell, or
    // (anywhere outside the panel) close. Cell rects come from layout.tradeCellRect
    // so they line up exactly with what the renderer drew.
    _tapTrade(pt) {
        const npc = this._tradeNpc;
        if (!npc) { this._closeTrade(); return; }
        if (!this._pointInRect(pt, TRADE_MODAL_RECT)) { this._closeTrade(); return; }
        const loot = !!npc._container;   // (Phase 6b) chest — take-only, no bribe/sell
        if (!loot && this._pointInRect(pt, TRADE_BRIBE_RECT, HIT_SLOP)) { this._tradeActivate('bribe', 0); return; }

        // LEFT column: vendor BUY / chest TAKE (a non-vendor NPC has no stock).
        const stock = npc.stock || [];
        for (let i = 0; i < stock.length; i++) {
            if (this._pointInRect(pt, tradeCellRect(TRADE_BUY_ORIGIN, i), HIT_SLOP)) { this._tradeActivate('buy', i); return; }
        }
        if (loot) return;   // a chest has no right column

        const offerMode = !npc.vendor;   // (Phase 6a)
        if (!offerMode) {
            const bb = this._buybackList(npc);
            for (let i = 0; i < bb.length && i < TRADE_COLS; i++) {
                if (this._pointInRect(pt, tradeCellRect(TRADE_BUYBACK_ORIGIN, i), HIT_SLOP)) { this._tradeActivate('buyback', i); return; }
            }
        }

        // RIGHT column: SELL (vendor) or OFFER (non-vendor). Same grid.
        const sell = this._tradeSell || [];
        for (let i = 0; i < sell.length; i++) {
            if (this._pointInRect(pt, tradeCellRect(TRADE_SELL_ORIGIN, i), HIT_SLOP)) { this._tradeActivate('sell', i); return; }
        }
    }

    // (menu grammar) The one per-cell trade action — buy / sell / offer / buyback /
    // bribe — that BOTH a tap (_tapTrade) and a keyboard Confirm route through, so
    // pointer and keys can never drift.
    _tradeActivate(zone, index) {
        const npc = this._tradeNpc; if (!npc) return;
        const loot = !!npc._container, offerMode = !npc.vendor;
        if (zone === 'bribe') { if (!loot) this._bribeVendor(); return; }
        if (zone === 'buy')   { const stock = npc.stock || []; if (stock[index] != null) this._buyFromVendor(stock[index]); return; }
        if (zone === 'buyback' && !offerMode && !loot) { const bb = this._buybackList(npc); if (bb[index]) this._buyFromVendor(bb[index].itemId); return; }
        if (zone === 'sell')  { const sell = this._tradeSell || []; if (sell[index]) { if (offerMode) this._offerFromTrade(sell[index].slot); else this._sellToVendor(sell[index].slot); } return; }
    }

    // (menu grammar) The navigable slot list, in cursor order: BUY cells, then
    // BUYBACK, then SELL, then the Bribe button (mirrors the on-screen layout).
    _tradeSlots() {
        const npc = this._tradeNpc; if (!npc) return [];
        const loot = !!npc._container, offerMode = !npc.vendor;
        const slots = [];
        (npc.stock || []).forEach((_, i) => slots.push({ zone: 'buy', index: i }));
        if (!loot) {
            if (!offerMode) this._buybackList(npc).slice(0, TRADE_COLS).forEach((_, i) => slots.push({ zone: 'buyback', index: i }));
            (this._tradeSell || []).forEach((_, i) => slots.push({ zone: 'sell', index: i }));
            slots.push({ zone: 'bribe', index: 0 });
        }
        return slots;
    }

    // Snap a (possibly stale, post-transaction) cursor to a valid slot.
    _clampTradeCursor(c) {
        const slots = this._tradeSlots();
        if (!slots.length) return { zone: 'buy', index: 0 };
        if (c && slots.some(s => s.zone === c.zone && s.index === c.index)) return c;
        return slots[0];
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
