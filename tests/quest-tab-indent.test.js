// quest-tab-indent.test.js — FX29: in the Quests tab, the current stage's
// description lines up under its location, on every wrapped line. The old code
// padded with leading spaces, which the word wrap drops.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Renderer } from '../game/renderer.js';
import { BitmapFont } from '../game/bitmap-font.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const FONT = new BitmapFont();
const px = (s) => FONT.measure(s, 1);
// Where the first visible letter lands: the draw x plus any leading spaces.
const inkX = (d) => d.x + px(d.text.match(/^ */)[0]);

function draw(R, stage) {
    const drawn = [];
    const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })), set: (t, k, v) => { t[k] = v; return true; } });
    const r = Object.assign(Object.create(Renderer.prototype), {
        ctx, sprites: { uiPanel: null },
        font: { measure: (s, sc = 1) => FONT.measure(s, sc), drawText: (c, text, x, y, o = {}) => drawn.push({ text, x, y, color: o.color }) },
    });
    r._drawJournalQuestsBody({ questEngine: {
        getActiveQuestView: () => ({ title: 'T', stages: [stage] }),
        getCompletedTitles: () => [], getCompletedCount: () => ({ done: 0, total: 1 }),
        getJournalLines: () => [],
    } }, R);
    return drawn;
}

describe('the Quests tab indents the description under the location', () => {
    const desc = 'Tear down the barricade and escape the sewer before the water comes up past the third rung of the ladder';
    const stage = { objective: 'Go', done: false, current: true, location: 'SEWER GATE', description: desc };

    for (const w of [300, 200]) {
        test(`${w} px wide: every description line starts at the location's x and fits`, () => {
            const R = { x: 0, y: 0, w, h: 500 };
            const drawn = draw(R, stage);
            const loc = drawn.find((d) => d.text.includes('SEWER GATE'));
            assert.ok(loc, JSON.stringify(drawn.map((d) => d.text)));
            const lines = drawn.filter((d) => desc.includes(d.text) && d.text.includes(' '));
            assert.ok(lines.length >= 2, `want a description that wraps, got ${lines.length} lines`);
            assert.equal(lines.map((d) => d.text).join(' '), desc, 'no words lost');
            for (const d of lines) {
                assert.equal(inkX(d), inkX(loc), `"${d.text}" starts at ${inkX(d)}, the location at ${inkX(loc)}`);
                assert.ok(d.x + px(d.text) <= R.x + 22 + 6 + (R.w - 56) + 0.001, `"${d.text}" runs past the tab body`);
            }
        });
    }

    test('the location and description sit to the right of the objective line', () => {
        const drawn = draw({ x: 0, y: 0, w: 600, h: 500 }, stage);
        const obj = drawn.find((d) => d.text.includes('Go'));
        const loc = drawn.find((d) => d.text.includes('SEWER GATE'));
        assert.ok(inkX(loc) > inkX(obj), `location ${inkX(loc)} vs objective ${inkX(obj)}`);
    });

    test('a stage that is not current shows no location or description', () => {
        const drawn = draw({ x: 0, y: 0, w: 600, h: 500 }, { ...stage, current: false });
        assert.ok(!drawn.some((d) => d.text.includes('SEWER GATE') || d.text.includes('barricade')));
    });
});
