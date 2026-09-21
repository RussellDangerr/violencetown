// autoplay-boot.test.js — the hook must cost a normal player nothing, and must
// load before the game or the game starts on the wall clock.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../game/index.html', import.meta.url), 'utf8');

describe('the autoplay hook', () => {
    test('index.html loads boot.js as a module, before main.js', () => {
        const boot = html.indexOf('<script type="module" src="autoplay/boot.js"></script>');
        const main = html.indexOf('<script type="module" src="main.js"></script>');
        assert.ok(boot > 0, 'boot.js is not loaded');
        assert.ok(boot < main, 'boot.js loads after main.js — the game would start on the wall clock');
    });

    test('an autoplay run does not register the service worker', () => {
        assert.match(html, /'serviceWorker' in navigator && !new URLSearchParams\(location\.search\)\.has\('autoplay'\)/);
    });

    test('without ?autoplay it installs nothing', async () => {
        const before = globalThis.setTimeout;
        await import('../game/autoplay/boot.js');
        assert.equal(globalThis.__autoplay, undefined);
        assert.equal(globalThis.setTimeout, before);
    });
});
