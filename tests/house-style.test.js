// house-style.test.js — Kenney's Tiny packs are the house style (ruled
// 2026-10-09, plans/batch-2.md stage 2): one pixel size with the ground, the
// Tiny plum outline on every sprite from another pack, shadows at wall bases.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SHEETS, TINY_INK, TINY_STYLE_SHEETS, SpriteSheet } from '../game/sprites.js';

const src = (f) => readFileSync(fileURLToPath(new URL(`../game/${f}`, import.meta.url)), 'utf8');
const renderer = src('renderer.js');

describe('one outline', () => {
    test('the ink is the Tiny packs\' plum', () => {
        assert.deepEqual(TINY_INK, [0x3f, 0x26, 0x31]);
    });
    test('only sheets that exist are excused, and the Tiny ones are among them', () => {
        assert.ok(TINY_STYLE_SHEETS.size > 0);
        for (const k of TINY_STYLE_SHEETS) assert.ok(SHEETS[k], `${k} is not a sheet`);
        for (const k of ['tinyDungeon', 'tinyTown', 'tinyExtra']) assert.ok(TINY_STYLE_SHEETS.has(k), k);
    });
    test('the packs that clash with Tiny are not excused', () => {
        for (const k of ['rpgUrban', 'roguelikeCity', 'car']) assert.ok(!TINY_STYLE_SHEETS.has(k), k);
    });
    // A sheet without its browser Image (node has none): only the fields the
    // draw reads.
    const sheetOf = (key) => Object.assign(Object.create(SpriteSheet.prototype),
        { key, loaded: true, img: {}, frameW: 16, frameH: 16, padding: 0 });

    test('a Tiny-style sheet draws plainly; nothing touches the image', () => {
        const sheet = sheetOf('tinyTown');
        const calls = [];
        const ok = sheet.drawRegionInk({ drawImage: (...a) => calls.push(a) }, 0, 0, 16, 16, 10, 20, 32, 32);
        assert.equal(ok, true);
        assert.deepEqual(calls[0].slice(1), [0, 0, 16, 16, 10, 20, 32, 32]);
    });
    test('a sprite from another pack comes back ringed in plum, one source pixel wide', () => {
        // A 3x3 cell with one opaque pixel in the middle, on a fake canvas.
        const W = 5, data = new Uint8ClampedArray(W * W * 4);
        data[(2 * W + 2) * 4 + 3] = 255;
        let put = null, drawnAt = null;
        const ctx2d = { drawImage() {}, getImageData: () => ({ data }), putImageData: (im) => { put = im; } };
        globalThis.document = { createElement: () => ({ getContext: () => ctx2d }) };
        try {
            const sheet = sheetOf('rpgUrban');
            sheet.drawRegionInk({ drawImage: (...a) => { drawnAt = a.slice(1); } }, 0, 0, 3, 3, 30, 30, 6, 6);
        } finally { delete globalThis.document; }
        const px = (x, y) => Array.from(put.data.slice((y * W + x) * 4, (y * W + x) * 4 + 4));
        for (const [x, y] of [[1, 2], [3, 2], [2, 1], [2, 3]]) assert.deepEqual(px(x, y), [...TINY_INK, 255], `(${x},${y}) is inked`);
        for (const [x, y] of [[1, 1], [3, 1], [1, 3], [3, 3]]) assert.equal(px(x, y)[3], 0, `diagonal (${x},${y}) stays clear: the outline is 4-connected`);
        assert.deepEqual(drawnAt, [28, 28, 10, 10], 'the cell grows by one source pixel each side, at the draw scale');
    });

    test('the prototype switches are gone: the house style is the default', () => {
        assert.equal(existsSync(fileURLToPath(new URL('../game/art-flags.js', import.meta.url))), false);
        assert.doesNotMatch(renderer, /art-flags|spriteInset|ART\./);
    });
});

describe('one pixel size', () => {
    test('characters, chests and ground items fill the tile, like the ground', () => {
        for (const re of [
            /_inkFrame\(sprites\[frame\.sheet\], ctx, frame\.col, frame\.row, px, py, TILE_PX, TILE_PX\)/,   // enemies, NPCs
            /_inkFrame\(sprites\[info\.sheet\], ctx, info\.col, info\.row, px, py, TILE_PX, TILE_PX\)/,       // chests
            /_inkRegion\(sprites\[spr\.sheet\], ctx, spr\.x, spr\.y, spr\.w, spr\.h, px, py, TILE_PX, TILE_PX\)/, // ground items
            /ppx, ppy, TILE_PX, TILE_PX/,                                                                   // the player
        ]) assert.match(renderer, re);
    });
});

describe('shadows at wall bases', () => {
    test('drawn every frame, after the ground', () => {
        const at = renderer.indexOf('this._drawTiles(game);');
        assert.ok(at > 0);
        assert.match(renderer.slice(at, at + 200), /\n\s+this\._drawWallShadows\(game\);/);
    });
});
