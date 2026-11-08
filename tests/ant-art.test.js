// ant-art.test.js — the ants look like the Pico-8 mite, two or three to a tile
// (plans/an4-ants-pico-mite-art.md). Every pixel of the committed sheet is read
// back and checked against what tools/gen_ant.py says it draws; then the real
// renderer draws an ant (and a goon, as the control) into a recording canvas.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { Enemy } from '../game/enemies.js';
import { ANT_TYPE, ANT_TAG, ANT_HP, ANT_BITE } from '../game/ants.js';
import { SHEETS, ENEMY_SPRITES, TINY_INK, TINY_STYLE_SHEETS, spriteVariant } from '../game/sprites.js';
import { TILE_PX } from '../game/data.js';
import { DOCK } from '../game/layout.js';
import { computeViewport } from '../game/viewport.js';
import { Renderer } from '../game/renderer.js';
import { defaultVerb } from '../game/wheel-model.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const url = (p) => new URL(p, import.meta.url);
const gen = readFileSync(url('../tools/gen_ant.py'), 'utf8');

// Decode an 8-bit, non-interlaced RGBA or palette PNG.
function readRGBA(path) {
    const buf = readFileSync(path);
    let pos = 8, width = 0, height = 0, depth = 0, type = 0, interlace = 0, plte = null, trns = null;
    const idat = [];
    while (pos < buf.length) {
        const len = buf.readUInt32BE(pos);
        const kind = buf.toString('ascii', pos + 4, pos + 8);
        const data = buf.subarray(pos + 8, pos + 8 + len);
        if (kind === 'IHDR') {
            width = data.readUInt32BE(0); height = data.readUInt32BE(4);
            depth = data[8]; type = data[9]; interlace = data[12];
        } else if (kind === 'PLTE') plte = data;
        else if (kind === 'tRNS') trns = data;
        else if (kind === 'IDAT') idat.push(data);
        else if (kind === 'IEND') break;
        pos += 12 + len;
    }
    if (depth !== 8 || interlace !== 0 || (type !== 3 && type !== 6)) {
        throw new Error(`${path}: unsupported PNG (depth ${depth}, colour type ${type}, interlace ${interlace})`);
    }
    const bpp = type === 6 ? 4 : 1, stride = width * bpp;
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
    const at = type === 6
        ? (x, y) => [...px.subarray((y * width + x) * 4, (y * width + x) * 4 + 4)]
        : (x, y) => {
            const i = px[y * width + x];
            return [plte[i * 3], plte[i * 3 + 1], plte[i * 3 + 2], trns && i < trns.length ? trns[i] : 255];
        };
    return { width, height, at };
}

// The tool's reshaped mite, read from its source.
const UP = [...new RegExp('^UP = \\[(.*?)^\\]', 'ms').exec(gen)[1].matchAll(/'([^']*)'/g)].map(m => m[1]);

const CELL = 16;
const sheet = () => readRGBA(url(`../game/${SHEETS.ant.src.replace(/^\.\//, '')}`));

// 8-way connected pieces of ink inside one cell.
function pieces(img, cell) {
    const seen = new Set(), out = [];
    const ink = (x, y) => x >= 0 && y >= 0 && x < CELL && y < CELL && img.at(cell * CELL + x, y)[3] > 0;
    for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
        if (!ink(x, y) || seen.has(y * CELL + x)) continue;
        const stack = [[x, y]]; let n = 0;
        seen.add(y * CELL + x);
        while (stack.length) {
            const [cx, cy] = stack.pop(); n++;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                const nx = cx + dx, ny = cy + dy;
                if (ink(nx, ny) && !seen.has(ny * CELL + nx)) { seen.add(ny * CELL + nx); stack.push([nx, ny]); }
            }
        }
        out.push(n);
    }
    return out;
}

