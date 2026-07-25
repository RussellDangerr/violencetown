// give-action.test.js — Task 17: poisoning as a social attack.
//
// Giving someone sewer fare (sewerFare:true, e.g. tunnel_mushroom) routes
// through the SAME seam as an ordinary gift — reactToTransaction(npc, 'give',
// { item }) → applyGive — because that seam is the one place every disposition
// move already flows through (bribes, gifts, dialogue). Feeding someone poison
// is that same transaction with a negative sign, not a special case bolted on
// beside it.
//
// Four rules under test (spec order):
//   1. The disposition hit must EXCEED the gift credit the food would
//      otherwise earn — never a net-positive way to raise their opinion.
//   2. An NPC whose `values` include the food reacts WORSE — betrayal
//      proportional to how much they wanted it.
//   3. Whether they flip hostile keys off the existing `flipThreshold`.
//   4. A sewer-dweller given the same item is PLEASED — it's medicine.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { reactToTransaction, SHIFT_MULTIPLIER } from '../game/give-action.js';
import { ITEMS } from '../game/items.js';

// A faithful-enough NPC stub: every field applyGive/isSewerDweller/isHostile
// actually read, nothing more.
function makeNpc(overrides = {}) {
    return {
        type: 'Red Fungus',
        disposition: 0,
        flipThreshold: 40,
        bribeable: true,
        values: {},
        allegiance: 'neutral',
        buffs: [],
        entity: { hp: 100, maxHp: 100, alive: true },
        giftLog: [],
        ...overrides,
    };
}

const MUSHROOM = ITEMS.tunnel_mushroom; // dot: {id:'poison', dmg:5, turns:2}, sewerFare:true
const MEAT = ITEMS.mystery_meat;        // flat damage:3, sewerFare:true

