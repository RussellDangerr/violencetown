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
import { FACING_VECTORS } from './perception.js';
import { resolveItemDef } from './item-registry.js';

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
        // Law 0 (plans/gold-standard-design.md, amended 2026-07-24): every
        // combatant has exactly 100 HP, no exemptions — this is just the ctor
        // default. Softness lives in negative armor (Law 3), not a lower hp.
        hp = 100, armor = 0, damage = DEFAULT_DAMAGE, sightRange = DEFAULT_SIGHT,
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
        // Law 0 (plans/gold-standard-design.md, amended 2026-07-24): vermin is
        // now a ROLE marker only (ambient swarm class, challenge GP <= 5, Law 6)
        // — it no longer licenses sub-100 HP; that exemption is repealed.
        vermin = false,
        // Law 2 (plans/gold-standard-design.md): elemental matchups. Arrays of
        // damageType strings read by combat.js's elementalMult.
        weak = null, resist = null, immune = null,
        // (carry-forward c) Facing for backstab (combat.js isBackstab), normally
        // stamped live by pathing.js's stepEntity. Persisted so a mid-fight
        // reload doesn't erase an enemy's back — mirrors x/y: ctor param + field
        // + toSave, restored via fromSave's `new Enemy(s)` same as x/y.
        _lastDx = 0, _lastDy = 0,
        // Law 2 positional (ruled 2026-07-24): a shove spins its victim clean
        // around and it spends its next HOSTILE turn recovering (npc.js) — the
        // backstab window survives exactly one follow-up hit. Persisted the
        // same way as _lastDx/_lastDy so a mid-fight reload doesn't erase a
        // still-recovering shove victim.
        _spunTurns = 0,
        // (perception) Authored spawn facing — 'N'|'NE'|'E'|'SE'|'S'|'SW'|'W'|'NW'.
        // Seeds _lastDx/_lastDy so an enemy that has never taken a step still has a
        // front and a back. Not persisted: _lastDx/_lastDy already are, and they are
        // the live truth the moment the enemy moves.
        facing = null,
        // (perception) Optional per-enemy hearing BONUS on top of a sound's own
        // loudness — 0 means normal ears; a watchdog might carry 3.
        hearingRange = null,
        // (theft) Worn gear whose removal actually moves armor/damage — distinct
        // from `loadout`, which is what this enemy would USE. The wheel's Gear
        // branch greys out until an enemy declares one.
        equipped = null,
        // (theft) Theft opt-out, mirroring `bribeable`, for quest-critical NPCs.
        // Bribery-immune and theft-immune are separate concerns on purpose.
        thievable = null,
        // Law 5 — this NPC runs the boss spending policy instead of the grunt
        // heal policy. STATED, never inferred from armor: ruling A4 asks for
        // exactly this rather than deriving a boss from its band.
        boss = false,
        // Shove-immunity. main.js's _isHeavy reads exactly this field and the
        // shove comment has described 'captains, the Sewer Merchant, bosses'
        // as unbudgeable since the shove shipped -- but the ctor dropped the
        // field, so nothing could ever BE heavy and the branch was dead. A
        // puzzleWall that can be shoved aside is not a wall, so it needs this.
        heavy = false,
        // (perception ladder) Runtime counters. Persisted so a save taken mid-hunt
        // reloads mid-hunt instead of resetting the NPC to calm.
        _awareBeats = 0,
        _sweepBeats = 0,
        // Where this character belongs: its spawn tile, and the anchor for both
        // the chase leash (npc.js) and the walk home after a shove. Defaults to
        // (x, y) so ordinary spawns need not state it, and is a real ctor param so
        // a save restores the ORIGINAL post rather than re-deriving it from
        // wherever the character happened to be standing when you saved.
        homeX = null,
        homeY = null,
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
        // Law 6f (plans/gold-standard-design.md): the potions/gear this enemy
        // carries — an array of item ids (resolveLoadout below resolves them to
        // real defs; legacy { name, value } literals still count too, for old
        // saves/fixtures). Value counts toward Challenge GP (challengeGp below)
        // but is NOT yet consumed by AI (not USED in a fight); that lands with
        // boss spending policies. Loot stays liquid gold only — a loadout item
        // never becomes lootable coin on death.
        loadout = null,
        // Town Clock (feature/town-clock): heartbeat-driven ambient NPC. When
        // true, this NPC is advanced by the free-running world tick
        // (game.worldTick) via resolveAmbientTurns instead of the per-player-turn
        // resolveEnemyTurns, so it wanders/chatters while the player stands still.
        ambient = false,
        // Species, not allegiance (ai.js::isSewerDweller) — sewer fare (Phase D)
        // is poison to humans and medicine to whatever eats it down here. Must
        // survive a bribe flip, so it is deliberately NOT derived from behavior/
        // allegiance the way deriveAllegiance's other fields are.
        sewerDweller = false,
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
        this.homeX = homeX ?? x;
        this.homeY = homeY ?? y;
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
        this.vermin        = !!vermin;
        this.weak          = weak;
        this.resist        = resist;
        this.immune        = immune;
        // (carry-forward c) restored facing; overwritten live by stepEntity on
        // this enemy's next move, same as x/y.
        this._lastDx       = _lastDx;
        this._lastDy       = _lastDy;
        // (Law 2 positional) restored recovery-turn count; see ctor param note.
        this._spunTurns    = _spunTurns;
        // (perception) Authored facing seeds the stamp ONLY when there is no live
        // facing to preserve. fromSave reconstructs via `new Enemy(s)` carrying the
        // persisted _lastDx/_lastDy, so an unconditional assignment here would
        // re-point every enemy that had since turned, on every single reload.
        if (facing && this._lastDx === 0 && this._lastDy === 0) {
            const v = FACING_VECTORS[facing];
            if (v) { this._lastDx = v[0]; this._lastDy = v[1]; }
        }
        this.hearingRange  = hearingRange;
        this.equipped      = equipped;
        this.thievable     = thievable;
        this.boss          = !!boss;
        this.heavy         = !!heavy;
        this._awareBeats   = _awareBeats;
        this._sweepBeats   = _sweepBeats;
        this.vendor        = vendor;
        this.stock         = stock;
        this.specialBuys   = specialBuys;
        // (transaction spine) Vendors carry a funded till so SELL has a source;
        // plain NPCs start empty. Both round-trip via serEnemy. giftLog is a
        // stub for future barter/memory.
        this.gold          = gold != null ? gold : (vendor ? VENDOR_WALLET : 0);
        this.giftLog       = Array.isArray(giftLog) ? giftLog : [];
        this.loadout       = loadout;
        this.ambient       = ambient;
        this.sewerDweller  = !!sewerDweller;

        // Debuffs / buffs — symmetric with Game.buffs[] on the player side.
        // Used by Poke (applies Blind), Poison (DoT, future), Stun (skip
        // turn, future), etc. Combat-side effect reads inside
        // applyDamageToPlayer's single computeHit call (main.js) — e.g.,
        // enemy.hasBuff('blind') halves its outgoing damage there.
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
    // (re-derived / RAM-only): _lostSightTurns, _buyback, render/emote
    // transients.
    toSave() {
        return {
            id: this.id, type: this.type, x: this.x, y: this.y,
            hp: this.entity.hp, maxHp: this.entity.maxHp, alive: this.entity.alive, armor: this.entity.armor,
            damage: this.damage, sightRange: this.sightRange, hearingRange: this.hearingRange,
            behavior: this.behavior, homeRegion: this.homeRegion,
            wanderRadius: this.wanderRadius, wanderEveryTurns: this.wanderEveryTurns,
            wantsItems: this.wantsItems, depositsTo: this.depositsTo,
            barks: this.barks, barkEveryTurns: this.barkEveryTurns, adjacencyBark: this.adjacencyBark,
            disposition: this.disposition, flipThreshold: this.flipThreshold, bribeable: this.bribeable,
            values: this.values, onFlip: this.onFlip,
            name: this.name, dialogueId: this.dialogueId,
            vendor: this.vendor, stock: this.stock, specialBuys: this.specialBuys, gold: this.gold, giftLog: this.giftLog,
            // Law 6f: the carried kit must survive a reload the same way gold
            // does, or a boss's Challenge GP would drop on save/load.
            loadout: this.loadout,
            // (theft) Worn gear and the theft opt-out must survive a reload the
            // same way loadout does, or a robbed enemy would come back armoured.
            equipped: this.equipped, thievable: this.thievable, boss: this.boss, heavy: this.heavy,
            ambient: this.ambient,
            // Species marker (ai.js::isSewerDweller) — must survive a reload same
            // as vermin/weak/resist/immune did, or a reloaded Violet Fungus would
            // start taking poison damage from its own mushrooms.
            sewerDweller: this.sewerDweller,
            // runtime
            state: this.state, fsmState: this.fsmState, lastWanderTurn: this._lastWanderTurn,
            // (perception ladder) so a save taken mid-hunt reloads mid-hunt.
            _awareBeats: this._awareBeats, _sweepBeats: this._sweepBeats,
            // Persisted since the walk-home landed. It used to be re-derived from
            // the save's x/y, which silently moved the anchor: save while a chaser
            // was mid-leash and "home" became wherever it happened to stand.
            homeX: this.homeX, homeY: this.homeY,
            carrying: this.carrying, barkIndex: this._barkIndex, barkOffset: this._barkOffset,
            wasAdjacent: this._wasAdjacent, buffs: (this.buffs || []).map(b => ({ ...b })),
            // allegiance runtime (see note above)
            allegiance: this.allegiance,
            ally: this._ally, wasFlipped: this._wasFlipped,
            isSummon: this._isSummon, summonTurnsLeft: this._summonTurnsLeft,
            // phase-D extras (present only when set on the live enemy)
            isBarricade: this.isBarricade, tag: this.tag,
            // vermin is a role marker (Law 0/6) — must survive a reload the same
            // way any other config field does, or a saved rat loses its role.
            vermin: this.vermin,
            // Law 2 (plans/gold-standard-design.md): elemental matchups must
            // survive a reload the same way — ctor↔save drift already shipped
            // bugs once (vermin).
            weak: this.weak, resist: this.resist, immune: this.immune,
            // (carry-forward c) facing for backstab — a mid-fight reload must
            // not erase an enemy's back.
            _lastDx: this._lastDx, _lastDy: this._lastDy,
            // Law 2 positional: a mid-fight reload must not erase a spun
            // victim's recovery turn (that would hand back the free hit).
            _spunTurns: this._spunTurns,
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

// Resolve a loadout to real item defs. Entries are item IDS so an enemy can
// actually USE what it carries and so the death drop is a one-liner. Unknown ids
// are dropped rather than throwing — content-validate.js is where a typo gets
// caught loudly, at author time.
export function resolveLoadout(loadout) {
    if (!Array.isArray(loadout)) return [];
    return loadout.map(x => (typeof x === 'string' ? resolveItemDef(x) : x)).filter(Boolean);
}

// Law 6f — the nameplate number is the whole kit: liquid gold + carried item
// values. Accepts item IDS (the authoring form) and legacy {value} literals (old
// saves and fixtures), so both read the same number.
export function challengeGp(e) {
    const items = (e.loadout ?? []).reduce((s, x) => {
        const def = (typeof x === 'string') ? resolveItemDef(x) : x;
        return s + (def?.value ?? def?.baseValue ?? 0);
    }, 0);
    return (e.gold ?? 0) + items;
}

// ── Spawn from a map entry ───────────────────────────────────────────────────

// Stock kits by armor band. This is the OMISSION BACKSTOP, not the authoring
// surface: a summon, a runtime set-piece spawn, or a new enemy added by someone
// who didn't read the spec inherits a legal kit instead of shipping broke —
// which is precisely how Law 6's wallets sat empty through a whole release.
// Explicit authoring always wins.
const KIT_DEFAULTS = [
    { maxArmor: -80, gold: 1, loadout: ['rock'] },                           //  4 GP
    { maxArmor: -30, gold: 3, loadout: ['tunnel_mushroom'] },                // 12 GP
    { maxArmor: -15, gold: 6, loadout: ['tunnel_mushroom', 'fire_bottle'] }, // 27 GP
    { maxArmor: 0,   gold: 8, loadout: ['bandage', 'fire_bottle'] },         // 45 GP
    { maxArmor: 10,  gold: 30, loadout: ['bandage', 'bandage', 'fire_bottle', 'sludge_sack', 'boardwalk_burger'] }, // 117 GP
];

function defaultKit(armor) {
    for (const k of KIT_DEFAULTS) if (armor <= k.maxArmor) return k;
    return KIT_DEFAULTS[KIT_DEFAULTS.length - 1];
}

// Law 6d: a spawn the player already mugged comes back broke — no gold AND no
// kit, so re-entering a zone can't farm either half of the wallet. Pure so it
// stays Node-testable.
export function spawnEnemy(spawnDef, muggedIds) {
    const e = new Enemy(spawnDef);
    const fights = (e.damage ?? 0) > 0 && !e.ambient;
    if (fights && spawnDef.gold == null && spawnDef.loadout == null) {
        const kit = defaultKit(e.entity.armor ?? 0);
        e.gold = kit.gold;
        e.loadout = [...kit.loadout];
    }
    if (!Array.isArray(e.loadout)) e.loadout = e.loadout ? [...e.loadout] : [];
    if (muggedIds?.has(e.id)) { e.gold = 0; e.loadout = []; }
    return e;
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
        // folds into applyDamageToPlayer's single computeHit call and
        // halves the enemy's outgoing damage there).
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
