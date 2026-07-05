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

export const QUESTS = {
    // ── Chapter Two: the Canyon fail-branch escape (Pike + the grappling hook).
    //    The engine tracks ONE quest, so this is the single canyon objective; Pike's
    //    "deal" route is flag-driven (dialogue onPick + _handleEnemyDeath) so it
    //    never competes with this for the active slot.
    canyon_escape: {
        id: 'canyon_escape',
        title: 'Out of the Canyon',
        stages: [
            {
                id: 'find_way_out',
                objective: "Escape the canyon — get Pike's rope: buy it, earn it, or take it",
                on: { type: 'map_entered', match: { map: 'downtown-map.json' } },
            },
        ],
        onComplete: (game) => {
            game._log('[You sink the hook into the rock, haul yourself up over the canyon lip, and out onto a Downtown street. Out at last.]', 'transition');
            if (game._startMainQuest2) game._startMainQuest2();   // (Phase 4) chain into MQ2 on arrival
        },
    },

    // ── Chapter Two: Main Quest 2 — the burger delivery (Phase 4 playground).
    //    STRUCTURE is real (2 stages; both delivery idioms via item_given; journal
    //    location + description; world-map targetZone). The TEXT is placeholder for
    //    Caelan to author. Started deterministically on Downtown arrival (both the
    //    canyon-grapple climb-out and the alcohol-ramp → game._startMainQuest2).
    deliver_burger: {
        id: 'deliver_burger',
        title: 'Special Delivery',
        stages: [
            {
                id: 'get_burger',
                objective: 'Pick up the burger + fries at the diner',
                location: 'Downtown · The Diner',
                description: 'The diner cook has a delivery bagged and waiting. The diner is the leftmost door on the Downtown strip.',
                targetZone: 'DOWNTOWN',
                on: { type: 'item_pickup', match: { id: 'burger_fries' } },
                autoSatisfy: (game) => (game.inventory || []).some(s => s && s.itemDef.id === 'burger_fries'),
            },
            {
                id: 'handoff',
                objective: 'Deliver the burger + fries to the stranded traveler',
                location: 'Downtown · the street',
                description: 'The stranded traveler on the Downtown street is waiting on this. Hand it over — talk to them, or offer it from your satchel.',
                targetZone: 'DOWNTOWN',
                on: { type: 'item_given', match: { item: 'burger_fries', npc: 'dt-recipient' } },
            },
        ],
        onComplete: (game) => {
            game.gold = (game.gold || 0) + 50;
            game._log('[Delivered. The traveler presses a little Gold Card credit into your hand. +50 GP.]', 'transition');
        },
    },

    fix_car: {
        id: 'fix_car',
        title: 'A Working Car',
        // Started DETERMINISTICALLY (game._startMainQuest, on game start / first
        // town entry) rather than via a fragile once-per-approach adjacency bark
        // off the Borgir boss — the old startOn could be missed entirely if the
        // player never stepped exactly adjacent, dead-stalling the whole game.
        // Borgir's bark is now flavor only; it no longer gates quest start.
        stages: [
            {
                id: 'examine_car',
                objective: "Your car won't start - examine it (E)",
                on: { type: 'examine', match: { targetId: 'car' } },
                // Tolerant: if the player already examined the car before this
                // stage went active, the 'examine' event was dropped — so
                // auto-satisfy from the persisted flag instead of dead-stalling.
                autoSatisfy: (game) => !!game.questEngine.state.flags.carExamined,
            },
            {
                id: 'recover_converter',
                objective: 'Get your converter back from the sewer',
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
                objective: 'Tear down the barricade and escape the sewer!',
                // Phase D implements the set-piece as a Game method; no-op here.
                onEnter: (game) => { if (game._sewerEscapeSetpiece) game._sewerEscapeSetpiece(); },
                on: { type: 'map_entered', match: { map: 'town-map.json' } },
            },
            {
                id: 'return_to_car',
                objective: 'Install the converter - return to your car',
                onEnter: (game) => { game._sewerEscape = null; },  // escaped — clear the gauntlet state
                on: { type: 'interact_car', match: {} },
            },
        ],
        onComplete: (game) => {
            // The car runs: set the persistent flag (read by _interactCar's flavor
            // line) and clear the North-bridge barricade. The ending no longer
            // fires the instant the car's fixed — it fires when the player DRIVES
            // NORTH ACROSS the now-open bridge (main.js _doMove), so the bridge
            // that's been the visible objective all game finally pays off.
            game.questEngine.state.flags.carFixed = true;
            game._log('[The car coughs, sputters, then ROARS to life — and up north the bridge barricade rattles loose. Drive out of Violencetown.]', 'transition');
            if (game._openBridgeIfCarFixed) game._openBridgeIfCarFixed();
        },
    },
};

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

    // The current objective line for the HUD (null when no quest is active).
    getHudText() {
        const id = this.state.activeId;
        if (!id) return null;
        const stage = QUESTS[id].stages[this.state.stageIndex];
        if (!stage) return null;
        let t = stage.objective;
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
        return (m.item == null || m.item === itemId) && (m.npc == null || m.npc === npcId);
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

    // (Phase 4 map) The active stage's targetZone — a zoneName the world map
    // highlights as "go here next" — or null.
    getTargetZone() {
        const id = this.state.activeId;
        if (!id) return null;
        const s = QUESTS[id].stages[this.state.stageIndex];
        return (s && s.targetZone) || null;
    }

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
