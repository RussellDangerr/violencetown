// quest-boon-reward.test.js — BP3: each quest pays one boon poition, once per game
// (plans/bp3-quests-pay-boon-poition.md; BPR2 a: one kind of item, no per-quest table).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { QUESTS, QuestEngine, ACT2_QUESTS } from '../game/quests.js';
import { SLOTS } from '../game/slots.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

function fakeGame() {
    const g = {
        gold: 0, granted: [], logs: [],
        _grantItem(id, msg) { g.granted.push(id); if (msg) g.logs.push(msg); return true; },
        _grantBoon() { return g._grantItem('boon_poition', '[TEXT]'); },
        _log(m) { g.logs.push(m); },
        _render() {}, _startMainQuest2() {}, _openBridgeIfCarFixed() {},
    };
    g.questEngine = new QuestEngine(g);
    return g;
}
const boons = (g) => g.granted.filter(id => id === 'boon_poition').length;
function finish(g, id) {
    g.questEngine.state.activeId = id;
    g.questEngine.state.stageIndex = 0;
    g.questEngine._complete();
}

describe('quest completion pays a boon', () => {
    for (const id of ['canyon_escape', 'deliver_burger', 'fix_car']) {
        test(`${id} pays one boon poition, once`, () => {
            const g = fakeGame();
            finish(g, id);
            assert.equal(boons(g), 1);
            finish(g, id);
            assert.equal(boons(g), 1);
        });
    }
    test('deliver_burger keeps its 50 GP', () => {
        const g = fakeGame();
        finish(g, 'deliver_burger');
        assert.equal(g.gold, 50);
    });
    test('a reload (flags kept) never pays again', () => {
        const g = fakeGame();
        finish(g, 'canyon_escape');
        const saved = JSON.parse(JSON.stringify(g.questEngine.state));
        const g2 = fakeGame();
        g2.questEngine.state = saved;
        finish(g2, 'canyon_escape');
        assert.equal(boons(g2), 0);
    });
    test('each pay logs a line', () => {
        const g = fakeGame();
        finish(g, 'canyon_escape');
        assert.ok(g.logs.length >= 1);
    });
});

describe('Act 2 claims pay a boon', () => {
    for (const zone of Object.keys(ACT2_QUESTS)) {
        test(`claiming the ${zone} item pays one boon, once`, () => {
            const g = fakeGame();
            g.questEngine.state.flags[`act2_${zone}`] = 'collect';
            assert.equal(g.questEngine.act2Claim(zone), true);
            assert.equal(boons(g), 1);
            assert.equal(g.granted[0], SLOTS[ACT2_QUESTS[zone].slot].requiredDrop);
            assert.equal(g.questEngine.act2Claim(zone), false);
            assert.equal(boons(g), 1);
        });
    }
    test('a refused item pays no boon and claims nothing', () => {
        const g = fakeGame();
        g._grantItem = () => false; g._grantBoon = () => false;
        const zone = Object.keys(ACT2_QUESTS)[0];
        g.questEngine.state.flags[`act2_${zone}`] = 'collect';
        assert.equal(g.questEngine.act2Claim(zone), false);
        assert.equal(g.questEngine.state.flags[`boon_act2_${zone}`], undefined);
    });
});

describe('six sources in all', () => {
    test('three quests plus the three Act 2 zones', () => {
        assert.equal(Object.keys(QUESTS).length, 3);
        assert.equal(Object.keys(ACT2_QUESTS).length, 3);
    });
});

describe('main.js wiring', () => {
    test('Game pays the boon through _grantItem', async () => {
        const { readFileSync } = await import('node:fs');
        const src = readFileSync(new URL('../game/main.js', import.meta.url), 'utf8');
        assert.match(src, /_grantBoon\(\) \{ return this\._grantItem\('boon_poition'/);
    });
});
