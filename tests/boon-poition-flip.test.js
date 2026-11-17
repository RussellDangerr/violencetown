import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS, resolveThrow } from '../game/items.js';
import { Enemy } from '../game/enemies.js';

function foe(x, y, extra = {}) {
    return new Enemy({ id: 'e' + x + y, type: 'rat', x, y, hp: 10, behavior: null, ...extra });
}
function stub(enemies) {
    return { playerX: 5, playerY: 5, enemies, map: { isWalkable: () => true },
        _entitiesInRadius: () => [], buffs: [], boons: {} };
}
const D = ITEMS.boon_poition;

test('thrown on a hostile it lowers max MP and MP by the full amount', () => {
    const e = foe(7, 5);
    const msg = resolveThrow(stub([e]), D, null, 1, { x: 7, y: 5 });
    assert.equal(e.entity.maxMp, 99);
    assert.equal(e.entity.mp, 99);
    assert.match(msg, /lowers .* max MP by 1/);
});

test('a neighbour of the impact tile is untouched (no burst)', () => {
    const a = foe(7, 5), b = foe(8, 5);
    resolveThrow(stub([a, b]), D, null, 1, { x: 7, y: 5 });
    assert.equal(a.entity.maxMp, 99);
    assert.equal(b.entity.maxMp, 100);
});

test('an empty tile gets nothing and the throw is spent', () => {
    const e = foe(8, 5);
    const msg = resolveThrow(stub([e]), D, null, 1, { x: 7, y: 5 });
    assert.equal(e.entity.maxMp, 100);
    assert.match(msg, /shatters harmlessly/);
});

test('a friendly on the tile gets nothing', () => {
    const e = foe(7, 5);
    e.allegiance = 'neutral';
    resolveThrow(stub([e]), D, null, 1, { x: 7, y: 5 });
    assert.equal(e.entity.maxMp, 100);
});

test('the lowered max survives save and load', () => {
    const e = foe(7, 5);
    resolveThrow(stub([e]), D, null, 1, { x: 7, y: 5 });
    const back = Enemy.fromSave(JSON.parse(JSON.stringify(e.toSave())));
    assert.equal(back.entity.maxMp, 99);
    assert.equal(back.entity.mp, 99);
    assert.equal('maxMp' in foe(1, 1).toSave(), false);
});
