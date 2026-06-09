// quest-flow.test.js — drive the REAL QuestEngine (game/quests.js) through the
// fix_car critical path with a minimal fake game stub.
//
// HOW TO READ THIS FILE
//   - The "happy path" suite is the regression guard for the intended flow and
//     SHOULD PASS on current dev code.
//   - The "soft-lock orderings" suite documents bugs from the audit. Several of
//     its assertions are EXPECTED TO FAIL against current dev code — that is
//     INTENDED. Each failing test names the bug it documents in its title and a
//     leading comment, so a green run there means the bug was fixed.
//
// We import the engine + the quest data table directly and feed it synthetic
// events, so the test exercises quest FLOW independent of the game content the
// stages reference (Borgir, the sewer set-piece, the converter, the car).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { QuestEngine, QUESTS } from '../game/quests.js';

// ── Minimal fake game ────────────────────────────────────────────────────────
//
// The engine only calls a handful of optional hooks on `game`:
//   _log?.(), _render?.(), _sewerEscapeSetpiece?.(), and it assigns
//   game._sewerEscape = null inside return_to_car.onEnter. We record calls so
//   tests can assert the scripted side-effects fired on stage entry.
function makeFakeGame() {
    const g = {
        logs: [],
        renders: 0,
        setpieceCalls: 0,
        _sewerEscape: { sentinel: true }, // non-null so we can detect the clear
        _log(msg, kind) { this.logs.push({ msg, kind }); },
        _render() { this.renders++; },
        _sewerEscapeSetpiece() { this.setpieceCalls++; },
    };
    g.questEngine = new QuestEngine(g);
    return g;
}

// Convenience: current active stage id (null if none / completed).
const stageId = (g) => g.questEngine.currentStageId();

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

    test('auto-starts on npc_adjacent borgir_boss', () => {
        assert.equal(QUESTS.fix_car.startOn.type, 'npc_adjacent');
        assert.deepEqual(QUESTS.fix_car.startOn.match, { id: 'borgir_boss' });
    });
});

// ── Happy path — SHOULD PASS on current code ─────────────────────────────────
describe('fix_car happy path (regression guard — expected GREEN)', () => {
    test('advances examine_car → recover_converter → escape_sewer → return_to_car and completes', () => {
        const g = makeFakeGame();
        const qe = g.questEngine;

        // Nothing active until the player walks up to Borgir.
        assert.equal(stageId(g), null);

        // 1. Walk up to Borgir → auto-start at stage 0.
        qe.emit('npc_adjacent', { id: 'borgir_boss' });
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

        // onComplete side-effects.
        assert.equal(qe.getFlag('carFixed'), true);
        assert.equal(qe.getFlag('deliveryUnlocked'), true);
    });

    test('wrong-typed events do not advance the active stage', () => {
        const g = makeFakeGame();
        const qe = g.questEngine;
        qe.emit('npc_adjacent', { id: 'borgir_boss' }); // → examine_car

        // An examine of the WRONG target must not advance.
        qe.emit('examine', { targetId: 'mailbox' });
        assert.equal(stageId(g), 'examine_car');

        // A correctly-typed but mismatched-payload pickup must not advance.
        qe.emit('item_pickup', { id: 'rock' });
        assert.equal(stageId(g), 'examine_car');
    });

    test('does not auto-start twice or re-complete', () => {
        const g = makeFakeGame();
        const qe = g.questEngine;
        qe.emit('npc_adjacent', { id: 'borgir_boss' });
        const idxAfterFirst = qe.state.stageIndex;
        // Re-emitting the start trigger must be a no-op (already active).
        qe.emit('npc_adjacent', { id: 'borgir_boss' });
        assert.equal(qe.state.stageIndex, idxAfterFirst);
        assert.equal(stageId(g), 'examine_car');
    });
});

