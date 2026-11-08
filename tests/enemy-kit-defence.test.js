// enemy-kit-defence.test.js — EK1 (plans/ek1-hurt-enemy-uses-kit.md), EKR1 pick a.
//
// A hurt enemy with no heal in its kit drinks its Defence Poition, and failing that
// puts on an armour piece. The pure choice, the application, the hit it now soaks,
// and a real turn through tickNpcState are each pinned; then Thieve's Gear with two
// pieces worn.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { kitChoice, KIT_HP_FLOOR } from '../game/ai.js';
import { ITEMS, kitHealValue, applyKitItem, kitDefenceValue, kitGearWeight } from '../game/items.js';
import { Enemy } from '../game/enemies.js';
import { tickNpcState } from '../game/npc.js';
import { attack } from '../game/combat.js';
import { gearTake, pickGear } from '../game/theft.js';
import { resolveItemDef } from '../game/item-registry.js';

const extraFor = (defended = false) => ({
    defenceOf: kitDefenceValue, gearWeightOf: kitGearWeight, defended,
});
const choose = (hp, ids, defended = false, alreadyHealing = false) =>
    kitChoice(hp, 100, ids.map(id => ITEMS[id]), (d) => kitHealValue(d, false), alreadyHealing, extraFor(defended));

describe('kitChoice — heal, then poition, then armour', () => {
    test('a Defence Poition is drunk when there is no heal', () => {
        const c = choose(KIT_HP_FLOOR, ['rock', 'defence_poition', 'foil_hat']);
        assert.equal(c.kind, 'defence');
        assert.equal(c.def.id, 'defence_poition');
    });

    test('a heal still comes first, poition or no poition', () => {
        const c = choose(50, ['defence_poition', 'foil_hat', 'bandage']);
        assert.equal(c.kind, 'heal');
        assert.equal(c.def.id, 'bandage');
    });

    test('and while a dose is still regenerating it waits, rather than falling through', () => {
        assert.equal(choose(50, ['defence_poition', 'foil_hat', 'bandage'], false, true), null);
    });

    test('with no poition it puts on the heaviest armour piece', () => {
        const c = choose(50, ['rock', 'foil_hat', 'cardboard_cuirass']);
        assert.equal(c.kind, 'armour');
        assert.ok(kitGearWeight(ITEMS.cardboard_cuirass) > kitGearWeight(ITEMS.foil_hat), 'the premise');
        assert.equal(c.def.id, 'cardboard_cuirass');
    });

    test('a poition is not drunk on top of a running one: armour goes on instead', () => {
        const c = choose(50, ['defence_poition', 'foil_hat'], true);
        assert.equal(c.kind, 'armour');
    });

    test('the threshold is unchanged: above 70 HP, or at full, it does nothing', () => {
        assert.equal(choose(KIT_HP_FLOOR + 1, ['defence_poition', 'foil_hat']), null);
        assert.equal(choose(100, ['defence_poition', 'foil_hat']), null);
    });

    test('Bandage and Soap are not clothes; a weapon is never worn', () => {
        assert.equal(choose(50, ['soap', 'rock']), null);
        assert.equal(kitGearWeight(ITEMS.soap), 0);
    });

    test('without the extra argument it behaves exactly as before', () => {
        assert.equal(kitChoice(50, 100, [ITEMS.defence_poition, ITEMS.foil_hat], (d) => kitHealValue(d, false)), null);
    });
});

describe('the defence buff is read on the hits an enemy takes', () => {
    const fungus = () => new Enemy({ id: 'f', type: 'Fungus', x: 1, y: 1, armor: 0 });

    test('a Defence Poition makes each blow land 4 softer, and only while it runs', () => {
        const e = fungus();
        const before = attack({ name: 'p' }, e.entity, 10).dealt;
        assert.equal(before, 10);
        e.entity.hp = e.entity.maxHp;
        assert.ok(applyKitItem(ITEMS.defence_poition, e, false));
        assert.equal(attack({ name: 'p' }, e.entity, 10).dealt, 6, '10 - 4');
        for (let i = 0; i < 6; i++) e.tickBuffs({});
        assert.equal(e.hasBuff('defence'), false, 'worn off after its 6 turns');
        assert.equal(attack({ name: 'p' }, e.entity, 10).dealt, 10);
    });

    test('a hit still lands for at least 1', () => {
        const e = fungus();
        applyKitItem(ITEMS.defence_poition, e, false);
        assert.equal(attack({ name: 'p' }, e.entity, 2).dealt, 1);
    });

    test('it does not show up as an own field on the body (saves and snapshots stay as they were)', () => {
        const e = fungus();
        assert.equal(Object.keys(e.entity).includes('guardOf'), false);
        assert.equal(JSON.stringify(e.entity).includes('guardOf'), false);
    });
});

