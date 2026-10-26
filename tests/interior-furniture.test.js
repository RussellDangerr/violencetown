// interior-furniture.test.js — the Interior Pack's furniture, outlined to match
// (plans/zone-1-interiors-get-a-vocabulary.md).
//
// tools/gen_outlined_sheet.py cuts the furniture out of Kenney's Roguelike
// Interior Pack and outlines it into rlInterior_outlined.png; sprites.js reads
// that strip through INTERIOR_SPRITES. These hold the three together, and hold
// the picture to the two promises the tool makes: every piece is closed by the
// Tiny plum, and the cells of a run (a counter) meet with no seam.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SHEETS, TINY_STYLE_SHEETS, TINY_INK, INTERIOR_SPRITES } from '../game/sprites.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GAME = join(ROOT, 'game');
const CELL = 16;

// Just enough PNG to read RGBA: 8-bit, non-interlaced, colour type 6 (what
// Pillow writes for an RGBA image). Anything else throws.
function readRGBA(path) {
    const buf = readFileSync(path);
    let pos = 8, width = 0, height = 0, depth = 0, type = 0, interlace = 0;
    const idat = [];
    while (pos < buf.length) {
        const len = buf.readUInt32BE(pos);
        const kind = buf.toString('ascii', pos + 4, pos + 8);
        const data = buf.subarray(pos + 8, pos + 8 + len);
        if (kind === 'IHDR') {
            width = data.readUInt32BE(0); height = data.readUInt32BE(4);
            depth = data[8]; type = data[9]; interlace = data[12];
        } else if (kind === 'IDAT') idat.push(data);
        else if (kind === 'IEND') break;
        pos += 12 + len;
    }
    if (depth !== 8 || type !== 6 || interlace !== 0) throw new Error(`${path}: not 8-bit RGBA`);
    const bpp = 4, stride = width * bpp;
    const raw = inflateSync(Buffer.concat(idat));
    const px = Buffer.alloc(stride * height);
    for (let y = 0; y < height; y++) {
        const filter = raw[y * (stride + 1)];
        const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
        for (let i = 0; i < stride; i++) {
            const a = i >= bpp ? px[y * stride + i - bpp] : 0;
            const b = y > 0 ? px[(y - 1) * stride + i] : 0;
            const c = y > 0 && i >= bpp ? px[(y - 1) * stride + i - bpp] : 0;
            let v = src[i];
            if (filter === 1) v += a;
            else if (filter === 2) v += b;
            else if (filter === 3) v += (a + b) >> 1;
            else if (filter === 4) {
                const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
                v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
            }
            px[y * stride + i] = v & 0xff;
        }
    }
    const at = (x, y) => Array.from(px.subarray((y * width + x) * 4, (y * width + x) * 4 + 4));
    return { width, height, at };
}

