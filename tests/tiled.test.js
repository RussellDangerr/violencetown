// tiled.test.js — the Tiled pipeline (plans/tiled-pipeline.md) never damages a map.
//
// The maps are written in three JSON styles, some with floats like 4.0 that a
// parse-and-reserialise would flatten, so export edits the text surgically. These
// tests hold it to that: an untouched round trip changes nothing, and a real edit
// changes only the bytes it should.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { toTiled, fromTiled, buildTileset } from '../tools/tiled.mjs';
import { TILE_BY_ID } from '../game/data.js';

const GAME_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'game');
const mapFiles = readdirSync(GAME_DIR).filter(f => f.endsWith('-map.json')).sort();
const read = f => readFileSync(join(GAME_DIR, f), 'utf8');
const copy = o => JSON.parse(JSON.stringify(o));
const objectOf = (tmj, key, index) => tmj.layers.find(l => l.name === key).objects
    .find(o => o.properties.some(p => p.name === 'vt_index' && p.value === index));

describe('round trip', () => {
    for (const file of mapFiles) {
        test(`${file}: import then export untouched is byte-identical`, () => {
            const text = read(file);
            const r = fromTiled(text, copy(toTiled(text)));
            assert.deepEqual(r.errors, []);
            assert.deepEqual(r.warnings, []);
            assert.equal(r.text, text);
        });
    }
});

describe('edits', () => {
    const text = read('canyon-map.json');
    const before = JSON.parse(text);

    test('a painted tile and a moved enemy change only those values', () => {
        const tmj = copy(toTiled(text));
        const n = 3 * before.width + 4;
        tmj.layers[0].data[n] = 50 + 1;                 // GRAVE_DIRT, gid = id + 1
        objectOf(tmj, 'enemies', 1).x -= 16;            // one cell west
        const r = fromTiled(text, tmj);
        assert.deepEqual(r.errors, []);
        const after = JSON.parse(r.text);
        assert.equal(after.tiles[n], 50);
        assert.equal(after.tiles.filter((t, i) => t !== before.tiles[i]).length, 1);
        assert.equal(after.enemies[1].x, before.enemies[1].x - 1);
        after.tiles = before.tiles; after.enemies[1].x = before.enemies[1].x;
        assert.deepEqual(after, before);
        // Text outside the tiles array is untouched apart from the one number.
        const tail = s => s.slice(s.indexOf('"enemies"'));
        assert.equal(tail(r.text).replace(`"x": ${before.enemies[1].x - 1}`, `"x": ${before.enemies[1].x}`), tail(text));
    });

    test('an untouched off-grid light keeps its half-cell value', () => {
        const town = read('town-map.json');
        const r = fromTiled(town, copy(toTiled(town)));
        assert.ok(JSON.parse(r.text).lights.some(l => !Number.isInteger(l.y)));
    });

    test('resizing rewrites width, height and the tiles', () => {
        const tmj = copy(toTiled(text));
        const W = before.width + 2, H = before.height;
        tmj.width = W; tmj.layers[0].width = W;
        tmj.layers[0].data = Array.from({ length: W * H }, () => 52 + 1);
        const after = JSON.parse(fromTiled(text, tmj).text);
        assert.equal(after.width, W);
        assert.equal(after.tiles.length, W * H);
    });

    test('empty, flipped and unknown tiles are refused, and nothing is written', () => {
        for (const gid of [0, 0x80000000 + 53, 999]) {
            const tmj = copy(toTiled(text));
            tmj.layers[0].data[5] = gid;
            const r = fromTiled(text, tmj);
            assert.equal(r.errors.length, 1, `gid ${gid}`);
            assert.equal(r.text, text);
        }
    });

    test('objects added or deleted in Tiled are reported, not applied', () => {
        const tmj = copy(toTiled(text));
        const enemies = tmj.layers.find(l => l.name === 'enemies');
        enemies.objects.push({ id: 99, name: 'New Rat', x: 16, y: 16, width: 16, height: 16, properties: [] });
        enemies.objects.splice(0, 1);
        const r = fromTiled(text, tmj);
        assert.equal(r.text, text);
        assert.equal(r.warnings.length, 2);
    });
});

describe('tileset', () => {
    test('Tiled tile N is game tile N, for every tile id', () => {
        const { recipe, tsx } = buildTileset();
        const ids = Object.keys(TILE_BY_ID).map(Number).sort((a, b) => a - b);
        assert.deepEqual(recipe.tiles.map(t => t.id), ids);
        for (const t of recipe.tiles) assert.ok(t.layers.length > 0, `tile ${t.id} paints nothing`);
        for (const id of ids) assert.match(tsx, new RegExp(`<tile id="${id}">\\s*<properties>\\s*<property name="name" value="${TILE_BY_ID[id].name}"`));
    });
});
