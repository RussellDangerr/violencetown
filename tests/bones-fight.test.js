import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SLOTS, ECHO_SLOTS, pickSlots, echoSpawn, echoStands } from '../game/slots.js';
import { spawnEnemy } from '../game/enemies.js';

const snap = (over = {}) => ({
    v: 1, at: 1, hp: 5, maxHp: 37, mp: 1, maxMp: 5, gold: 3, turn: 9, zones: 1, map: null,
    gear: { weapon: 'wooden_sword', body: 'cardboard_cuirass' }, peak: 0, harm: 0, ...over,
});
const grave = JSON.parse(readFileSync(new URL('../game/graveyard-map.json', import.meta.url), 'utf8'));
const G = ECHO_SLOTS['graveyard.echo'];
const T = ECHO_SLOTS['town.echo'];
const at = (s, slotId) => ({ id: s.spawn, slot: slotId, x: s.at.x, y: s.at.y });

test('a foe stands in the Graveyard only; a friend or neutral stays in Town only', () => {
    const foe = snap({ harm: 2 }), friend = snap({ peak: 9 }), neutral = snap();
    assert.ok(echoStands(G, foe) && !echoStands(T, foe));
    assert.ok(echoStands(T, friend) && !echoStands(G, friend));
    assert.ok(echoStands(T, neutral) && !echoStands(G, neutral));
});

test('no snapshot means no ghost, and nothing throws', () => {
    for (const s of [null, undefined, {}, { v: 0 }, snap({ maxHp: 0 })]) {
        assert.equal(echoStands(G, s), false);
        assert.equal(echoStands(T, s), false);
        assert.doesNotThrow(() => echoSpawn(at(G, 'graveyard.echo'), s));
    }
});

test('the Graveyard foe is hostile, with its snapshot HP and gear', () => {
    const e = spawnEnemy(echoSpawn(at(G, 'graveyard.echo'), snap({ harm: 1 })));
    assert.ok(e.damage > 0);
    assert.ok(e.disposition < 0);
    assert.equal(e.entity.maxHp, 37);
    assert.equal(e.entity.hp, 37);
    assert.equal(e.tag, 'old_self');
});

test('beating it drops one of its snapshot items', () => {
    const e = spawnEnemy(echoSpawn(at(G, 'graveyard.echo'), snap({ harm: 1 })));
    assert.equal(e.loadout.filter(id => id === 'wooden_sword').length, 1);
    assert.ok(!(e.equipped || []).includes('wooden_sword'), 'the drop is not also worn');
});

test('a friend stays friendly and keeps the old stats', () => {
    const e = spawnEnemy(echoSpawn(at(T, 'town.echo'), snap({ peak: 9 })));
    assert.equal(e.damage, 0);
    assert.ok(e.disposition > 0);
    assert.equal(e.entity.maxHp, 100);
});

test('the Graveyard spot is open ground, and the echo is still no anchor', () => {
    const { x, y } = G.at;
    assert.equal(grave.tiles[y * grave.width + x], 52);
    assert.ok(!grave.props.some(p => p.x === x && p.y === y));
    assert.ok(!grave.enemies.some(e => e.x === x && e.y === y));
    assert.ok(!('graveyard.echo' in SLOTS));
    assert.deepEqual(Object.keys(pickSlots(4242)), Object.keys(pickSlots(4242, { ...SLOTS })));
});

test('main.js asks echoStands before it spawns', () => {
    const src = readFileSync(new URL('../game/main.js', import.meta.url), 'utf8');
    assert.match(src, /!echoStands\(slot, snap\)/);
});
