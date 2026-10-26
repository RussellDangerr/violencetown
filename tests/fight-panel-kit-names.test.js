// fight-panel-kit-names.test.js — the fight's target panel names every piece of
// an enemy's kit (plans/fx28-kit-panel-names.md). A weapon in a loadout used to
// fall through an ITEMS-only lookup and print its raw id.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import { targetPanel } from '../game/fight-panels.js';
import { SLOTS, ENTRIES, resolveSpawn } from '../game/slots.js';
import { spawnEnemy } from '../game/enemies.js';
import { WEAPONS } from '../game/weapons.js';
import { ITEMS } from '../game/items.js';

const GAME = new URL('../game/', import.meta.url);
const MAP_FILES = readdirSync(GAME).filter((f) => f.endsWith('-map.json')).sort();
const mapData = (file) => JSON.parse(readFileSync(new URL(file, GAME), 'utf8'));

// Every enemy a spawn can become: a slot spawn once per entry in its pool (a
// seed can pick any of them), anything else once.
function variants(spawn) {
    if (spawn && spawn.slot && SLOTS[spawn.slot]) {
        return SLOTS[spawn.slot].pool.map((p) => ({
            label: `${spawn.id} as ${p.entry}`,
            def: resolveSpawn(spawn, { [spawn.slot]: p.entry }),
        }));
    }
    return [{ label: spawn.id, def: resolveSpawn(spawn, {}) }];
}

// A kit row is named when its name is a real string that is not its own id.
function rawRows(panel) {
    return panel.kit.filter((k) => typeof k.name !== 'string' || !k.name || k.name === k.id);
}

describe('FX28: the target panel names every piece of an enemy\'s kit', () => {
    test('the Alien\'s panel reads the Ray Gun\'s name, not its id', () => {
        const alien = spawnEnemy(resolveSpawn({ id: 'factory_boss', slot: 'factory.boss', x: 0, y: 0 }, {}));
        assert.ok(alien.loadout.includes('ray_gun'), 'the Alien carries the Ray Gun');
        const row = targetPanel(alien).kit.find((k) => k.id === 'ray_gun');
        assert.ok(row, 'the Ray Gun has a row');
        assert.equal(row.name, WEAPONS.ray_gun.name);
        assert.notEqual(row.name, 'ray_gun');
    });

    test('an item still reads its ITEMS name, and an unknown id still shows as itself', () => {
        const kit = targetPanel({ loadout: ['bandage', 'no_such_thing'] }).kit;
        assert.equal(kit[0].name, ITEMS.bandage.name);
        assert.equal(kit[1].name, 'no_such_thing');
    });

    test('there are maps, and they hold enemies with kit, to walk', () => {
        assert.ok(MAP_FILES.length >= 10, `found ${MAP_FILES.length} maps`);
        let rows = 0;
        for (const f of MAP_FILES) {
            for (const s of mapData(f).enemies ?? []) {
                for (const v of variants(s)) rows += targetPanel(spawnEnemy(v.def)).kit.length;
            }
        }
        assert.ok(rows > 50, `walked ${rows} kit rows`);
    });

    for (const file of MAP_FILES) {
        test(`${file}: every enemy's kit resolves to a name`, () => {
            const bad = [];
            for (const s of mapData(file).enemies ?? []) {
                for (const v of variants(s)) {
                    for (const k of rawRows(targetPanel(spawnEnemy(v.def)))) bad.push(`${v.label}: ${k.id}`);
                }
            }
            assert.deepEqual(bad, []);
        });
    }

    test('every slot registry entry\'s kit resolves to a name, placed or not', () => {
        const bad = [];
        let carriers = 0;
        for (const [id, entry] of Object.entries(ENTRIES)) {
            const e = spawnEnemy({ ...structuredClone(entry), id, x: 0, y: 0 });
            // A harmless talker (the Crat) carries nothing; anything that fights must.
            if (e.loadout.length === 0) {
                assert.equal(entry.damage ?? 0, 0, `${id} fights, so it carries something`);
                continue;
            }
            carriers++;
            for (const k of rawRows(targetPanel(e))) bad.push(`${id}: ${k.id}`);
        }
        assert.ok(carriers > 0, 'at least one registry entry carries a kit');
        assert.deepEqual(bad, []);
    });

    test('the stock kits an unauthored fighter inherits resolve to names too', () => {
        const bad = [];
        for (const armor of [-100, -50, -20, -5, 5, 50]) {
            const e = spawnEnemy({ id: `stock_${armor}`, type: 'Thug', x: 0, y: 0, hp: 10, damage: 5, armor });
            assert.ok(e.loadout.length > 0, `armor ${armor} gets a stock kit`);
            for (const k of rawRows(targetPanel(e))) bad.push(`armor ${armor}: ${k.id}`);
        }
        assert.deepEqual(bad, []);
    });
});