describe('the ant sheet', () => {
    test('it is registered as a Tiny-style sheet of four 16x16 cells', () => {
        assert.equal(SHEETS.ant.frameW, 16);
        assert.equal(SHEETS.ant.frameH, 16);
        assert.ok(TINY_STYLE_SHEETS.has('ant'), 'the outline pass would add a second ink ring around ink-coloured mites');
        const img = sheet();
        assert.equal(img.width, 4 * CELL);
        assert.equal(img.height, CELL);
    });

    test('every pixel it draws is the Tiny outline colour, fully opaque', () => {
        const img = sheet();
        let ink = 0;
        for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
            const [r, g, b, a] = img.at(x, y);
            if (a === 0) continue;
            ink++;
            assert.deepEqual([r, g, b, a], [...TINY_INK, 255], `pixel (${x},${y})`);
        }
        assert.ok(ink > 0, 'the sheet is empty');
    });

    test('the mite is reshaped: three dots, three legs a side, left and right the same', () => {
        assert.equal(UP.length, 8);
        for (const row of UP) assert.equal(row, [...row].reverse().join(''), `${row} is lopsided`);
        // Rows 0-1, 3-4 and 6-7 are the head, thorax and abdomen; 2 and 5 are the gaps between.
        assert.equal(UP[2], '......');
        assert.equal(UP[5], '......');
        const dots = [[0, 1], [3, 4], [6, 7]].map(([a, b]) => UP[a].split('#').length - 1 + UP[b].split('#').length - 1);
        assert.deepEqual(dots, [8, 8, 8], 'each dot is a blob with a leg either side');
        const legs = (side) => UP.filter(r => r[side] === '#').length;
        assert.equal(legs(0), 3, 'three legs on the left');
        assert.equal(legs(5), 3, 'three legs on the right');
    });

    test('each cell holds two or three separate mites', () => {
        const img = sheet();
        const counts = [];
        for (let c = 0; c < 4; c++) {
            const p = pieces(img, c);
            assert.ok(p.every(n => n === 8), `cell ${c}: a piece is not one dot with its legs (${p})`);
            assert.equal(p.length % 3, 0, `cell ${c}: ${p.length} pieces is not a whole number of mites`);
            counts.push(p.length / 3);
        }
        for (const [c, n] of counts.entries()) assert.ok(n === 2 || n === 3, `cell ${c} holds ${n} mites`);
        assert.ok(counts.includes(2) && counts.includes(3), `the cells should be a mix of two and three (${counts})`);
    });
});

describe('an ant resolves to the mites', () => {
    const ant = (id) => ({ id, type: ANT_TYPE, x: 6, y: 5 });

    test('Ant has a sprite entry with the four cells of the ant sheet', () => {
        const s = ENEMY_SPRITES[ANT_TYPE];
        assert.ok(s, 'no entry for the Ant type');
        assert.equal(s.sheet, 'ant');
        assert.deepEqual(s.variants.map(v => v.col), [0, 1, 2, 3]);
        assert.ok(s.variants.every(v => v.row === 0));
    });

    test('ants get all four looks between them, and the same ant always the same one', () => {
        const looks = new Set();
        for (let i = 1; i <= 40; i++) looks.add(spriteVariant(ENEMY_SPRITES[ANT_TYPE], ant(`ant_${40 + 7 * i}_${i}`)).col);
        assert.deepEqual([...looks].sort(), [0, 1, 2, 3]);
        const one = ant('ant_7_2');
        assert.equal(spriteVariant(ENEMY_SPRITES[ANT_TYPE], one).col, spriteVariant(ENEMY_SPRITES[ANT_TYPE], one).col);
    });
});

// ── the real draw, into a recording canvas ───────────────────────────────────
const VP = computeViewport({ cssW: 3440, cssH: 1440, dpr: 1, dock: DOCK });

