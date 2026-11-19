// pc3b-main-log-plain.test.js: the log lines in main.js are plain and bracket-free (PCR3).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '..', 'game', 'main.js'), 'utf8');
const lines = src.split(/\r?\n/);

const logLines = lines
    .map((text, i) => ({ text, n: i + 1 }))
    .filter(({ text }) => /_log\(|summonLine|requiresMsg/.test(text) && !/^\s*\/\//.test(text));

describe('main.js log lines', () => {
    test('there are log lines to check', () => {
        assert.ok(logLines.length > 100, `found ${logLines.length}`);
    });

    test('no log line starts a string with a square bracket or carries [TEXT]', () => {
        const bad = logLines.filter(({ text }) => /(['"`])\[(?!\\)/.test(text.replace(/\.replace\([^)]*\)/g, '')) || /\[TEXT/.test(text));
        assert.deepEqual(bad.map(b => `${b.n}: ${b.text.trim()}`), []);
    });

    test('no [TEXT] anywhere in main.js', () => {
        assert.deepEqual(lines.map((t, i) => [i + 1, t]).filter(([, t]) => t.includes('[TEXT')), []);
    });
});

describe('the lines the card names', () => {
    const has = (s) => assert.ok(src.includes(s), `main.js should contain: ${s}`);
    test('shove lines say what moved and what happens to it', () => {
        has('You shove ${who} 1 tile. ${who} now faces the way they moved and skips the next turn.');
        has('You push ${who}. ${who} does not move.');
        has('You push ${who}. ${who} has no free tile to move to.');
    });
    test('the car line says alcohol is needed', () => {
        has('The car is fixed. Drive north over the bridge. You need alcohol in the tank to make it.');
    });
    test('the whole-line log brackets are gone', () => {
        has('`Dropped ${def.name} x${n}`');
        has("'Save loaded'");
    });
    test('the continue line and the zoom readout', () => {
        has('`Saved game: ${zone}, ${age} ago`');
        has("' auto' : ''");
    });
    test('the summon lines name the turns they last', () => {
        has('fights for you for ${turns} turns.');
        has('fights for you for ${FINALE_PHASE1.sunManTurns} turns.');
    });
    test('the fight-join line', () => {
        has("'Hostile characters who see the fight come after you.'");
    });
});
