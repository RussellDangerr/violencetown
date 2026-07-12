// enemies.js — Enemy entities + the per-turn resolver that dispatches to the FSM
//
// Per the project's character ontology (Character > {Hero, NPC > {Enemy,
// non-hostile NPC}}), this file holds the Enemy class — the hostile-NPC
// subclass with chase+attack as its default. Non-hostile NPC behavior and
// the general FSM live in npc.js. A future cleanup may rename Enemy → Npc
// and consolidate these files; for now, the Enemy class persists for back-
// compat with the original chase-only behavior.
//
// Dispatch rule (PD-3 step 4): every non-ambient enemy is routed to tickNpcState
// (npc.js) by its `allegiance` — hostiles run the HOSTILE case (the chase, which
// used to live inline here), allies run the ALLIED case, and neutrals are skipped
// on the player-turn loop (they wander on the world heartbeat, resolveAmbientTurns).
// `behavior` is now ctor-input / save-only — parsed once into capabilities +
// allegiance at construction; runtime dispatch never reads it.

import { Entity, attack, formatDamageNumber } from './combat.js';
import { manhattan } from './utils.js';
import { stepEntity, fleeStep } from './pathing.js';
import { tickNpcState } from './npc.js';
import { tickBuffList } from './buffs.js';
import { parseCapabilities, deriveAllegiance } from './ai.js';

const DEFAULT_SIGHT = 8;
const DEFAULT_DAMAGE = 8;

// (The chase's leash tuning — LEASH_DISTANCE / LOST_SIGHT_BEATS — moved to npc.js
// alongside the relocated chase, PD-3 step 4.)
// (transaction spine) A vendor's "till" — the gold they can pay out when you SELL
// to them, so the transferGold conservation has a funded source. Generous enough
// that it never runs dry in normal play; a real number so it saves/loads. Plain
// NPCs start at 0 (they don't buy/sell).
const VENDOR_WALLET    = 9999;

