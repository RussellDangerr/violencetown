// visual-breakage.test.js — plans/batch-2.md stage 1: what read as broken.
//
// Each block pins one fix from the 2026-10-07 visual audit, so it cannot quietly
// come back: the stick through every NPC, the lettered item boxes, the edge
// trees over each map's last row, the sideways Carnival arrows, the doubled
// doors, the spriteless town wall, text running past its frame.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { facingCue, fillerSkips, exitDir } from '../game/renderer.js';
import { ITEM_SPRITES, UNKNOWN_ITEM_SPRITE, itemSprite, SHEETS, TOWN_TILE_SPRITE_MAP, PROP_SPRITES } from '../game/sprites.js';
import { ITEMS } from '../game/items.js';
import { WEAPONS } from '../game/weapons.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GAME = join(ROOT, 'game');
const maps = readdirSync(GAME).filter(f => f.endsWith('-map.json'))
    .map(f => ({ f, d: JSON.parse(readFileSync(join(GAME, f), 'utf8')) }));
const rendererSrc = readFileSync(join(GAME, 'renderer.js'), 'utf8');

describe('the facing cue no longer runs through the body', () => {
    const T = 32, c = 100;
    for (const [name, ux, uy] of [['down', 0, 1], ['up', 0, -1], ['left', -1, 0], ['right', 1, 0], ['down-right', Math.SQRT1_2, Math.SQRT1_2]]) {
        test(`facing ${name}: every point of the chevron sits at the tile's edge or past it`, () => {
            for (const [x, y] of facingCue(c, c, ux, uy, T)) {
                const along = (x - c) * ux + (y - c) * uy;   // distance out from the centre, in the facing direction
                assert.ok(along >= T / 2 - 3, `point (${x},${y}) is ${along.toFixed(1)} px from the centre`);
            }
        });
    }
    test('the overlay draws the cue through facingCue, and the old tan line is gone', () => {
        assert.match(rendererSrc, /facingCue\(sx \+ TILE_PX \/ 2, sy \+ TILE_PX \/ 2,/);
        assert.doesNotMatch(rendererSrc, /rgba\(212,185,106,0\.75\)/);   // the old line's stroke
    });
});

describe('no item draws as a letter in a box', () => {
    const all = { ...ITEMS, ...WEAPONS };
    test('every item and weapon has a sprite to draw: its own, or the plain bag', () => {
        for (const id of Object.keys(all)) {
            const s = itemSprite(id);
            assert.ok(s && SHEETS[s.sheet], `${id} has nothing to draw`);
        }
    });
    test('only the three with no fitting cell yet fall back to the bag', () => {
        const bare = Object.keys(all).filter(id => !ITEM_SPRITES[id]).sort();
        assert.deepEqual(bare, ['latex_gloves', 'red_cape', 'shoe_bags']);
        assert.ok(bare.length > 0 && bare.every(id => itemSprite(id) === UNKNOWN_ITEM_SPRITE));
    });
    test('no fallback still draws ITEM_COLORS letters unless a sheet failed to load', () => {
        // The four draw sites ask itemSprite(), never ITEM_SPRITES directly.
        assert.equal((rendererSrc.match(/ITEM_SPRITES\[/g) || []).length, 0);
        assert.equal((rendererSrc.match(/itemSprite\(/g) || []).length, 4);
    });
    test('the derived sheet exists and is five 16-px cells wide', () => {
        const png = readFileSync(join(GAME, 'assets-placeholder', 'kenney', 'tinyExtra_packed.png'));
        assert.equal(png.readUInt32BE(16), 80);   // IHDR width
        assert.equal(png.readUInt32BE(20), 16);   // IHDR height
    });
    test('the rock and Fire Blood no longer use cells that carry a square of ground', () => {
        assert.notDeepEqual([ITEM_SPRITES.rock.sheet, ITEM_SPRITES.rock.x, ITEM_SPRITES.rock.y], ['tinyDungeon', 0, 16]);
        assert.notDeepEqual([ITEM_SPRITES.fire_blood.sheet, ITEM_SPRITES.fire_blood.x, ITEM_SPRITES.fire_blood.y], ['tinyDungeon', 80, 32]);
    });
});

describe('the edge forest stays out of the map', () => {
    const tree = PROP_SPRITES.tree;
    test('the filler tree is two tiles tall, which is why it reached in', () => {
        assert.equal(tree.hTiles, 2);
    });
    test('the row just past the south edge, under the map, is left bare', () => {
        assert.equal(fillerSkips(5, 26, 34, 26, 2), true);
        assert.equal(fillerSkips(0, 26, 34, 26, 2), true);
        assert.equal(fillerSkips(33, 26, 34, 26, 2), true);
    });
    test('everywhere else keeps its trees', () => {
        for (const [x, y] of [[5, 27], [-1, 26], [34, 26], [5, -1], [-1, 5], [34, 5]]) {
            assert.equal(fillerSkips(x, y, 34, 26, 2), false, `(${x},${y})`);
        }
        assert.equal(fillerSkips(5, 26, 34, 26, 1), false, 'a one-tile filler never reaches in');
    });
});

describe('every exit arrow points the way its label says', () => {
    const word = { North: 'up', South: 'down', East: 'right', West: 'left' };
    const exits = maps.flatMap(({ f, d }) => (d.transitions || []).map(t => ({ f, t, d })));
    test('there are exits to check', () => assert.ok(exits.length > 20));
    for (const { f, t, d } of exits) {
        const m = /^\[(North|South|East|West)\b/.exec(t.label || '');
        if (!m) continue;
        test(`${f} (${t.x},${t.y}) "${m[1]}" points ${word[m[1]]}`, () => {
            assert.equal(exitDir(t, d.width, d.height), word[m[1]]);
        });
    }
});

describe('maps', () => {
    test('no door is stacked on top of another door', () => {
        const stacked = [];
        for (const { f, d } of maps) {
            for (let y = 0; y + 1 < d.height; y++) for (let x = 0; x < d.width; x++) {
                if (d.tiles[y * d.width + x] === 15 && d.tiles[(y + 1) * d.width + x] === 15) stacked.push(`${f} (${x},${y})`);
            }
        }
        assert.deepEqual(stacked, []);
    });
    test('every door still has its exit', () => {
        const town = maps.find(m => m.f === 'town-map.json').d, borgir = maps.find(m => m.f === 'borgir-map.json').d;
        assert.ok(town.transitions.some(t => t.x === 8 && t.y === 6 && t.toMap === 'borgir-map.json'));
        assert.ok(borgir.transitions.some(t => t.x === 8 && t.y === 16 && t.toMap === 'town-map.json'));
    });
    test('the town wall has art: a hedge on grass, not a flat brown band', () => {
        assert.deepEqual(TOWN_TILE_SPRITE_MAP[10], { sheet: 'tinyTown', col: 5, row: 0, under: 13 });
    });
});
