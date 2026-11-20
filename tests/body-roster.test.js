// body-roster.test.js — the device tab of bodies you have worn (MS2).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { sanitizeNoteIds } from '../game/interactions.js';
import { ITEMS } from '../game/items.js';
import { DEVICE_TABS, DEVICE_TAB_LABELS } from '../game/layout.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
const { Game } = await import('../game/main.js');
const { Renderer } = await import('../game/renderer.js');

const maskId = Object.keys(ITEMS).find(id => ITEMS[id].body?.species === 'rat');
const track = (game) => Game.prototype._trackBodies.call(game);

describe('recording worn bodies', () => {
    test('the Rat Mask exists as a body piece', () => assert.ok(maskId));
    test('nothing is listed before a body is worn', () => {
        const g = { equipment: {}, bodiesWorn: [] };
        track(g);
        assert.deepEqual(g.bodiesWorn, []);
    });
    test('wearing the mask adds the rat once, however many frames', () => {
        const g = { equipment: { head: ITEMS[maskId] }, bodiesWorn: [] };
        track(g); track(g);
        assert.deepEqual(g.bodiesWorn, ['rat']);
    });
    test('taking the mask off keeps the rat on the list', () => {
        const g = { equipment: { head: ITEMS[maskId] }, bodiesWorn: [] };
        track(g);
        g.equipment = {};
        track(g);
        assert.deepEqual(g.bodiesWorn, ['rat']);
    });
});

describe('the tab', () => {
    test('is the last device tab with a plain label', () => {
        assert.equal(DEVICE_TABS[DEVICE_TABS.length - 1], 'bodies');
        assert.equal(DEVICE_TAB_LABELS.bodies, 'BODIES');
    });
    test('the renderer lists only Night Kid and the worn bodies', () => {
        const rows = [];
        const fake = { ctx: {}, font: { drawText: (c, t) => rows.push(t) } };
        const body = { x: 0, y: 0, w: 400, h: 400 };
        Renderer.prototype._drawDeviceBodies.call(fake, { bodiesWorn: [] }, body);
        assert.deepEqual(rows.splice(0), ['kid']);
        Renderer.prototype._drawDeviceBodies.call(fake, { bodiesWorn: ['rat'] }, body);
        assert.deepEqual(rows, ['kid', 'rat']);
    });
});

describe('save and load', () => {
    const src = readFileSync(new URL('../game/save.js', import.meta.url), 'utf8');
    test('the list is written, read back and cleaned', () => {
        assert.match(src, /bodiesWornEntry\(game\)/);
        assert.match(src, /game\.bodiesWorn\s*=\s*\[\.\.\.p\.bodiesWorn\]/);
        assert.match(src, /p\.bodiesWorn = sanitizeNoteIds\(p\.bodiesWorn\)/);
        assert.deepEqual(sanitizeNoteIds(['rat', 'rat', 7]), ['rat']);
        assert.deepEqual(sanitizeNoteIds(undefined), []);   // an old save has an empty list
    });
    test('the field stays out of the save while empty', () => {
        assert.match(src, /bodiesWorn\.length \? \{ bodiesWorn \} : \{\}/);
    });
    test('a new game clears it', () => {
        const m = readFileSync(new URL('../game/main.js', import.meta.url), 'utf8');
        assert.match(m, /this\.bodiesWorn = \[\];\s+\/\/ \(MS2\) and no body/);
    });
});