export class Enemy {
    constructor({
        id, type, x, y,
        hp = 50, armor = 0, damage = DEFAULT_DAMAGE, sightRange = DEFAULT_SIGHT,
        // FSM/spawn input — parsed ONCE into capabilities + allegiance (ai.js);
        // absence (null) = a born-hostile chaser. Runtime reads those, not behavior.
        behavior = null,
        homeRegion = null,
        wanderRadius = 3,
        wanderEveryTurns = 4,
        // WORKING-state fields (only meaningful if behavior includes WORKING)
        wantsItems = null,
        depositsTo = null,
        // Bark fields (independent of FSM — barks fire on turn cadence
        // regardless of whether the NPC is idle, wandering, working, or
        // chasing. The Fungus King chases AND barks.)
        barks = null,
        barkEveryTurns = 8,
        // Adjacency bark — fires once when the player first becomes adjacent
        // to this NPC. Used for non-hostile NPCs like Carrion who deliver a
        // single line of dialogue on first contact.
        adjacencyBark = null,
        // Disposition fields (read by future feature/give-action; inert here)
        disposition = null,
        flipThreshold = null,
        bribeable = null,
        values = null,
        onFlip = null,
        // Display name + dialogue id (Step 4 — disposition dialogue). `name` is
        // the NPC's shown name (e.g. "Bartho"); `dialogueId` keys into dialogue.js.
        name = null,
        dialogueId = null,
        // Free-form tag for set-piece / quest hooks (e.g. 'wererat_boss', 'sewer_rat').
        tag = null,
        // Vendor fields (trade Slice 1). `vendor:true` makes the NPC a shopkeep —
        // pressing [E] adjacent opens their trade window. `stock` is the list of
        // item ids they sell (infinite supply for now); buy/sell prices come from
        // trade.js keyed off this NPC's `disposition`.
        vendor = null,
        stock = null,
        // (Phase 6d) Special-buyer override: { itemId: fixedPrice }. A vendor with
        // this buys the listed items for the fixed GP even when they're questItems
        // that sellPrice() would refuse — the archetype is Macc paying 500 for the
        // Cataclysmic Converter that no ordinary merchant wants.
        specialBuys = null,
        // (transaction spine) real gold + a transaction log (restored from saves).
        gold = null,
        giftLog = null,
        // Town Clock (feature/town-clock): heartbeat-driven ambient NPC. When
        // true, this NPC is advanced by the free-running world tick
        // (game.worldTick) via resolveAmbientTurns instead of the per-player-turn
        // resolveEnemyTurns, so it wanders/chatters while the player stands still.
        ambient = false,
    }) {
        this.id         = id;
        this.type       = type;
        this.x          = x;
        this.y          = y;
        this.damage     = damage;
        this.sightRange = sightRange;
        this.state      = 'idle'; // legacy chase state: 'idle' | 'chasing' | 'returning'
        this.entity     = new Entity({ name: `[${type}]`, hp, armor });

        // Leash anchor — where this enemy spawned. A chaser that strays too far
        // from home (or loses sight of the player for too long) drops aggro and
        // walks back here, then resumes idle. Runtime-only; NOT persisted (save.js
        // re-derives it from the spawn entry on load). See the leash block in
        // resolveEnemyTurns for the tunable thresholds.
        this.homeX = x;
        this.homeY = y;
        this._lostSightTurns = 0; // consecutive chase-beats with no LOS on the player
        this._lastSeenX = null;   // (PD-1) last tile the player was SEEN on — a blind
        this._lastSeenY = null;   // chaser pursues THIS, not the player's true position

        // FSM config (null behavior = legacy entry; non-null = FSM-controlled)
        this.behavior         = behavior;
        // (PD-3/NH-3) `behavior` is parsed ONCE into orthogonal fields; runtime code
        // reads these, not `behavior`. Additive for now — behavior/_ally still drive
        // dispatch until later tasks flip over.
        this.capabilities = parseCapabilities(behavior);
        this.allegiance   = deriveAllegiance({ behavior });
        this.homeRegion       = homeRegion;
        this.wanderRadius     = wanderRadius;
        this.wanderEveryTurns = wanderEveryTurns;
        this.wantsItems       = wantsItems;
        this.depositsTo       = depositsTo;

        // FSM runtime state. Born-hostiles start in HOSTILE so the chase runs on
        // their first turn; neutral/ally initialize lazily in tickNpcState.
        this.fsmState         = (this.allegiance === 'hostile') ? 'HOSTILE' : null;
        this._lastWanderTurn  = 0;
        this.carrying         = null; // string item-type when carrying, null otherwise

        // Bark runtime state (initialized lazily in the bark check)
        this.barks            = barks;
        this.barkEveryTurns   = barkEveryTurns;
        this._barkIndex       = 0;
        this._barkOffset      = null;

        // Adjacency-bark state (one-shot trigger on player-adjacency edge)
        this.adjacencyBark    = adjacencyBark;
        this._wasAdjacent     = false;

        // Disposition data — stored but not yet read. See plans/give-action-
        // and-disposition.md for the feature that consumes these fields.
        this.disposition   = disposition;
        this.flipThreshold = flipThreshold;
        this.bribeable     = bribeable;
        this.values        = values;
        this.onFlip        = onFlip;
        this.name          = name;
        this.dialogueId    = dialogueId;
        this.tag           = tag;
        this.vendor        = vendor;
        this.stock         = stock;
        this.specialBuys   = specialBuys;
        // (transaction spine) Vendors carry a funded till so SELL has a source;
        // plain NPCs start empty. Both round-trip via serEnemy. giftLog is a
        // stub for future barter/memory.
        this.gold          = gold != null ? gold : (vendor ? VENDOR_WALLET : 0);
        this.giftLog       = Array.isArray(giftLog) ? giftLog : [];
        this.ambient       = ambient;

        // Debuffs / buffs — symmetric with Game.buffs[] on the player side.
        // Used by Poke (applies Blind), Poison (DoT, future), Stun (skip
        // turn, future), etc. Combat-side effect reads in resolveEnemyTurns
        // (e.g., enemy.hasBuff('blind') halves outgoing damage).
        this.buffs = [];
    }

    // Buff management — mirrors Game.addBuff / removeBuff / hasBuff /
    // _tickBuffs at main.js:147-167 so both sides of combat use the same
    // shape. Refreshing an existing buff resets its turn counter rather than
    // stacking — same semantics as the player side.
    addBuff(id, name, turns, type = 'debuff', extra = {}) {
        const existing = this.buffs.find(b => b.id === id);
        if (existing) { existing.turns = turns; return; }
        this.buffs.push({ id, name, turns, type, ...extra });
    }

