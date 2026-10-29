// ice-cone-order.test.js — IC2: the delivery order includes the ice cone
// (plans/ic2-vampires-order-ice-cone.md).
//
// A quest stage waiting on `item_given` may list several `items`; it advances
// only once every one has been handed to its NPC, by talking (the dialogue's
// handOver) or through the satchel (one item_given per item). What has been
// handed over lives in the saved counters, so a save part-way keeps it.
//
// The real main.js methods the hand-off runs through (_dialogueChoices,
// _pickDialogueChoice, _removeFromSlot, _canStageGive) are lifted out of the
// source and bound to a small game object, as between-quests.test.js does.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { QuestEngine, QUESTS } from '../game/quests.js';
import { getDialogue, DIALOGUES } from '../game/dialogue.js';
import { ITEMS } from '../game/items.js';

const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');

function liveMethod(name, params, freeVars = {}) {
    const signature = `${name}(${params}) {`;
    const at = mainSrc.indexOf(signature);
    assert.ok(at > 0, `${name}(${params}) not found in main.js`);
    const closeAt = mainSrc.indexOf('\n    }', at);
    assert.ok(closeAt > at, `${name} body never closes`);
    const body = mainSrc.slice(at + name.length, closeAt + '\n    }'.length);
    const names = Object.keys(freeVars);
    const factory = new Function(...names, `'use strict'; return function ${body}`);
    return factory(...names.map(n => freeVars[n]));
}

const BURGER = 'burger_fries';
const CONE = 'tigers_blood_ice_cone';
const NPC = 'dt-recipient';

// A test-only quest: one stage that wants both items handed to the traveler.
// Added under its own id so the real quests are untouched by the engine tests.
const TEST_Q = 'ic2_test_order';
QUESTS[TEST_Q] = {
    id: TEST_Q, title: 'test order',
    stages: [{ id: 'give_both', objective: 'o', targetZone: null,
               on: { type: 'item_given', match: { npc: NPC }, items: [BURGER, CONE] } }],
};

function makeGame(held = []) {
    const free = { getDialogue, transferGold() {}, applyDispositionDelta() {}, DIALOGUE_HOSTILE_AT: -999, audio: { playSfx() {} } };
    const g = {
        inventory: held.map(id => ({ itemDef: ITEMS[id], count: 1 })),
        gold: 0, logs: [], completed: [],
        _log(m) { this.logs.push(m); },
        _render() {},
        _closeDialogue() {}, _onEntityHarmed() {},
        _grantItem(id) { this.inventory.push({ itemDef: ITEMS[id], count: 1 }); this.emitGameEvent('item_pickup', { id }); return true; },
        emitGameEvent(type, payload) { this.questEngine.emit(type, payload); },
    };
    for (const [n, p] of [['_dialogueChoices', ''], ['_pickDialogueChoice', 'choice'], ['_removeFromSlot', 'slot'], ['_canStageGive', 'entry']]) {
        g[n] = liveMethod(n, p, free);
    }
    g.questEngine = new QuestEngine(g);
    return g;
}
const holds = (g, id) => g.inventory.some(s => s && s.itemDef && s.itemDef.id === id);
// The satchel give of one item, as _commitOffer emits it.
const satchelGive = (g, item) => {
    const slot = g.inventory.findIndex(s => s && s.itemDef && s.itemDef.id === item);
    g._removeFromSlot(slot);
    g.emitGameEvent('item_given', { npc: NPC, item });
};

