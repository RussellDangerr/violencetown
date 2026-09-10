// prop-coverage.test.js — every placed prop has art, and that art is really on
// its sheet.
//
// The renderer skips a prop whose type has no PROP_SPRITES entry — silently
// (renderer.js _drawActors: `if (!def) continue;`) — while map.js still counts
// the prop as solid. The first attempt at the graveyard (zone-identity.md
// Item 3) died mid-edit in exactly that state: 96 grave props in the map and
// no entries for them, so the graveyard would have rendered with no graves and
// 96 invisible walls. tile-coverage.test.js noticed only incidentally, because
// the gravestone TILE had become unplaced. This is the direct check.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PROP_SPRITES, SHEETS } from '../game/sprites.js';
import { TILE_BY_ID } from '../game/data.js';

const GAME_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'game');

// `*-map.json` matches the real maps and excludes the stale
// `*-map-TheDangerrZone.json` snapshots, which end in `-TheDangerrZone.json`.
const mapFiles = readdirSync(GAME_DIR)
    .filter(f => f.endsWith('-map.json'))
    .sort();

function loadMap(file) {
    return JSON.parse(readFileSync(join(GAME_DIR, file), 'utf8'));
}

// Width and height straight from the PNG's IHDR chunk (bytes 16-23, big-endian),
// so a region can be checked against the real image without decoding it.
function pngSize(src) {
    const buf = readFileSync(join(GAME_DIR, src));
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

const maps = mapFiles.map(file => ({ file, map: loadMap(file) }));
const placed = maps.flatMap(({ file, map }) => (map.props || []).map(p => ({ file, ...p })));

describe('prop coverage', () => {
    test('the map sweep actually found props', () => {
        assert.ok(placed.length > 0, 'no props in any map — did the sweep break?');
    });

    test('every prop placed in a map JSON has a PROP_SPRITES entry', () => {
        const missing = placed
            .filter(p => !PROP_SPRITES[p.type])
            .map(p => `${p.file} at (${p.x}, ${p.y}): ${p.type}`);
        assert.deepEqual(missing, [], `props with no art (they would draw nothing and still block):\n  ${missing.join('\n  ')}`);
    });

    test('every PROP_SPRITES entry reads a region that exists on a registered sheet', () => {
        for (const [type, def] of Object.entries(PROP_SPRITES)) {
            const sheet = SHEETS[def.sheet];
            assert.ok(sheet, `${type}: sheet '${def.sheet}' is not registered in SHEETS`);
            for (const k of ['sx', 'sy']) {
                assert.ok(Number.isInteger(def[k]) && def[k] >= 0, `${type}: bad ${k} (${def[k]})`);
            }
            for (const k of ['sw', 'sh', 'wTiles', 'hTiles']) {
                assert.ok(Number.isInteger(def[k]) && def[k] > 0, `${type}: bad ${k} (${def[k]})`);
            }
            const { w, h } = pngSize(sheet.src);
            assert.ok(
                def.sx + def.sw <= w && def.sy + def.sh <= h,
                `${type}: region (${def.sx}, ${def.sy}) ${def.sw}x${def.sh} runs off ${sheet.src} (${w}x${h})`,
            );
        }
    });

    test('no PROP_SPRITES entry is orphaned', () => {
        const used = new Set(placed.map(p => p.type));
        const orphans = Object.keys(PROP_SPRITES).filter(t => !used.has(t));
        assert.deepEqual(orphans, [], `prop art nothing places: ${orphans.join(', ')}`);
    });

    test('props stand inside their map, one to a cell', () => {
        const problems = [];
        for (const { file, map } of maps) {
            const seen = new Set();
            for (const p of map.props || []) {
                const key = `${p.x},${p.y}`;
                if (!(p.x >= 0 && p.y >= 0 && p.x < map.width && p.y < map.height)) problems.push(`${file}: ${p.type} at (${key}) is off the map`);
                if (seen.has(key)) problems.push(`${file}: two props at (${key})`);
                seen.add(key);
            }
        }
        assert.deepEqual(problems, [], problems.join('\n  '));
    });

    test('a solid prop stands on walkable ground', () => {
        // The prop is what blocks its cell. Ground that is already unwalkable
        // means a tile-to-prop conversion was left half-done — the old tile
        // still renders underneath, and the prop blocks nothing new.
        const buried = [];
        for (const { file, map } of maps) {
            for (const p of map.props || []) {
                if (p.solid === false) continue;
                const id = map.tiles[p.y * map.width + p.x];
                if (!TILE_BY_ID[id]?.walkable) buried.push(`${file}: ${p.type} at (${p.x}, ${p.y}) sits on ${TILE_BY_ID[id]?.name ?? id}`);
            }
        }
        assert.deepEqual(buried, [], `solid props on unwalkable ground:\n  ${buried.join('\n  ')}`);
    });
});
