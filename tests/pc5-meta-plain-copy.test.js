// pc5-meta-plain-copy.test.js (PC5) — the away, credits, bones and save copy is plain words.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NEWS_LINES, RESTED_BUFF, RESTED_LINE } from '../game/away.js';
import { CREDITS } from '../game/credits.js';
import { CODE_REFUSALS } from '../game/save.js';

describe('no [TEXT] placeholder is left', () => {
    for (const f of ['away', 'credits', 'bones', 'save']) {
        test(`game/${f}.js has none`, () => {
            const src = readFileSync(new URL(`../game/${f}.js`, import.meta.url), 'utf8');
            assert.ok(!src.includes('[TEXT]'));
        });
    }
});

describe('the rested line explains the buff from its data', () => {
    test('it names the stat, amount and turns of RESTED_BUFF', () => {
        assert.ok(RESTED_LINE.includes(`${RESTED_BUFF.stat} +${RESTED_BUFF.amount} for ${RESTED_BUFF.turns} turns`));
        assert.ok(!RESTED_BUFF.name.includes('[TEXT]'));
    });
});

describe('every line is a plain sentence', () => {
    const all = [...NEWS_LINES, ...Object.values(CODE_REFUSALS), ...CREDITS.cards.flat(), CREDITS.hint];
    test('none is empty, and the four news lines differ', () => {
        for (const l of all) assert.ok(l.trim().length > 0 && !l.includes('[TEXT]'), l);
        assert.equal(new Set(NEWS_LINES).size, NEWS_LINES.length);
    });
    test('every save refusal says nothing was loaded', () => {
        for (const l of Object.values(CODE_REFUSALS)) assert.match(l, /nothing was loaded/);
    });
});
