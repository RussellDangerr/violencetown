// quest-flow.test.js — drive the REAL QuestEngine (game/quests.js) through the
// fix_car critical path with a minimal fake game stub.
//
// fix/critical-path made the quest START DETERMINISTICALLY (game._startMainQuest
// → questEngine.start('fix_car')) instead of via a fragile npc_adjacent bark, and
// made the early stages tolerant of out-of-order play via autoSatisfy predicates
// (a durable carExamined flag; the converter already being in inventory). These
// tests are the regression guard for that: the happy path AND the two former
// audit soft-locks should all be GREEN.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { QuestEngine, QUESTS } from '../game/quests.js';

// ── Minimal fake game ────────────────────────────────────────────────────────
//
// The engine calls a few optional hooks on `game`, and the autoSatisfy predicates
// read game.questEngine.state.flags.carExamined and game.inventory.
function makeFakeGame() {
    const g = {
        logs: [],
        renders: 0,
        setpieceCalls: 0,
        inventory: [],                     // autoSatisfy(recover_converter) reads this
        _sewerEscape: { sentinel: true },  // non-null so we can detect the clear
        _log(msg, kind) { this.logs.push({ msg, kind }); },
        _render() { this.renders++; },
        _sewerEscapeSetpiece() { this.setpieceCalls++; },
    };
    g.questEngine = new QuestEngine(g);
    return g;
}

const stageId = (g) => g.questEngine.currentStageId();
// Deterministic start — what game._startMainQuest does in the real game.
const startQuest = (g) => g.questEngine.start('fix_car');
// A converter inventory entry shaped the way autoSatisfy checks it (s.itemDef.id).
const CONVERTER = { itemDef: { id: 'catalytic_converter' }, count: 1 };

// ── Sanity: the quest table is shaped the way the flow test assumes ──────────
describe('fix_car quest definition', () => {
    test('has the four expected stages in order', () => {
        const ids = QUESTS.fix_car.stages.map(s => s.id);
        assert.deepEqual(ids, [
            'examine_car',
            'recover_converter',
            'escape_sewer',
            'return_to_car',
        ]);
    });

    test('starts deterministically — no fragile startOn trigger', () => {
        // fix/critical-path removed the npc_adjacent startOn; the quest is now
        // started explicitly by game._startMainQuest → questEngine.start().
        assert.equal(QUESTS.fix_car.startOn, undefined);
    });

    test('the recoverable stages carry autoSatisfy predicates', () => {
        const byId = Object.fromEntries(QUESTS.fix_car.stages.map(s => [s.id, s]));
        assert.equal(typeof byId.examine_car.autoSatisfy, 'function');
        assert.equal(typeof byId.recover_converter.autoSatisfy, 'function');
    });
});

// ── Happy path ───────────────────────────────────────────────────────────────
describe('fix_car happy path (regression guard — expected GREEN)', () => {
    test('advances examine_car → recover_converter → escape_sewer → return_to_car and completes', () => {
        const g = makeFakeGame();
        const qe = g.questEngine;

        // Nothing active until the game starts the quest.
        assert.equal(stageId(g), null);

        // 1. Deterministic start → stage 0 (nothing auto-satisfied yet).
        startQuest(g);
        assert.equal(qe.isActive('fix_car'), true);
        assert.equal(stageId(g), 'examine_car');

        // 2. Examine the car → recover_converter.
        qe.emit('examine', { targetId: 'car' });
        assert.equal(stageId(g), 'recover_converter');

        // 3. Pick up the converter → escape_sewer (set-piece onEnter fires).
        qe.emit('item_pickup', { id: 'catalytic_converter' });
        assert.equal(stageId(g), 'escape_sewer');
        assert.equal(g.setpieceCalls, 1, 'escape_sewer.onEnter should trigger the sewer set-piece once');

        // 4. Reach the town map → return_to_car (gauntlet state cleared).
        qe.emit('map_entered', { map: 'town-map.json' });
        assert.equal(stageId(g), 'return_to_car');
        assert.equal(g._sewerEscape, null, 'return_to_car.onEnter should null out _sewerEscape');

        // 5. Interact with the car → quest completes.
        qe.emit('interact_car', {});
        assert.equal(qe.isComplete('fix_car'), true, 'completion must be REACHABLE via the intended event chain');
        assert.equal(qe.isActive('fix_car'), false);
        assert.equal(stageId(g), null);

        // onComplete side-effect (the never-read deliveryUnlocked flag was removed).
        assert.equal(qe.getFlag('carFixed'), true);
    });

    test('wrong-typed events do not advance the active stage', () => {
        const g = makeFakeGame();
        const qe = g.questEngine;
        startQuest(g); // → examine_car

        // An examine of the WRONG target must not advance.
        qe.emit('examine', { targetId: 'mailbox' });
        assert.equal(stageId(g), 'examine_car');

        // A correctly-typed but mismatched-payload pickup must not advance.
        qe.emit('item_pickup', { id: 'rock' });
        assert.equal(stageId(g), 'examine_car');
    });

    test('does not start twice or re-complete', () => {
        const g = makeFakeGame();
        const qe = g.questEngine;
        startQuest(g);
        const idxAfterFirst = qe.state.stageIndex;
        startQuest(g); // re-start must be a no-op (already active)
        assert.equal(qe.state.stageIndex, idxAfterFirst);
        assert.equal(stageId(g), 'examine_car');
    });
});

