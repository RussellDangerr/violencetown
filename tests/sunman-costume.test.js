// sunman-costume.test.js — CO2: absorbing Sun Man gives you his costume
// (plans/co2-sun-man-costume.md).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS } from '../game/items.js';
import { WEAPONS } from '../game/weapons.js';
import { COSTUMES, SLOT_KEYS, toggleCostume, isCostumed } from '../game/costumes.js';
import { beastFell, FINALE_PHASE2 } from '../game/finale-setpiece.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

function game() {
    return {
        equipment: { weapon: WEAPONS.wooden_sword, left: null, top: ITEMS.rat_mask, bottom: null, front: null, back: null, sides: null },
        skills: { light_fingers: 9 },
        inventory: [], events: [], logs: [],
        questEngine: { state: { flags: {} } },
        _addToInventory(d) { this.inventory.push(d); return true; },
        emitGameEvent(type, payload) { this.events.push({ type, payload }); },
        _log(m) { this.logs.push(m); },
    };
}
const beast = { tag: FINALE_PHASE2.beastTag, id: FINALE_PHASE2.beastId };

describe('Sun Man costume', () => {
    test('the item names a costume that exists and fills every slot', () => {
        const it = ITEMS.sun_man_costume;
        assert.equal(it.useType, 'costume');
        const c = COSTUMES[it.costume];
        assert.ok(c);
        for (const k of SLOT_KEYS) assert.ok(k in c.kit, `kit has ${k}`);
    });

    test('winning phase 2 gives it once', () => {
        const g = game();
        assert.equal(beastFell(g, beast), true);
        assert.equal(g.inventory.length, 1);
        assert.equal(g.inventory[0].id, 'sun_man_costume');
        beastFell(g, beast);   // a second fall, or a reload with the flag saved
        assert.equal(g.inventory.length, 1);
    });

    test('another enemy falling gives nothing', () => {
        const g = game();
        assert.equal(beastFell(g, { tag: 'rat' }), false);
        assert.equal(g.inventory.length, 0);
    });

    test('after the win it is worn and taken off like any costume', () => {
        const g = game();
        const before = { ...g.equipment };
        beastFell(g, beast);
        const def = g.inventory[0];
        assert.ok(toggleCostume(g, def));
        assert.ok(isCostumed(g));
        assert.equal(g.costume.id, 'sun_man_costume');
        assert.notEqual(g.equipment.top, before.top);
        assert.ok(toggleCostume(g, def));
        assert.equal(isCostumed(g), false);
        assert.deepEqual(g.equipment, before);
        assert.equal(g.skills.light_fingers, 9);
    });
});
