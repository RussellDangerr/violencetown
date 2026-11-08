// act2-quests.test.js — the three Act 2 quests (plans/ab3-act2-quests.md): a quest per zone of
// its ruled verb, the boss fight a step, the item handed over only at the last step, quests held
// beside the active quest, and every line a placeholder.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { QuestEngine, ACT2_QUESTS, ACT2_VERBS } from '../game/quests.js';
import { SLOTS, resolveSpawn, defaultPicks, requiredDropFor } from '../game/slots.js';
import { spawnEnemy } from '../game/enemies.js';
import { ITEMS } from '../game/items.js';
import { GameMap } from '../game/map.js';

const GAME = new URL('../game/', import.meta.url);
const mapData = (file) => JSON.parse(readFileSync(new URL(file, GAME), 'utf8'));

// A stand-in game: a bag, a zone, and the two calls the quests make.
function stand(zoneName = 'TOWN') {
    const game = {
        inventory: [], map: { zoneName }, logs: [], turn: 0,
        _log(t) { this.logs.push(t); }, _render() {},
        _grantItem(id) { this.inventory.push({ itemDef: ITEMS[id] }); return true; },
    };
    game.questEngine = new QuestEngine(game);
    return game;
}
const holds = (g, id) => g.inventory.some(s => s.itemDef.id === id);
const bossOf = (zone) => {
    const q = ACT2_QUESTS[zone];
    const spawns = mapData(q.map).enemies;
    return { enemy: spawnEnemy(resolveSpawn(spawns.find(e => e.slot === q.slot), defaultPicks())), spawns };
};

const ZONES = [
    { zone: 'FACTORY', verb: 'given', slot: 'factory.boss', map: 'factory-map.json' },
    { zone: 'GRAVEYARD', verb: 'taken', slot: 'graveyard.boss', map: 'graveyard-map.json' },
    { zone: 'CARNIVAL', verb: 'earned', slot: 'carnival.boss', map: 'carnival-map.json' },
];

describe('each Act 2 zone has a quest of its ruled verb, the boss a step in it (SP1R1)', () => {
    test('the verbs: Factory given, Graveyard taken, Carnival earned', () => {
        assert.deepEqual(ACT2_VERBS, { FACTORY: 'given', GRAVEYARD: 'taken', CARNIVAL: 'earned' });
        assert.deepEqual(Object.keys(ACT2_QUESTS).sort(), ['CARNIVAL', 'FACTORY', 'GRAVEYARD']);
    });

    for (const z of ZONES) {
        test(`${z.zone}: ${z.verb}, on its boss slot and map, with a boss step then a collect step`, () => {
            const q = ACT2_QUESTS[z.zone];
            assert.equal(q.verb, z.verb);
            assert.equal(q.slot, z.slot);
            assert.equal(q.map, z.map);
            assert.equal(SLOTS[z.slot].viaQuest, true);
            assert.deepEqual(Object.keys(q.steps), ['boss', 'collect']);
        });
    }

    test('the frozen area and the Sewer are no Act 2 quest: their drops stay on the floor', () => {
        assert.ok(!SLOTS['sewer.boss'].viaQuest);
        assert.ok(!SLOTS['frozen.boss'].viaQuest);
    });
});

describe('finishing the quest yields the item; skipping it does not', () => {
    for (const z of ZONES) {
        const item = SLOTS[z.slot].requiredDrop;
        describe(z.zone, () => {
            test('the quest stands at its boss step from the start, and the bag is empty', () => {
                const g = stand(z.zone);
                g.questEngine.emit('map_entered', { map: z.map });
                assert.equal(g.questEngine.act2Step(z.zone), 'boss');
                assert.ok(!holds(g, item));
            });

            test('beating the boss moves the quest on and tells the death handler to skip the floor drop', () => {
                const g = stand(z.zone);
                g.questEngine.emit('map_entered', { map: z.map });
                const { enemy, spawns } = bossOf(z.zone);
                assert.equal(requiredDropFor(enemy, spawns), item, 'the slot still holds the item');
                assert.equal(g.questEngine.act2BossDown(enemy, spawns), true);
                assert.equal(g.questEngine.act2Step(z.zone), 'collect');
                assert.ok(!holds(g, item), 'the boss gave nothing');
            });

            test('skipping the quest: a boss beaten and the last step never taken leaves the bag empty', () => {
                const g = stand(z.zone);
                g.questEngine.emit('map_entered', { map: z.map });
                const { enemy, spawns } = bossOf(z.zone);
                g.questEngine.act2BossDown(enemy, spawns);
                g.questEngine.emit('examine', { targetId: 'something-else' });
                assert.ok(!holds(g, item));
                assert.notEqual(g.questEngine.act2Step(z.zone), 'done');
            });

            test('the last step before the boss falls gives nothing', () => {
                const g = stand(z.zone);
                g.questEngine.emit('map_entered', { map: z.map });
                g.questEngine.emit('examine', { targetId: ACT2_QUESTS[z.zone].claimId });
                assert.ok(!holds(g, item));
                assert.equal(g.questEngine.act2Step(z.zone), 'boss');
            });

            test('finishing: the claim spot after the boss puts the item in the bag, once', () => {
                const g = stand(z.zone);
                g.questEngine.emit('map_entered', { map: z.map });
                const { enemy, spawns } = bossOf(z.zone);
                g.questEngine.act2BossDown(enemy, spawns);
                g.questEngine.emit('examine', { targetId: ACT2_QUESTS[z.zone].claimId });
                assert.ok(holds(g, item));
                assert.equal(g.questEngine.act2Step(z.zone), 'done');
                g.questEngine.emit('examine', { targetId: ACT2_QUESTS[z.zone].claimId });
                assert.equal(g.inventory.filter(s => s.itemDef.id === item).length, 1, 'a second go gives no second');
            });

            test('a boss beaten again after the quest is done does not reopen it', () => {
                const g = stand(z.zone);
                g.questEngine.emit('map_entered', { map: z.map });
                const { enemy, spawns } = bossOf(z.zone);
                g.questEngine.act2BossDown(enemy, spawns);
                g.questEngine.act2Claim(z.zone);
                assert.equal(g.questEngine.act2BossDown(enemy, spawns), true);
                assert.equal(g.questEngine.act2Step(z.zone), 'done');
            });
        });
    }

    test('a boss that is not an Act 2 boss is not the quests\' business', () => {
        const g = stand('SEWER');
        const spawns = mapData('sewer-map.json').enemies;
        const wr = spawnEnemy(resolveSpawn(spawns.find(e => e.slot === 'sewer.boss'), defaultPicks()));
        assert.equal(g.questEngine.act2BossDown(wr, spawns), false);
    });
});

