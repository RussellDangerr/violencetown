// boon-cap.test.js (BP5) — 12 boons at most, across kinds; the 13th is refused and kept; Quests reads n / 12.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ITEMS, BOON_KINDS, BOON_CAP, BOON_CAP_LINE, boonCount, resolveUse } from '../game/items.js';

const mainSrc = readFileSync('game/main.js', 'utf8');
const rendSrc = readFileSync('game/renderer.js', 'utf8');
const stub = () => ({ playerHp: 100, playerMaxHp: 100, playerMp: 50, playerMaxMp: 50, equipment: {}, tempEquips: [], buffs: [], boons: {} });
const drink = (g, kind) => { g._boonKind = kind; return resolveUse(g, ITEMS.boon_poition, null); };

test("the amounts are BPR3's (done by BP4b)", () => {
    assert.deepEqual(Object.fromEntries(Object.entries(BOON_KINDS).map(([k, v]) => [k, v.amount])), { mana: 10, defence: 1, strength: 1 });
});

test('twelve across mixed kinds all land; the thirteenth changes nothing', () => {
    const g = stub();
    const kinds = ['mana', 'defence', 'strength'];
    for (let i = 0; i < BOON_CAP; i++) drink(g, kinds[i % 3]);
    assert.equal(boonCount(g), 12);
    assert.deepEqual(g.boons, { mana: 4 * 10, defence: 4, strength: 4 });
    assert.equal(g.playerMaxMp, 90);
    const msg = drink(g, 'mana');
    assert.equal(msg, BOON_CAP_LINE);
    assert.equal(boonCount(g), 12);
    assert.equal(g.playerMaxMp, 90);
});

test('the refusal is a plain line, not a placeholder', () => {
    assert.ok(!BOON_CAP_LINE.includes('[TEXT]'));
    assert.match(BOON_CAP_LINE, /12/);
    assert.match(BOON_CAP_LINE, /stays in your bag/);
});

test('the chooser refuses at the cap: logs the line, no chooser, no turn', () => {
    const at = mainSrc.indexOf('    _openBoonChooser() {');
    assert.ok(at > 0);
    const end = mainSrc.indexOf('\n    }', at) + 6;
    const body = mainSrc.slice(at + 4 + '_openBoonChooser'.length, end);
    const f = new Function('BOON_KINDS', 'BOON_CAP', 'BOON_CAP_LINE', 'boonCount', 'STATE', `'use strict'; return function ${body}`)(BOON_KINDS, BOON_CAP, BOON_CAP_LINE, boonCount, { IDLE: 'idle' });
    const logs = [];
    const g = { boons: { mana: 12 }, selectedSlot: 3, state: 'x', _log: (m) => logs.push(m), _render: () => {}, overlayOptions: null };
    f.call(g);
    assert.deepEqual(logs, [BOON_CAP_LINE]);
    assert.equal(g.overlayOptions, null);
    assert.equal(g.state, 'idle');
});

test('the Quests tab reads n / cap', () => {
    assert.ok(rendSrc.includes('Boons drunk: ${boonN} / ${BOON_CAP}'));
    assert.ok(!rendSrc.includes('`[TEXT] ${boonN}`'));
});

test('spine.md records the cap in a dated, non-Locked row', () => {
    const row = readFileSync('plans/spine.md', 'utf8').split('\n').find((l) => l.includes('Boon poitions: at most 12'));
    assert.ok(row && /2026-11-17/.test(row) && !/\*\*Locked\*\*/.test(row));
});
