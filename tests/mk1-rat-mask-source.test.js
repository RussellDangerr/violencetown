// mk1-rat-mask-source.test.js — the Rat Mask has exactly one source in a new game: the floor
// of the Sewer's north side room (plans/mk1-find-the-rat-mask.md).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GameMap } from '../game/map.js';
import { ITEMS, canStandOn } from '../game/items.js';

const GAME = new URL('../game/', import.meta.url);
const mapFiles = fs.readdirSync(GAME).filter(f => f.endsWith('-map.json'));
const load = f => JSON.parse(fs.readFileSync(new URL(f, GAME), 'utf8'));
const ID = 'rat_mask';

// Every place a map hands out an item: ground items, shop stock, containers, examinable grants.
function mapSources() {
    const found = [];
    for (const f of mapFiles) {
        const m = load(f);
        for (const it of m.items || []) if (it.type === ID) found.push({ file: f, kind: 'items', x: it.x, y: it.y });
        for (const e of m.enemies || []) if ((e.stock || []).includes(ID) || (e.loadout || []).includes(ID)) found.push({ file: f, kind: 'enemy', id: e.id });
        for (const c of m.containers || []) if ((c.contents || []).includes(ID)) found.push({ file: f, kind: 'container' });
        for (const ex of m.examinables || []) if (ex.grants === ID) found.push({ file: f, kind: 'examinable' });
    }
    return found;
}

describe('the Rat Mask has one source', () => {
    test('exactly one map source: a floor item in the Sewer north room', () => {
        const src = mapSources();
        assert.equal(src.length, 1, JSON.stringify(src));
        assert.equal(src[0].file, 'sewer-north-map.json');
        assert.equal(src[0].kind, 'items');
    });

    test('no loadout, slot entry or quest grant names it', async () => {
        const { ENTRIES } = await import('../game/slots.js');
        for (const [id, e] of Object.entries(ENTRIES)) assert.ok(!(e.loadout || []).includes(ID), `slots.js entry ${id}`);
        for (const f of ['slots.js', 'quests.js']) {
            assert.ok(!fs.readFileSync(new URL(f, GAME), 'utf8').includes(ID), `${f} mentions ${ID}`);
        }
    });

    test('the item exists', () => assert.ok(ITEMS[ID]));
});

describe('its tile', () => {
    const data = load('sewer-north-map.json');
    const spot = data.items.find(i => i.type === ID);
    const map = new GameMap(data);

    test('is open floor, clear of every character and the door', () => {
        assert.equal(map.isWalkable(spot.x, spot.y), true);
        const near = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
        for (const e of data.enemies) assert.ok(near(spot, e) >= 4, `${e.id} is too close`);
        for (const t of data.transitions) assert.ok(near(spot, t) >= 4, 'the door is too close');
        assert.ok(!(data.examinables || []).some(e => e.x === spot.x && e.y === spot.y));
    });

    test('is reachable on foot from the spawn, 8-way with no corner cutting, without the mask', () => {
        const key = (x, y) => `${x},${y}`;
        const seen = new Set([key(data.spawn.x, data.spawn.y)]);
        const q = [[data.spawn.x, data.spawn.y]];
        while (q.length) {
            const [x, y] = q.shift();
            for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
                if (!dx && !dy) continue;
                const nx = x + dx, ny = y + dy;
                if (seen.has(key(nx, ny)) || !canStandOn(map, nx, ny)) continue;
                if (dx && dy && !(canStandOn(map, x + dx, y) && canStandOn(map, x, y + dy))) continue;
                seen.add(key(nx, ny));
                q.push([nx, ny]);
            }
        }
        assert.ok(seen.has(key(spot.x, spot.y)));
    });

    test('the pickup is remembered under the key a reload checks', () => {
        const collected = new Set([`sewer-north-map.json|${spot.x}|${spot.y}|${ID}`]);
        assert.ok(map.itemSpawns.every(s => collected.has(`sewer-north-map.json|${s.x}|${s.y}|${s.type}`)));
    });
});

describe('taken once, it stays taken across a save and reload', () => {
    test('the pickup key survives JSON and the loader, and the spawn filter then skips it', async () => {
        const { migrate } = await import('../game/save.js');
        const map = new GameMap(load('sewer-north-map.json'));
        const url = 'sewer-north-map.json';
        const keyOf = s => `${url}|${s.x}|${s.y}|${s.type}`;
        const blob = JSON.parse(JSON.stringify({ world: { collectedItems: map.itemSpawns.map(keyOf) } }));
        const loaded = new Set(migrate(blob).world.collectedItems);
        assert.equal(map.itemSpawns.filter(s => !loaded.has(keyOf(s))).length, 0, 'taken: nothing respawns');
        assert.equal(map.itemSpawns.filter(s => !new Set().has(keyOf(s))).length, 1, 'untaken: it spawns');
    });
});

describe('worn, it opens the Sewer grate', () => {
    test('canStandOn is true at (2,4) with the mask and false without', () => {
        const sewer = new GameMap(load('sewer-map.json'));
        assert.equal(canStandOn(sewer, 2, 4), false);
        assert.equal(canStandOn(sewer, 2, 4, { equipment: { top: ITEMS[ID] } }), true);
    });
});
