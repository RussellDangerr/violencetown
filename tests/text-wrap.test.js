// text-wrap.test.js — text is fitted by its measured width, not 8 px a letter
// (plans/fx5-text-wrap-measured.md). The UI font is VT323 (~4.8 px a letter at
// scale 1); the old rule was sized for the retired 8x8 atlas and cut or wrapped
// with ~40% of the room still empty. Every check here measures with the real
// BitmapFont.measure, the same one the game draws with.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Renderer, cutToWidth, wrapToWidth } from '../game/renderer.js';
import { BitmapFont } from '../game/bitmap-font.js';
import { DOCK, fightPanelRects } from '../game/layout.js';
import { computeViewport } from '../game/viewport.js';
import { WEAPON_TIERS } from '../game/weapons.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const FONT = new BitmapFont();
const px = (s) => FONT.measure(s, 1);
const OLD_CHARS = (room) => Math.floor(room / 8);     // what the 8 px rule allowed

describe('cutToWidth', () => {
    test('text that fits comes back whole', () => {
        assert.equal(cutToWidth('FOIL HAT', 200, px), 'FOIL HAT');
        const exact = 'X'.repeat(10);
        assert.equal(cutToWidth(exact, px(exact), px), exact, 'exactly the room still fits');
    });

    test('a cut line fits its room, ends in ~, and is as long as the room allows', () => {
        const s = 'The car coughs, sputters, then roars to life and up north the bridge barricade rattles loose.';
        for (const room of [30, 61, 100, 157, 240, 333]) {
            const out = cutToWidth(s, room, px);
            assert.ok(out.endsWith('~'), `${room}: ${out}`);
            assert.ok(px(out) <= room, `${room}: ${px(out)} px > room`);
            const head = out.slice(0, -1);
            assert.ok(s.startsWith(head), 'the cut keeps the head of the text');
            assert.ok(px(s.slice(0, head.length + 1) + '~') > room, `${room}: one more letter would still fit`);
        }
    });

    test('a cut keeps more than the 8 px rule did', () => {
        const s = 'A'.repeat(200);
        const room = 300;
        assert.ok(cutToWidth(s, room, px).length > OLD_CHARS(room));
    });

    test('no room at all leaves just the mark', () => {
        assert.equal(cutToWidth('ABC', 1, px), '~');
    });
});

describe('wrapToWidth', () => {
    const s = 'Tear down the barricade and escape the sewer before the water comes up past the third rung of the ladder';

    test('every line fits, no words are lost, and no line could take the next word', () => {
        for (const room of [60, 120, 200, 356]) {
            const lines = wrapToWidth(s, room, px);
            assert.equal(lines.join(' '), s, `${room}: words in order`);
            for (const [i, ln] of lines.entries()) {
                assert.ok(px(ln) <= room, `${room}: "${ln}" is ${px(ln)} px`);
                const next = lines[i + 1];
                if (next) assert.ok(px(`${ln} ${next.split(' ')[0]}`) > room, `${room}: "${ln}" had room for more`);
            }
        }
    });

    test('a word wider than the room keeps a line to itself, unbroken', () => {
        assert.deepEqual(wrapToWidth('a SUPERCALIFRAGILISTIC b', 30, px), ['a', 'SUPERCALIFRAGILISTIC', 'b']);
    });

    test('wraps to fewer lines than the 8 px rule did', () => {
        const room = 356;
        const r = Object.create(Renderer.prototype);
        const old = r._wrapText(s, OLD_CHARS(room));
        assert.ok(wrapToWidth(s, room, px).length < old.length);
    });
});

// A renderer whose font records each string and measures like the real one.
function rig(vp) {
    const drawn = [];
    const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })), set: (t, k, v) => { t[k] = v; return true; } });
    const r = Object.assign(Object.create(Renderer.prototype), {
        ctx, viewport: vp, canvas: vp ? { width: vp.backingW, height: vp.backingH } : null,
        sprites: { uiPanel: null }, _fightFace: false, _hudFor: null, _hudFaceFor: null, _hudCache: null,
        font: { measure: (s, sc = 1) => FONT.measure(s, sc), drawText: (c, text, x, y, o = {}) => drawn.push({ text, x, y, color: o.color }) },
    });
    return { r, drawn };
}

const SIZES = [['3440x1440', 3440, 1440], ['1920x1080', 1920, 1080]];
const GREAT = WEAPON_TIERS.great_sword[0];

