// costume.test.js — CO1: a costume takes every slot and brings its own kit
// (plans/co1-costume-takes-every-slot.md).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ITEMS, resolveUse, unequipItem } from '../game/items.js';
import { WEAPONS } from '../game/weapons.js';
import { rankOf } from '../game/skills.js';
import { resolveItemDef } from '../game/item-registry.js';
import { COSTUMES, SLOT_KEYS, wearCostume, removeCostume, toggleCostume, dropCostume, isCostumed } from '../game/costumes.js';
import { serialize, migrate } from '../game/save.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const mainSrc = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');

// A stand-in game with the player's own, non-starter gear and a rank of their own.
function game() {
    return {
        equipment: {
            weapon: WEAPONS.wooden_sword, left: null, top: ITEMS.rat_mask,
            bottom: null, front: null, back: ITEMS.red_cape, sides: null,
        },
        skills: { light_fingers: 9 },
        inventory: [], tempEquips: [],
        _addToInventory(d) { this.inventory.push({ itemDef: d, count: 1 }); },
        map: { url: 'town-map.json' }, turn: 1, rng: { getState: () => 1 },
        playerX: 1, playerY: 1, playerHp: 10, playerMaxHp: 10, playerMp: 1, playerMaxMp: 1,
        facing: 'down', gold: 0, buffs: [],
    };
}
const ids = (eq) => Object.fromEntries(SLOT_KEYS.map(k => [k, eq[k] ? eq[k].id : null]));

