// PC5b: the intro and finale stand-ins say plainly what is happening (plans/pc5b-intro-finale-plain-copy.md).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FINALE_LINES } from '../game/finale-setpiece.js';
import { CARD } from '../game/tv-intro.js';

describe('no [TEXT] reaches a player from the intro or the finale set piece', () => {
    for (const f of ['game/finale-setpiece.js', 'game/tv-intro.js']) {
        test(`${f} has no [TEXT]`, () => {
            assert.ok(!readFileSync(new URL('../' + f, import.meta.url), 'utf8').includes('[TEXT'));
        });
    }
});

describe('the finale has its own line for each moment', () => {
    const moments = ['bite', 'cloak', 'refused', 'rises', 'cue', 'scream', 'essence', 'costume'];
    test('every moment is a distinct, non-empty plain line', () => {
        const seen = new Set();
        for (const m of moments) {
            const line = FINALE_LINES[m];
            assert.ok(typeof line === 'string' && line.length > 0, m);
            assert.ok(!line.includes('[TEXT'), m);
            assert.ok(!seen.has(line), `${m} repeats another line`);
            seen.add(line);
        }
    });
    test('the words said over heads are plain', () => {
        for (const k of ['biteSaid', 'risesSaid', 'screamSaid']) assert.ok(FINALE_LINES[k] && !FINALE_LINES[k].includes('[TEXT'), k);
    });
});

test('the title card says what the game is and how to skip', () => {
    assert.equal(CARD.lines.length, 2);
    for (const l of CARD.lines) assert.ok(l.length > 0 && !l.includes('[TEXT'));
});
