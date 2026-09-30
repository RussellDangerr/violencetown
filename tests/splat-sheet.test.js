// splat-sheet.test.js — the hit-splat badge atlas and the code that reads it agree.
//
// game/assets/ui_splats.png is drawn by tools/gen_splats.py: one silhouette per
// damage type (rows), by the number's length 1..4 and again gold-outlined for a
// crit (columns). The renderer picks a cell through splat-layout.js. If the
// generator and the game ever disagree on rows, widths or cell size, every
// splat draws the wrong shape or a sliver of two — silently. These pin it.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SPLAT_ROWS, SPLAT_CELL_W, SPLAT_CELL_H, SPLAT_BODY_W, splatCell, splatPill } from '../game/splat-layout.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const gen = read('../tools/gen_splats.py');
const renderer = read('../game/renderer.js');
const sprites = read('../game/sprites.js');

const pyList = (name) => JSON.parse(new RegExp(`^${name} = (\\[.*?\\])`, 'm').exec(gen)[1].replace(/'/g, '"'));
const TYPES = pyList('TYPES');
const BODY_W = pyList('BODY_W');
const [, cellW, cellH] = /^CELL_W, CELL_H = (\d+), (\d+)/m.exec(gen).map(Number);

describe('the splat atlas matches the code that reads it', () => {
    test('rows: the generator draws the types in SPLAT_ROWS order', () => {
        assert.ok(TYPES.length > 0);
        assert.deepEqual(TYPES.map((t) => SPLAT_ROWS[t]), TYPES.map((_, i) => i));
        assert.equal(Object.keys(SPLAT_ROWS).length, TYPES.length, 'no row the generator does not draw');
    });

    test('columns and cells: same body widths, same cell size, in the sheet declaration too', () => {
        assert.deepEqual(BODY_W, SPLAT_BODY_W);
        assert.deepEqual([cellW, cellH], [SPLAT_CELL_W, SPLAT_CELL_H]);
        const decl = /splats:\s*\{[^}]*frameW:\s*(\d+),\s*frameH:\s*(\d+)/.exec(sprites);
        assert.ok(decl, 'sprites.js declares the splats sheet');
        assert.deepEqual([Number(decl[1]), Number(decl[2])], [SPLAT_CELL_W, SPLAT_CELL_H]);
    });

    test('the PNG on disk is exactly that grid: 4 lengths x 2 (crit) wide, one row per type', () => {
        const png = readFileSync(new URL('../game/assets/ui_splats.png', import.meta.url));
        assert.equal(png.toString('latin1', 1, 4), 'PNG');
        const w = png.readUInt32BE(16), h = png.readUInt32BE(20);   // IHDR
        assert.deepEqual([w, h], [SPLAT_CELL_W * SPLAT_BODY_W.length * 2, SPLAT_CELL_H * TYPES.length]);
    });

    test('every damage type with a colour has a shape of its own', () => {
        const block = /const SPLAT_COLOR = \{(.*?)\};/s.exec(renderer)[1];
        const coloured = [...block.matchAll(/(\w+):\s*'#/g)].map((m) => m[1]);
        assert.ok(coloured.includes('physical') && coloured.length >= 6, 'the fixture really read SPLAT_COLOR');
        for (const t of coloured) assert.ok(t in SPLAT_ROWS, `${t} has a colour but no splat row`);
    });

    test('the body the digits sit in is the pill the layout keeps apart', () => {
        // The no-overlap invariant (cascade.test.js) is measured on splatPill; the
        // atlas body must be that pill, to the pixel it rounds to.
        SPLAT_BODY_W.forEach((bw, i) => {
            const pill = splatPill((i + 1) * 4.8);
            assert.ok(Math.abs(pill.w - bw) <= 1, `length ${i + 1}: pill ${pill.w} vs body ${bw}`);
        });
    });
});

describe('splatCell — which cell a splat draws', () => {
    test('length picks the column, a crit the gold half, the type the row', () => {
        assert.deepEqual(splatCell('physical', 2), { col: 1, row: 0, bodyW: 16 });
        assert.deepEqual(splatCell('heal', 3, true), { col: 2 + 4, row: SPLAT_ROWS.heal, bodyW: 20 });
    });

    test('lengths clamp to the widths drawn; an unknown type draws as physical', () => {
        assert.equal(splatCell('fire', 0).col, 0);
        assert.equal(splatCell('fire', 9).col, 3);
        assert.equal(splatCell('fire', 9, true).col, 7);
        assert.equal(splatCell('mystery', 2).row, SPLAT_ROWS.physical);
    });
});