describe('the test costume', () => {
    test('is a bag item that names a costume, with placeholder copy', () => {
        const it = ITEMS.test_costume;
        assert.equal(it.useType, 'costume');
        assert.ok(COSTUMES[it.costume]);
        assert.match(it.name, /^\[/);
        assert.ok(it.fallbackColor, 'a tinted placeholder icon');
    });

    test('every slot of the kit resolves to a real item', () => {
        const c = COSTUMES.test_costume;
        assert.deepEqual(Object.keys(c.kit).sort(), [...SLOT_KEYS].sort());
        for (const k of SLOT_KEYS) if (c.kit[k]) assert.ok(resolveItemDef(c.kit[k]), k);
    });

    test('wearing fills every slot with the kit', () => {
        const g = game();
        const msg = wearCostume(g, 'test_costume');
        assert.ok(msg);
        assert.equal(isCostumed(g), true);
        const kit = COSTUMES.test_costume.kit;
        assert.deepEqual(ids(g.equipment), kit);
        assert.notEqual(g.equipment.top.id, 'rat_mask', 'your own mask is replaced');
    });

    test('its fixed stats are the kit pieces\' own', () => {
        const g = game();
        wearCostume(g, 'test_costume');
        const armour = ['top', 'bottom', 'front', 'back', 'sides'].reduce((n, k) => n + (g.equipment[k].armor || 0), 0);
        assert.equal(armour, 2 + 2 + 4 + 1 + 1);
    });

    test('taking it off brings your own gear back exactly', () => {
        const g = game();
        const before = ids(g.equipment);
        const mask = g.equipment.top;
        wearCostume(g, 'test_costume');
        assert.ok(removeCostume(g));
        assert.deepEqual(ids(g.equipment), before);
        assert.equal(g.equipment.top, mask, 'the very same defs');
        assert.equal(g.costume, null);
        assert.equal(removeCostume(g), null, 'nothing to take off');
    });

    test('using the item twice toggles it on, then off', () => {
        const g = game();
        const before = ids(g.equipment);
        toggleCostume(g, ITEMS.test_costume);
        assert.equal(isCostumed(g), true);
        toggleCostume(g, ITEMS.test_costume);
        assert.deepEqual(ids(g.equipment), before);
    });
});

describe('COR2: no changing a piece while it is worn', () => {
    test('equipping a piece is refused and the piece stays in the bag', () => {
        const g = game();
        wearCostume(g, 'test_costume');
        const kit = ids(g.equipment);
        const msg = resolveUse(g, ITEMS.rat_mask, null, 1, 'weapon', -1);
        assert.match(msg, /costume/);
        assert.deepEqual(ids(g.equipment), kit);
        assert.deepEqual(g.inventory.map(s => s.itemDef.id), ['rat_mask']);
    });

    test('a weapon swap is refused too', () => {
        const g = game();
        wearCostume(g, 'test_costume');
        resolveUse(g, WEAPONS.great_sword, null, 1, 'weapon', -1);
        assert.equal(g.equipment.weapon.id, 'wooden_sword');
        assert.equal(g.inventory.length, 1);
    });

    test('unequipping a piece is refused', () => {
        const g = game();
        wearCostume(g, 'test_costume');
        assert.match(unequipItem(g, 'top'), /costume/);
        assert.equal(g.equipment.top.id, 'foil_hat');
        assert.equal(g.inventory.length, 0);
    });

    test('with no costume on, equipping works as before', () => {
        const g = game();
        resolveUse(g, ITEMS.foil_hat, null, 1, 'weapon', -1);
        assert.equal(g.equipment.top.id, 'foil_hat');
    });
});

describe('COR3: its own skill ranks', () => {
    test('worn, the costume\'s ranks apply; off, yours come back', () => {
        const g = game();
        assert.equal(rankOf(g.skills, 'light_fingers'), 2);
        wearCostume(g, 'test_costume');
        assert.deepEqual(g.skills, COSTUMES.test_costume.skills);
        g.skills = { light_fingers: 99 };   // uses earned in the costume rest with it
        removeCostume(g);
        assert.deepEqual(g.skills, { light_fingers: 9 });
    });

    test('death drops the costume and gives your ranks back', () => {
        const g = game();
        wearCostume(g, 'test_costume');
        dropCostume(g);
        assert.equal(g.costume, null);
        assert.deepEqual(g.skills, { light_fingers: 9 });
    });
});

describe('saving', () => {
    const roundTrip = (g) => migrate(JSON.parse(JSON.stringify(serialize(g))));

    test('no costume leaves the save field out', () => {
        assert.equal('costume' in serialize(game()).player, false);
        assert.ok(!roundTrip(game()).player.costume);
    });

    test('wearing it survives a save and load, stash and all', () => {
        const g = game();
        wearCostume(g, 'test_costume');
        const raw = roundTrip(g);
        assert.equal(raw.player.costume.id, 'test_costume');
        assert.equal(raw.player.costume.stash.equipment.top, 'rat_mask');
        assert.equal(raw.player.equipment.top, 'foil_hat');
        assert.deepEqual(raw.player.skills, COSTUMES.test_costume.skills);
        // What loadInto does with it, through the same helper:
        const mod = raw.player.costume;
        assert.deepEqual(mod.stash.skills, { light_fingers: 9 });
    });

    test('loadInto rebuilds the stash defs', async () => {
        const { costumeFromSave } = await import('../game/costumes.js');
        const g = game();
        wearCostume(g, 'test_costume');
        const c = costumeFromSave(roundTrip(g).player.costume);
        assert.equal(c.stash.equipment.top, ITEMS.rat_mask);
        assert.equal(c.stash.equipment.weapon, WEAPONS.wooden_sword);
        assert.equal(c.stash.equipment.bottom, null);
    });

    test('a damaged costume entry loads as none', async () => {
        const { sanitizeCostume } = await import('../game/costumes.js');
        for (const bad of [null, 5, {}, { id: 'nope', stash: {} }, { id: 'test_costume' }, { id: 'test_costume', stash: {} }]) {
            assert.equal(sanitizeCostume(bad), null);
        }
    });
});

describe('main.js wiring', () => {
    test('both use paths toggle a costume and spend the turn', () => {
        assert.match(mainSrc, /item\.useType === 'costume'[\s\S]{0,160}_toggleCostume\?\.\(item\)/);
        assert.match(mainSrc, /isCostume \? this\._toggleCostume\?\.\(def\)/);
        assert.match(mainSrc, /equips \|\| isCostume/);
    });
    test('death and a new game drop the costume', () => {
        assert.equal((mainSrc.match(/_dropCostume\?\.\(\)/g) || []).length, 2);
    });
});
