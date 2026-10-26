// act2-bosses.test.js — each Act 2 zone has one boss in its slot, and beating it
// drops that zone's required item (plans/ab1-act2-placeholder-bosses.md).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { SLOTS, ENTRIES, resolveSpawn, defaultPicks, requiredDropFor, dropLineFor } from '../game/slots.js';
import { spawnEnemy } from '../game/enemies.js';
import { ITEMS } from '../game/items.js';
import { GameMap } from '../game/map.js';

const GAME = new URL('../game/', import.meta.url);
const mapData = (file) => JSON.parse(readFileSync(new URL(file, GAME), 'utf8'));

const ACT2 = [
    { slot: 'carnival.boss',  map: 'carnival-map.json',  entry: 'bigfoot',        item: 'act2_item_a', name: '[ITEM A]' },
    { slot: 'factory.boss',   map: 'factory-map.json',   entry: 'alien_invasion', item: 'act2_item_b', name: '[ITEM B]' },
    { slot: 'graveyard.boss', map: 'graveyard-map.json', entry: 'the_deity',      item: 'act2_item_c', name: '[ITEM C]' },
];

describe('Act 2: one boss per zone, each dropping its required item', () => {
    for (const z of ACT2) {
        describe(z.slot, () => {
            const data = mapData(z.map);
            const spawns = data.enemies;

            test('the slot is a boss slot on its own map, holding its zone\'s item', () => {
                const s = SLOTS[z.slot];
                assert.equal(s.kind, 'boss');
                assert.equal(s.map, z.map);
                assert.equal(s.requiredDrop, z.item);
                assert.equal(s.pool[0].entry, z.entry, 'the spine\'s first pool entry fills it today');
            });

            test('exactly one boss stands on the map, on open ground away from the arrival and the exits', () => {
                const here = spawns.filter(e => e.slot === z.slot);
                assert.equal(here.length, 1);
                const sp = here[0];
                const m = new GameMap(data, z.map);
                assert.ok(m.isWalkable(sp.x, sp.y), `(${sp.x},${sp.y}) is not walkable`);
                assert.ok(!m.getTransition(sp.x, sp.y), 'stands on an exit');
                assert.ok(Math.abs(sp.x - m.spawn.x) + Math.abs(sp.y - m.spawn.y) >= 10, 'stands on top of the arrival tile');
                assert.ok(!spawns.some(e => e !== sp && e.x === sp.x && e.y === sp.y), 'shares a tile with another spawn');
                const bosses = spawns.map(e => resolveSpawn(e, defaultPicks())).filter(e => e.boss);
                assert.equal(bosses.length, 1, 'the zone has exactly one boss');
            });

            test('the spawned boss is a boss, and beating it drops the item', () => {
                const sp = spawns.find(e => e.slot === z.slot);
                const enemy = spawnEnemy(resolveSpawn(sp, defaultPicks()));
                assert.equal(enemy.boss, true);
                assert.equal(enemy.slot, z.slot);
                assert.equal(enemy.type, ENTRIES[z.entry].type);
                assert.equal(requiredDropFor(enemy, spawns), z.item);
                // A save written before this slot existed carries no `slot`: the map still knows.
                assert.equal(requiredDropFor({ id: sp.id }, spawns), z.item);
                // No dropLine of its own: the death handler logs its generic line.
                assert.equal(dropLineFor(enemy, spawns), null);
            });

            test('the item is a quest item that cannot be lost, with its placeholder name', () => {
                const it = ITEMS[z.item];
                assert.ok(it, `${z.item} is not a real item`);
                assert.equal(it.id, z.item);
                assert.equal(it.questItem, true);
                assert.equal(it.consumable, false);
                assert.equal(it.name, z.name);
            });
        });
    }

    test('the three items are three different items', () => {
        assert.equal(new Set(ACT2.map(z => SLOTS[z.slot].requiredDrop)).size, 3);
    });
});

describe('the placeholders are obviously fake', () => {
    for (const z of ACT2) {
        test(`${z.entry}: [TEXT] barks, the existing Boss cell`, () => {
            const e = ENTRIES[z.entry];
            assert.equal(e.type, 'Boss');
            assert.ok(e.barks.length > 0 && e.barks.every(b => b === '[TEXT]'));
            assert.equal(ITEMS[z.item].description, '[TEXT]');
        });
    }

    test('the placeholder bosses never share a stat block object', () => {
        assert.notEqual(ENTRIES.bigfoot.loadout, ENTRIES.alien_invasion.loadout);
        assert.notEqual(ENTRIES.alien_invasion.barks, ENTRIES.the_deity.barks);
    });
});
