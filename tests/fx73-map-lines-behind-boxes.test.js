// fx73-map-lines-behind-boxes.test.js: the Map tab's connectors stay behind the zone boxes
// (plans/fx73-map-lines-behind-boxes.md). The real _drawWorldMapBody draws onto a small
// software canvas that blends fills and rasterises straight strokes, and pixels are sampled.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Renderer } from '../game/renderer.js';
import { WORLD_ZONES } from '../game/world-map.js';
import { UI } from '../game/ui-sprites.js';

const W = 700, H = 500;
const BOX = { w: 92, h: 40, gx: 26, gy: 20 };

function parse(c) {
    let m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c);
    if (m) return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16), 1];
    m = /^rgba?\(([^)]+)\)$/.exec(c);
    if (m) { const p = m[1].split(',').map(Number); return [p[0], p[1], p[2], p[3] ?? 1]; }
    throw new Error(`colour ${c}`);
}

function softCanvas(bg) {
    const px = new Float64Array(W * H * 3);
    for (let i = 0; i < W * H; i++) { px[i * 3] = bg[0]; px[i * 3 + 1] = bg[1]; px[i * 3 + 2] = bg[2]; }
    const blend = (x, y, col, a) => {
        x = Math.round(x); y = Math.round(y);
        if (x < 0 || y < 0 || x >= W || y >= H) return;
        for (let k = 0; k < 3; k++) px[(y * W + x) * 3 + k] = px[(y * W + x) * 3 + k] * (1 - a) + col[k] * a;
    };
    let path = [];
    const ctx = {
        globalAlpha: 1, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1,
        fillRect(x, y, w, h) {
            const [r, g, b, a] = parse(this.fillStyle);
            for (let j = Math.round(y); j < Math.round(y + h); j++) for (let i = Math.round(x); i < Math.round(x + w); i++) blend(i, j, [r, g, b], a * this.globalAlpha);
        },
        beginPath() { path = []; }, moveTo(x, y) { path.push([x, y]); }, lineTo(x, y) { path.push([x, y]); },
        stroke() {
            const [r, g, b, a] = parse(this.strokeStyle);
            const [p, q] = path;
            const n = Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) * 2);
            const seen = new Set();
            for (let i = 0; i <= n; i++) {
                const cx = p[0] + (q[0] - p[0]) * i / n, cy = p[1] + (q[1] - p[1]) * i / n;
                for (let dy = -1; dy <= 0; dy++) for (let dx = -1; dx <= 0; dx++) {
                    const key = `${Math.round(cx) + dx},${Math.round(cy) + dy}`;
                    if (!seen.has(key)) { seen.add(key); blend(Math.round(cx) + dx, Math.round(cy) + dy, [r, g, b], a * this.globalAlpha); }
                }
            }
        },
        strokeRect() {},
    };
    return { ctx, at: (x, y) => [0, 1, 2].map(k => px[(Math.round(y) * W + Math.round(x)) * 3 + k]) };
}

function drawMap(visited) {
    const bg = parse(UI.panelBg);
    const { ctx, at } = softCanvas(bg);
    const r = Object.assign(Object.create(Renderer.prototype), { ctx, font: { drawText() {} } });
    const R = { x: 0, y: 0, w: W, h: H }, top = 20;
    r._drawWorldMapBody({ map: { zoneName: 'TOWN' }, _visitedZones: visited, questEngine: null }, R, top);
    const cols = WORLD_ZONES.map(z => z.col), rows = WORLD_ZONES.map(z => z.row);
    const c0 = Math.min(...cols), r0 = Math.min(...rows);
    const gridW = (Math.max(...cols) - c0) * (BOX.w + BOX.gx) + BOX.w, gridH = (Math.max(...rows) - r0) * (BOX.h + BOX.gy) + BOX.h;
    const ox = R.x + Math.round((R.w - gridW) / 2), oy = top + Math.round(((R.y + R.h - 30 - top) - gridH) / 2);
    const box = (n) => { const z = WORLD_ZONES.find(q => q.zoneName === n); return { x: ox + (z.col - c0) * (BOX.w + BOX.gx), y: oy + (z.row - r0) * (BOX.h + BOX.gy) }; };
    return { at, box, bg };
}

// Points inside the Sewer box on the Canyon to Valley centre line.
function lineSamples(box) {
    const a = box('CANYON'), b = box('VALLEY'), s = box('SEWER');
    const A = { x: a.x + BOX.w / 2, y: a.y + BOX.h / 2 }, B = { x: b.x + BOX.w / 2, y: b.y + BOX.h / 2 };
    const out = [];
    for (let y = s.y + 3; y <= s.y + BOX.h - 3; y += 3) {
        const x = A.x + (B.x - A.x) * (y - A.y) / (B.y - A.y);
        if (x >= s.x + 3 && x <= s.x + BOX.w - 3) out.push({ x, y });
    }
    return out;
}

const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

describe('FX73: map connectors stay behind the zone boxes', () => {
    test('the Canyon-Valley line is hidden inside the Sewer box, visited or not', () => {
        for (const visited of [new Set(['TOWN']), new Set(WORLD_ZONES.map(z => z.zoneName))]) {
            const { at, box } = drawMap(visited);
            const pts = lineSamples(box);
            assert.ok(pts.length >= 6, 'the line crosses the Sewer box');
            const s = box('SEWER');
            for (const p of pts) {
                const beside = at(p.x - 12, p.y);
                assert.deepEqual(at(p.x, p.y), beside, `no line at ${Math.round(p.x)},${Math.round(p.y)}`);
            }
            assert.ok(s.x > 0);
        }
    });

    test('the line does show in the gap between boxes (the connector is still drawn)', () => {
        const { at, box, bg } = drawMap(new Set(['TOWN']));
        const a = box('CANYON'), b = box('VALLEY');
        const A = { x: a.x + BOX.w / 2, y: a.y + BOX.h / 2 }, B = { x: b.x + BOX.w / 2, y: b.y + BOX.h / 2 };
        const y = a.y + BOX.h + BOX.gy / 2;   // in the gap below the Canyon box, between box rows
        const x = A.x + (B.x - A.x) * (y - A.y) / (B.y - A.y);
        assert.ok(dist(at(x, y), bg) > 20, 'the connector pixel differs from the panel');
    });

    test('an unvisited zone is still fainter than a visited one', () => {
        const dim = drawMap(new Set(['TOWN']));
        const bright = drawMap(new Set(WORLD_ZONES.map(z => z.zoneName)));
        const s = dim.box('SEWER');
        const p = [s.x + 8, s.y + 6];
        assert.ok(dist(dim.at(...p), dim.bg) < dist(bright.at(...p), bright.bg), 'unvisited is nearer the panel colour');
        assert.notDeepEqual(dim.at(...p), bright.at(...p));
    });
});