// ── Former soft-locks (from the audit) — now FIXED, expected GREEN ──────────
//
// These exercise the out-of-order orderings the old engine dead-stalled on.
// fix/critical-path recovers from them via durable state + autoSatisfy.
describe('fix_car out-of-order tolerance (audit soft-locks, now GREEN)', () => {

    // Former SOFT-LOCK A — examine the car BEFORE the quest starts. The 'examine'
    // event records a durable carExamined flag even with no active quest; on
    // start, examine_car.autoSatisfy reads it and skips ahead.
    test('examining the car before the quest starts is remembered', () => {
        const g = makeFakeGame();
        const qe = g.questEngine;

        qe.emit('examine', { targetId: 'car' }); // no quest yet, but flag recorded
        assert.equal(stageId(g), null);
        assert.equal(qe.getFlag('carExamined'), true);

        startQuest(g);
        assert.equal(stageId(g), 'recover_converter',
            'a pre-start examine should satisfy the first objective without a redo');
    });

    // Former SOFT-LOCK B — already holding the converter when recover_converter is
    // entered. autoSatisfy reads inventory and skips the stage.
    test('already holding the converter satisfies recover_converter on entry', () => {
        const g = makeFakeGame();
        const qe = g.questEngine;
        g.inventory = [CONVERTER]; // grabbed out of order, already in the bag

        startQuest(g);                            // → examine_car
        qe.emit('examine', { targetId: 'car' });  // → recover_converter, auto-satisfies → escape_sewer
        assert.equal(stageId(g), 'escape_sewer',
            'holding the converter on entry should advance past recover_converter');
        assert.equal(g.setpieceCalls, 1, 'landing on escape_sewer should fire the set-piece once');
    });

    // Corollary — with the converter grabbed early, completion is still reachable.
    test('completion is reachable even if the converter pickup edge was missed', () => {
        const g = makeFakeGame();
        const qe = g.questEngine;
        g.inventory = [CONVERTER];

        startQuest(g);
        qe.emit('examine', { targetId: 'car' });          // auto-past recover_converter → escape_sewer
        qe.emit('map_entered', { map: 'town-map.json' });  // → return_to_car
        qe.emit('interact_car', {});                       // → complete
        assert.equal(qe.isComplete('fix_car'), true,
            'the quest must remain completable even if the converter pickup edge was missed');
    });

    // Both early — examined AND holding before start: the quest collapses straight
    // to escape_sewer on start, firing the set-piece exactly once.
    test('examine-and-hold before start collapses to escape_sewer on start', () => {
        const g = makeFakeGame();
        const qe = g.questEngine;
        qe.emit('examine', { targetId: 'car' }); // flag set
        g.inventory = [CONVERTER];               // converter held

        startQuest(g);
        assert.equal(stageId(g), 'escape_sewer');
        assert.equal(g.setpieceCalls, 1);
    });
});
