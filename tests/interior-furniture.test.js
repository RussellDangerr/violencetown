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
import { SHEETS, TINY_STYLE_SHEETS, TINY_INK, INTERIOR_SPRITES, PROP_SPRITES } from '../game/sprites.js';
import { resolveExamine } from '../game/examine.js';

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
    // AP4R1: the casino's slot machine now stands on its examine spot, so only
    // the bank's vault spot is still kept bare.
    test('casino_slots stays where it is, on the floor, with the slot machine standing on it', () => {
        const m = map('casino-map.json');
        const ex = (m.examinables || []).find(e => e.id === 'casino_slots');
        assert.ok(ex, 'casino_slots is gone');
        assert.deepEqual([ex.x, ex.y], [6, 2]);
        assert.equal(m.tiles[ex.y * m.width + ex.x], 11, 'casino_slots still stands on the floor tile');
        const on = (m.props || []).filter(p => p.x === ex.x && p.y === ex.y);
        assert.deepEqual(on.map(p => p.type), ['slotMachine']);
    });

    test('bank_vault stays where it is, with nothing placed on it', () => {
        const m = map('bank-map.json');
        const ex = (m.examinables || []).find(e => e.id === 'bank_vault');
        assert.ok(ex, 'bank_vault is gone');
        assert.deepEqual([ex.x, ex.y], [6, 2]);
        assert.equal(m.tiles[ex.y * m.width + ex.x], 11, 'bank_vault still stands on the floor tile');
        assert.ok(!(m.props || []).some(p => p.x === ex.x && p.y === ex.y), 'a prop covers bank_vault');
    });
});

describe('the furniture in the four rooms', () => {
    const map = (f) => JSON.parse(readFileSync(join(GAME, f), 'utf8'));
    const ROOMS = ['borgir-map.json', 'diner-map.json', 'bank-map.json', 'casino-map.json'];
    const interior = (m) => (m.props || []).filter(p => p.type in INTERIOR_SPRITES);

    test('every room has furniture from the sheet, and every piece is used somewhere', () => {
        const used = new Set();
        for (const f of ROOMS) {
            const pieces = interior(map(f));
            assert.ok(pieces.length > 0, `${f} has no furniture`);
            for (const p of pieces) {
                used.add(p.type);
                assert.equal(PROP_SPRITES[p.type]?.sheet, 'interior', `${p.type} draws from the interior strip`);
            }
        }
        assert.deepEqual(Object.keys(INTERIOR_SPRITES).filter(n => !used.has(n)), []);
    });

    test('furniture stands on the floor, never on a wall or the door', () => {
        for (const f of ROOMS) {
            const m = map(f);
            for (const p of interior(m)) assert.equal(m.tiles[p.y * m.width + p.x], 11, `${f}: ${p.type} at (${p.x}, ${p.y})`);
        }
    });

    for (const [file, id] of [['borgir-map.json', 'borgir_counter'], ['diner-map.json', 'diner_counter']]) {
        test(`${id} is a real counter`, () => {
            const m = map(file);
            const ex = m.examinables.find(e => e.id === id);
            const p = (m.props || []).find(q => q.x === ex.x && q.y === ex.y);
            assert.ok(p && p.type.startsWith('counter'), `no counter piece under ${id}`);
        });
    }

    test('a run is laid as its left end, its middles, then its right end', () => {
        const { runs } = generatorLists();
        const problems = [];
        let checked = 0;
        for (const f of ROOMS) {
            const m = map(f);
            const at = new Map((m.props || []).map(p => [`${p.x},${p.y}`, p.type]));
            for (const run of runs) {
                const [L, R] = [run[0], run[run.length - 1]];
                const member = new Set(run);
                for (const p of m.props || []) {
                    if (!member.has(p.type)) continue;
                    checked++;
                    const left = at.get(`${p.x - 1},${p.y}`), right = at.get(`${p.x + 1},${p.y}`);
                    const wantLeft = p.type !== L, wantRight = p.type !== R;
                    if (wantLeft !== (member.has(left) && left !== R)) problems.push(`${f}: ${p.type} at (${p.x}, ${p.y}) has ${left ?? 'nothing'} on its left`);
                    if (wantRight !== (member.has(right) && right !== L)) problems.push(`${f}: ${p.type} at (${p.x}, ${p.y}) has ${right ?? 'nothing'} on its right`);
                }
            }
        }
        assert.ok(checked > 0, 'no run pieces placed');
        assert.deepEqual(problems, []);
    });

    test('from the door you can still reach every host, examinable and the way out', () => {
        const problems = [];
        for (const f of ROOMS) {
            const m = map(f);
            const blocked = new Set([
                ...(m.props || []).filter(p => p.solid !== false).map(p => `${p.x},${p.y}`),
                ...(m.enemies || []).map(e => `${e.x},${e.y}`),
            ]);
            const open = (x, y) => x >= 0 && y >= 0 && x < m.width && y < m.height
                && [11, 15].includes(m.tiles[y * m.width + x]) && !blocked.has(`${x},${y}`);
            const seen = new Set([`${m.spawn.x},${m.spawn.y}`]);
            const queue = [[m.spawn.x, m.spawn.y]];
            while (queue.length) {
                const [x, y] = queue.shift();
                for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    const k = `${x + dx},${y + dy}`;
                    if (!seen.has(k) && open(x + dx, y + dy)) { seen.add(k); queue.push([x + dx, y + dy]); }
                }
            }
            const beside = (t) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => seen.has(`${t.x + dx},${t.y + dy}`));
            assert.ok((m.enemies || []).length > 0 && (m.examinables || []).length > 0, `${f}: nothing to reach`);
            for (const e of m.enemies || []) if (!beside(e)) problems.push(`${f}: ${e.name || e.type} is walled off`);
            for (const e of m.examinables || []) if (!beside(e) && !seen.has(`${e.x},${e.y}`)) problems.push(`${f}: ${e.id} is walled off`);
            for (const t of m.transitions || []) if (!seen.has(`${t.x},${t.y}`)) problems.push(`${f}: the way out is walled off`);
        }
        assert.deepEqual(problems, []);
    });

    test('examining a piece says its plain name', () => {
        const NOUNS = ['Counter', 'Table', 'Chair', 'Shelf', 'Plant', 'Stove'];
        for (const type of Object.keys(INTERIOR_SPRITES)) {
            const g = { examinables: [], enemies: [], containers: [], groundItems: [],
                map: { getTile: () => 11, isInBounds: () => true, propSpawns: [{ type, x: 0, y: 0 }] } };
            const r = resolveExamine(g, 0, 0);
            assert.ok(NOUNS.includes(r.title), `${type} examines as "${r.title}"`);
            assert.equal(r.body, `[${r.title}.]`);
        }
    });
});