    removeBuff(id) { this.buffs = this.buffs.filter(b => b.id !== id); }
    hasBuff(id)    { return this.buffs.some(b => b.id === id); }

    // Runs the shared buff table (buffs.js) — the same helper the player's
    // _tickBuffs uses, so the two sides can't silently diverge again. Enemy buffs
    // currently carry no onTick/onExpire (blind is read at attack time, feared is a
    // movement override), so this just decrements + expires — but any future enemy
    // status hook lands here for free.
    tickBuffs(game) {
        tickBuffList(this.buffs, this, game, null);
    }

    // ── Save contract (PD-5) ──────────────────────────────────────────────────
    // The save SHAPE lives on the class so it can't silently drift from the
    // constructor — the drift that already shipped bugs (NPCs losing name/dialogue;
    // vendors degrading to gift mode). save.js serEnemy/hydrateEnemy are thin
    // adapters over these two methods.
    //
    // Persisted: static identity + shop config (else `new Enemy(s)` reverts them to
    // null) AND the allegiance runtime — an ally/summon whose _ally isn't restored
    // reloads as an INERT ALLIED-labelled NPC that neither fights (resolveEnemyTurns
    // gates the ally turn on _ally) nor is hostile. Deliberately NOT persisted
    // (re-derived / RAM-only): homeX/homeY, _lostSightTurns, _buyback, render/emote
    // transients.
    toSave() {
        return {
            id: this.id, type: this.type, x: this.x, y: this.y,
            hp: this.entity.hp, maxHp: this.entity.maxHp, alive: this.entity.alive, armor: this.entity.armor,
            damage: this.damage, sightRange: this.sightRange,
            behavior: this.behavior, homeRegion: this.homeRegion,
            wanderRadius: this.wanderRadius, wanderEveryTurns: this.wanderEveryTurns,
            wantsItems: this.wantsItems, depositsTo: this.depositsTo,
            barks: this.barks, barkEveryTurns: this.barkEveryTurns, adjacencyBark: this.adjacencyBark,
            disposition: this.disposition, flipThreshold: this.flipThreshold, bribeable: this.bribeable,
            values: this.values, onFlip: this.onFlip,
            name: this.name, dialogueId: this.dialogueId,
            vendor: this.vendor, stock: this.stock, specialBuys: this.specialBuys, gold: this.gold, giftLog: this.giftLog,
            ambient: this.ambient,
            // runtime
            state: this.state, fsmState: this.fsmState, lastWanderTurn: this._lastWanderTurn,
            carrying: this.carrying, barkIndex: this._barkIndex, barkOffset: this._barkOffset,
            wasAdjacent: this._wasAdjacent, buffs: (this.buffs || []).map(b => ({ ...b })),
            // allegiance runtime (see note above)
            allegiance: this.allegiance,
            ally: this._ally, wasFlipped: this._wasFlipped,
            isSummon: this._isSummon, summonTurnsLeft: this._summonTurnsLeft,
            // phase-D extras (present only when set on the live enemy)
            isBarricade: this.isBarricade, tag: this.tag,
        };
    }

    static fromSave(s) {
        const e = new Enemy(s);   // config fields incl. ambient; s.hp → Entity
        const num = (v, d) => (typeof v === 'number' && isFinite(v)) ? v : d;
        e.entity.maxHp = num(s.maxHp, e.entity.maxHp);
        e.entity.hp = Math.max(0, Math.min(num(s.hp, e.entity.maxHp), e.entity.maxHp));
        e.entity.alive = s.alive !== false;
        e.state = s.state || 'idle';
        e.fsmState = s.fsmState ?? null;
        e._lastWanderTurn = num(s.lastWanderTurn, 0);
        e.carrying = s.carrying ?? null;
        e._barkIndex = num(s.barkIndex, 0);
        e._barkOffset = (typeof s.barkOffset === 'number') ? s.barkOffset : null;
        e._wasAdjacent = s.wasAdjacent === true;
        e.buffs = Array.isArray(s.buffs) ? s.buffs.map(b => ({ ...b })) : [];
        // Allegiance (PD-5): restore ally/summon runtime so a persisted ally keeps
        // fighting instead of reloading inert.
        // (PD-3) A serialized allegiance wins; OLD saves (no allegiance) keep the
        // value the ctor derived from behavior/_ally.
        if (s.allegiance) e.allegiance = s.allegiance;
        if (s.ally) e._ally = true;
        if (s.wasFlipped) e._wasFlipped = true;
        if (s.isSummon) e._isSummon = true;
        if (typeof s.summonTurnsLeft === 'number') e._summonTurnsLeft = s.summonTurnsLeft;
        if (s.isBarricade) e.isBarricade = true;
        if (s.tag != null) e.tag = s.tag;
        return e;
    }
}

