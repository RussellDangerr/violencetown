import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ITEMS, resolveUse } from '../game/items.js';
import { serialize } from '../game/save.js';

function stub(over = {}) {
    return { playerHp: 100, playerMaxHp: 100, playerMp: 100, playerMaxMp: 100, gold: 0, equipment: {}, tempEquips: [],
        buffs: [], boons: {}, enemies: [], playerX: 5, playerY: 5, map: { isWalkable: () => true },
        _entitiesInRadius: () => [], addBuff() {}, hasBuff: () => false, removeBuff() {}, ...over };
}

test('boon_poition is a permanent mana poition', () => {
    const d = ITEMS.boon_poition;
    assert.equal(d.name, '[TEXT]');
    assert.deepEqual(d.poition, { stat: 'mana', amount: 1, permanent: true });
});

test('drinking raises max MP and MP and records it', () => {
    const g = stub();
    resolveUse(g, ITEMS.boon_poition, null);
    assert.equal(g.playerMaxMp, 101);
    assert.equal(g.playerMp, 101);
    assert.deepEqual(g.boons, { mana: 1 });
    resolveUse(g, ITEMS.boon_poition, null);
    assert.equal(g.boons.mana, 2);
});

test('throwing it leaves the record alone and shatters', () => {
    const g = stub();
    const msg = resolveUse(g, { ...ITEMS.boon_poition, useType: 'throw' }, { dx: 1, dy: 0 });
    assert.match(msg, /shatters harmlessly/);
    assert.equal(g.playerMaxMp, 100);
    assert.deepEqual(g.boons, {});
});

test('save leaves boons out while empty, keeps them once drunk', () => {
    const base = { map: { url: 'town-map.json' }, turn: 1, playerX: 1, playerY: 1, playerHp: 1, playerMaxHp: 1,
        playerMp: 1, playerMaxMp: 1, facing: 'down', gold: 0, rng: { getState: () => 0 }, equipment: {}, tempEquips: [],
        buffs: [], inventory: [], selectedSlot: -1, groundItems: [], containers: [], enemies: [], _tileDiffs: [] };
    assert.equal('boons' in serialize({ ...base, boons: {} }).player, false);
    assert.equal('boons' in serialize({ ...base }).player, false);
    assert.deepEqual(serialize({ ...base, boons: { mana: 2 } }).player.boons, { mana: 2 });
});

test('nothing lists it; Quests tab line and new-game clear exist', () => {
    assert.ok(readFileSync('game/main.js', 'utf8').includes('this.boons = {}'));
    assert.match(readFileSync('game/renderer.js', 'utf8'), /\[TEXT\] \$\{boonN\}/);
    assert.equal(readFileSync('game/items.js', 'utf8').split('boon_poition').length - 1, 2);
});
