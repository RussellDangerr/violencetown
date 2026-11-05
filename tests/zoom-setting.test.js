// zoom-setting.test.js — the Closer / Farther zoom (plans/zm1-zoom-steps.md).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    computeViewport, zoomRange, stepZoom, zoomToSave, readZoom, writeZoom,
    ZOOM_KEY, MIN_TILES, MENU_SIZE, ART_PX,
} from '../game/viewport.js';

const SCREENS = {
    "Caelan's monitor": { cssW: 3440, cssH: 1440, dpr: 1 },
    '1080p fullscreen': { cssW: 1920, cssH: 1080, dpr: 1 },
    '1080p browser':    { cssW: 1920, cssH: 940,  dpr: 1 },
    '1440p':            { cssW: 2560, cssH: 1440, dpr: 1 },
    'laptop':           { cssW: 1440, cssH: 900,  dpr: 2 },
    '4K':               { cssW: 3840, cssH: 2160, dpr: 1 },
    'phone upright':    { cssW: 390,  cssH: 844,  dpr: 3 },
};
const at = (s, zoom) => computeViewport({ ...s, zoom });

// A localStorage stand-in, and one that refuses everything.
const memory = () => {
    const m = new Map();
    return {
        getItem: (k) => (m.has(k) ? m.get(k) : null),
        setItem: (k, v) => { m.set(k, String(v)); },
        removeItem: (k) => { m.delete(k); },
        _m: m,
    };
};
const broken = () => ({
    getItem() { throw new Error('denied'); },
    setItem() { throw new Error('denied'); },
    removeItem() { throw new Error('denied'); },
});

describe('the steps a screen allows', () => {
    test('the expected steps for known screens', () => {
        const want = {
            "Caelan's monitor": { min: 1, auto: 4, max: 4 },
            '1080p fullscreen': { min: 1, auto: 3, max: 3 },
            '1080p browser':    { min: 1, auto: 2, max: 3 },   // 940 / 304 = 3.09: x3 still fits the menus
            '1440p':            { min: 1, auto: 4, max: 4 },
            'laptop':           { min: 1, auto: 5, max: 5 },
            '4K':               { min: 1, auto: 6, max: 7 },
            'phone upright':    { min: 1, auto: 3, max: 3 },
        };
        for (const [name, s] of Object.entries(SCREENS)) {
            assert.deepEqual({ ...at(s).zoom }, want[name], name);
        }
    });

    test('the automatic step is always one of the steps, and every step is a whole scale', () => {
        for (const dpr of [1, 1.5, 2, 3]) {
            for (let w = 300; w <= 3840; w += 211) {
                for (let h = 300; h <= 2160; h += 173) {
                    const r = zoomRange(Math.floor(w * dpr), Math.floor(h * dpr));
                    assert.ok(Number.isInteger(r.min) && Number.isInteger(r.auto) && Number.isInteger(r.max));
                    assert.ok(r.min <= r.auto && r.auto <= r.max, `${w}x${h}@${dpr}`);
                }
            }
        }
    });

    test('the closest step still leaves a whole menu on screen; the next one would not', () => {
        for (const s of Object.values(SCREENS)) {
            const vp = at(s);
            const short = Math.min(vp.backingW, vp.backingH);
            const logicalShort = (k) => short / (k / ART_PX);
            assert.ok(logicalShort(vp.zoom.max) >= MENU_SIZE);
            assert.ok(logicalShort(vp.zoom.max + 1) < MENU_SIZE);
        }
    });

    test('farther than automatic always keeps the 20-tile floor', () => {
        for (const s of Object.values(SCREENS)) {
            const vp = at(s);
            const short = Math.min(vp.backingW, vp.backingH);
            for (let k = vp.zoom.min; k <= vp.zoom.auto; k++) {
                assert.ok(short / (16 * k) >= MIN_TILES, `${k} on ${s.cssW}x${s.cssH}`);
            }
        }
    });
});

