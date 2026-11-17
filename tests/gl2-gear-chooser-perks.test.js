// GL2: the GEAR chooser rows carry GL1's perk phrases and the renderer fits them.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { equipOptions, armourPerkPhrases } from '../game/inspector.js';
import { gearPerkLine } from '../game/renderer.js';
import { ITEMS, ARMOR_IDS } from '../game/items.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
const bagOf = (...ids) => ids.map(id => ({ itemDef: ITEMS[id], count: 1 }));
const rowFor = (slot, id) => equipOptions(slot, null, bagOf(id)).find(o => o.id === id);
const measure = (s) => s.length * 6;

describe('equipOptions perks', () => {
    test('every armour row carries the GL1 phrases and keeps sludgeImmune', () => {
        for (const id of ARMOR_IDS) {
            const d = ITEMS[id];
            const row = rowFor(d.equipSlot, id);
            assert.ok(row, id);
            assert.deepEqual(row.perks, armourPerkPhrases(d), id);
            assert.equal(row.sludgeImmune, !!d.sludgeImmune, id);
        }
    });
    test('the Shoe Bags say sludge-proof; the Lava Cape says +6 melee; masks and caps have phrases', () => {
        const shoes = ARMOR_IDS.filter(id => ITEMS[id].sludgeImmune);
        assert.ok(shoes.length);
        for (const id of shoes) assert.ok(rowFor(ITEMS[id].equipSlot, id).perks.includes('sludge-proof'));
        assert.deepEqual(rowFor('back', 'lava_cape').perks, ['+6 melee']);
        assert.deepEqual(rowFor('back', 'red_cape').perks, []);
        assert.ok(rowFor('top', 'rat_mask').perks.includes('walks through grates'));
        assert.ok(rowFor('top', 'strongman_mask').perks.includes('a two-hander in each hand'));
        assert.ok(rowFor('top', 'delivery_cap_grey').perks.some(p => /^foes carry \+\d+% gold$/.test(p)));
    });
    test('the Bare row has no perks', () => {
        const bare = equipOptions('top', ITEMS.rat_mask, []).find(o => o.id === '__bare__');
        assert.deepEqual(bare.perks, []);
    });
});

describe('gearPerkLine', () => {
    test('no perk, no line', () => {
        assert.equal(gearPerkLine({ perks: [] }, 200, measure).text, '');
        assert.equal(gearPerkLine({ id: '__bare__' }, 200, measure).text, '');
    });
    test('short text is drawn whole at full size', () => {
        assert.deepEqual(gearPerkLine({ perks: ['sludge-proof'] }, 200, measure), { text: 'sludge-proof', scale: 1 });
    });
    test('long text shrinks to fit, never wider than the room', () => {
        const r = gearPerkLine({ perks: ['a two-hander in each hand'] }, 120, measure);
        assert.ok(r.scale < 1 && r.scale >= 0.6);
        assert.ok(measure(r.text) * r.scale <= 120 + 1e-6);
    });
    test('text that cannot fit even shrunk is cut, still inside the room', () => {
        const r = gearPerkLine({ perks: ['a two-hander in each hand, and then some more words'] }, 120, measure);
        assert.ok(measure(r.text) * r.scale <= 120 + 1e-6);
    });
});
