// objective-after-ending.test.js — OE1: once the credits have rolled, the objective
// and the Map's rings leave the vault and point at the Town (plans/oe1-objective-after-ending.md).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { QuestEngine, BETWEEN_QUESTS } from '../game/quests.js';
import { markEndingSeen, endingSeen } from '../game/credits.js';
import { SLOTS } from '../game/slots.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const ZONES = ['CARNIVAL', 'FACTORY', 'GRAVEYARD'];
const items = ZONES.map(z => SLOTS[`${z.toLowerCase()}.boss`].requiredDrop);

// Act 1 done, all three Act 2 items in the bag: the vault row's moment.
function makeGame() {
    const g = { map: null, inventory: items.map(id => ({ itemDef: { id, name: id }, count: 1 })), _log() {} };
    g.questEngine = new QuestEngine(g);
    g.questEngine.forceComplete('fix_car');
    g.questEngine.state.flags.bridgeRoute = 'ramp';
    g.questEngine.forceComplete('deliver_burger');
    return g;
}

describe('OE1: objective after the ending', () => {
    test('before the credits the vault row holds', () => {
        const qe = makeGame().questEngine;
        assert.equal(qe.betweenQuests().id, 'to_downtown');
        assert.deepEqual(qe.getTargetZones(), ['DOWNTOWN']);
    });

    test('once the ending is seen, the Town replaces the vault', () => {
        const g = makeGame();
        assert.equal(markEndingSeen(g), true);
        const qe = g.questEngine;
        assert.equal(qe.betweenQuests().id, 'back_to_town');
        assert.deepEqual(qe.getTargetZones(), ['TOWN']);
        assert.equal(qe.getHudText(), '[TEXT]');
        assert.ok(!qe.getTargetZones().includes('DOWNTOWN'));
    });

    test('the new row sits ahead of the vault row', () => {
        const ids = BETWEEN_QUESTS.map(r => r.id);
        assert.ok(ids.indexOf('back_to_town') < ids.indexOf('to_downtown'));
    });

    test('it survives a save and reload', () => {
        const g = makeGame();
        markEndingSeen(g);
        const saved = JSON.parse(JSON.stringify(g.questEngine.serialize()));
        const g2 = { map: null, inventory: g.inventory, _log() {} };
        g2.questEngine = new QuestEngine(g2);
        g2.questEngine.restore(saved);
        assert.ok(endingSeen(g2));
        assert.deepEqual(g2.questEngine.getTargetZones(), ['TOWN']);
    });

    test('an active quest still wins over the row', () => {
        const g = makeGame();
        markEndingSeen(g);
        g.questEngine.state.activeId = 'fix_car';
        g.questEngine.state.stageIndex = 0;
        assert.equal(g.questEngine.betweenQuests(), null);
    });
});
