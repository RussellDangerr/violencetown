// tile-render.test.js — what Renderer._drawTiles paints, cell by cell.
//
// renderer.js imports cleanly under node, and _drawTiles touches nothing but
// this.ctx and this.sprites, so a recording canvas and a stand-in sheet are
// enough to see exactly which art lands in which cell — no DOM, no screenshot.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Renderer } from '../game/renderer.js';
import { GameMap } from '../game/map.js';
import { TILES, TILE_PX } from '../game/data.js';
import { OUTLINED_SPRITES, TILE_SPRITE_MAP } from '../game/sprites.js';

const HALF = 9;

// Paint one frame of `tiles` (a width-wide grid) with the player at (px, py).
// Returns the draw calls, each tagged with the world cell it landed in.
function paint(width, tiles, px, py) {
    const calls = [];
    const cellOf = (x, y) => [x / TILE_PX - HALF + px, y / TILE_PX - HALF + py].join(',');
    const ctx = {
        fillStyle: null,
        fillRect(x, y) { calls.push({ cell: cellOf(x, y), fill: this.fillStyle }); },
        drawImage() {},
    };
    const sheet = name => ({
        loaded: true,
        drawFrame(_, col, row, x, y) { calls.push({ cell: cellOf(x, y), sheet: name, col, row }); return true; },
        drawRegion(_, sx, sy, sw, sh, x, y) { calls.push({ cell: cellOf(x, y), sheet: name, sx, sy }); return true; },
    });
    const r = Object.assign(Object.create(Renderer.prototype), {
        ctx, half: HALF, _scrollX: 0, _scrollY: 0,
        sprites: new Proxy({}, { get: (_, name) => sheet(name) }),
    });
    const map = new GameMap({ width, height: tiles.length / width, spawn: { x: 0, y: 0 }, tiles }, 'test');
    r._drawTiles({ playerX: px, playerY: py, map });
    return (x, y) => calls.filter(c => c.cell === `${x},${y}`).map(({ cell, ...rest }) => rest);
}

describe('_drawTiles', () => {
    test('an off-map cell paints the void, not WALL\'s brick', () => {
        // getTile reports id 0 (WALL) off the map, which keeps the edge
        // unwalkable. Since WALL got real brick for the Sewer, every zone's
        // off-map margin rendered as dungeon brick — around the carnival,
        // beyond Town. Off the map there is nothing, and it should look it.
        const F = TILES.FLOOR.id;
        const at = paint(3, [F, F, F, F, F, F, F, F, F], 1, 1);
        assert.deepEqual(at(-1, -1), [{ fill: TILES.WALL.fallbackColor }]);
        assert.deepEqual(at(5, 2), [{ fill: TILES.WALL.fallbackColor }]);
    });

    test('an on-map WALL still draws its brick', () => {
        const W = TILES.WALL.id;
        const at = paint(3, [W, W, W, W, W, W, W, W, W], 1, 1);
        assert.deepEqual(at(0, 0), [{ sheet: TILE_SPRITE_MAP[W].sheet, col: TILE_SPRITE_MAP[W].col, row: TILE_SPRITE_MAP[W].row }]);
    });

    test('a tent cell paints carnival ground, then its own quadrant on top', () => {
        const T = TILES.TENT_GREEN.id, G = TILES.CIRCUS_GROUND.id;
        const at = paint(4, [T, T, G, G, T, T, G, G], 1, 1);
        const ground = { sheet: 'tinyTown', col: 1, row: 2 };
        const quad = col => ({ sheet: 'outlined', col, row: 0 });
        assert.deepEqual(at(0, 0), [ground, quad(OUTLINED_SPRITES.tentGreenTL)]);
        assert.deepEqual(at(1, 0), [ground, quad(OUTLINED_SPRITES.tentGreenTR)]);
        assert.deepEqual(at(0, 1), [ground, quad(OUTLINED_SPRITES.tentGreenBL)]);
        assert.deepEqual(at(1, 1), [ground, quad(OUTLINED_SPRITES.tentGreenBR)]);
        assert.deepEqual(at(2, 0), [ground], 'plain ground draws once, with nothing layered on it');
    });
});