describe('poisoning as a social attack (Task 17)', () => {

    test('rule 1 — the disposition hit EXCEEDS the gift credit the item would otherwise earn', () => {
        const npc = makeNpc({ values: { tunnel_mushroom: 8 } }); // would-be credit: 8 * SHIFT_MULTIPLIER
        const wouldBeCredit = 8 * SHIFT_MULTIPLIER;
        const before = npc.disposition;

        reactToTransaction(npc, 'give', { item: MUSHROOM });

        const drop = before - npc.disposition;
        assert.ok(drop > 0, 'disposition must move DOWN, not up');
        assert.ok(drop > wouldBeCredit,
            `drop (${drop}) must exceed the ${wouldBeCredit}-point credit this gift would have earned — feeding poison must never be a net-positive way to raise their opinion of you`);
    });

    test('rule 1 — still net-negative even when the NPC does not value the item at all', () => {
        const npc = makeNpc({ values: {} }); // weight 0 — an ordinary gift would earn +0
        reactToTransaction(npc, 'give', { item: MUSHROOM });
        assert.ok(npc.disposition < 0, 'zero credit is still a floor of zero — poisoning must still cost something');
    });

    test('rule 2 — an NPC who VALUES the food reacts worse than one who does not', () => {
        const wants = makeNpc({ values: { tunnel_mushroom: 10 } });
        const indifferent = makeNpc({ values: {} });

        reactToTransaction(wants, 'give', { item: MUSHROOM });
        reactToTransaction(indifferent, 'give', { item: MUSHROOM });

        assert.ok(wants.disposition < indifferent.disposition,
            'betrayal scales with how much they wanted it — the fan of tunnel mushrooms takes the harder disposition hit');
    });

    test('rule 3 — crossing the (mirrored) flipThreshold turns the victim hostile', () => {
        // A low flipThreshold + a value weight big enough that the poison penalty
        // pushes disposition past -flipThreshold on the first feeding.
        const npc = makeNpc({ flipThreshold: 20, disposition: 0, values: { tunnel_mushroom: 5 }, allegiance: 'neutral' });
        const result = reactToTransaction(npc, 'give', { item: MUSHROOM });

        assert.equal(npc.allegiance, 'hostile', 'a big enough betrayal turns them on you');
        assert.equal(result.flipped, true);
    });

    test('rule 3 — a small betrayal against a high flipThreshold does NOT flip them hostile', () => {
        const npc = makeNpc({ flipThreshold: 500, disposition: 0, values: {}, allegiance: 'neutral' });
        const result = reactToTransaction(npc, 'give', { item: MUSHROOM });

        assert.notEqual(npc.allegiance, 'hostile', 'a small poison dose should not flip a very tolerant NPC');
        assert.equal(result.flipped, false);
    });

    test('rule 3 — an already-hostile victim is not re-flipped (no infinite re-trigger)', () => {
        const npc = makeNpc({ flipThreshold: 1, disposition: -99, values: {}, allegiance: 'hostile' });
        const result = reactToTransaction(npc, 'give', { item: MUSHROOM });
        assert.equal(result.flipped, false, 'already hostile — nothing left to flip');
    });

    test('rule 4 — a sewer-dweller given the same item is PLEASED, not poisoned', () => {
        const dweller = makeNpc({ sewerDweller: true, values: { tunnel_mushroom: 8 } });
        const before = dweller.disposition;

        const result = reactToTransaction(dweller, 'give', { item: MUSHROOM });

        assert.ok(dweller.disposition > before, 'medicine, not poison — disposition should rise');
        assert.equal(result.accepted, true);
    });

    test('rule 4 — a sewer-dweller getting mushrooms is unaffected by the human poison math', () => {
        // A human and a sewer-dweller with IDENTICAL starting state should diverge
        // in opposite directions from the same gift.
        const human = makeNpc({ values: { tunnel_mushroom: 8 }, disposition: 0 });
        const dweller = makeNpc({ sewerDweller: true, values: { tunnel_mushroom: 8 }, disposition: 0 });

        reactToTransaction(human, 'give', { item: MUSHROOM });
        reactToTransaction(dweller, 'give', { item: MUSHROOM });

        assert.ok(human.disposition < 0);
        assert.ok(dweller.disposition > 0);
    });

    describe('the effect itself actually lands (not just the disposition math)', () => {
        test('a human fed a tunnel mushroom gets a positive (harmful) poison buff', () => {
            const npc = makeNpc();
            reactToTransaction(npc, 'give', { item: MUSHROOM });
            const dot = npc.buffs.find(b => b.id === 'poison');
            assert.ok(dot, 'expected a poison buff on the fed NPC');
            assert.equal(dot.dmg, 5);
            assert.equal(dot.turns, 2);
        });

        test('a sewer-dweller fed a tunnel mushroom gets a negative (healing) poison buff', () => {
            const npc = makeNpc({ sewerDweller: true });
            reactToTransaction(npc, 'give', { item: MUSHROOM });
            const dot = npc.buffs.find(b => b.id === 'poison');
            assert.ok(dot, 'expected a poison buff entry (as regen) on the fed sewer-dweller');
            assert.equal(dot.dmg, -5);
        });

        test('a human fed mystery meat (flat damage) loses HP immediately', () => {
            const npc = makeNpc();
            reactToTransaction(npc, 'give', { item: MEAT });
            assert.equal(npc.entity.hp, 97, 'flat 3 damage lands directly — no combat pipeline needed for a hand-fed item');
        });

        test('a sewer-dweller fed mystery meat gains HP immediately', () => {
            const npc = makeNpc({ sewerDweller: true });
            npc.entity.hp = 90;
            reactToTransaction(npc, 'give', { item: MEAT });
            assert.equal(npc.entity.hp, 93, 'same flat 3, opposite sign — medicine for the sewer-dweller');
        });
    });

    test('a bribery-immune NPC still refuses the item outright (no effect, no disposition change)', () => {
        const npc = makeNpc({ bribeable: false });
        const before = npc.disposition;
        const result = reactToTransaction(npc, 'give', { item: MUSHROOM });
        assert.equal(result.accepted, false);
        assert.equal(npc.disposition, before, 'refused offerings must not still poison the target');
        assert.deepEqual(npc.buffs, []);
    });

    test('an ordinary (non-sewerFare) gift is completely unaffected by this feature', () => {
        const npc = makeNpc({ values: { soap: 8 } });
        const before = npc.disposition;
        reactToTransaction(npc, 'give', { item: ITEMS.soap });
        assert.equal(npc.disposition, before + 8 * SHIFT_MULTIPLIER, 'plain gifts still use the ordinary values-weighted math');
    });
});