describe('the fight panels show long names whole', () => {
    for (const [name, w, h] of SIZES) {
        const vp = computeViewport({ cssW: w, cssH: h, dpr: 1, dock: DOCK });
        const P = fightPanelRects(vp);

        test(`${name}: the target panel lists DEFENCE POITION and CARDBOARD CUIRASS`, () => {
            const { r, drawn } = rig(vp);
            r._drawTargetPanel(P.right, {
                name: 'Wererat', hp: 66, maxHp: 100, armor: 0, gold: 20,
                kit: [{ id: 'a', name: 'Defence Poition' }, { id: 'b', name: '[Cardboard Cuirass]' }],
                takeable: { coin: true, kit: true, gear: false },
            });
            const texts = drawn.map((d) => d.text);
            assert.ok(texts.includes('DEFENCE POITION'), JSON.stringify(texts));
            assert.ok(texts.includes('CARDBOARD CUIRASS'), JSON.stringify(texts));
            for (const d of drawn) assert.ok(px(d.text) <= P.right.w - 12, `"${d.text}" runs past the panel`);
        });

        test(`${name}: the YOU panel shows a great sword in both hands by its full name`, () => {
            const { r, drawn } = rig(vp);
            const full = GREAT.name.replace(/[\[\]]/g, '').toUpperCase();
            r._drawGearPanel(P.left, { slots: [
                { label: 'RIGHT', name: GREAT.name }, { label: 'LEFT', name: GREAT.name },
            ] });
            assert.equal(drawn.filter((d) => d.text === full).length, 2, JSON.stringify(drawn.map((d) => d.text)));
            for (const d of drawn) assert.ok(px(d.text) <= P.left.w - 12, `"${d.text}" runs past the panel`);
        });
    }
});

describe('the dock log cuts at its edge, not halfway', () => {
    const FINALE = '[The car coughs, sputters, then ROARS to life - and up north the bridge barricade rattles loose. It is revving way past redline, though. Nothing that hot is making the ramp.]';
    for (const [name, w, h] of SIZES) {
        test(`${name}: the objective and every feed line fit, and the long one uses the room`, () => {
            const vp = computeViewport({ cssW: w, cssH: h, dpr: 1, dock: DOCK });
            const { r, drawn } = rig(vp);
            r._drawQuestLog({
                map: { zoneName: 'TOWN' }, _timeOfDay: () => '16:19',
                questEngine: { getHudText: () => 'x'.repeat(400) },
                _logStripMessages: [{ text: '[Entered TOWN]', category: 'transition' }, { text: FINALE, category: 'system' }],
            });
            const R = r._hud().log;
            const room = R.w - 24;
            const feed = drawn.find((d) => d.text.startsWith('[The car'));
            const obj = drawn.find((d) => d.text.startsWith('XXX'));
            assert.ok(feed && obj, JSON.stringify(drawn.map((d) => d.text)));
            for (const d of [feed, obj]) {
                assert.ok(px(d.text) <= room, `${px(d.text)} px > ${room}`);
                assert.ok(d.text.length > OLD_CHARS(room), `${d.text.length} letters is no better than the 8 px rule`);
            }
            if (px(FINALE) > room) assert.ok(px(feed.text) > room - px('XX'), 'the cut falls at the edge');
            assert.ok(drawn.some((d) => d.text === '[Entered TOWN]'), 'a short line is whole');
        });
    }
});

describe('the QUESTS tab and the inspector wrap to their width', () => {
    test('the witness log and stage lines fit the tab body', () => {
        const { r, drawn } = rig(null);
        const R = { x: 0, y: 0, w: 600, h: 500 };
        const long = 'Tear down the barricade and escape the sewer before the water comes up past the third rung';
        r._drawJournalQuestsBody({ questEngine: {
            getActiveQuestView: () => ({ title: 'T', stages: [{ objective: long, done: false, current: true, description: long }] }),
            getCompletedTitles: () => [], getCompletedCount: () => ({ done: 0, total: 1 }),
            getJournalLines: () => [{ text: long }, { text: long }],
        } }, R);
        const wrapped = drawn.filter((d) => /barricade|rung|sewer|Tear/.test(d.text));
        assert.ok(wrapped.length >= 4, JSON.stringify(drawn.map((d) => d.text)));
        for (const d of wrapped) assert.ok(px(d.text) <= R.w - 56, `"${d.text}" is ${px(d.text)} px`);
        assert.ok(wrapped.some((d) => d.text.length > OLD_CHARS(R.w - 56)), 'some line is longer than the 8 px rule allowed');
    });

    test('the inspect body fits the panel and takes fewer lines than before', () => {
        const { r, drawn } = rig(null);
        const body = 'Tear down the barricade and escape the sewer before the water comes up past the third rung of the ladder';
        r._fillScreen = () => {};
        r._drawInspectPanel({ inspect: { title: 'T', body } });
        const lines = drawn.filter((d) => body.includes(d.text) && d.text.includes(' '));
        assert.ok(lines.length >= 1, JSON.stringify(drawn.map((d) => d.text)));
        for (const d of lines) assert.ok(px(d.text) <= 400 - 44, `"${d.text}" is ${px(d.text)} px`);
        assert.equal(lines.map((d) => d.text).join(' '), body);
        assert.ok(lines.length < r._wrapText(body, OLD_CHARS(400 - 44)).length);
    });
});

test('renderer.js no longer sizes text at 8 px a letter', () => {
    const src = readFileSync(new URL('../game/renderer.js', import.meta.url), 'utf8');
    const hits = src.split('\n').filter((l) => /maxChars\s*=.*\/\s*8\b/.test(l) || /Math\.floor\([^\n]*\)\s*\/\s*8\)\)/.test(l));
    assert.deepEqual(hits, []);
});