// ── Resolve all enemies for one turn ─────────────────────────────────────────
//
// One dispatcher: every alive, non-ambient enemy is routed to tickNpcState
// (npc.js) by allegiance. Hostiles run the HOSTILE chase, allies the ALLIED
// combat turn; neutrals are skipped here (they wander on the world heartbeat).
// The pre-checks below (emerge delay, buffs, feared-flee, adjacency bark) run
// for every enemy first, exactly as before. Returns log messages.

export function resolveEnemyTurns(game) {
    const messages = [];

    for (const enemy of game.enemies) {
        if (!enemy.entity.isAlive()) continue;

        // Town Clock (feature/town-clock): ambient NPCs are driven by the world
        // heartbeat (resolveAmbientTurns), not the per-player-turn loop. Skip
        // them here so they never double-advance, tick combat buffs, or burn a turn.
        if (enemy.ambient) continue;

        // (zone pursuit) Just came through a door after the player — spend one
        // turn "emerging" (inert, but visible in the threshold) so the player
        // gets a beat to react to the breach before the chase resumes.
        if (enemy._emergeDelay > 0) { enemy._emergeDelay--; continue; }

        // Tick this enemy's buffs/debuffs (Blind, future Poison/Stun/Slow)
        // BEFORE any FSM/legacy logic runs. Expired buffs get removed; the
        // effect of an active buff reads later in the turn (e.g., Blind
        // halves the damage at the attack site).
        enemy.tickBuffs(game);

        // (fear) A feared enemy flees this turn — one step directly away from
        // the player — and does nothing else (no bark, chase, or attack). Its
        // prior state is untouched, so when the buff ticks out it resumes normal
        // logic (re-chases if it still has LOS). Allies are never feared.
        if (enemy.hasBuff('feared')) {
            const away = fleeStep(game, enemy);
            if (away) stepEntity(enemy, away.x, away.y, game._MOVE_MS);
            continue;
        }

        // Cadenced barks/grunts moved to the world heartbeat (resolveAmbientTurns)
        // so the world chatters on its own clock, not only on player turns (Town
        // Clock ambient-life pass). Adjacency barks stay here — they're player-
        // proximity events, naturally turn-based.

        // Adjacency-bark check — fires once on the rising edge of
        // player-adjacency. Used for non-hostile dialogue NPCs (Carrion).
        const adjMsg = maybeAdjacencyBark(game, enemy);
        if (adjMsg) messages.push(adjMsg);

        // (PD-3) One dispatcher: hostiles + allies act on the player-turn loop; neutrals
        // are heartbeat-driven (resolveAmbientTurns) — skip them here. The chase now lives
        // in tickNpcState's HOSTILE case (npc.js).
        if (enemy.allegiance === 'neutral') continue;
        const npcMessages = tickNpcState(game, enemy);
        for (const m of npcMessages) messages.push(m);
        continue;
    }

    return messages;
}

// ── Ambient emotes (Town Clock) ──────────────────────────────────────────────
//
// The placeholder grunts are now EMOTE BALLOONS (Kenney Emote Pack) instead of
// bracketed onomatopoeia text: on the world heartbeat a townsperson pops a small
// down-tail speech balloon over their head — mutter dots, a yawn, a hum, a
// grumble — so the place reads as alive without any authored copy. This sets a
// transient `_emote` (+ `_emoteStart`/`_emoteMs`) on the NPC that the renderer
// draws and fades; nothing routes to the log. Round-robins a curated idle set,
// with a per-NPC offset + stagger so a crowd doesn't all react on the same beat.
// (authored `barks` data stays intact but dormant — real lines come later.)
const AMBIENT_EMOTES = ['dots1', 'dots2', 'dots3', 'question', 'sleep', 'music', 'exclamation', 'anger'];
const EMOTE_EVERY = 22;   // world ticks between a character's emotes (~11s at 500ms)
const EMOTE_MS    = 1800; // how long a balloon lingers before it fades out
let _emoteStagger = 0;

