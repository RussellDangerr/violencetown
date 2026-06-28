// enemies.js — Enemy entities, Bresenham LOS, dispatch to FSM or legacy chase
//
// Per the project's character ontology (Character > {Hero, NPC > {Enemy,
// non-hostile NPC}}), this file holds the Enemy class — the hostile-NPC
// subclass with chase+attack as its default. Non-hostile NPC behavior and
// the general FSM live in npc.js. A future cleanup may rename Enemy → Npc
// and consolidate these files; for now, the Enemy class persists for back-
// compat with the original chase-only behavior.
//
// Dispatch rule (added in feature/sewer-npc-skeleton step 3): if a spawn
// entry includes a `behavior` array, that entry is FSM-controlled and is
// routed to tickNpcState in npc.js. If `behavior` is absent, the entry
// runs the legacy chase logic preserved below. This makes the FSM purely
// additive — existing map JSONs without `behavior` fields keep working.

import { Entity, attack, formatDamageNumber } from './combat.js';
import { manhattan, chebyshev } from './utils.js';
import { getGreedyStep, stepEntity } from './pathing.js';
import { tickNpcState } from './npc.js';

const DEFAULT_SIGHT = 8;
const DEFAULT_DAMAGE = 8;

export class Enemy {
    constructor({
        id, type, x, y,
        hp = 50, armor = 0, damage = DEFAULT_DAMAGE, sightRange = DEFAULT_SIGHT,
        // FSM fields (optional; absence triggers legacy chase behavior)
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
        this.state      = 'idle'; // legacy chase state: 'idle' | 'chasing'
        this.entity     = new Entity({ name: `[${type}]`, hp, armor });

        // FSM config (null behavior = legacy entry; non-null = FSM-controlled)
        this.behavior         = behavior;
        this.homeRegion       = homeRegion;
        this.wanderRadius     = wanderRadius;
        this.wanderEveryTurns = wanderEveryTurns;
        this.wantsItems       = wantsItems;
        this.depositsTo       = depositsTo;

        // FSM runtime state (initialized lazily in tickNpcState)
        this.fsmState         = null;
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

    tickBuffs() {
        const expired = [];
        for (const b of this.buffs) { b.turns--; if (b.turns <= 0) expired.push(b); }
        for (const b of expired) this.removeBuff(b.id);
    }
}

// ── Bresenham Line-of-Sight ──────────────────────────────────────────────────

export function hasLineOfSight(map, x0, y0, x1, y1) {
    if (x0 === x1 && y0 === y1) return true;  // same cell — trivially visible; avoids a degenerate loop
    let dx = Math.abs(x1 - x0);
    let dy = Math.abs(y1 - y0);
    let sx = x0 < x1 ? 1 : -1;
    let sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    let cx = x0;
    let cy = y0;

    while (cx !== x1 || cy !== y1) {
        const e2 = 2 * err;
        if (e2 > -dy) { err -= dy; cx += sx; }
        if (e2 <  dx) { err += dx; cy += sy; }

        // If we haven't reached the target and hit a wall, no LOS
        if ((cx !== x1 || cy !== y1) && !map.isWalkable(cx, cy)) {
            return false;
        }
    }

    return true;
}

// ── Resolve all enemies for one turn ─────────────────────────────────────────
//
// Two paths:
//   1. If the enemy has a `behavior` whitelist, dispatch to tickNpcState
//      (the FSM in npc.js). The FSM may transition IDLE ↔ WANDER and
//      eventually WORKING / HOSTILE. Returns log messages.
//   2. Otherwise, run the legacy chase logic — LOS check, transition to
//      'chasing' on first sighting, attack-if-adjacent, greedy step toward
//      player. This is exactly the v0.4.x behavior preserved for back-compat.

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
        enemy.tickBuffs();

        // Cadenced barks/grunts moved to the world heartbeat (resolveAmbientTurns)
        // so the world chatters on its own clock, not only on player turns (Town
        // Clock ambient-life pass). Adjacency barks stay here — they're player-
        // proximity events, naturally turn-based.

        // Adjacency-bark check — fires once on the rising edge of
        // player-adjacency. Used for non-hostile dialogue NPCs (Carrion).
        const adjMsg = maybeAdjacencyBark(game, enemy);
        if (adjMsg) messages.push(adjMsg);

        // FSM-controlled entry. Ambient states (IDLE/WANDER/WORKING) are now
        // driven by the world heartbeat (resolveAmbientTurns); the per-turn loop
        // only resolves ALLIED NPCs, whose combat turn must stay in lockstep with
        // the player. Other FSM NPCs fall through to the heartbeat.
        if (enemy.behavior) {
            if (enemy._ally) {
                const npcMessages = tickNpcState(game, enemy);
                for (const m of npcMessages) messages.push(m);
            }
            continue;
        }

        // Legacy chase logic below — unchanged from v0.4.3-dev behavior.
        const dist = manhattan(enemy.x, enemy.y, game.playerX, game.playerY);

        // Check LOS
        if (dist <= enemy.sightRange && hasLineOfSight(game.map, enemy.x, enemy.y, game.playerX, game.playerY)) {
            if (enemy.state === 'idle') {
                enemy.state = 'chasing';
                messages.push({
                    text: `[${enemy.entity.name} spotted you!]`,
                    sourceEnemy: enemy,
                    category: 'spotted',
                });
            }
        }

        if (enemy.state !== 'chasing') continue;

        // Adjacent? Attack. Visual feedback (red damage number, hit-flash,
        // stagger, event word, screen shake on big hits) replaces the
        // attack log line. The player-death case is handled by the death-
        // screen flow in main.js, which has its own messaging.
        //
        // Blind debuff halves outgoing damage (deterministic — no RNG, per
        // combat.js's "no miss" contract). The Math.max(1, ...) clamp
        // mirrors combat.js's "at least 1 always lands" rule.
        if (chebyshev(enemy.x, enemy.y, game.playerX, game.playerY) <= 1) {
            const dmg = enemy.hasBuff('blind')
                ? Math.max(1, Math.floor(enemy.damage * 0.5))
                : enemy.damage;
            game.applyDamageToPlayer(dmg);
            continue;
        }

        // Chase: greedy move toward player
        const bestMove = getGreedyStep(
            game,
            { x: enemy.x, y: enemy.y },
            { x: game.playerX, y: game.playerY },
            { self: enemy }
        );
        if (bestMove) {
            stepEntity(enemy, bestMove.x, bestMove.y, game._MOVE_MS);
        }
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

        // Pop an ambient emote balloon on the world clock — every non-engaged
        // character reacts now and then so the world never feels dead. Sets a
        // transient _emote the renderer draws; no log/overhead-text message.
        maybeEmote(npc, game.worldTick);

        // Ambient FSM step (IDLE/WANDER/WORKING) on the world clock. The behavior
        // whitelist gates who actually moves — IDLE-only NPCs (vendors, blockers)
        // stay put; WANDER/WORKING NPCs roam/labour while the player stands still.
        if (npc.behavior) {
            const npcMessages = tickNpcState(game, npc, game.worldTick);
            for (const m of npcMessages) messages.push(m);
        }
    }

