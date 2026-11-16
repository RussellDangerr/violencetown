// quests.js — data-driven, event-driven quest tracking.
//
// A quest is an ordered list of stages. The active stage advances when an
// emitted game event matches its `on` condition. Scripted side-effects live in
// stage.onEnter (run once when the engine enters the stage) and stage.onProgress
// (run on each counter increment). A quest can also auto-start via `startOn`.
//
// (Phase 4) Optional PRESENTATIONAL stage fields — read by the Journal + the
// world map, ignored by the event matcher: `location` (a short "where" string,
// e.g. "Downtown · The Diner"), `description` (a longer journal line), and
// `targetZone` (a zoneName the world map highlights so "go here next" is clear).
// Every stage carries `targetZone`: a zone, or `null` for a stage with no place.
// content-validate.js fails a stage that leaves it out (plans/mp1-map-marks-quest-stages.md).
// The delivery event type `item_given { npc, item }` is emitted by BOTH the
// trade-window give and a dialogue `consumesItem` choice.
//
// The engine only matches event types/payloads, so quest FLOW is defined here
// independently of the CONTENT the stages reference (the Borgir boss, the
// Wererat, the converter, the car, the sewer set-piece). That content — and
// the set-piece script game._sewerEscapeSetpiece — arrives in Phase D; until
// then the onEnter hooks below no-op via optional chaining.
//
// NOT to be confused with the future [J] "Witness Log" journal
// (plans/quest-journal.md), which is retrospective evidence with no objectives.
// This is active objective tracking, surfaced as a one-line HUD goal.

import { SLOTS, slotIdOf } from './slots.js';
import { CREDITS } from './credits.js';