// The generator's own lists, read from its source, so its order and sprites.js
// cannot drift apart: [[name, ...], ...] for the runs, [name, ...] for singles.
function generatorLists() {
    const py = readFileSync(join(ROOT, 'tools', 'gen_outlined_sheet.py'), 'utf8');
    const block = (start) => {
        const from = py.indexOf(`\n${start} = [`);
        assert.ok(from >= 0, `${start} not found in the generator`);
        let depth = 0, i = py.indexOf('[', from);
        const begin = i;
        for (; i < py.length; i++) {
            if (py[i] === '#') { i = py.indexOf('\n', i); continue; }
            if (py[i] === '[') depth++;
            else if (py[i] === ']' && --depth === 0) break;
        }
        return py.slice(begin + 1, i).replace(/#[^\n]*/g, '');
    };
    const names = (text) => [...text.matchAll(/\(\s*"(\w+)"\s*,\s*\(/g)].map(m => m[1]);
    const runsText = block('INTERIOR_RUNS');
    const runs = [];
    let depth = 0, start = -1;
    for (let i = 0; i < runsText.length; i++) {
        if (runsText[i] === '[') { if (depth++ === 0) start = i; }
        else if (runsText[i] === ']' && --depth === 0) runs.push(names(runsText.slice(start, i + 1)));
    }
    return { runs, singles: names(block('INTERIOR_SINGLES')) };
}

const isInk = (p) => p[3] === 255 && p[0] === TINY_INK[0] && p[1] === TINY_INK[1] && p[2] === TINY_INK[2];
const sheetPath = () => join(GAME, SHEETS.interior.src);
const byColumn = Object.entries(INTERIOR_SPRITES).sort((a, b) => a[1] - b[1]).map(([n]) => n);

describe('interior furniture sheet', () => {
    test('is registered packed, and the outline pass leaves it alone', () => {
        assert.equal(SHEETS.interior?.src, './assets-placeholder/kenney/rlInterior_outlined.png');
        assert.equal(SHEETS.interior.padding ?? 0, 0, 'the strip is packed; only its source has a gutter');
        assert.ok(TINY_STYLE_SHEETS.has('interior'), 'already outlined: inking it again at draw time would double the stroke');
    });

    test('the columns run 0..n-1, one name each', () => {
        const cols = Object.values(INTERIOR_SPRITES).sort((a, b) => a - b);
        assert.ok(cols.length > 0);
        assert.deepEqual(cols, cols.map((_, i) => i));
    });

    test('sprites.js names the columns in the generator\'s order', () => {
        const { runs, singles } = generatorLists();
        assert.ok(runs.length > 0 && singles.length > 0, 'read nothing from the generator');
        assert.deepEqual(byColumn, [...runs.flat(), ...singles]);
    });

    test('the strip is one row, one cell per name', () => {
        const img = readRGBA(sheetPath());
        assert.equal(img.width, CELL * byColumn.length);
        assert.equal(img.height, CELL);
    });

    test('every cell holds a piece, closed by the Tiny plum', () => {
        const img = readRGBA(sheetPath());
        const { runs } = generatorLists();
        const runOf = new Map(runs.flatMap(r => r.map((n, i) => [n, { first: i === 0, last: i === r.length - 1 }])));
        const problems = [];
        for (const [name, col] of Object.entries(INTERIOR_SPRITES)) {
            const x0 = col * CELL;
            const solid = (x, y) => x >= 0 && y >= 0 && x < CELL && y < CELL && img.at(x0 + x, y)[3] > 0;
            let opaque = 0, ink = 0, open = 0;
            const pos = runOf.get(name) || { first: true, last: true };
            for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
                if (!solid(x, y)) continue;
                opaque++;
                const p = img.at(x0 + x, y);
                if (isInk(p)) { ink++; continue; }
                // A pixel of the piece itself: it may not touch the open air, nor
                // the cell edge — except where a run's cell meets its neighbour.
                const besideAir = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
                    const nx = x + dx, ny = y + dy;
                    if (nx < 0) return pos.first;
                    if (nx >= CELL) return pos.last;
                    if (ny < 0 || ny >= CELL) return true;
                    return !solid(nx, ny);
                });
                if (besideAir) open++;
            }
            if (opaque === 0) problems.push(`${name}: empty cell`);
            else if (ink === 0) problems.push(`${name}: no outline at all`);
            else if (open > 0) problems.push(`${name}: ${open} edge pixel(s) with no outline`);
        }
        assert.deepEqual(problems, []);
    });

    test('a run\'s cells meet without a seam', () => {
        // Outlined cell by cell, a counter would carry a plum line down every
        // joint. Outlined as one strip, a joint is the art itself.
        const img = readRGBA(sheetPath());
        const { runs } = generatorLists();
        let joints = 0;
        for (const run of runs) {
            for (let i = 0; i + 1 < run.length; i++) {
                const lx = INTERIOR_SPRITES[run[i]] * CELL + CELL - 1, rx = lx + 1;
                let seam = 0, rows = 0;
                for (let y = 1; y < CELL - 1; y++) {
                    const l = img.at(lx, y), r = img.at(rx, y);
                    if (l[3] === 0 || r[3] === 0) continue;
                    rows++;
                    if (isInk(l) || isInk(r)) seam++;
                }
                joints++;
                assert.ok(rows > 0, `${run[i]}|${run[i + 1]}: the two cells do not meet`);
                assert.ok(seam <= 2, `${run[i]}|${run[i + 1]}: ${seam} of ${rows} joint rows are plum — a seam`);
            }
        }
        assert.ok(joints > 0, 'no runs to check');
    });
});

describe('what the furniture leaves alone', () => {
    const map = (f) => JSON.parse(readFileSync(join(GAME, f), 'utf8'));
    for (const [file, id] of [['casino-map.json', 'casino_slots'], ['bank-map.json', 'bank_vault']]) {
        test(`${id} stays where it is, with nothing placed on it`, () => {
            const m = map(file);
            const ex = (m.examinables || []).find(e => e.id === id);
            assert.ok(ex, `${id} is gone`);
            assert.deepEqual([ex.x, ex.y], [6, 2]);
            assert.equal(m.tiles[ex.y * m.width + ex.x], 11, `${id} still stands on the floor tile`);
            assert.ok(!(m.props || []).some(p => p.x === ex.x && p.y === ex.y), `a prop covers ${id}`);
        });
    }
});
