// tv-intro.test.js — the game opens like a TV switching on (plans/tv1-tv-opening.md).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { introAt, drawTvIntro, isSkipKey, TOTAL_MS, STILL_MS, BLACK_MS, LINE_MS, OPEN_MS, HOLD_MS, W, H, CARD }
    from '../game/tv-intro.js';

// ── A tiny rasteriser: the intro is only fillRect and drawText, so a test can
// paint the frames into a pixel buffer and measure what a player's eyes would.
function parseColor(c) {
    let m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c);
    if (m) return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
    m = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(c);
    if (m) return [+m[1], +m[2], +m[3]];
    throw new Error('colour the test does not know: ' + c);
}

function makeCanvas(base = [14, 12, 8]) {
    const px = new Float32Array(W * H * 3);
    for (let i = 0; i < W * H; i++) { px[i * 3] = base[0]; px[i * 3 + 1] = base[1]; px[i * 3 + 2] = base[2]; }
    const ctx = {
        fillStyle: '#000000', globalAlpha: 1,
        fillRect(x, y, w, h) {
            const [r, g, b] = parseColor(this.fillStyle);
            const a = this.globalAlpha;
            for (let yy = Math.max(0, y); yy < Math.min(H, y + h); yy++) {
                for (let xx = Math.max(0, x); xx < Math.min(W, x + w); xx++) {
                    const i = (yy * W + xx) * 3;
                    px[i] += (r - px[i]) * a; px[i + 1] += (g - px[i + 1]) * a; px[i + 2] += (b - px[i + 2]) * a;
                }
            }
        },
    };
    // text is a solid box the size of its glyph run: a worst-case stand-in
    const font = {
        drawText(c, text, x, y, { color = '#ffffff', scale = 1, align = 'left' } = {}) {
            const w = text.length * 4 * scale, h = 8 * scale;
            const left = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
            const was = c.fillStyle; c.fillStyle = color;
            c.fillRect(Math.round(left), Math.round(y), Math.round(w), Math.round(h));
            c.fillStyle = was;
        },
    };
    return { px, ctx, font };
}

const luma = (r, g, b) => 0.2126 * (r / 255) ** 2.2 + 0.7152 * (g / 255) ** 2.2 + 0.0722 * (b / 255) ** 2.2;
function measure(px) {
    let sum = 0, red = 0;
    const n = W * H;
    for (let i = 0; i < n; i++) {
        const r = px[i * 3], g = px[i * 3 + 1], b = px[i * 3 + 2];
        sum += luma(r, g, b);
        if (r > 128 && r > 2 * g && r > 2 * b) red++;
    }
    return { luma: sum / n, red: red / n };
}

function frameAt(ms, opts) {
    const c = makeCanvas();
    drawTvIntro(c.ctx, c.font, introAt(ms, opts));
    return c.px;
}

// Sharp changes in any one second: frame-to-frame jumps in the screen's mean
// brightness of at least 10% of the range, counted in every 1 s window.
function sharpChangesPerSecond(levels, fps) {
    const jumps = [];
    for (let i = 1; i < levels.length; i++) if (Math.abs(levels[i] - levels[i - 1]) >= 0.1) jumps.push(i);
    let worst = 0;
    for (const j of jumps) worst = Math.max(worst, jumps.filter((k) => k >= j && k < j + fps).length);
    return worst;
}

describe('the timeline', () => {
    test('it takes under two seconds, and the pieces add up to it', () => {
        assert.ok(TOTAL_MS < 2000);
        assert.equal(TOTAL_MS, BLACK_MS + LINE_MS + OPEN_MS + HOLD_MS + 250);
    });
    test('black first: nothing is lit', () => {
        const f = introAt(0);
        assert.deepEqual([f.lineW, f.lineLevel, f.open, f.done], [0, 0, 0, false]);
    });
    test('then a line grows across the middle, with the picture still shut', () => {
        const f = introAt(BLACK_MS + LINE_MS / 2);
        assert.ok(f.lineW > 0 && f.lineW < 1);
        assert.ok(f.lineLevel > 0);
        assert.equal(f.open, 0);
    });
    test('the line opens into the picture, then the card holds', () => {
        const mid = introAt(BLACK_MS + LINE_MS + OPEN_MS / 2);
        assert.ok(mid.open > 0 && mid.open < 1 && mid.lineW === 1);
        const hold = introAt(BLACK_MS + LINE_MS + OPEN_MS + HOLD_MS / 2);
        assert.deepEqual([hold.open, hold.cardAlpha, hold.lineLevel], [1, 1, 0]);
    });
    test('the card melts into the title, then the opening is done', () => {
        const fade = introAt(TOTAL_MS - 100);
        assert.ok(fade.cardAlpha > 0 && fade.cardAlpha < 1);
        assert.equal(introAt(TOTAL_MS).done, true);
        assert.equal(introAt(TOTAL_MS + 5000).done, true);
    });
    test('the picture only ever opens: no step backwards before the fade', () => {
        let open = 0, w = 0;
        for (let ms = 0; ms < TOTAL_MS - 250; ms += 8) {
            const f = introAt(ms);
            assert.ok(f.open >= open && f.lineW >= w, `went back at ${ms} ms`);
            open = f.open; w = f.lineW;
        }
    });
    test('a bad time reads as the start', () => {
        assert.equal(introAt(-5).open, 0);
        assert.equal(introAt(NaN).done, false);
    });
});

