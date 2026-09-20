// log-tagging.test.js — the combat log's tagging cannot silently rot again.
//
// Background: H1 stage 3 built a combat log as a filter over _log's existing
// categories, and it shipped EMPTY in real play. npc.js tagged its combat
// reports, _routeWorldMessages branched on that tag, and then logged the text
// without it. Nothing failed; the log just had nothing in it.
//
// main.js is DOM-coupled and no test imports it, so this reads its source. That
// is a blunt instrument, deliberately aimed at one narrow thing: a _log call
// that is KNOWN to be carrying a categorised message must pass the category on.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Normalised to LF. main.js is stored CRLF, and probing CRLF text for a
// LF-delimited closing brace matches nothing at all — which silently turned the
// "method body" below into the whole of main.js the first time this was written.
const src = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8')
    .split('\r\n').join('\n');

const methodBody = (name) => {
    const at = src.indexOf(`    ${name}(`);
    assert.ok(at > 0, `${name} not found in main.js`);
    const end = src.indexOf('\n    }\n', at);
    assert.ok(end > at, `${name}: closing brace not found — the body probe is broken`);
    const body = src.slice(at, end);
    // A probe that overruns turns this guard into a scan of all of main.js and
    // starts reporting other methods' bugs as this one's. Fail loudly instead.
    const lines = body.split('\n').length;
    assert.ok(lines < 120, `${name}: body ran to ${lines} lines — the probe overran`);
    return body;
};

describe('_routeWorldMessages passes the category through', () => {
    const body = methodBody('_routeWorldMessages');

    test('every _log call in it carries a second argument', () => {
        // Matched to the statement's end rather than the first ')': one of these
        // calls contains String(m), and stopping at its paren truncates it.
        const calls = body.match(/this\._log\(.*?\);/g) || [];
        assert.ok(calls.length >= 3, `expected several _log calls, found ${calls.length}`);
        for (const call of calls) {
            assert.ok(call.includes(','),
                `bare _log in _routeWorldMessages — a message's category is being dropped: ${call}`);
        }
    });

    test('it routes through logCategory rather than re-deciding inline', () => {
        assert.ok(body.includes('logCategory('),
            'the category rule belongs in combat-log.logCategory, not re-derived here');
    });
});

describe("the fight's own messages are tagged", () => {
    // resolveThrow returns the burst/damage line for a thrown item — the lines a
    // player sees most in a fight. Every call site must tag them.
    test('every resolveThrow result is logged as combat', () => {
        const sites = src.match(/resolveThrow\([^;]*;\s*(?:if \(msg\) )?this\._log\(msg[^;]*;/g) || [];
        assert.ok(sites.length >= 3, `expected 3+ resolveThrow log sites, found ${sites.length}`);
        for (const s of sites) {
            assert.ok(/_log\(msg,\s*'combat'\)/.test(s), `untagged resolveThrow log: ${s.slice(-60)}`);
        }
    });
});

describe('categories are spelled from one list', () => {
    test('no _log call invents a category outside the known set', () => {
        const KNOWN = new Set(['system', 'combat', 'pickup', 'transition', 'quest']);
        const cats = [...src.matchAll(/this\._log\([^;]*?,\s*'([a-z-]+)'\s*\)/g)].map((m) => m[1]);
        assert.ok(cats.length > 0, 'no categorised _log calls found at all');
        for (const c of cats) {
            assert.ok(KNOWN.has(c), `unknown log category '${c}' — a typo here is invisible at runtime`);
        }
    });
});

describe('buffs report themselves as combat', () => {
    // buffs.js calls game._log directly rather than returning a message, so its
    // lines bypass _routeWorldMessages entirely. The DOT tick — "[Bartho —
    // Burning 5]" — is one of the most common lines in a fight and was landing
    // under 'system', which is how the combat log stayed empty even after
    // _routeWorldMessages was fixed.
    const buffsSrc = readFileSync(fileURLToPath(new URL('../game/buffs.js', import.meta.url)), 'utf8')
        .split('\r\n').join('\n');

    test('every game._log in buffs.js carries a category', () => {
        const calls = buffsSrc.match(/game\._log\(.*?\);/g) || [];
        assert.ok(calls.length >= 3, `expected several _log calls in buffs.js, found ${calls.length}`);
        for (const call of calls) {
            assert.ok(/,\s*'[a-z-]+'\s*\)/.test(call),
                `untagged buff message — it will file under 'system': ${call}`);
        }
    });
});
