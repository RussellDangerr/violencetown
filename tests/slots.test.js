// slots.test.js — the slot registry (plans/slot-registry.md, plans/spine.md §2).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import { SLOTS, ENTRIES, pickSlots, defaultPicks, resolveSpawn, requiredDropFor, dropLineFor, slotIdOf } from '../game/slots.js';
import { Enemy, spawnEnemy } from '../game/enemies.js';
import { ITEMS } from '../game/items.js';
import { validateContent } from '../game/content-validate.js';

const GAME = new URL('../game/', import.meta.url);
const mapData = (file) => JSON.parse(readFileSync(new URL(file, GAME), 'utf8'));
const allMaps = () => readdirSync(GAME).filter(f => f.endsWith('-map.json')).map(file => ({ file, data: mapData(file) }));

describe('SL-4: a required item belongs to the slot, so every entry drops it', () => {
    const required = Object.entries(SLOTS).filter(([, s]) => s.requiredDrop);

    test('there is at least one required-item slot to check (the Sewer boss)', () => {
        assert.ok(required.some(([id]) => id === 'sewer.boss'));
    });

    test('all four boss slots on the spine carry a required item', () => {
        const ids = required.map(([id]) => id).sort();
        assert.deepEqual(ids, ['carnival.boss', 'factory.boss', 'frozen.boss', 'graveyard.boss', 'sewer.boss']);
    });

    for (const [slotId, slot] of required) {
        for (const { entry } of slot.pool) {
            test(`${slotId} filled by '${entry}' drops ${slot.requiredDrop}`, () => {
                const spawns = mapData(slot.map).enemies;
                const spawn = spawns.find(s => s.slot === slotId);
                assert.ok(spawn, `${slotId} stands nowhere on ${slot.map}`);
                const enemy = spawnEnemy(resolveSpawn(spawn, { [slotId]: entry }));
                assert.equal(enemy.type, ENTRIES[entry].type, 'the pick is not the one standing there');
                // From the live enemy alone, and from the map when the enemy came from an old save.
                assert.equal(requiredDropFor(enemy, []), slot.requiredDrop);
                assert.equal(requiredDropFor({ id: spawn.id }, spawns), slot.requiredDrop);
                assert.ok(ITEMS[slot.requiredDrop], `${slot.requiredDrop} is not a real item`);
            });
        }
    }

    test('the death handler drops by slot, never by the Were-Rat\'s tag', () => {
        const src = readFileSync(new URL('main.js', GAME), 'utf8');
        const body = src.slice(src.indexOf('    _handleEnemyDeath(enemyObj) {'), src.indexOf('(Remembrance Rings) The Were-Rat also'));
        assert.match(body, /requiredDropFor\(enemyObj/);
        assert.doesNotMatch(body, /tag === 'wererat_boss' && ITEMS\.catalytic_converter/);
    });

    test('an enemy outside every slot guarantees nothing', () => {
        assert.equal(requiredDropFor(new Enemy({ id: 'rat1', type: 'Rat', x: 0, y: 0 }), []), null);
        assert.equal(requiredDropFor(null), null);
    });

    test('the drop line names whoever filled the slot', () => {
        const spawn = mapData('sewer-map.json').enemies.find(s => s.slot === 'sewer.boss');
        const enemy = spawnEnemy(resolveSpawn(spawn, defaultPicks()));
        assert.equal(dropLineFor(enemy), '[The Were-Rat drops your cataclysmic converter!]');
        assert.equal(dropLineFor({ id: 'x', slot: 'sewer.boss', type: 'Bigfoot' }), '[The Bigfoot drops your cataclysmic converter!]');
    });
});

describe('the picks', () => {
    const fixture = { 'a.boss': { kind: 'boss', map: 'x', pool: [{ entry: 'one', weight: 3 }, { entry: 'two', weight: 1 }] } };

    test('the same seed gives the same picks', () => {
        for (const seed of [0, 1, 42, 0xFFFFFFFF]) assert.deepEqual(pickSlots(seed, fixture), pickSlots(seed, fixture));
    });

    test('a weighted pool is honoured across seeds', () => {
        let ones = 0;
        const N = 4000;
        for (let seed = 0; seed < N; seed++) if (pickSlots(seed, fixture)['a.boss'] === 'one') ones++;
        assert.ok(ones / N > 0.70 && ones / N < 0.80, `weight 3:1 picked 'one' ${ones}/${N}`);
    });

    test('adding a slot does not reshuffle the picks of slots sorted before it', () => {
        const more = { ...fixture, 'z.boss': { kind: 'boss', map: 'y', pool: [{ entry: 'p' }, { entry: 'q' }] } };
        for (let seed = 0; seed < 200; seed++) assert.equal(pickSlots(seed, more)['a.boss'], pickSlots(seed, fixture)['a.boss']);
    });

    test('a pool of one always picks its one (SL-3): today the Sewer boss is the Were-Rat', () => {
        for (let seed = 0; seed < 50; seed++) assert.equal(pickSlots(seed)['sewer.boss'], 'wererat');
        assert.deepEqual(defaultPicks(), {
            'sewer.boss': 'wererat',
            'carnival.boss': 'bigfoot',
            'factory.boss': 'alien_invasion',
            'graveyard.boss': 'the_deity',
            'frozen.boss': 'siberia',
            'sewer.character': 'crat',
        });
    });

    test('a pool of one always picks its one: today the Sewer character is the Crat', () => {
        for (let seed = 0; seed < 50; seed++) assert.equal(pickSlots(seed)['sewer.character'], 'crat');
    });
});

describe('resolveSpawn: the map says where, the registry says who', () => {
    const spawn = { id: 'wererat', slot: 'sewer.boss', x: 17, y: 10, facing: 'N' };

    test('the entry stands at the spawn, with the spawn\'s id, place, facing and slot', () => {
        const r = resolveSpawn(spawn, defaultPicks());
        assert.equal(r.type, 'Wererat');
        assert.equal(r.tag, 'wererat_boss');
        assert.deepEqual([r.id, r.x, r.y, r.facing, r.slot], ['wererat', 17, 10, 'N', 'sewer.boss']);
    });

    test('a spawn outside every slot passes through untouched', () => {
        const plain = { id: 'r', type: 'Rat', x: 1, y: 2 };
        assert.equal(resolveSpawn(plain, defaultPicks()), plain);
    });

    test('a pick the pool no longer holds falls back to the pool\'s first entry', () => {
        assert.equal(resolveSpawn(spawn, { 'sewer.boss': 'gone' }).type, 'Wererat');
        assert.equal(resolveSpawn(spawn, null).type, 'Wererat');
    });

    test('the registry is never mutated through a spawned enemy', () => {
        const before = JSON.stringify(ENTRIES.wererat);
        const e = spawnEnemy(resolveSpawn(spawn, defaultPicks()));
        e.loadout.length = 0;
        e.barks.push('x');
        assert.equal(JSON.stringify(ENTRIES.wererat), before);
    });

    test('the spawned Were-Rat is the boss it always was', () => {
        const e = spawnEnemy(resolveSpawn(spawn, defaultPicks()));
        assert.equal(e.boss, true);
        assert.equal(e.sewerDweller, true);
        assert.equal(e.gold, 44);
        assert.equal(e.entity.armor, 6);
        assert.equal(e.damage, 12);
        assert.equal(e.slot, 'sewer.boss');
        assert.equal(slotIdOf(e), 'sewer.boss');
    });
});

describe('Enemy.slot in the save', () => {
    test('written only when set, so every other enemy saves as it did before slots', () => {
        const plain = JSON.parse(JSON.stringify(new Enemy({ id: 'r', type: 'Rat', x: 0, y: 0 }).toSave()));
        assert.equal('slot' in plain, false);
        const boss = new Enemy({ id: 'wererat', type: 'Wererat', x: 0, y: 0, slot: 'sewer.boss' });
        assert.equal(Enemy.fromSave(JSON.parse(JSON.stringify(boss.toSave()))).slot, 'sewer.boss');
    });
});

describe('content validation sees the slots', () => {
    test('the shipped maps and registry are clean', () => {
        assert.deepEqual(validateContent(allMaps()).problems, []);
    });

    test('a slot standing nowhere, an unknown entry or an unknown item is a problem', () => {
        const slots = {
            'a.boss': { kind: 'boss', map: 'sewer-map.json', requiredDrop: 'no_such_item', pool: [{ entry: 'ghost' }] },
        };
        const entries = { real: { type: 'Wererat', loadout: ['no_such_thing'] } };
        const p = validateContent(allMaps(), { slots, entries }).problems.join('\n');
        assert.match(p, /'a\.boss' pools unknown entry 'ghost'/);
        assert.match(p, /'a\.boss' requires unknown item 'no_such_item'/);
        assert.match(p, /'a\.boss' must stand exactly once/);
        assert.match(p, /entry 'real' carries unknown item 'no_such_thing'/);
        assert.match(p, /unknown slot 'sewer\.boss'/);
    });
});