export const QUESTS = {
    // ── Chapter Two: the Canyon fail-branch escape (Pike + the grappling hook).
    //    The engine tracks ONE quest, so this is the single canyon objective; Pike's
    //    "deal" route is flag-driven (dialogue onPick + _handleEnemyDeath) so it
    //    never competes with this for the active slot.
    canyon_escape: {
        id: 'canyon_escape',
        title: 'Out of the Canyon',
        // (CY1) A branch: only the crash route ever starts it, so the ramp route
        // leaves it out of the Quests tab's count (getCompletedCount).
        branch: 'canyon',
        stages: [
            {
                id: 'find_way_out',
                objective: "Escape the canyon — get Pike's rope: buy it, earn it, or take it",
                targetZone: 'CANYON',
                on: { type: 'map_entered', match: { map: 'downtown-map.json' } },
            },
        ],
        onComplete: (game) => {
            if (game._startMainQuest2) game._startMainQuest2();   // (Phase 4) chain into MQ2 on arrival
        },
    },

    // ── Chapter Two: Main Quest 2 — the burger delivery (Phase 4 playground).
    //    STRUCTURE is real (3 stages; both delivery idioms via item_given; journal
    //    location + description; world-map targetZone). The TEXT is placeholder for
    //    Caelan to author. Started deterministically on Downtown arrival (both the
    //    canyon-grapple climb-out and the alcohol-ramp → game._startMainQuest2).
    deliver_burger: {
        id: 'deliver_burger',
        title: 'Special Delivery',
        stages: [
            {
                id: 'get_burger',
                // (FD3) Your boss hands the bag over before the crossing, so this settles on its own.
                objective: '[TEXT]',
                location: '[TEXT]',
                description: '[TEXT]',
                targetZone: 'DOWNTOWN',
                on: { type: 'item_pickup', match: { id: 'burger_fries' } },
                autoSatisfy: (game) => (game.inventory || []).some(s => s && s.itemDef.id === 'burger_fries'),
            },
            {
                // (IC2) The order includes the Tiger's Blood Ice Cone. It is not a quest
                // item, so it comes from wherever it drops (the diner's machine today,
                // the frozen area later): the stage only asks that it is in the bag.
                // The Factory is where both of its sources begin.
                id: 'get_cone',
                objective: '[TEXT]',
                location: '[TEXT]',
                description: '[TEXT]',
                targetZone: 'FACTORY',
                on: { type: 'item_pickup', match: { id: 'tigers_blood_ice_cone' } },
                autoSatisfy: (game) => (game.inventory || []).some(s => s && s.itemDef.id === 'tigers_blood_ice_cone'),
            },
            {
                id: 'handoff',
                objective: '[TEXT]',
                location: '[TEXT]',
                description: '[TEXT]',
                targetZone: 'DOWNTOWN',
                // (AE1, SP8) The Financier takes it, in the bank. Both items, handed over together or one at a time (QuestEngine.owedItems).
                on: { type: 'item_given', match: { npc: 'bank-financier' }, items: ['burger_fries', 'tigers_blood_ice_cone'] },
            },
        ],
        onComplete: (game) => {
            game.gold = (game.gold || 0) + 50;
            game._log('[TEXT] +50 GP.', 'transition');
        },
    },

    fix_car: {
        id: 'fix_car',
        title: '[TEXT]',
        // Started DETERMINISTICALLY (game._startMainQuest, on game start / first
        // town entry) rather than via a fragile once-per-approach adjacency bark
        // off the Borgir boss — the old startOn could be missed entirely if the
        // player never stepped exactly adjacent, dead-stalling the whole game.
        // Borgir's bark is now flavor only; it no longer gates quest start.
        stages: [
            {
                id: 'examine_car',
                // Says GO, not just "examine it": the car is eight tiles from spawn and E
                // reads the tile you face, so the old wording could not be followed from
                // where you stand. Kept short on purpose — the HUD truncates at
                // floor(innerW / 8) chars, and "walk to it and examine it (E)" cut to
                // "...AND EXAMINE~" on a phone, losing the very (E) this line is about.
                // examine.js points the way when E lands on anything else.
                objective: '[TEXT]',
                targetZone: 'TOWN',
                on: { type: 'examine', match: { targetId: 'car' } },
                // Tolerant: if the player already examined the car before this
                // stage went active, the 'examine' event was dropped — so
                // auto-satisfy from the persisted flag instead of dead-stalling.
                autoSatisfy: (game) => !!game.questEngine.state.flags.carExamined,
            },
            {
                id: 'recover_converter',
                objective: '[TEXT]',
                targetZone: 'SEWER',
                on: { type: 'item_pickup', match: { id: 'catalytic_converter' } },
                // Tolerant: the converter only advances this stage on PICKUP. If
                // it's already in the bag when this stage is entered (e.g. grabbed
                // out of order), it can never be re-dropped while held — so
                // auto-satisfy when it's already carried.
                autoSatisfy: (game) =>
                    (game.inventory || []).some(s => s && s.itemDef.id === 'catalytic_converter'),
            },
            {
                id: 'escape_sewer',
                objective: '[TEXT]',
                targetZone: 'SEWER',
                // Phase D implements the set-piece as a Game method; no-op here.
                onEnter: (game) => { if (game._sewerEscapeSetpiece) game._sewerEscapeSetpiece(); },
                on: { type: 'map_entered', match: { map: 'town-map.json' } },
            },
            {
                id: 'return_to_car',
                objective: '[TEXT]',
                // (MC1) Once Macc holds the Converter on his shelf: buy it back from him.
                objectiveShelved: '[TEXT]',
                targetZone: 'TOWN',
                onEnter: (game) => { game._sewerEscape = null; },  // escaped — clear the gauntlet state
                on: { type: 'interact_car', match: {} },
            },
        ],
        onComplete: (game) => {
            // The car runs: set the persistent flag (read by _interactCar's flavor
            // line) and clear the North-bridge barricade. The bridge cutscene
            // fires when the player DRIVES NORTH ACROSS the now-open bridge
            // (main.js _doMove), so the bridge that's been the visible
            // objective all game finally pays off.
            game.questEngine.state.flags.carFixed = true;
            game._log('[TEXT]', 'transition');
            if (game._openBridgeIfCarFixed) game._openBridgeIfCarFixed();
        },
    },
};

