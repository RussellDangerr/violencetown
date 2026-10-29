// fight-panel-inset.test.js — (FX20) the fight panels' titles clear the
// frame's gold corner. The corner's reach is read from the panel atlas itself,
// so a redrawn corner that grows past the inset fails here instead of on screen.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { Renderer, PANEL_TEXT_INSET } from '../game/renderer.js';
import { DOCK, fightPanelRects } from '../game/layout.js';
import { computeViewport } from '../game/viewport.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

// Just enough PNG to read ui_panel.png: 8-bit RGBA, not interlaced.
function decodePng(buf) {
    let off = 8, w = 0, h = 0, depth = 0, colour = 0, interlace = 0;
    const idat = [];
    while (off < buf.length) {
        const len = buf.readUInt32BE(off);
        const type = buf.toString('ascii', off + 4, off + 8);
        const data = buf.subarray(off + 8, off + 8 + len);
        if (type === 'IHDR') {
            w = data.readUInt32BE(0); h = data.readUInt32BE(4);
            depth = data[8]; colour = data[9]; interlace = data[12];
        } else if (type === 'IDAT') idat.push(data);
        else if (type === 'IEND') break;
        off += 12 + len;
    }
    assert.equal(depth, 8, 'the panel atlas is 8-bit');
    assert.equal(colour, 6, 'the panel atlas is RGBA');
    assert.equal(interlace, 0, 'the panel atlas is not interlaced');
    const raw = inflateSync(Buffer.concat(idat));
    const bpp = 4, stride = w * bpp;
    const px = Buffer.alloc(h * stride);
    for (let y = 0; y < h; y++) {
        const f = raw[y * (stride + 1)];
        const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
        for (let i = 0; i < stride; i++) {
            const a = i >= bpp ? px[y * stride + i - bpp] : 0;
            const b = y > 0 ? px[(y - 1) * stride + i] : 0;
            const c = y > 0 && i >= bpp ? px[(y - 1) * stride + i - bpp] : 0;
            let v = line[i];
            if (f === 1) v += a;
            else if (f === 2) v += b;
            else if (f === 3) v += (a + b) >> 1;
            else if (f === 4) {
                const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
                v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
            }
            px[y * stride + i] = v & 255;
        }
    }
    return { w, h, at: (x, y) => [...px.subarray((y * w + x) * 4, (y * w + x) * 4 + 4)] };
}

// The frame's gold: the corner ornament and the edge lines are one warm,
// opaque colour; the parchment inside is dark. Gold here is bright red and
// green over a low blue.
const isGold = ([r, g, b, a]) => a > 0 && r > 150 && g > 120 && b < 140;

// The corner's reach: the right-most gold column in the base variant's 16×16
// top-left cell, skipping the top 2 rows (the frame's top edge, which runs the
// panel's whole width and is not the corner). Plus one, as a width.
function cornerReach() {
    const png = decodePng(readFileSync(new URL('../game/assets/ui_panel.png', import.meta.url)));
    let reach = 0;
    for (let y = 2; y < 16; y++) {
        for (let x = 0; x < 16; x++) if (isGold(png.at(x, y))) reach = Math.max(reach, x + 1);
    }
    return reach;
}

function recorder() {
    const state = { globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: null, strokeStyle: null, filter: 'none' };
    return new Proxy(state, {
        get(t, k) {
            if (k in t) return t[k];
            return () => ({ addColorStop() {} });
        },
        set(t, k, v) { t[k] = v; return true; },
    });
}

const VP = computeViewport({ cssW: 3440, cssH: 1440, dpr: 1, dock: DOCK });

function rig() {
    const drawn = [];
    const r = Object.assign(Object.create(Renderer.prototype), {
        ctx: recorder(), canvas: { width: VP.backingW, height: VP.backingH },
        viewport: VP, sprites: { uiPanel: null },
        font: {
            drawText: (ctx, text, x, y, o = {}) => drawn.push({ text, x, y, color: o.color }),
            measure: (s, scale = 1) => String(s).length * 8 * scale,
        },
        _fightFace: true, _hudFor: null, _hudFaceFor: null, _hudCache: null,
    });
    return { r, drawn };
}

const foe = (type = 'Wererat') => ({
    type, x: 12, y: 10, ambient: false, state: 'chasing', sightRange: 8, thievable: true,
    entity: { isAlive: () => true, hp: 7, maxHp: 12, armor: 2 },
    gold: 40, loadout: ['rock'], equipped: ['soap'],
});
const game = (enemy = foe()) => ({
    playerX: 10, playerY: 10, _fightOn: true, wheel: null,
    equipment: { weapon: { id: 'wooden_sword', name: '[Wooden Sword]' }, top: null, bottom: null,
                 front: null, back: null, sides: null },
    enemies: [enemy],
});

describe('(FX20) the fight panel titles clear the gold corner', () => {
    test('the corner is measured from the atlas, and is a real ornament', () => {
        const reach = cornerReach();
        assert.ok(reach > 2, `corner reach ${reach} px reads as no more than the edge line`);
        assert.ok(reach < 16, `corner reach ${reach} px fills the whole cell`);
    });

    test('the shared inset is at least as wide as the corner', () => {
        assert.ok(PANEL_TEXT_INSET >= cornerReach(),
            `inset ${PANEL_TEXT_INSET} px is narrower than the ${cornerReach()} px corner`);
    });

    test('YOU starts past the left corner', () => {
        const { r, drawn } = rig();
        r._drawFightPanels(game());
        const p = fightPanelRects(r._view());
        const you = drawn.find((d) => d.text === 'YOU');
        assert.ok(you, 'YOU was drawn');
        assert.equal(you.x - p.left.x, PANEL_TEXT_INSET);
        assert.ok(you.x - p.left.x >= cornerReach());
    });

    test("the target's name starts past the left corner and stops short of the right one", () => {
        const { r, drawn } = rig();
        r._drawFightPanels(game(foe('Wererat Wererat Wererat Wererat')));
        const p = fightPanelRects(r._view());
        const title = drawn.find((d) => d.y === Math.min(...drawn.filter((e) => e.x >= p.right.x).map((e) => e.y))
            && d.x >= p.right.x);
        assert.ok(title, 'the target panel drew a title');
        assert.ok(/WERERAT/.test(title.text), title.text);
        assert.equal(title.x - p.right.x, PANEL_TEXT_INSET);
        const right = title.x + r._measurer(1)(title.text);
        assert.ok(right <= p.right.x + p.right.w - cornerReach(),
            `the name ends at ${right}, inside the right corner (panel ends ${p.right.x + p.right.w})`);
    });
});
