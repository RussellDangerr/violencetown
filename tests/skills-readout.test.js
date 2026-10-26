// skills-readout.test.js — the Remoticon's skills readout (plans/us2-skill-readout.md).
// A band at the top of the RINGS tab lists each skill you have used cleanly and
// its rank as pips. The geometry is pure (layout.js deviceSkillsLayout); the
// draw is checked through a recording canvas, like dock-faces-render.test.js.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { deviceBodyRect, deviceRingsLayout, deviceSkillsLayout, deviceSkillsBand, rectsOverlap } from '../game/layout.js';
import { SKILLS } from '../game/skills.js';
import { Renderer, SKILL_LABELS } from '../game/renderer.js';
import { UI } from '../game/ui-sprites.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const BODY = deviceBodyRect();
const RANKS = SKILLS.light_fingers.ranks.map((r) => r.at);   // the counts each rank needs, read not restated
const inside = (r, o) => r.x >= o.x && r.y >= o.y && r.x + r.w <= o.x + o.w && r.y + r.h <= o.y + o.h;

describe('which skills the readout lists', () => {
    test('no skills, or no record at all, lists nothing', () => {
        assert.deepEqual(deviceSkillsLayout(BODY, {}).rows, []);
        assert.deepEqual(deviceSkillsLayout(BODY, undefined).rows, []);
        assert.deepEqual(deviceSkillsLayout(BODY, { light_fingers: 0 }).rows, []);
    });

    test('an unknown skill id is not listed', () => {
        assert.deepEqual(deviceSkillsLayout(BODY, { not_a_skill: 40 }).rows, []);
    });

    test('a skill appears after its first clean use, at rank 0 with every pip unlit', () => {
        const [row] = deviceSkillsLayout(BODY, { light_fingers: 1 }).rows;
        assert.equal(row.id, 'light_fingers');
        assert.equal(row.rank, 0);
        assert.equal(row.of, SKILLS.light_fingers.ranks.length);
        assert.equal(row.pips.length, row.of);
        assert.ok(row.pips.every((p) => !p.lit));
    });

    test('each rank reached lights one more pip, left to right', () => {
        for (let k = 0; k < RANKS.length; k++) {
            const [row] = deviceSkillsLayout(BODY, { light_fingers: RANKS[k] }).rows;
            assert.equal(row.rank, k + 1, `at ${RANKS[k]} clean uses`);
            assert.deepEqual(row.pips.map((p) => p.lit), row.pips.map((_, i) => i <= k));
        }
        const [justShort] = deviceSkillsLayout(BODY, { light_fingers: RANKS[0] - 1 }).rows;
        assert.equal(justShort.rank, 0);
    });
});

describe('where the readout sits', () => {
    test('the band sits below the tab title and inside the body', () => {
        const band = deviceSkillsBand(BODY);
        assert.ok(band.y >= BODY.y + 14, 'clear of "THE HANDS", drawn at body.y - 2');
        assert.ok(inside(band, BODY));
    });

    test('the band clears every socket and finger at every ring tier', () => {
        const band = deviceSkillsBand(BODY);
        for (let tier = 0; tier <= 4; tier++) {
            const { hands, sockets } = deviceRingsLayout(BODY, { ringTier: tier, ringSlots: {} });
            assert.ok(sockets.length > 0);
            for (const s of sockets) assert.ok(!rectsOverlap(band, s), `tier ${tier} socket ${s.key}`);
            for (const h of hands) {
                for (const f of h.fingers) {
                    const stalk = { x: f.cx - 6, y: f.tipY, w: 12, h: h.palmY - f.tipY };
                    assert.ok(!rectsOverlap(band, stalk), `tier ${tier} finger ${f.key}`);
                }
            }
        }
    });

    test('a row, its pips and its label room stay inside the band', () => {
        const { band, rows } = deviceSkillsLayout(BODY, { light_fingers: RANKS.at(-1) });
        const [row] = rows;
        assert.ok(inside(row, band));
        assert.ok(row.labelW > 0);
        for (const p of row.pips) {
            assert.ok(inside(p, row));
            assert.ok(p.x >= row.x + row.labelW, 'pips start right of the label room');
        }
        for (let i = 1; i < row.pips.length; i++) assert.ok(!rectsOverlap(row.pips[i - 1], row.pips[i]));
    });

    test('more skills than the band holds are left off, never drawn over the hands', () => {
        const added = [];
        try {
            for (let i = 0; i < 8; i++) {
                const id = `test_skill_${i}`;
                SKILLS[id] = { ranks: [{ at: 1, perk: {} }] };
                added.push(id);
            }
            const skills = Object.fromEntries(['light_fingers', ...added].map((id) => [id, 1]));
            const { band, rows } = deviceSkillsLayout(BODY, skills);
            assert.ok(rows.length >= 2 && rows.length < added.length + 1, `rows: ${rows.length}`);
            for (const r of rows) assert.ok(inside(r, band));
            for (let i = 1; i < rows.length; i++) assert.ok(!rectsOverlap(rows[i - 1], rows[i]));
            assert.equal(rows[0].id, 'light_fingers', 'in SKILLS order');
        } finally {
            for (const id of added) delete SKILLS[id];
        }
    });
});