describe('a piece put on adds to the armour and counts as worn', () => {
    test('armour goes up, the piece is worn, and Thieve takes the heavier of two', () => {
        const e = new Enemy({ id: 'f', type: 'Fungus', x: 1, y: 1, armor: 0,
            equipped: ['cardboard_cuirass'], loadout: ['foil_hat'] });
        e.entity.armor = ITEMS.cardboard_cuirass.armor;
        const start = e.entity.armor;
        assert.ok(applyKitItem(ITEMS.foil_hat, e, false));
        assert.equal(e.entity.armor, start + ITEMS.foil_hat.armor);
        assert.deepEqual(e.equipped, ['cardboard_cuirass', 'foil_hat']);

        const pick = pickGear(e, resolveItemDef);
        const took = gearTake(e, resolveItemDef);
        assert.equal(took.id, pick.def.id);
        const other = took.id === 'foil_hat' ? 'cardboard_cuirass' : 'foil_hat';
        assert.equal(e.entity.armor, ITEMS[other].armor, 'the other piece still counts');
        assert.deepEqual(e.equipped, [other]);
    });

    test('it works on an enemy that authored no worn gear at all', () => {
        const e = new Enemy({ id: 'f', type: 'Fungus', x: 1, y: 1, armor: -10 });
        applyKitItem(ITEMS.foil_hat, e, false);
        assert.equal(e.entity.armor, -10 + ITEMS.foil_hat.armor);
        assert.deepEqual(e.equipped, ['foil_hat']);
    });

    test('a non-wearable does nothing', () => {
        const e = new Enemy({ id: 'f', type: 'Fungus', x: 1, y: 1, armor: 0 });
        assert.equal(applyKitItem(ITEMS.soap, e, false), null);
        assert.equal(applyKitItem(ITEMS.rock, e, false), null);
        assert.equal(e.entity.armor, 0);
    });
});

describe('a real hurt enemy does it in a real turn', () => {
    const openRoom = ['...........', '...........', '...........', '...........', '...........'];
    function makeGame(px, py) {
        const H = openRoom.length, W = openRoom[0].length;
        return {
            playerX: px, playerY: py, enemies: [], containers: [], turn: 0, _MOVE_MS: 150,
            map: { isWalkable: (x, y) => x >= 0 && y >= 0 && x < W && y < H },
            rng: { pick: (a) => a[0], float: () => 0.5 },
            damageTaken: 0,
            applyDamageToPlayer(d) { this.damageTaken += d; },
        };
    }
    const hurt = (g, hp, over = {}) => {
        const e = new Enemy({ id: 'k1', type: 'Fungus', x: 5, y: 2, sightRange: 8, facing: 'S', damage: 9, ...over });
        e.entity.hp = hp;
        g.enemies.push(e);
        return e;
    };
    const text = (msgs) => msgs.map(m => m.text || m).join(' ');

    test('it drinks the poition as its turn, with today\'s log line, and the poition leaves the kit', () => {
        const g = makeGame(5, 3);
        const e = hurt(g, 60, { loadout: ['defence_poition', 'rock'] });
        const msgs = tickNpcState(g, e, 1);
        assert.match(text(msgs), /digs out \[Defence Poition\] and uses it\./);
        assert.deepEqual(e.loadout, ['rock']);
        assert.equal(e.hasBuff('defence'), true);
        assert.equal(g.damageTaken, 0, 'drinking IS the turn');
        assert.equal(attack({ name: 'p' }, e.entity, 10).dealt, 6);
    });

    test('with no poition it puts a piece on: kit to worn, armour up', () => {
        const g = makeGame(5, 3);
        const e = hurt(g, 60, { loadout: ['foil_hat', 'rock'] });
        const armourBefore = e.entity.armor;
        const msgs = tickNpcState(g, e, 1);
        assert.match(text(msgs), /digs out \[Foil Hat\] and uses it\./);
        assert.deepEqual(e.loadout, ['rock']);
        assert.deepEqual(e.equipped, ['foil_hat']);
        assert.equal(e.entity.armor, armourBefore + ITEMS.foil_hat.armor);
    });

    test('a heal in the kit is still used first', () => {
        const g = makeGame(5, 3);
        const e = hurt(g, 50, { loadout: ['defence_poition', 'bandage'] });
        tickNpcState(g, e, 1);
        assert.equal(e.entity.hp, 75);
        assert.deepEqual(e.loadout, ['defence_poition']);
        assert.equal(e.hasBuff('defence'), false);
    });

    test('one item a turn: the second piece waits for the next turn', () => {
        const g = makeGame(5, 3);
        const e = hurt(g, 60, { loadout: ['foil_hat', 'cardboard_cuirass'] });
        tickNpcState(g, e, 1);
        assert.equal(e.loadout.length, 1);
        tickNpcState(g, e, 2);
        assert.equal(e.loadout.length, 0);
        assert.equal(e.equipped.length, 2);
    });

    test('above the kit threshold it fights instead', () => {
        const g = makeGame(5, 3);
        const e = hurt(g, KIT_HP_FLOOR + 5, { loadout: ['defence_poition', 'foil_hat'] });
        tickNpcState(g, e, 1);
        assert.deepEqual(e.loadout, ['defence_poition', 'foil_hat']);
        assert.ok(g.damageTaken > 0);
    });
});
