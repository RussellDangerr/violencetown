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

import { reactToTransaction, SHIFT_MULTIPLIER, applyHostileFlip } from '../game/give-action.js';
import { DISPOSITION_MIN } from '../game/disposition-curves.js';
import { ITEMS } from '../game/items.js';
import { buyPrice } from '../game/trade.js';

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

// ── applyHostileFlip — the missing downward path (Thieve Task 10) ────────────
//
// applyFlip only ever handled the UPWARD cases (becomeAlly, offerDiscount).
// Nothing anywhere in the codebase turned someone against you; a noticed theft
// is the first thing that needs it.
describe('applyHostileFlip', () => {
    test('a noticed theft flips them hostile at the floor', () => {
        const npc = { disposition: 20, allegiance: 'neutral', fsmState: 'IDLE', state: 'idle' };
        applyHostileFlip(npc);
        assert.equal(npc.disposition, DISPOSITION_MIN);
        assert.equal(npc.allegiance, 'hostile');
        assert.equal(npc.fsmState, 'HOSTILE');
    });

    test('the floor is the shared constant, not a fourth spelling of -100', () => {
        const npc = { disposition: 0 };
        applyHostileFlip(npc);
        assert.equal(npc.disposition, DISPOSITION_MIN);
        assert.equal(DISPOSITION_MIN, -100, 'if this moves, the flip should move with it');
    });

    test('robbing your own bribed ally turns them', () => {
        const npc = { disposition: 80, allegiance: 'ally', _ally: true, fsmState: 'ALLIED' };
        applyHostileFlip(npc);
        assert.equal(npc._ally, false);
        assert.equal(npc.allegiance, 'hostile');
    });

    test('_wasFlipped is left alone so a bribe can still buy them back', () => {
        // From -100 that is expensive, and it should be. But it must remain
        // possible — a permanent unforgiving enemy is a dead end, not a cost.
        const npc = { disposition: 0, _wasFlipped: false };
        applyHostileFlip(npc);
        assert.equal(npc._wasFlipped, false);
    });

    test('the victim is set searching with NO last-seen — robbed, not identified', () => {
        // They learn they were robbed, not by whom or from where. Being noticed
        // costs you a permanent enemy; it does not cost you your position.
        const npc = { disposition: 0, _lastSeenX: 4, _lastSeenY: 4 };
        applyHostileFlip(npc);
        assert.equal(npc.state, 'searching');
        assert.equal(npc._lastSeenX, null);
        assert.equal(npc._lastSeenY, null);
    });

    test('the awareness counters are reset so the sweep starts fresh', () => {
        const npc = { disposition: 0, _sweepBeats: 5, _awareBeats: 3 };
        applyHostileFlip(npc);
        assert.equal(npc._sweepBeats, 0);
        assert.equal(npc._awareBeats, 0);
    });

    test('a missing victim is survivable', () => {
        applyHostileFlip(null);
        applyHostileFlip(undefined);
    });
});

describe('reactToTransaction routes a theft', () => {
    test("'theft' flips the victim and reports it", () => {
        const npc = { disposition: 40, allegiance: 'neutral' };
        const r = reactToTransaction(npc, 'theft');
        assert.deepEqual(r, { flipped: true });
        assert.equal(npc.allegiance, 'hostile');
        assert.equal(npc.disposition, DISPOSITION_MIN);
    });

    test('a theft is written into the gift log like any other transaction', () => {
        const npc = { disposition: 0, giftLog: [] };
        reactToTransaction(npc, 'theft');
        assert.equal(npc.giftLog.length, 1);
        assert.equal(npc.giftLog[0].type, 'theft');
    });

    test('an unknown transaction type still returns null', () => {
        assert.equal(reactToTransaction({ disposition: 0 }, 'nonsense'), null);
    });
});

// ── offerDiscount — the merchant flip (CN1) ──────────────────────────────────
//
// The deal a merchant promises lives in her prices (trade.js reads disposition), so the flip
// has nothing of its own to set: no discount flag, and the shop she already has stays open.
describe('the offerDiscount flip leaves the deal to her prices', () => {
    const merchant = () => makeNpc({
        type: 'Carrion', disposition: 10, flipThreshold: 40, onFlip: 'offerDiscount',
        vendor: true, stock: ['soap', 'bandage'], values: { soap: 8 },
    });

    test('crossing the threshold flips her without writing a discount flag', () => {
        const npc = merchant();
        const r = reactToTransaction(npc, 'give', { item: ITEMS.soap });
        assert.equal(r.flipped, true);
        assert.equal(npc._wasFlipped, true);
        assert.equal('_discountMode' in npc, false);
    });

    test('she stays a vendor with the same stock, and no warning for an unknown mode', () => {
        const npc = merchant();
        reactToTransaction(npc, 'give', { item: ITEMS.soap });
        assert.equal(npc.vendor, true);
        assert.deepEqual(npc.stock, ['soap', 'bandage']);
        assert.equal(npc._warnedUnknownOnFlip, undefined);
        assert.notEqual(npc.allegiance, 'hostile');
    });

    test('the flip log line is the one she always had', () => {
        const r = reactToTransaction(merchant(), 'give', { item: ITEMS.soap });
        assert.equal(r.log, `[Carrion accepts the ${ITEMS.soap.name}. "...much obliged. I'll work you a deal next time."]`);
    });

    test('her stock costs less after the flip, by her disposition alone', () => {
        const npc = merchant();
        const before = ['soap', 'bandage'].map(id => buyPrice(ITEMS[id], npc.disposition));
        reactToTransaction(npc, 'give', { item: ITEMS.soap });
        const after = ['soap', 'bandage'].map(id => buyPrice(ITEMS[id], npc.disposition));
        assert.ok(after[0] < before[0] && after[1] < before[1], `${before} -> ${after}`);
    });
});