// ── Soft-lock orderings (from the audit) ─────────────────────────────────────
//
// These document out-of-order player actions that the linear, event-edge-
// triggered engine mishandles. The assertions describe the DESIRED (robust)
// behavior; where current code is buggy the test FAILS, pinning the bug.
describe('fix_car soft-lock orderings (audit — some EXPECTED RED)', () => {

    // SOFT-LOCK A — "examine-before-quest-start".
    // The player examines the car BEFORE walking up to Borgir (before the quest
    // exists). The examine event fires while activeId is null and is dropped.
    // When the quest later starts at examine_car, the player must examine AGAIN.
    // DESIRED: a robust quest remembers the pre-start examine and the first
    // stage is already satisfied (or auto-advances) when the quest starts.
    //
    // EXPECTED RESULT ON CURRENT CODE: FAIL.
    //   Bug documented: pre-start `examine` is silently lost; the engine has no
    //   memory of events that arrive before startOn fires, so the player is
    //   forced to re-do the examine. (Soft, recoverable — but a UX trap if the
    //   car can only be examined once.)
    test('[EXPECTED RED] examining the car before meeting Borgir is remembered', () => {
        const g = makeFakeGame();
        const qe = g.questEngine;

        // Player examines the car first (quest not started yet → event dropped).
        qe.emit('examine', { targetId: 'car' });
        assert.equal(stageId(g), null); // nothing active — confirms the drop

        // Now meet Borgir → quest starts.
        qe.emit('npc_adjacent', { id: 'borgir_boss' });

        // DESIRED: the earlier examine counts; we should already be past
        // examine_car onto recover_converter without a second examine.
        // (FAILS today: we are parked back on examine_car, re-asking the player
        // to examine the car a second time.)
        assert.equal(
            stageId(g),
            'recover_converter',
            'pre-start examine should satisfy the first objective without a redo',
        );
    });

    // SOFT-LOCK B — "converter-already-held".
    // The player already holds the catalytic converter when the quest reaches
    // recover_converter (e.g., they grabbed it before the engine entered that
    // stage, so the item_pickup edge already fired and won't fire again).
    // recover_converter advances ONLY on a fresh item_pickup event, so the
    // quest is stuck — completion is UNREACHABLE without re-picking-up an item
    // already in hand. This is a HARD soft-lock.
    // DESIRED: entering recover_converter while the converter is already held
    // immediately satisfies it (engine checks inventory on stage entry).
    //
    // EXPECTED RESULT ON CURRENT CODE: FAIL.
    test('[EXPECTED RED] already holding the converter satisfies recover_converter on entry', () => {
        const g = makeFakeGame();
        const qe = g.questEngine;

        // Model "already holding it": the player picked up the converter during
        // the examine_car stage (the engine isn't on recover_converter yet, so
        // this pickup edge does NOT advance the converter stage).
        qe.emit('npc_adjacent', { id: 'borgir_boss' }); // → examine_car
        qe.emit('item_pickup', { id: 'catalytic_converter' }); // fired too early
        assert.equal(stageId(g), 'examine_car'); // confirms the early pickup did nothing

        // Reach the converter stage the normal way.
        qe.emit('examine', { targetId: 'car' });
        assert.equal(stageId(g), 'recover_converter');

        // DESIRED: because the converter is already held, recover_converter is
        // satisfied on entry and we are now on escape_sewer.
        // (FAILS today: we sit on recover_converter forever, because the only
        // way forward is another item_pickup{catalytic_converter} event, which
        // can't happen for an item already in inventory.)
        assert.equal(
            stageId(g),
            'escape_sewer',
            'holding the converter on entry should advance past recover_converter',
        );
    });

    // Corollary to SOFT-LOCK B — prove the dead-end is truly inescapable on the
    // current event vocabulary: every OTHER critical-path event is a no-op while
    // parked on recover_converter, so the quest can never be completed.
    //
    // EXPECTED RESULT ON CURRENT CODE: FAIL (completion stays unreachable).
    test('[EXPECTED RED] recover_converter is escapable without a duplicate pickup event', () => {
        const g = makeFakeGame();
        const qe = g.questEngine;
        qe.emit('npc_adjacent', { id: 'borgir_boss' });
        qe.emit('examine', { targetId: 'car' });
        assert.equal(stageId(g), 'recover_converter');

        // Try to push the quest forward with everything EXCEPT a fresh
        // converter pickup. None of these match recover_converter.on, so on
        // current code they all no-op and the quest dead-ends.
        qe.emit('map_entered', { map: 'town-map.json' });
        qe.emit('interact_car', {});
        qe.emit('examine', { targetId: 'car' });

        assert.equal(
            qe.isComplete('fix_car'),
            true,
            'the quest must remain completable even if the converter pickup edge was missed',
        );
    });
});