describe('a delivery stage that needs several items', () => {
    test('one item handed over leaves the stage waiting; the second finishes it', () => {
        const g = makeGame([BURGER, CONE]);
        g.questEngine.start(TEST_Q);
        satchelGive(g, BURGER);
        assert.ok(g.questEngine.isActive(TEST_Q), 'one of two does not finish the order');
        assert.deepEqual(g.questEngine.owedItems(), [CONE]);
        satchelGive(g, CONE);
        assert.ok(g.questEngine.isComplete(TEST_Q));
    });

    test('either order works, and an item not on the list does nothing', () => {
        const g = makeGame([BURGER, CONE]);
        g.questEngine.start(TEST_Q);
        g.emitGameEvent('item_given', { npc: NPC, item: 'catalytic_converter' });
        g.emitGameEvent('item_given', { npc: 'someone-else', item: CONE });
        assert.deepEqual(g.questEngine.owedItems(), [BURGER, CONE], 'wrong item or wrong NPC counts for nothing');
        satchelGive(g, CONE);
        satchelGive(g, BURGER);
        assert.ok(g.questEngine.isComplete(TEST_Q));
    });

    test('the same item twice still leaves the other owed', () => {
        const g = makeGame();
        g.questEngine.start(TEST_Q);
        g.emitGameEvent('item_given', { npc: NPC, item: BURGER });
        g.emitGameEvent('item_given', { npc: NPC, item: BURGER });
        assert.ok(g.questEngine.isActive(TEST_Q));
        assert.deepEqual(g.questEngine.owedItems(), [CONE]);
    });

    test('the satchel lets a listed item go only while it is still owed, and only to that NPC', () => {
        const g = makeGame([BURGER, CONE]);
        g.questEngine.start(TEST_Q);
        assert.equal(g.questEngine.expectsDelivery(BURGER, NPC), true);
        assert.equal(g.questEngine.expectsDelivery(BURGER, 'diner_cook'), false);
        assert.equal(g.questEngine.expectsDelivery('catalytic_converter', NPC), false);
        g._offerNpc = { id: NPC };
        assert.equal(g._canStageGive({ def: ITEMS[BURGER] }), true, 'the burger (a quest item) may be staged for the traveler');
        satchelGive(g, BURGER);
        assert.equal(g.questEngine.expectsDelivery(BURGER, NPC), false, 'handed over already');
    });

    test('a save part-way keeps what was handed over', () => {
        const g = makeGame([BURGER, CONE]);
        g.questEngine.start(TEST_Q);
        satchelGive(g, BURGER);
        const saved = JSON.parse(JSON.stringify(g.questEngine.serialize()));

        const h = makeGame([CONE]);
        h.questEngine.restore(saved);
        assert.ok(h.questEngine.isActive(TEST_Q));
        assert.deepEqual(h.questEngine.owedItems(), [CONE], 'the burger stays handed over after a reload');
        satchelGive(h, CONE);
        assert.ok(h.questEngine.isComplete(TEST_Q));
    });

    test('holdsOwed and handOver: all of it in the bag hands all of it over at once', () => {
        const g = makeGame([BURGER]);
        g.questEngine.start(TEST_Q);
        assert.equal(g.questEngine.holdsOwed(), false, 'the cone is missing');
        assert.equal(g.questEngine.handOver(NPC), 1, 'only what is held goes');
        assert.ok(g.questEngine.isActive(TEST_Q));

        const h = makeGame([BURGER, CONE]);
        h.questEngine.start(TEST_Q);
        assert.equal(h.questEngine.holdsOwed(), true);
        assert.equal(h.questEngine.handOver(NPC), 2);
        assert.ok(h.questEngine.isComplete(TEST_Q));
        assert.ok(!holds(h, BURGER) && !holds(h, CONE), 'both left the bag');
    });

    test('a one-item delivery still owes just its one item', () => {
        const qe = makeGame().questEngine;
        qe.state.activeId = 'deliver_burger';
        qe.state.stageIndex = QUESTS.deliver_burger.stages.findIndex(s => s.id === 'handoff');
        const want = QUESTS.deliver_burger.stages[qe.state.stageIndex].on;
        assert.deepEqual(qe.owedItems(), want.items ? want.items : [want.match.item]);
        qe.state.activeId = null;
        assert.deepEqual(qe.owedItems(), [], 'no quest, nothing owed');
    });
});

describe("the traveler's hand-off line", () => {
    const recipient = { id: NPC, name: 'Stranded Traveler', dialogueId: 'mq2_recipient', disposition: 0 };
    const atHandoff = (g) => {
        g.questEngine.forceComplete('fix_car');
        g.questEngine.start('deliver_burger');
        g.questEngine.state.stageIndex = QUESTS.deliver_burger.stages.findIndex(s => s.id === 'handoff');
        g._dialogueNpc = { ...recipient };
        g._dialogueCursor = 0;
    };
    const owed = () => {
        const on = QUESTS.deliver_burger.stages.find(s => s.id === 'handoff').on;
        return on.items ? on.items : [on.match.item];
    };

    test('is offered only while everything owed is in the bag, and hands it all over', () => {
        const g = makeGame(owed());
        atHandoff(g);
        const deliver = g._dialogueChoices().find(c => c.id === 'deliver');
        assert.ok(deliver, 'the hand-off line is on offer');
        g._pickDialogueChoice(deliver);
        assert.ok(g.questEngine.isComplete('deliver_burger'), `finished: ${g.logs.join(' | ')}`);
        for (const id of owed()) assert.ok(!holds(g, id), `${id} left the bag`);
    });

    test('is not offered with an empty bag', () => {
        const g = makeGame();
        atHandoff(g);
        assert.ok(!g._dialogueChoices().some(c => c.id === 'deliver'));
    });

    test('names no item outside the item table', () => {
        for (const s of QUESTS.deliver_burger.stages) for (const id of (s.on.items || [])) assert.ok(ITEMS[id], id);
        assert.ok(DIALOGUES.mq2_recipient.choices.some(c => c.id === 'deliver'));
    });
});