describe('reduce motion', () => {
    test('the still card shows from the first frame', () => {
        const f = introAt(0, { reduceMotion: true });
        assert.deepEqual([f.still, f.open, f.cardAlpha, f.lineW, f.done], [true, 1, 1, 0, false]);
    });
    test('nothing moves: every frame is the same until the card goes', () => {
        const first = frameAt(0, { reduceMotion: true });
        for (let ms = 16; ms < STILL_MS; ms += 16) {
            assert.deepEqual(introAt(ms, { reduceMotion: true }), introAt(0, { reduceMotion: true }), `moved at ${ms} ms`);
            assert.deepEqual(frameAt(ms, { reduceMotion: true }), first, `repainted differently at ${ms} ms`);
        }
    });
    test('the still card then gives way to the title, with no fade', () => {
        const f = introAt(STILL_MS, { reduceMotion: true });
        assert.equal(f.done, true);
        assert.ok(STILL_MS < TOTAL_MS);
    });
    test('the card is on the screen: it is lit, not black', () => {
        const { luma: l } = measure(frameAt(0, { reduceMotion: true }));
        assert.ok(l > 0.01);
    });
});

describe('which keys skip', () => {
    test('any ordinary key does, Space included', () => {
        for (const key of [' ', 'Enter', 'a', 'Escape', 'ArrowUp', 'Tab']) assert.equal(isSkipKey({ key }), true, key);
    });
    test('a modifier on its own does not, nor a shortcut or a function key', () => {
        for (const key of ['Shift', 'Control', 'Alt', 'Meta']) assert.equal(isSkipKey({ key }), false, key);
        assert.equal(isSkipKey({ key: 'r', ctrlKey: true }), false);
        assert.equal(isSkipKey({ key: 'F5' }), false);
        assert.equal(isSkipKey({ key: 'F12' }), false);
        assert.equal(isSkipKey(null), false);
    });
});

describe('gentle on the eyes', () => {
    const FPS = 60;
    const frames = [];
    for (let ms = 0; ms <= TOTAL_MS + 100; ms += 1000 / FPS) frames.push(measure(frameAt(ms)));
    // the title screen standing alone after the card has melted, drawn as the
    // intro's under-layer is: same base colour
    const levels = frames.map((f) => f.luma);

    test('the sampler sees something: the opening is not all black', () => {
        assert.ok(frames.length > 100);
        assert.ok(Math.max(...levels) > 0.01, 'no lit frame at all');
        assert.ok(Math.max(...levels) > Math.min(...levels));
    });
    test('no more than three sharp brightness changes in any second', () => {
        assert.ok(sharpChangesPerSecond(levels, FPS) <= 3);
    });
    test('in fact none: the biggest frame-to-frame jump is under 10% of the range', () => {
        let biggest = 0;
        for (let i = 1; i < levels.length; i++) biggest = Math.max(biggest, Math.abs(levels[i] - levels[i - 1]));
        assert.ok(biggest < 0.1, `jump of ${biggest}`);
    });
    test('no full-screen red, in any frame', () => {
        for (const f of frames) assert.ok(f.red < 0.01, `red share ${f.red}`);
    });
    test('the detector would catch a flasher (10 flashes a second) and a red screen', () => {
        const flasher = Array.from({ length: 60 }, (_, i) => (Math.floor(i / 3) % 2 ? 1 : 0));
        assert.ok(sharpChangesPerSecond(flasher, 60) > 3);
        const c = makeCanvas([200, 10, 10]);
        assert.ok(measure(c.px).red > 0.9);
    });
    test('the last frame of the opening hands over to the title without a jump', () => {
        const last = measure(frameAt(TOTAL_MS - 8)).luma;
        const title = measure(makeCanvas().px).luma;
        assert.ok(Math.abs(last - title) < 0.1);
    });
});

describe('the words', () => {
    test('every word but the game name is [TEXT]', () => {
        assert.equal(CARD.name, 'VIOLENCETOWN');
        assert.ok(CARD.lines.length > 0);
        for (const line of CARD.lines) assert.equal(line, '[TEXT]');
    });
});

describe('wired in', () => {
    const main = readFileSync(new URL('../game/main.js', import.meta.url), 'utf8');
    const renderer = readFileSync(new URL('../game/renderer.js', import.meta.url), 'utf8');
    test('main.js plays it where the title was first drawn, and skips it under the autoplay', () => {
        assert.match(main, /this\._startTvIntro\(splashCanvas\)/);
        assert.match(main, /window\.__autoplay\) \{ this\.renderer\.renderSplash/);
    });
    test('a button press ends it, so GAME START and CONTINUE work as today', () => {
        const starts = main.match(/this\._endTvIntro\?\.\(\)/g) || [];
        assert.ok(starts.length >= 2);
    });
    test('the renderer draws it on the splash canvas', () => {
        assert.match(renderer, /renderSplash\(splashCanvas, intro = null\)/);
        assert.match(renderer, /drawTvIntro\(ctx, this\.font, tv\)/);
    });
});