// (NO1) Between quests: while no quest is active, the first row whose `when`
// holds gives the HUD its objective and the Map its rings, so the gap between one
// quest ending and the next starting still says where to go. Rows read only
// saved state (flags, the bridge route, the completed list), so a save made in a
// gap reloads with its row showing (plans/no1-objective-points-at-bridge.md).
// A row may ring several zones at once (AE2, plans/ae2-act2-zones-objective.md).
export const BETWEEN_QUESTS = [
    {
        id: 'to_bridge',   // the car runs, the bridge isn't crossed yet: the crash or the ramp is next
        when: (qe) => !!qe.getFlag('carFixed') && !qe.bridgeRoute(),
        objective: 'Drive north across the bridge',
        targetZones: ['TOWN'],
    },
    {
        id: 'back_to_town',   // (OE1) the credits have rolled: the vault is done, the Town is home (OE1R1 a)
        when: (qe) => qe.getFlag(CREDITS.seenFlag) === true,
        objective: '[TEXT]',
        targetZones: ['TOWN'],
    },
    {
        id: 'to_downtown',   // all three Act 2 items are in the bag: the bank's vault in Downtown is next (FX54)
        when: (qe) => qe.isComplete('deliver_burger') && act2Missing(qe).length === 0,
        objective: '[TEXT]',
        targetZones: ['DOWNTOWN'],
    },
    {
        id: 'to_act2',     // Act 1 ends with the delivery; Act 2's three zones come in any order (spine §1)
        when: (qe) => qe.isComplete('deliver_burger'),
        // The full row, as a table read sees it; `narrow` drops each zone whose item is held (FX54).
        objective: 'Explore the Carnival, Factory and Graveyard',
        targetZones: ['CARNIVAL', 'FACTORY', 'GRAVEYARD'],
        narrow: (qe) => {
            const zones = act2Missing(qe);
            return { objective: `Explore the ${joinNames(zones)}`, targetZones: zones };
        },
    },
];

// (FX54) The Act 2 zones, in Map order. A zone's item is its boss slot's required
// drop, `<zone>.boss` in SLOTS, so no item id is written here. The frozen area's
// slot is not listed, so its ice cone never counts.
const ACT2_ZONES = ['CARNIVAL', 'FACTORY', 'GRAVEYARD'];

// (AB3, plans/ab3-act2-quests.md) The three Act 2 quests. They run side by side with the active
// quest (Act 2 is played in any order) and never touch it: each one's step is a saved flag,
// `act2_<zone>`, absent until the boss falls (quest 1's autoplay walks into the Factory, so
// entering a zone must not write the save). Steps: 'boss' (the default: not yet beaten),
// 'collect' (the boss has fallen; examining the zone's claim spot ends the quest),
// 'done' (the item is in the bag). The boss slot says
// which item and where; the verb is how the item reaches you (SP1R1). All text is [TEXT].
export const ACT2_VERBS = { FACTORY: 'given', GRAVEYARD: 'taken', CARNIVAL: 'earned' };
export const ACT2_QUESTS = {};
for (const zone of ACT2_ZONES) {
    const slot = `${zone.toLowerCase()}.boss`;
    if (!SLOTS[slot]?.viaQuest) continue;
    ACT2_QUESTS[zone] = {
        zone, slot, map: SLOTS[slot].map, verb: ACT2_VERBS[zone],
        // The examinable on the zone's map whose use is the quest's last step ([E] on it).
        claimId: `[TEXT]_claim_${zone.toLowerCase()}`,
        // (ST1) A second spot that ends the same quest: the Carnival's booth, guarded by whoever
        // fills the boss slot. Null where a zone has no booth.
        boothId: zone === 'CARNIVAL' ? '[TEXT]_booth_carnival' : null,
        title: '[TEXT]',
        steps: { boss: { objective: '[TEXT]' }, collect: { objective: '[TEXT]' } },
    };
}
const act2Key = (zone) => `act2_${zone}`;

// The Act 2 zones whose required item is not in the bag.
function act2Missing(qe) {
    return ACT2_ZONES.filter(zone => {
        const item = SLOTS[`${zone.toLowerCase()}.boss`]?.requiredDrop;
        return !item || qe._slotOf(item) < 0;
    });
}

// (NI2) The Quests tab's checklist of the three Act 2 items: one row per zone, in Map order,
// with the item's id and whether the bag holds it. null until Act 1's delivery is done, as the
// objective above is. The id comes from the boss slot, so no item is named here; the
// renderer reads the name from the item data.
export function act2Checklist(qe) {
    if (typeof qe?.isComplete !== 'function' || !qe.isComplete('deliver_burger')) return null;
    return ACT2_ZONES.map(zone => {
        const itemId = SLOTS[`${zone.toLowerCase()}.boss`]?.requiredDrop ?? null;
        return { zone, itemId, held: !!itemId && qe._slotOf(itemId) >= 0 };
    });
}

