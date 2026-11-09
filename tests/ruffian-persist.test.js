import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Enemy, spawnEnemy, muggerRecords } from '../game/enemies.js';

const def = { id: 'ruf1', type: 'Ruffian', x: 3, y: 3, hp: 20, maxHp: 20, damage: 3, gold: 5, loadout: [], tag: 'mugger' };

describe('BS2 the Ruffian keeps your gold', () => {
    test('a record is taken from a mugger who took gold, and respawn gives it back', () => {
        const live = spawnEnemy(def, new Set());
        live._tookGold = 10; live.gold += 10;
        const rec = muggerRecords([live], {});
        assert.deepEqual(rec, { ruf1: 10 });
        const back = spawnEnemy(def, new Set(), null, null, rec);
        assert.equal(back.gold, 5 + 10);
        assert.equal(back._tookGold, 10);
    });
    test('without a record he spawns as the map made him', () => {
        const e = spawnEnemy(def, new Set(), null, null, {});
        assert.equal(e.gold, 5);
        assert.ok(!(e._tookGold > 0));
    });
    test('a dead one, or one who lost the gold, drops out; other zones are kept', () => {
        const live = spawnEnemy(def, new Set());
        live._tookGold = 10; live.gold = 15;
        live.entity.alive = false;
        assert.deepEqual(muggerRecords([live], { ruf1: 10, other: 4 }), { other: 4 });
        const broke = spawnEnemy(def, new Set()); broke._tookGold = 10; broke.gold = 0;
        assert.deepEqual(muggerRecords([broke], { ruf1: 10 }), {});
    });
    test('a looted (mugged) one does not get it back', () => {
        const e = spawnEnemy(def, new Set(['ruf1']), null, null, { ruf1: 10 });
        assert.equal(e.gold, 0);
    });
    test('the took-gold mark survives his own save and load', () => {
        const live = spawnEnemy(def, new Set());
        live._tookGold = 10;
        const back = Enemy.fromSave(JSON.parse(JSON.stringify(live.toSave())));
        assert.equal(back._tookGold, 10);
        const clean = Enemy.fromSave(JSON.parse(JSON.stringify(spawnEnemy(def, new Set()).toSave())));
        assert.ok(!(clean._tookGold > 0));
    });
});
