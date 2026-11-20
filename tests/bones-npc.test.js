import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { snapshotOf, attitudeOf } from '../game/bones.js';
import { SLOTS, ECHO_SLOTS, pickSlots, defaultPicks, echoSpawn } from '../game/slots.js';
import { spawnEnemy } from '../game/enemies.js';
import { ENEMY_SPRITES, SHEETS, spriteVariant, spriteFrame } from '../game/sprites.js';

const snap = (over = {}) => ({
    v: 1, at: 1, hp: 5, maxHp: 20, mp: 1, maxMp: 5, gold: 3, turn: 9, zones: 1, map: null,
    gear: { weapon: 'wooden_sword', body: 'catalytic_converter' }, peak: 0, harm: 0, ...over,
});
const SPAWN = { id: 'old-self', slot: 'town.echo', x: 21, y: 16 };
const town = JSON.parse(readFileSync(new URL('../game/town-map.json', import.meta.url), 'utf8'));

test('a snapshot records how the run went', () => {
    const s = snapshotOf({ equipment: {}, _peakDisposition: 30, _muggedIds: new Set(['a']), _robbed: { b: {} }, _respawnLists: { z: [{ id: 'c' }] } });
    assert.equal(s.peak, 30);
    assert.equal(s.harm, 3);
});

test('attitude: harm makes a foe, warmth a friend, else neutral; old snapshots are neutral', () => {
    assert.equal(attitudeOf(snap({ harm: 1, peak: 50 })), 'foe');
    assert.equal(attitudeOf(snap({ peak: 5 })), 'friend');
    assert.equal(attitudeOf(snap()), 'neutral');
    const old = snap(); delete old.peak; delete old.harm;
    assert.equal(attitudeOf(old), 'neutral');
    assert.equal(attitudeOf(null), 'neutral');
});

test('no snapshot, no old character', () => {
    assert.equal(echoSpawn(SPAWN, null), null);
    assert.equal(echoSpawn(SPAWN, { v: 0 }), null);
});

test('the old character wears your gear, never a required or quest item', () => {
    const e = echoSpawn(SPAWN, snap());
    assert.equal(e.tag, 'old_self');
    assert.deepEqual(e.equipped, ['wooden_sword']);
    assert.equal(e.slot, 'town.echo');
    for (const slot of Object.values(SLOTS)) if (slot.requiredDrop) assert.ok(!e.equipped.includes(slot.requiredDrop));
    assert.ok(!(e.loadout || []).includes('catalytic_converter'));
});

test('attitude shapes the NPC: a foe fights, a friend and a neutral do not', () => {
    const foe = spawnEnemy(echoSpawn(SPAWN, snap({ harm: 2 })));
    assert.ok(foe.damage > 0);
    for (const s of [snap({ peak: 9 }), snap()]) {
        const e = spawnEnemy(echoSpawn(SPAWN, s));
        assert.equal(e.damage, 0);
    }
    assert.ok(spawnEnemy(echoSpawn(SPAWN, snap({ peak: 9 }))).disposition > 0);
});

test('barks are plain', () => {
    const e = echoSpawn(SPAWN, snap());
    assert.deepEqual(e.barks, ['Your old self is standing here.', 'Your old self is waiting.']);
});

test('the echo slot is no anchor: no game rolls it, so picks do not shift', () => {
    assert.ok(!('town.echo' in pickSlots(12345)));
    assert.ok(!('town.echo' in defaultPicks()));
    assert.ok(!('town.echo' in SLOTS), 'it is in no anchor registry: no pick, no save field, no sweep row');
    assert.deepEqual(Object.keys(pickSlots(777)), Object.keys(pickSlots(777, { ...SLOTS })));
});

test('it has its own spot, not a map spawn, and takes no Locked character place', () => {
    const { x, y, } = ECHO_SLOTS['town.echo'].at;
    assert.ok(!town.enemies.some(e => e.slot === 'town.echo' || e.id === ECHO_SLOTS['town.echo'].spawn));
    assert.ok(town.enemies.every(e => !(e.x === x && e.y === y)));
    assert.equal(ECHO_SLOTS['town.echo'].requiredDrop, undefined);
    assert.equal(ECHO_SLOTS['town.echo'].map, 'town-map.json');
});

test('it is drawn as your sprite, tinted pale, and nobody else is', () => {
    const e = echoSpawn({ id: 'old-self', slot: 'town.echo', x: 21, y: 16 }, snap());
    const info = spriteVariant(ENEMY_SPRITES[e.type], e);
    assert.equal(info.sheet, 'oldSelfTint');
    assert.ok(SHEETS.oldSelfTint.tint);
    assert.deepEqual([info.col, info.row], [1, 7]);
    assert.equal(spriteFrame(info, e).col, 1, 'no facing columns of the urban sheet');
    assert.equal(spriteVariant(ENEMY_SPRITES.Violencian, { id: 'townie-e' }).sheet, 'rpgUrban');
});

test('main.js stands the old character up from the newest kept snapshot, none without', () => {
    const src = readFileSync(new URL('../game/main.js', import.meta.url), 'utf8');
    assert.match(src, /this\._echoEnemies\?\.\(url, dead\)/);
    const i = src.indexOf('_echoEnemies(url, dead');
    assert.match(src.slice(i, i + 700), /readSnapshots\(localStorage\)\.pop\(\)[\s\S]*if \(e\) out\.push\(e\)/);
});