// A context that records the calls it was asked to make.
function recorder() {
    const calls = [];
    const state = { globalAlpha: 1, fillStyle: null, strokeStyle: null, lineWidth: 1 };
    const ctx = new Proxy(state, {
        get(t, k) {
            if (k in t) return t[k];
            return (...a) => { calls.push({ fn: k, a, fill: t.fillStyle, stroke: t.strokeStyle }); };
        },
        set(t, k, v) { t[k] = v; return true; },
    });
    return { ctx, calls };
}

function rig() {
    const { ctx, calls } = recorder();
    const drawn = [];
    const r = Object.assign(Object.create(Renderer.prototype), {
        ctx, sprites: { uiPanel: null },
        font: {
            drawText: (c, text, x, y, o = {}) => drawn.push({ text, x, y, color: o.color }),
            measure: (text, scale = 1) => String(text).length * 8 * scale,
        },
    });
    return { r, drawn, calls };
}

describe('what the readout draws', () => {
    test('every skill has a label entry', () => {
        for (const id of Object.keys(SKILLS)) assert.ok(typeof SKILL_LABELS[id] === 'string' && SKILL_LABELS[id], id);
    });

    test('with no skills it draws nothing', () => {
        const { r, drawn, calls } = rig();
        r._drawDeviceSkills({ skills: {} }, BODY);
        assert.equal(drawn.length, 0);
        assert.equal(calls.length, 0);
    });

    test('a ranked skill draws its label and one filled pip per rank reached', () => {
        const { r, drawn, calls } = rig();
        r._drawDeviceSkills({ skills: { light_fingers: RANKS[0] } }, BODY);
        const [row] = deviceSkillsLayout(BODY, { light_fingers: RANKS[0] }).rows;
        assert.equal(drawn.length, 1);
        assert.equal(drawn[0].text, SKILL_LABELS.light_fingers);
        assert.equal(drawn[0].color, UI.gold);
        const filled = calls.filter((c) => c.fn === 'fillRect');
        const hollow = calls.filter((c) => c.fn === 'strokeRect');
        assert.equal(filled.length, 1);
        assert.equal(hollow.length, row.of - 1);
        assert.deepEqual(filled[0].a, [row.pips[0].x, row.pips[0].y, row.pips[0].w, row.pips[0].h]);
    });

    test('a skill used but not yet ranked draws dim, with no pip filled', () => {
        const { r, drawn, calls } = rig();
        r._drawDeviceSkills({ skills: { light_fingers: 1 } }, BODY);
        assert.equal(drawn[0].color, UI.dim);
        assert.equal(calls.filter((c) => c.fn === 'fillRect').length, 0);
    });

    test('the RINGS tab draws the readout alongside the hands', () => {
        const { r, drawn } = rig();
        r._drawDeviceRings({ skills: { light_fingers: RANKS[1] }, ringTier: 0, ringSlots: {}, discoveredFusions: [] }, BODY);
        const texts = drawn.map((d) => d.text);
        assert.ok(texts.includes('THE HANDS'));
        assert.ok(texts.includes(SKILL_LABELS.light_fingers), JSON.stringify(texts));
    });
});