// ['CARNIVAL', 'FACTORY', 'GRAVEYARD'] -> "Carnival, Factory and Graveyard".
function joinNames(zones) {
    const names = zones.map(z => z[0] + z.slice(1).toLowerCase());
    return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export class QuestEngine {
    constructor(game) {
        this.game = game;
        this.state = { activeId: null, stageIndex: 0, counters: {}, completed: [], flags: {}, journal: [] };
    }

    // (Phase 4 journal) Append a witness-log line — the chronological record the
    // Journal screen shows beneath the active-quest checklist + completed list.
    _note(text) {
        const j = this.state.journal || (this.state.journal = []);
        j.push({ turn: (this.game && this.game.turn) || 0, text });
        if (j.length > 60) j.shift();
    }

    start(questId) {
        const q = QUESTS[questId];
        if (!q) return;
        if (this.state.activeId === questId || this.state.completed.includes(questId)) return;
        this.state.activeId = questId;
        this.state.stageIndex = 0;
        this._note(`Began "${q.title}".`);
        this.game._log?.(`[New quest: ${q.title}]`, 'transition');
        const stage = q.stages[0];
        if (stage && stage.onEnter) stage.onEnter(this.game);
        this._settleAutoSatisfy();   // skip past any stage already satisfied at start
        this.game._render?.();
    }

    // Ingest a game event. Auto-starts any quest whose startOn matches, then
    // advances the active quest if the current stage's condition is met.
    emit(type, payload = {}) {
        if (type === 'examine') {
            const q = Object.values(ACT2_QUESTS).find(a => a.claimId === payload.targetId);
            if (q) this.act2Claim(q.zone);
            // (ST1) The booth: closed while the guard lives, then the same last step as the claim spot.
            const booth = Object.values(ACT2_QUESTS).find(a => a.boothId && a.boothId === payload.targetId);
            if (booth) {
                if (this.act2Step(booth.zone) === 'boss') this.game._log?.('[TEXT]', 'transition');
                else this.act2Claim(booth.zone);
            }
        }
        // Durable side-effect: remember the car was examined EVEN IF no quest is
        // active yet. The examine_car stage reads this flag (autoSatisfy) so an
        // early examine — before fix_car reaches that stage — still counts and
        // can't be lost. Flag is serialized, so it also survives save/reload.
        if (type === 'examine' && payload.targetId === 'car') {
            this.state.flags.carExamined = true;
        }

        for (const qid of Object.keys(QUESTS)) {
            const q = QUESTS[qid];
            if (q.startOn && q.startOn.type === type && matches(q.startOn.match, payload)
                && this.state.activeId !== qid && !this.state.completed.includes(qid)) {
                this.start(qid);
            }
        }

        const id = this.state.activeId;
        if (!id) return;
        const stage = QUESTS[id].stages[this.state.stageIndex];
        if (!stage || !stage.on || stage.on.type !== type) return;
        if (!matches(stage.on.match, payload)) return;

        // (IC2) A stage listing `items` needs every one of them handed over:
        // each is recorded in the saved counters, and only the last advances.
        if (Array.isArray(stage.on.items)) {
            if (!stage.on.items.includes(payload.item) || this._given(stage, payload.item)) return;
            this.state.counters[givenKey(stage, payload.item)] = 1;
            if (this._owed(stage).length) { this.game._render?.(); return; }
        }

        if (stage.on.count) {
            const key = stage.id;
            this.state.counters[key] = (this.state.counters[key] || 0) + (payload.amount || 1);
            if (stage.onProgress) stage.onProgress(this.game, this.state.counters[key]);
            if (this.state.counters[key] < stage.on.count) { this.game._render?.(); return; }
        }
        this._advance();
    }

    _advance() {
        const q = QUESTS[this.state.activeId];
        this.state.stageIndex++;
        if (this.state.stageIndex >= q.stages.length) { this._complete(); return; }
        const stage = q.stages[this.state.stageIndex];
        this._note(`→ ${stage.objective}`);
        if (stage.onEnter) stage.onEnter(this.game);
        this._settleAutoSatisfy();   // chain past any freshly-entered stage already satisfied
        this.game._render?.();
    }

    // Skip forward past any stage whose `autoSatisfy(game)` predicate is already
    // true on entry. This is what keeps the main quest from dead-stalling: a
    // stage's gating event can be DROPPED if it fired before the stage went
    // active (examine the car early, grab the converter out of order), so each
    // such stage carries a predicate that re-derives "already done" from durable
    // state (a flag, inventory contents). Loops so several satisfied stages in a
    // row collapse in one settle, and completes the quest if it runs off the end.
    // Does NOT re-run onEnter for a stage it's leaving — only the onEnter of the
    // stage it lands on (mirrors _advance), so set-piece hooks fire exactly once.
    _settleAutoSatisfy() {
        const q = QUESTS[this.state.activeId];
        if (!q) return;
        let guard = 0;
        while (this.state.stageIndex < q.stages.length && guard++ < q.stages.length + 1) {
            const stage = q.stages[this.state.stageIndex];
            if (!stage || typeof stage.autoSatisfy !== 'function' || !stage.autoSatisfy(this.game)) return;
            this.state.stageIndex++;
            if (this.state.stageIndex >= q.stages.length) { this._complete(); return; }
            const next = q.stages[this.state.stageIndex];
            if (next.onEnter) next.onEnter(this.game);
        }
    }

    _complete() {
        const id = this.state.activeId;
        const q = QUESTS[id];
        if (!this.state.completed.includes(id)) this.state.completed.push(id);
        if (q) this._note(`Completed "${q.title}".`);
        this.state.activeId = null;
        this.state.stageIndex = 0;
        if (q && q.onComplete) q.onComplete(this.game);
        this.game._render?.();
    }

    // Force the active quest straight to completion (runs onComplete once).
    // Used by tolerant interactions that must never dead-stall on a dropped stage
    // event — e.g. installing the converter at the car when the sewer→town
    // map_entered event was missed, leaving the quest short of return_to_car.
    forceComplete(questId) {
        if (!QUESTS[questId] || this.state.completed.includes(questId)) return;
        this.state.activeId = questId;
        this._complete();
    }

    // The current objective line for the HUD: the active stage's, else a
    // between-quests row's (null when neither applies).
    getHudText() {
        const here = this.act2Here();   // (AB3) the zone you stand in speaks first
        if (here) return here.objective;
        const id = this.state.activeId;
        if (!id) return this._betweenView()?.objective ?? null;
        const stage = QUESTS[id].stages[this.state.stageIndex];
        if (!stage) return null;
        let t = stage.objective;
        if (stage.objectiveShelved && this.state.flags.shelved && this.state.flags.shelved.catalytic_converter != null) {
            t = stage.objectiveShelved;
        }
        if (stage.on && stage.on.count) {
            const n = Math.min(this.state.counters[stage.id] || 0, stage.on.count);
            t += ` (${n}/${stage.on.count})`;
        }
        return t;
    }

    // The id of the active quest's current stage (null if no active quest).
    currentStageId() {
        const id = this.state.activeId;
        if (!id) return null;
        const stage = QUESTS[id].stages[this.state.stageIndex];
        return stage ? stage.id : null;
    }

    // The active quest's current stage OBJECT (null if none) — for callers that
    // need its trigger, not just its id. examine.js reads `on` to point a player
    // at the thing an 'examine X' stage is waiting for.
    currentStage() {
        const id = this.state.activeId;
        if (!id) return null;
        return QUESTS[id].stages[this.state.stageIndex] || null;
    }

    // (AB3) The Act 2 quest steps. Unset = 'boss'.
    act2Step(zone) { return ACT2_QUESTS[zone] ? (this.state.flags[act2Key(zone)] ?? 'boss') : null; }

    // A boss fell. True when its slot's item is the quest's to give (the caller skips the floor
    // drop); the quest moves to its collect step.
    act2BossDown(enemy, mapSpawns) {
        const slot = slotIdOf(enemy, mapSpawns);
        const q = Object.values(ACT2_QUESTS).find(a => a.slot === slot);
        if (!q) return false;
        if (this.act2Step(q.zone) !== 'done') {
            this.state.flags[act2Key(q.zone)] = 'collect';
            this.game._log?.('[TEXT]', 'transition');
            // (ST2) Won with the strongman beside you: one more line. The step is the same.
            const ally = (this.game.enemies || []).find(e => e.id === 'strongman' && e._ally && e.entity?.isAlive?.());
            if (ally) this.game._log?.('[TEXT]', 'transition');
        }
        return true;
    }

    // The quest's last step: the item goes into the bag. False unless the boss has fallen.
    act2Claim(zone) {
        const q = ACT2_QUESTS[zone];
        if (!q || this.act2Step(zone) !== 'collect') return false;
        const item = SLOTS[q.slot].requiredDrop;
        if (!this.game._grantItem?.(item, '[TEXT]')) return false;
        this.state.flags[act2Key(zone)] = 'done';
        this._note(`Completed "${q.title}".`);
        return true;
    }

    // The unfinished Act 2 quest of the zone you stand in, with its step; null elsewhere.
    act2Here() {
        const zone = this.game?.map?.zoneName;
        const q = ACT2_QUESTS[zone];
        const step = q && this.act2Step(zone);
        return step && step !== 'done' ? { quest: q, step, objective: q.steps[step].objective } : null;
    }

    // (NO1) The BETWEEN_QUESTS row that applies now, or null. Only while no
    // quest is active: an active quest's own stage always wins.
    betweenQuests() {
        if (this.state.activeId) return null;
        return BETWEEN_QUESTS.find(row => row.when(this)) || null;
    }

    // (FX54) What the row shows now: a row with `narrow` trims itself to the state.
    _betweenView() {
        const row = this.betweenQuests();
        return row && row.narrow ? row.narrow(this) : row;
    }

    isActive(id) { return this.state.activeId === id; }
    isComplete(id) { return this.state.completed.includes(id); }
    getFlag(k) { return this.state.flags[k]; }

    // (§delivery) True when the active stage is a delivery expecting exactly this
    // item handed to this NPC. The trade window uses it to permit an otherwise
    // un-give-able quest item when handing it over IS the current objective
    // (stage `on: { type: 'item_given', match: { item, npc } }`).
    expectsDelivery(itemId, npcId) {
        const id = this.state.activeId;
        if (!id) return false;
        const stage = QUESTS[id].stages[this.state.stageIndex];
        if (!stage || !stage.on || stage.on.type !== 'item_given') return false;
        const m = stage.on.match || {};
        if (Array.isArray(stage.on.items)) {
            return this._owed(stage).includes(itemId) && (m.npc == null || m.npc === npcId);
        }
        return (m.item == null || m.item === itemId) && (m.npc == null || m.npc === npcId);
    }

    // (IC2) The items the active delivery stage still wants handed over: its
    // `items` minus those already given, or its one `match.item`. [] when the
    // active stage is not a delivery.
    owedItems() {
        const stage = this.currentStage();
        if (!stage || !stage.on || stage.on.type !== 'item_given') return [];
        return this._owed(stage);
    }

    // True when something is owed and every owed item is in the bag.
    holdsOwed() {
        const owed = this.owedItems();
        return owed.length > 0 && owed.every(id => this._slotOf(id) >= 0);
    }

    // Hand every owed item to `npcId` at once: out of the bag, one `item_given`
    // per item (the event the satchel give emits too). Returns how many went.
    handOver(npcId) {
        const owed = this.owedItems();
        let n = 0;
        for (const item of owed) {
            const slot = this._slotOf(item);
            if (slot < 0) continue;
            this.game._removeFromSlot(slot);
            this.game.emitGameEvent('item_given', { npc: npcId, item });
            n++;
        }
        return n;
    }

    _given(stage, item) { return !!this.state.counters[givenKey(stage, item)]; }
    _owed(stage) {
        if (Array.isArray(stage.on.items)) return stage.on.items.filter(item => !this._given(stage, item));
        const m = stage.on.match || {};
        return m.item != null ? [m.item] : [];
    }
    _slotOf(itemId) {
        return (this.game.inventory || []).findIndex(s => s && s.itemDef && s.itemDef.id === itemId);
    }

    // (Phase 4 journal) A render-ready view of the active quest for the Journal:
    // the title + every stage flagged done / current, with the current stage's
    // location + description surfaced. null when no quest is active.
    getActiveQuestView() {
        const id = this.state.activeId;
        if (!id) return null;
        const q = QUESTS[id];
        const cur = this.state.stageIndex;
        return {
            id, title: q.title,
            stages: q.stages.map((s, i) => ({
                objective: s.objective,
                location: s.location || null,
                description: s.description || null,
                done: i < cur,
                current: i === cur,
            })),
        };
    }

    // Titles of completed quests, and the witness-log lines (oldest first).
    getCompletedTitles() { return this.state.completed.map(id => (QUESTS[id] && QUESTS[id].title) || id); }
    getJournalLines() { return (this.state.journal || []).slice(); }

    // (CY1) Which way you crossed the North bridge: 'canyon' (crashed through),
    // 'ramp' (sailed over into Downtown), or null (not yet). The arrival code
    // sets the `bridgeRoute` flag; a save from before that flag existed reads it
    // from the quests the crossing starts: the Canyon quest only on a crash, the
    // delivery quest on arriving in Downtown.
    bridgeRoute() {
        const f = this.state.flags.bridgeRoute;
        if (f === 'canyon' || f === 'ramp') return f;
        const began = (id) => this.isActive(id) || this.isComplete(id);
        if (began('canyon_escape')) return 'canyon';
        if (began('deliver_burger')) return 'ramp';
        return null;
    }

    // Finished quests out of every quest the game defines. Derived from the
    // completed list (already saved), so it needs no saved field of its own.
    // (CY1) A branch quest on the route you did NOT take is left out of both
    // numbers; before the bridge is crossed every quest still counts.
    getCompletedCount() {
        const route = this.bridgeRoute();
        const ids = Object.keys(QUESTS).filter(id => !(route && QUESTS[id].branch && QUESTS[id].branch !== route));
        const done = new Set(this.state.completed.filter(id => ids.includes(id))).size;
        return { done, total: ids.length };
    }

    // (Phase 4 map) Every zoneName the world map rings as "go here next": the
    // active stage's targetZone, or, with no quest active, a between-quests row's
    // zones, or none.
    getTargetZones() {
        const id = this.state.activeId;
        if (!id) return (this._betweenView()?.targetZones ?? []).slice();
        const s = QUESTS[id].stages[this.state.stageIndex];
        return s && s.targetZone ? [s.targetZone] : [];
    }

    // The first of getTargetZones(), or null.
    getTargetZone() { return this.getTargetZones()[0] ?? null; }

    serialize() {
        return {
            activeId: this.state.activeId,
            stageIndex: this.state.stageIndex,
            counters: { ...this.state.counters },
            completed: this.state.completed.slice(),
            flags: { ...this.state.flags },
            journal: (this.state.journal || []).slice(),
        };
    }

    // Restore progress WITHOUT re-running stage.onEnter — a mid-set-piece save
    // already persisted the spawned entities + tile diffs, so re-running would
    // double-spawn / re-seal the sewer.
    restore(obj) {
        if (!obj || typeof obj !== 'object') return;
        const valid = QUESTS[obj.activeId] ? obj.activeId : null;
        this.state.activeId = valid;
        this.state.stageIndex = valid ? clampStage(valid, obj.stageIndex) : 0;
        this.state.counters = (obj.counters && typeof obj.counters === 'object') ? { ...obj.counters } : {};
        this.state.completed = Array.isArray(obj.completed) ? obj.completed.filter(id => !!QUESTS[id]) : [];
        this.state.flags = (obj.flags && typeof obj.flags === 'object') ? { ...obj.flags } : {};
        this.state.journal = Array.isArray(obj.journal) ? obj.journal.slice() : [];
    }
}

// The saved-counter key that records one item of a several-item delivery.
function givenKey(stage, item) { return `${stage.id}/${item}`; }

// Every key in matchObj must strictly equal the same key in payload.
function matches(matchObj, payload) {
    if (!matchObj) return true;
    for (const k of Object.keys(matchObj)) {
        if (payload[k] !== matchObj[k]) return false;
    }
    return true;
}

function clampStage(activeId, idx) {
    const q = QUESTS[activeId];
    if (!q) return 0;
    if (typeof idx !== 'number' || idx < 0) return 0;
    return Math.min(idx, q.stages.length - 1);
}
