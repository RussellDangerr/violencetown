// screen-page.test.js — the page around the canvas, once the dock holds the
// wheel's opener (plans/screen-fill.md, section 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../game/index.html', import.meta.url), 'utf8');
const css  = readFileSync(new URL('../game/style.css', import.meta.url), 'utf8');
const main = readFileSync(new URL('../game/main.js', import.meta.url), 'utf8');

test("the touch ACTION button is gone: the dock's ✦ opens the wheel", () => {
    assert.ok(!/id="action-btn"/.test(html), 'index.html still has #action-btn');
    assert.ok(!/#action-btn/.test(css), 'style.css still styles #action-btn');
    assert.ok(!/action-btn/.test(main), 'main.js still binds #action-btn');
});

test('the version badge lives in the ☰ menu sheet', () => {
    const at = html.indexOf('id="menu-sheet-panel"');
    const panel = html.slice(at, html.indexOf('</div>', at));
    assert.ok(panel.includes('id="version-badge"'), 'the badge is not inside #menu-sheet-panel');
});

test('no band under the canvas is reserved for touch controls', () => {
    assert.ok(!/184px/.test(css), 'style.css still reserves the 184px touch band');
});