function rig() {
    const state = { globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: null, strokeStyle: null, filter: 'none' };
    const rects = [], texts = [], cells = [];
    const ctx = new Proxy(state, {
        get(t, k) {
            if (k === 'fillRect') return (x, y, w, h) => rects.push({ x, y, w, h, style: t.fillStyle });
            if (k in t) return t[k];
            if (k === 'createImageData') return (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
            return () => (/Gradient/.test(k) ? { addColorStop() {} } : undefined);
        },
        set(t, k, v) { t[k] = v; return true; },
    });
    const fake = (name) => ({
        loaded: true,
        drawFrame: (c, col, row) => { cells.push({ name, col, row }); return true; },
        drawFrameInk: (c, col, row) => { cells.push({ name, col, row }); return true; },
    });
    const r = Object.assign(Object.create(Renderer.prototype), {
        ctx, canvas: { width: VP.backingW, height: VP.backingH }, viewport: VP,
        sprites: { ant: fake('ant'), tinyDungeon: fake('tinyDungeon') },
        font: { drawText: (c, text) => texts.push(String(text)), measure: (t) => String(t).length * 6 },
        _scrollX: 0, _scrollY: 0, _fightFace: true, _hudFor: null, _hudFaceFor: null, _hudCache: null,
    });
    return { r, rects, texts, cells };
}

const mkAnt = () => new Enemy({
    id: 'ant_3_1', type: ANT_TYPE, x: 6, y: 5, hp: ANT_HP, damage: ANT_BITE, sightRange: 0, tag: ANT_TAG,
});
const mkGoon = () => new Enemy({ id: 'g1', type: 'Violet Fungus', x: 6, y: 5, gold: 50 });

// One tile east of the player, who faces it: the spot where every label would show.
function scene(e) {
    e._lastDx = -1; e._lastDy = 0;
    const g = {
        playerX: 5, playerY: 5, facing: 'right', turn: 1, wheel: null, _idleTick: 0, _animating: false,
        _fightOn: true, _inCombat: () => true, _damageNumbers: [],
        equipment: { weapon: null, top: null, bottom: null, front: null, back: null, sides: null },
        enemies: [e], containers: [], groundItems: [],
        map: { width: 20, height: 20, isWalkable: () => true },
    };
    return g;
}
function draw(e) {
    const g = scene(e);
    const { r, rects, texts, cells } = rig();
    const px = VP.origin.x + (e.x - g.playerX) * TILE_PX, py = VP.origin.y + (e.y - g.playerY) * TILE_PX;
    r._drawEnemySprite(g, e, px, py, 0);
    return { g, rects, texts, cells };
}
const barRects = (rects) => rects.filter(r => r.style === '#000000cc');

describe('an ant is drawn as pests, not as a fighter', () => {
    test('the ant draws its mites from the ant sheet, not the red square', () => {
        const { cells, rects } = draw(mkAnt());
        assert.equal(cells.length, 1);
        assert.equal(cells[0].name, 'ant');
        assert.ok(cells[0].col >= 0 && cells[0].col <= 3 && cells[0].row === 0, JSON.stringify(cells[0]));
        assert.ok(!rects.some(r => r.style === '#cc4433'), 'the fallback square was drawn');
    });

    test('the control: a goon in the same spot has its HP bar and its label', () => {
        const goon = mkGoon();
        const { g, rects, texts } = draw(goon);
        assert.ok(barRects(rects).length >= 2, 'the goon has an HP bar and a label box');
        assert.ok(texts.some(t => t.includes(' · ')), `the goon has a label (${texts})`);
        assert.ok(defaultVerb({ x: goon.x, y: goon.y, npc: goon }, g), 'the goon has a verb to name');
    });

    test('an ant shows no HP bar, no wallet pips, no type label', () => {
        const ant = mkAnt();
        const { g, rects, texts } = draw(ant);
        assert.ok(defaultVerb({ x: ant.x, y: ant.y, npc: ant }, g), 'the ant has a verb, so only the pest rule hides its label');
        assert.deepEqual(barRects(rects), [], 'a bar or label box was drawn');
        assert.deepEqual(texts, [], `text drawn over an ant: ${texts}`);
    });

    test('a squashed ant leaves no K.O. word and no grey square; a squashed goon does', () => {
        const dead = (e) => { e.entity.hp = 0; e.entity.alive = false; return draw(e); };
        const goon = dead(mkGoon());
        assert.ok(goon.texts.some(t => t.startsWith('[KO]')), 'the control goon should show its K.O. tag');
        const ant = dead(mkAnt());
        assert.deepEqual(ant.texts, []);
        assert.ok(!ant.rects.some(r => /^rgba\(60, 60, 60/.test(r.style)), 'the corpse tint was drawn over an ant');
    });
});
