// PC3 (plans/pc3-ui-plain-copy.md): the labels it names are plain, with no brackets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEVICE_TAB_LABELS, RING_PASSIVE_LABEL } from '../game/layout.js';
import { HASTE_CHIP_LABEL, SKILL_LABELS } from '../game/renderer.js';

const html = readFileSync(new URL('../game/index.html', import.meta.url), 'utf8');
const rend = readFileSync(new URL('../game/renderer.js', import.meta.url), 'utf8');

test('the constants are plain words', () => {
    const all = [...Object.values(DEVICE_TAB_LABELS), RING_PASSIVE_LABEL, HASTE_CHIP_LABEL, ...Object.values(SKILL_LABELS)];
    for (const s of all) assert.ok(s && !/[\[\]]/.test(s), s);
    assert.deepEqual(DEVICE_TAB_LABELS, { notes: 'NOTES', bodies: 'BODIES' });
});

test('index.html: no [TEXT] in a label, an aria label or a placeholder attribute', () => {
    for (const m of html.matchAll(/(aria-label|placeholder)="([^"]*)"/g)) assert.ok(!m[2].includes('[TEXT]'), m[0]);
    assert.ok(!/<(button|label)[^>]*>[^<]*\[TEXT\]/.test(html));
});

test('the target panel, bag footer, notes line and offer button read plainly', () => {
    for (const s of ['`Armour ${t.armor}`', "'Wearing'", "'No notes yet.'", "'TALK'", 'SPACE ACTIONS', 'ESC BACK', "'Items to find'"]) {
        assert.ok(rend.includes(s), s);
    }
});
