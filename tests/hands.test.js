// hands.test.js — power wield (plans/hb1-power-wield-mask.md): one mask lets each
// hand hold its own two-hander; any other head slot refuses the second.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { ITEMS, resolveUse, unequipItem, holdInHands, settleHands, heldInHands, gearOptions } from '../game/items.js';
import { WEAPON_TIERS, weaponClassOf } from '../game/weapons.js';
import { ITEM_SPRITES, SHEETS } from '../game/sprites.js';
import { powerWielding, POWER_WIELD_REFUSAL } from '../game/hands.js';

const handsOf = (d) => (weaponClassOf(d) || {}).hands || 1;
const GREAT = WEAPON_TIERS.great_sword[0];
const AXE2 = WEAPON_TIERS.battle_axe[0];
const MASK = ITEMS.strongman_mask;

function game(eq = {}) {
    const g = {
        equipment: { weapon: null, left: null, top: null, bottom: null, front: null, back: null, sides: null, ...eq },
        inventory: [], tempEquips: [], costume: null, _handsOf: handsOf,
        _addToInventory(d) { this.inventory.push({ itemDef: d, count: 1 }); return true; },
    };
    return g;
}
const bag = (g, d) => { g.inventory.push({ itemDef: d, count: 1 }); return g.inventory.length - 1; };
const bagged = (g) => g.inventory.map(s => s.itemDef.id);

describe('the power-wield mask', () => {
    test('it is a head-slot mask carrying the flag, with a placeholder name and bag sprite', () => {
        assert.equal(MASK.equipSlot, 'top');
        assert.equal(MASK.powerWield, true);
        assert.equal(MASK.name, 'Power-Wield Mask');
        assert.ok(MASK.body && MASK.body.sprite);
        assert.ok(ITEM_SPRITES.strongman_mask && SHEETS[ITEM_SPRITES.strongman_mask.sheet].tint);
        assert.equal(powerWielding({ top: MASK }), true);
        assert.equal(powerWielding({ top: ITEMS.rat_mask }), false);
        assert.equal(powerWielding({ top: null }), false);
    });
});

describe('wearing it, each hand holds a two-hander', () => {
    test('a two-hander in each hand: both stay, and both are listed as held', () => {
        const g = game({ top: MASK });
        const a = bag(g, GREAT), b = bag(g, AXE2);
        resolveUse(g, GREAT, null, 1, 'weapon', a);
        resolveUse(g, AXE2, null, 1, 'left', b);
        assert.equal(g.equipment.weapon, GREAT);
        assert.equal(g.equipment.left, AXE2);
        const held = heldInHands(g.equipment, handsOf);
        assert.deepEqual(held.map(h => [h.hand, h.def.id]), [['weapon', GREAT.id], ['left', AXE2.id]]);
    });

    test('two of the same two-hander are two held', () => {
        const eq = game({ top: MASK }).equipment;
        holdInHands(eq, GREAT, handsOf, 'weapon');
        holdInHands(eq, GREAT, handsOf, 'left');
        assert.equal(heldInHands(eq, handsOf).length, 2);
        settleHands(eq, handsOf);   // a load leaves the pair alone
        assert.equal(eq.weapon, GREAT);
        assert.equal(eq.left, GREAT);
    });

    test('one two-hander fills only its own hand', () => {
        const eq = game({ top: MASK }).equipment;
        holdInHands(eq, GREAT, handsOf, 'weapon');
        assert.equal(eq.left, null);
        assert.equal(heldInHands(eq, handsOf).length, 1);
    });

    test('the left plate may go Bare on a two-hander', () => {
        const g = game({ top: MASK, weapon: GREAT, left: AXE2 });
        assert.ok(gearOptions(g, 'left').some(o => o.id === '__bare__'));
        assert.match(unequipItem(g, 'left'), /Unequipped/);
        assert.equal(g.equipment.left, null);
        assert.equal(g.equipment.weapon, GREAT);
    });
});

describe('any other head slot refuses the second two-hander', () => {
    for (const [label, top] of [['no mask', null], ['the Rat Mask', ITEMS.rat_mask]]) {
        test(label, () => {
            const g = game({ top, weapon: GREAT, left: GREAT });
            const b = bag(g, AXE2);
            g.inventory.splice(b, 1);   // the caller takes it out of the bag first
            const msg = resolveUse(g, AXE2, null, 1, 'left', b);
            assert.equal(msg, POWER_WIELD_REFUSAL);
            assert.match(msg, /^\[TEXT/);
            assert.equal(g.equipment.weapon, GREAT);
            assert.equal(g.equipment.left, GREAT);
            assert.deepEqual(bagged(g), [AXE2.id], 'the refused one is back in the bag');
        });
    }

    test('without it, a two-hander still fills both hands as before', () => {
        const eq = game().equipment;
        holdInHands(eq, GREAT, handsOf, 'weapon');
        assert.equal(eq.left, GREAT);
        assert.equal(heldInHands(eq, handsOf).length, 1);
    });
});

describe('the mask coming on and off', () => {
    test('putting it on frees the left of a lone two-hander', () => {
        const g = game({ weapon: GREAT, left: GREAT });
        const m = bag(g, MASK);
        g.inventory.splice(m, 1);
        resolveUse(g, MASK, null, 1, 'weapon', m);
        assert.equal(g.equipment.top, MASK);
        assert.equal(g.equipment.weapon, GREAT);
        assert.equal(g.equipment.left, null);
    });

    test('taking it off bags the second two-hander and refills the left', () => {
        const g = game({ top: MASK, weapon: GREAT, left: AXE2 });
        unequipItem(g, 'top');
        assert.equal(g.equipment.top, null);
        assert.equal(g.equipment.weapon, GREAT);
        assert.equal(g.equipment.left, GREAT);
        assert.deepEqual(bagged(g).sort(), [AXE2.id, MASK.id].sort());
    });

    test('two copies of one two-hander: taking it off bags the second copy', () => {
        const g = game({ top: MASK, weapon: GREAT, left: GREAT });
        unequipItem(g, 'top');
        assert.equal(g.equipment.left, GREAT);
        assert.deepEqual(bagged(g).sort(), [GREAT.id, MASK.id].sort());
    });

    test('swapping to another mask does the same', () => {
        const g = game({ top: MASK, weapon: GREAT, left: AXE2 });
        const m = bag(g, ITEMS.rat_mask);
        g.inventory.splice(m, 1);
        resolveUse(g, ITEMS.rat_mask, null, 1, 'weapon', m);
        assert.equal(g.equipment.top.id, 'rat_mask');
        assert.equal(g.equipment.left, GREAT);
        assert.ok(bagged(g).includes(AXE2.id) && bagged(g).includes('strongman_mask'));
    });
});