describe('the setting changes the scale', () => {
    test('unset is exactly today: the same viewport as no zoom at all', () => {
        for (const s of Object.values(SCREENS)) {
            const today = computeViewport({ ...s });
            for (const unset of [undefined, null, 0, NaN, 'x', 2.5, -1]) {
                const vp = at(s, unset);
                assert.equal(vp.k, today.k);
                assert.equal(vp.rows, today.rows);
                assert.deepEqual(vp.origin, today.origin);
                assert.deepEqual(vp.menu, today.menu);
            }
        }
    });

    test('Farther shows more tiles, and every step is a whole pixel scale', () => {
        const s = SCREENS["Caelan's monitor"];
        let prevRows = 0;
        for (let k = 4; k >= 1; k--) {
            const vp = at(s, k);
            assert.equal(vp.k, k);
            assert.ok(Number.isInteger(vp.k));
            assert.ok(vp.rows > prevRows);
            prevRows = vp.rows;
        }
        assert.equal(at(s, 3).rows, 30);   // 1440 / 48
        assert.equal(at(s, 2).rows, 45);
    });

    test('Closer shows fewer tiles where the screen has room for it', () => {
        const s = SCREENS['1080p browser'];
        assert.ok(at(s, 3).rows < at(s).rows);
        assert.equal(at(s, 3).k, 3);
    });

    test('a zoom the screen cannot take is held to its nearest step', () => {
        const s = SCREENS['1080p fullscreen'];
        assert.equal(at(s, 9).k, 3);
        assert.equal(at(s, 1).k, 1);
    });

    test('menus keep their size and stay on screen at every step', () => {
        for (const s of Object.values(SCREENS)) {
            const r = at(s).zoom;
            for (let k = r.min; k <= r.max; k++) {
                const vp = at(s, k);
                assert.equal(vp.menu.w, MENU_SIZE);
                assert.equal(vp.menu.h, MENU_SIZE);
                assert.ok(vp.menu.y + MENU_SIZE <= vp.h + 1e-9, `${s.cssW}x${s.cssH} x${k}: menu runs off the bottom`);
            }
        }
    });

    test('a step moves one at a time and stops at the ends', () => {
        const r = { min: 1, auto: 2, max: 3 };
        assert.equal(stepZoom(r, 2, +1), 3);
        assert.equal(stepZoom(r, 3, +1), 3);
        assert.equal(stepZoom(r, 2, -1), 1);
        assert.equal(stepZoom(r, 1, -1), 1);
    });

    test('choosing the automatic step saves nothing, so it keeps following the screen', () => {
        const r = { min: 1, auto: 2, max: 3 };
        assert.equal(zoomToSave(r, 2), null);
        assert.equal(zoomToSave(r, 3), 3);
        assert.equal(zoomToSave(r, 1), 1);
    });
});

describe('the choice is saved and survives a reload', () => {
    test('what is written is what the next session reads', () => {
        const disk = memory();
        writeZoom(disk, 3);
        assert.equal(readZoom(disk), 3);
        const s = SCREENS['1080p browser'];
        assert.equal(at(s, readZoom(disk)).k, 3);   // the reloaded page opens at the saved step
    });

    test('nothing saved reads as automatic', () => {
        assert.equal(readZoom(memory()), null);
        assert.equal(readZoom(null), null);
        assert.equal(readZoom(undefined), null);
    });

    test('going back to automatic clears the saved value', () => {
        const disk = memory();
        writeZoom(disk, 2);
        writeZoom(disk, null);
        assert.equal(disk._m.has(ZOOM_KEY), false);
        assert.equal(readZoom(disk), null);
    });

    test('junk on disk reads as automatic', () => {
        for (const junk of ['{', 'abc', '"3"', '2.5', '0', '-1', 'null', '[]', '{"k":3}', '99999']) {
            const disk = memory();
            disk.setItem(ZOOM_KEY, junk);
            assert.equal(readZoom(disk), null, junk);
        }
    });

    test('storage that throws never takes the game down', () => {
        const quiet = console.warn; console.warn = () => {};
        try {
            assert.equal(readZoom(broken()), null);
            assert.doesNotThrow(() => writeZoom(broken(), 3));
            assert.doesNotThrow(() => writeZoom(null, 3));
        } finally { console.warn = quiet; }
    });

    test('the zoom has its own key: it never touches the options or the save', () => {
        const disk = memory();
        writeZoom(disk, 3);
        assert.deepEqual([...disk._m.keys()], [ZOOM_KEY]);
        assert.notEqual(ZOOM_KEY, 'violencetown.settings');
    });
});

describe('main.js and the Options panel are wired to it', () => {
    const main = readFileSync(new URL('../game/main.js', import.meta.url), 'utf8');
    const html = readFileSync(new URL('../game/index.html', import.meta.url), 'utf8');

    test('the saved zoom is read at boot and handed to the viewport', () => {
        assert.match(main, /this\._zoom = readZoom\(/);
        assert.match(main, /computeViewport\(\{[^}]*zoom: this\._zoom/);
    });

    test('Options has Farther and Closer buttons and a readout', () => {
        for (const id of ['opt-zoom-farther', 'opt-zoom-closer', 'opt-zoom-val']) {
            assert.ok(html.includes(`id="${id}"`), id);
            assert.ok(main.includes(`'${id}'`), `${id} is used by main.js`);
        }
    });
});