function maybeEmote(enemy, clock) {
    if (enemy._emoteOffset == null) {
        // Stagger each character's phase so they don't all react on the same beat.
        _emoteStagger = (_emoteStagger + 7) % EMOTE_EVERY;
        enemy._emoteOffset = clock - _emoteStagger;
        enemy._emoteIndex = enemy._emoteIndex || 0;
        return;
    }
    const elapsed = clock - enemy._emoteOffset;
    if (elapsed <= 0 || elapsed % EMOTE_EVERY !== 0) return;
    enemy._emote      = AMBIENT_EMOTES[enemy._emoteIndex % AMBIENT_EMOTES.length];
    enemy._emoteStart = performance.now();
    enemy._emoteMs    = EMOTE_MS;
    enemy._emoteIndex++;
}

// ── Resolve ambient (heartbeat-driven) NPCs ──────────────────────────────────
//
// Town Clock (feature/town-clock): NPCs spawned with `ambient: true` are driven
// by the free-running world heartbeat (game.worldTick) instead of the per-
// player-turn loop, so the town keeps living while the player stands still.
// They never tick combat buffs and never advance game.turn — combat clarity is
// untouched. resolveEnemyTurns skips ambient NPCs, so this is their sole driver.
// Returns the same message shape (bark tuples / FSM strings) as resolveEnemyTurns.
export function resolveAmbientTurns(game) {
    const messages = [];

    for (const npc of game.enemies) {
        if (!npc.entity.isAlive()) continue;
        if (npc.state === 'chasing') continue;   // engaged hostile = combat, not ambient
        if (npc._ally) continue;                  // allies resolve on the player-turn loop
        if (npc.hasBuff('feared')) continue;      // (fear) the per-turn loop owns its flee

        // Pop an ambient emote balloon on the world clock — every non-engaged
        // character reacts now and then so the world never feels dead. Sets a
        // transient _emote the renderer draws; no log/overhead-text message.
        maybeEmote(npc, game.worldTick);

        // Ambient FSM step (IDLE/WANDER/WORKING) on the world clock. Only NEUTRALS
        // wander on the heartbeat — hostiles/allies act on the player-turn loop
        // (resolveEnemyTurns). Gating on allegiance (not `behavior`) keeps a
        // provoked-neutral — whose `behavior` array is no longer nulled — from
        // double-dispatching (chase here AND on the player turn). The capability
        // whitelist still gates who actually MOVES inside tickNpcState — IDLE-only
        // NPCs stay put; WANDER/WORKING NPCs roam/labour while the player stands still.
        if (npc.allegiance === 'neutral') {
            const npcMessages = tickNpcState(game, npc, game.worldTick);
            for (const m of npcMessages) messages.push(m);
        }
    }

    return messages;
}

// ── Adjacency-bark resolution ───────────────────────────────────────────────
//
// Edge-triggered: fires only on the turn the player BECOMES adjacent
// (manhattan distance 1) to this NPC, having been non-adjacent on the
// previous resolution. Doesn't re-fire while the player remains adjacent,
// and re-arms once they step away. Used for non-hostile dialogue NPCs
// like Carrion who deliver a single line per encounter.
//
// One-shot-per-approach is the right cadence for dialogue — repeated
// barks every turn while standing next to an NPC would be log spam.

function maybeAdjacencyBark(game, enemy) {
    if (!enemy.adjacencyBark) return null;
    const dist = manhattan(enemy.x, enemy.y, game.playerX, game.playerY);
    const isAdjacent = dist === 1;
    if (isAdjacent && !enemy._wasAdjacent) {
        enemy._wasAdjacent = true;
        return { text: enemy.adjacencyBark, sourceEnemy: enemy, category: 'adjacency-bark' };
    }
    if (!isAdjacent) {
        enemy._wasAdjacent = false;
    }
    return null;
}