    return messages;
}

// ── Bark resolution ─────────────────────────────────────────────────────────
//
// Returns the next bark log-line for this enemy if the cadence fires this
// turn, or null otherwise. Round-robins through the `barks` array. Each
// enemy has a per-instance offset (the turn it first ticked) so multiple
// barking NPCs don't synchronize on the same turn unless they spawned
// together.
//
// Barks are NOT gated on line-of-sight or player proximity — they fire
// whenever the player is on the same map as the bark-emitter. This is the
// "negative-space worldbuilding" principle from plans/cosmology-and-arc.md:
// the player hears the world doing its thing even from across walls. If
// playtest reveals this is too chatty, a polish-pass can add proximity
// gating.

function maybeBark(game, enemy, clock = game.turn) {
    if (!enemy.barks || enemy.barks.length === 0) return null;

    // Lazy offset init: first tick records the spawn-clock so cadence starts
    // counting from this enemy's first appearance, not from clock 0. `clock` is
    // game.turn for combat-path enemies, game.worldTick for ambient NPCs.
    if (enemy._barkOffset == null) {
        enemy._barkOffset = clock;
        return null; // don't bark on the spawn tick itself
    }

    const cadence = enemy.barkEveryTurns ?? 8;
    const elapsed = clock - enemy._barkOffset;
    if (elapsed <= 0 || elapsed % cadence !== 0) return null;

    const idx = enemy._barkIndex % enemy.barks.length;
    enemy._barkIndex += 1;
    // Tuple shape (since overhead-dialogue v1): the consumer in main.js's
    // _advanceWorld branches on category and routes spoken lines to
    // _spawnOverheadDialogue at the source enemy's tile.
    return { text: enemy.barks[idx], sourceEnemy: enemy, category: 'bark' };
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
