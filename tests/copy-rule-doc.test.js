// copy-rule-doc.test.js — the loop's copy rule (plans/pc8-copy-rule-plain-facts.md) is
// written where the builder and the checker read it.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\s+/g, ' ');

const loop = read('tools/roadmap-board/LOOP.md');
const section6 = loop.slice(loop.indexOf('## 6.'), loop.indexOf('## 7.'));
const builder = read('.claude/agents/slice-builder.md');
const checker = read('.claude/agents/slice-checker.md');

describe('LOOP.md section 6 states PCR3', () => {
    test('section 6 is found', () => {
        assert.ok(section6.length > 200, 'section 6 should be found between ## 6. and ## 7.');
    });

    test('copy is plain, flat and true to the code, with what it is, does, numbers, source', () => {
        assert.match(section6, /plain, flat and true to the code/);
        assert.match(section6, /what the thing is, what it does, its numbers, where it comes from/);
        assert.match(section6, /No jokes, no character voice, no atmosphere, no story prose/);
    });

    test('names, his quoted lines and the plans/ design facts are kept; no square brackets', () => {
        assert.match(section6, /Keep every name, whoever invented it/);
        assert.match(section6, /Keep his own quoted lines and the design facts written in `plans\/`/);
        assert.match(section6, /No square brackets in player-visible text/);
    });

    test('existing creative lines are replaced, no longer kept', () => {
        assert.doesNotMatch(loop, /Lines that are already creative writing stay as they are/);
        assert.match(section6, /already AI-written creative writing are replaced with plain facts/);
    });

    test('the item-text pattern: stats, one physical fact, then source', () => {
        assert.match(section6, /generated stats line/);
        assert.match(section6, /at most one short physical fact/);
        assert.match(section6, /"Dropped by \/ Sold by \/ Found in"/);
    });

    test('a copy slice greps tests first and reports BLOCKED with the full list', () => {
        assert.match(section6, /grep `tests\/` for every string it will change/);
        assert.match(section6, /report BLOCKED with the full list/);
    });
});

describe('the agents say the same', () => {
    test('slice-builder points at section 6 with the rule in a sentence', () => {
        assert.match(builder, /Copy follows LOOP\.md §6 \(PCR3\)/);
        assert.match(builder, /every name is kept/);
        assert.match(builder, /report BLOCKED with the full list/);
    });

    test('slice-checker checks every new or changed line against the code', () => {
        assert.match(checker, /Check the copy against the code/);
        assert.match(checker, /cause or effect a line states that the code doesn't have/);
    });
});