describe('the quests sit beside the active quest and the save', () => {
    test('Act 2 progress mid-delivery leaves the burger delivery exactly as it was', () => {
        const g = stand('FACTORY');
        g.questEngine.start('deliver_burger');
        const before = JSON.stringify({ a: g.questEngine.state.activeId, i: g.questEngine.state.stageIndex });
        g.questEngine.emit('map_entered', { map: 'factory-map.json' });
        const { enemy, spawns } = bossOf('FACTORY');
        g.questEngine.act2BossDown(enemy, spawns);
        assert.equal(JSON.stringify({ a: g.questEngine.state.activeId, i: g.questEngine.state.stageIndex }), before);
        assert.equal(g.questEngine.act2Step('FACTORY'), 'collect');
    });

    test('all three can be open at once, in any order', () => {
        const g = stand();
        for (const z of ['GRAVEYARD', 'CARNIVAL']) {
            const { enemy, spawns } = bossOf(z);
            g.questEngine.act2BossDown(enemy, spawns);
        }
        assert.deepEqual(['FACTORY', 'GRAVEYARD', 'CARNIVAL'].map(z => g.questEngine.act2Step(z)), ['boss', 'collect', 'collect']);
    });

    test('the save carries nothing for them until a boss falls (quest 1 walks the Factory and its saves must not change)', () => {
        const g = stand();
        g.questEngine.start('fix_car');
        g.questEngine.emit('map_entered', { map: 'sewer-map.json' });
        g.questEngine.emit('map_entered', { map: 'factory-map.json' });
        assert.ok(!Object.keys(g.questEngine.serialize().flags).some(k => k.startsWith('act2_')));
    });

    test('a step survives save and load', () => {
        const g = stand();
        const { enemy, spawns } = bossOf('CARNIVAL');
        g.questEngine.act2BossDown(enemy, spawns);
        const h = stand();
        h.questEngine.restore(JSON.parse(JSON.stringify(g.questEngine.serialize())));
        assert.equal(h.questEngine.act2Step('CARNIVAL'), 'collect');
    });

    test('the HUD line is the zone\'s quest step while you stand in it, the usual line elsewhere', () => {
        const g = stand('GRAVEYARD');
        g.questEngine.emit('map_entered', { map: 'graveyard-map.json' });
        assert.equal(g.questEngine.getHudText(), '[TEXT]');
        assert.equal(g.questEngine.act2Here().step, 'boss');
        g.map.zoneName = 'TOWN';
        assert.equal(g.questEngine.act2Here(), null);
    });

    test('a finished quest no longer speaks for the zone', () => {
        const g = stand('FACTORY');
        g.questEngine.emit('map_entered', { map: 'factory-map.json' });
        const { enemy, spawns } = bossOf('FACTORY');
        g.questEngine.act2BossDown(enemy, spawns);
        g.questEngine.act2Claim('FACTORY');
        assert.equal(g.questEngine.act2Here(), null);
    });
});

describe('the claim spot stands on each map, and every line is a placeholder', () => {
    for (const z of ZONES) {
        test(`${z.zone}: the claim spot is an examinable standing on a prop, beside open ground`, () => {
            const data = mapData(z.map);
            const m = new GameMap(data, z.map);
            const ex = data.examinables.filter(e => e.id === ACT2_QUESTS[z.zone].claimId);
            assert.equal(ex.length, 1);
            assert.equal(ex[0].text, '[TEXT]');
            assert.ok(data.props.some(p => p.x === ex[0].x && p.y === ex[0].y), 'stands on no prop');
            const open = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => m.isWalkable(ex[0].x + dx, ex[0].y + dy));
            assert.ok(open, 'nowhere to stand beside it');
        });
    }

    test('the quest titles, objectives and hand-over lines are all [TEXT]', () => {
        for (const q of Object.values(ACT2_QUESTS)) {
            assert.equal(q.title, '[TEXT]');
            for (const st of Object.values(q.steps)) assert.equal(st.objective, '[TEXT]');
        }
        const g = stand('FACTORY');
        g.questEngine.emit('map_entered', { map: 'factory-map.json' });
        const { enemy, spawns } = bossOf('FACTORY');
        g.questEngine.act2BossDown(enemy, spawns);
        g.questEngine.act2Claim('FACTORY');
        assert.ok(g.logs.length > 0 && g.logs.every(l => l === '[TEXT]'), JSON.stringify(g.logs));
    });
});
