// plain-copy-guard.test.js — keeps [TEXT] and bracketed player text from coming back
// (plans/pc6-plain-copy-guard.md, ruling PCR3).
//
// THE RULE. Every .js, .json and .html file under game/ is read as text. A finding is:
//   1. a string that contains a stand-in marker: [TEXT] or [NAME], or the [TEXT: ...] and
//      [NAME: ...] forms. In JS this is any string or template literal; in JSON any string
//      value; in HTML any text outside a comment.
//   2. a bracket-wrapped string (its text, trimmed, starts with '[' and ends with ']'; a
//      template such as `[${name}]` counts) when it sits in a player position:
//        - anywhere inside the arguments of a _log(...) call (this._log, game._log?.(...));
//        - the value of a FIELDS key below, in JS and in JSON. In JS the value runs from the key's
//          ':' or '=' to the next ',' or ';' at that depth, through any ( ) and [ ] in it, so
//          `name: '[x]'`, `def.name = f(`[${x}]`)`, `a ? '[x]' : b` and `barks: ['[x]']` all
//          count; an object literal { } inside the value starts afresh.
// Skipped: JS comments, HTML comments, regex literals, everything inside console.*(...)
// calls (tags like '[save]' or '[npc]'), the parameter list of a method named _log, and the
// value of an id key (`id`, or ending in Id / ID), markers included: those are internal ids.
// Bracket-wrapped strings anywhere else (a key hint like '[E]', a drawText label) are not
// counted unless they carry a marker.
//
// THE ALLOW-LIST. ALLOWED names every file with findings today and its exact count. The test
// fails when a file not on the list has a finding, when a listed file's count goes up, and when
// it goes DOWN without the list being lowered to match. A file at 0 leaves the list. Each
// plain-copy slice lowers its files' numbers in the same commit; the last one empties it.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, extname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const GAME = join(ROOT, 'game');

// File (relative to game/) → number of findings on origin/dev when PC6 was built.
const ALLOWED = {
    'bank-map.json': 4,
    'borgir-map.json': 3,
    'buffs.js': 4,
    'canyon-map.json': 13,
    'carnival-map.json': 10,
    'carrion-room-map.json': 2,
    'casino-map.json': 2,
    'compactor-map.json': 1,
    'compactor.js': 1,
    'costumes.js': 2,
    'dialogue.js': 36,
    'diner-map.json': 3,
    'downtown-map.json': 17,
    'enemies.js': 5,
    'factory-map.json': 11,
    'frozen-map.json': 4,
    'gorge-map.json': 1,
    'graveyard-map.json': 8,
    'hand-data.js': 2,
    'hands.js': 1,
    'hints.js': 8,
    'hit-splat.js': 1,
    'hypno-vision.js': 1,
    'index.html': 15,
    'inspector.js': 1,
    'interactions.js': 3,
    'item-uses.js': 5,
    'items.js': 60,
    'layout.js': 3,
    'main.js': 188,
    'npc.js': 11,
    'quests.js': 1,
    'radicals/canyon/wreck.json': 1,
    'renderer.js': 13,
    'ring-data.js': 3,
    'save.js': 1,
    'sewer-map.json': 9,
    'sewer-north-map.json': 5,
    'sewer-setpiece.js': 4,
    'side-area-map.json': 2,
    'slots.js': 35,
    'theft.js': 2,
    'town-map.json': 38,
    'trade.js': 1,
    'valley-map.json': 3,
    'vault-map.json': 2,
    'weapons.js': 10,
    'wheel-model.js': 15,
    'wilderness-map.json': 6,
    'world-map.js': 4,
};

const FIELDS = new Set(['name', 'description', 'text', 'greeting', 'label', 'reply', 'barks', 'adjacencyBark']);
const ID_KEY = /^id$|Id$|ID$/;
const MARKER = /\[(?:TEXT|NAME)[\]:]/;
const isWrapped = (s) => { const t = s.trim(); return t.length >= 2 && t[0] === '[' && t[t.length - 1] === ']'; };

// ---------------------------------------------------------------- JS tokenizer
// Just enough of JS to tell strings, templates, comments and regexes apart.
const REGEX_AFTER_WORD = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new',
    'delete', 'void', 'throw', 'instanceof', 'yield', 'await']);
const PUNCT = ['>>>=', '===', '!==', '**=', '...', '<<=', '>>=', '>>>', '&&=', '||=', '??=',
    '==', '!=', '=>', '<=', '>=', '&&', '||', '??', '?.', '+=', '-=', '*=', '/=', '%=', '**',
    '++', '--', '<<', '>>', '&=', '|=', '^='];

function skipString(src, i) {            // src[i] is the opening quote; returns index after close
    const q = src[i];
    let j = i + 1;
    while (j < src.length && src[j] !== q && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1;
    return j + 1;
}
function skipTemplate(src, i) {          // src[i] is '`'
    let j = i + 1;
    while (j < src.length) {
        const c = src[j];
        if (c === '\\') { j += 2; continue; }
        if (c === '`') return j + 1;
        if (c === '$' && src[j + 1] === '{') { j = skipExpr(src, j + 2); continue; }
        j++;
    }
    return j;
}
function skipExpr(src, i) {              // inside ${ ... }; returns index after the closing '}'
    let j = i, depth = 0;
    while (j < src.length) {
        const c = src[j];
        if (c === '"' || c === "'") { j = skipString(src, j); continue; }
        if (c === '`') { j = skipTemplate(src, j); continue; }
        if (c === '/' && src[j + 1] === '/') { while (j < src.length && src[j] !== '\n') j++; continue; }
        if (c === '/' && src[j + 1] === '*') { const e = src.indexOf('*/', j + 2); j = e < 0 ? src.length : e + 2; continue; }
        if (c === '{') depth++;
        if (c === '}') { if (depth === 0) return j + 1; depth--; }
        j++;
    }
    return j;
}
function skipRegex(src, i) {             // src[i] is '/'; returns index after flags, or -1
    let j = i + 1, inClass = false;
    while (j < src.length) {
        const c = src[j];
        if (c === '\n') return -1;
        if (c === '\\') { j += 2; continue; }
        if (c === '[') inClass = true;
        else if (c === ']') inClass = false;
        else if (c === '/' && !inClass) { j++; while (/[a-z]/i.test(src[j] || '')) j++; return j; }
        j++;
    }
    return -1;
}

export function tokenizeJs(src) {
    const toks = [];
    let i = 0;
    const n = src.length;
    while (i < n) {
        const c = src[i];
        if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '﻿' || c === ' ') { i++; continue; }
        if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
        if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
        if (c === '"' || c === "'") {
            const j = skipString(src, i);
            toks.push({ type: 'str', value: src.slice(i + 1, j - 1), start: i });
            i = j; continue;
        }
        if (c === '`') {
            const j = skipTemplate(src, i);
            toks.push({ type: 'str', value: src.slice(i + 1, j - 1), start: i });
            i = j; continue;
        }
        if (/[A-Za-z_$#]/.test(c) || c > '\u007f') {
            let j = i + 1;
            while (j < n && (/[\w$]/.test(src[j]) || src[j] > '\u007f')) j++;
            toks.push({ type: 'ident', value: src.slice(i, j), start: i });
            i = j; continue;
        }
        if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
            let j = i + 1;
            while (j < n && /[\w.]/.test(src[j])) j++;
            toks.push({ type: 'num', value: src.slice(i, j), start: i });
            i = j; continue;
        }
        if (c === '/') {
            const prev = toks[toks.length - 1];
            const regexHere = !prev
                || (prev.type === 'punct' && ![')', ']', '}'].includes(prev.value))
                || (prev.type === 'ident' && REGEX_AFTER_WORD.has(prev.value));
            if (regexHere) {
                const j = skipRegex(src, i);
                if (j > 0) { toks.push({ type: 'regex', value: src.slice(i, j), start: i }); i = j; continue; }
            }
        }
        const p = PUNCT.find(op => src.startsWith(op, i)) || c;
        toks.push({ type: 'punct', value: p, start: i });
        i += p.length;
    }
    return toks;
}

// ---------------------------------------------------------------- scanners
const lineAt = (src, idx) => { let l = 1; for (let k = 0; k < idx; k++) if (src[k] === '\n') l++; return l; };

// If toks[k] is a key (`name:`, `def.name =`, `'name':`) whose kind we track, that kind.
function keyKind(toks, k) {
    const t = toks[k], op = toks[k + 1];
    if (!op || op.type !== 'punct' || (op.value !== ':' && op.value !== '=')) return null;
    if (t.type !== 'ident' && t.type !== 'str') return null;
    if (FIELDS.has(t.value)) return 'field';
    if (ID_KEY.test(t.value)) return 'id';
    return null;
}
// For an opening '(' at k: the callee's name and whether it hangs off `console`.
function callee(toks, k) {
    let j = k - 1;
    if (toks[j] && toks[j].value === '?.') j--;
    const name = toks[j];
    if (!name || name.type !== 'ident') return null;
    const dot = toks[j - 1], obj = toks[j - 2];
    const onConsole = !!(dot && (dot.value === '.' || dot.value === '?.') && obj && obj.value === 'console');
    return { name: name.value, onConsole };
}

export function scanJs(src) {
    const toks = tokenizeJs(src);
    // Match every bracket so a call can be told from a method definition `_log(m) { ... }`.
    const close = new Array(toks.length).fill(-1);
    const open = [];
    toks.forEach((t, k) => {
        if (t.type !== 'punct') return;
        if ('([{'.includes(t.value)) open.push(k);
        else if (')]}'.includes(t.value) && open.length) close[open.pop()] = k;
    });
    const findings = [];
    // stack: one tag per open bracket. 'console' / 'skip' (a _log parameter list) / 'log' cover
    // everything inside; 'field' / 'id' carry a key's value into its ( ... ) and [ ... ].
    const stack = [];
    // mode: the value of a tracked key, from its ':' or '=' to the next ',' or ';' at that depth.
    let mode = null;
    const top = () => (stack.length ? stack[stack.length - 1] : null);
    const report = (t, why) => findings.push({ line: lineAt(src, t.start), why, text: t.value.slice(0, 80) });
    for (let k = 0; k < toks.length; k++) {
        const t = toks[k];
        const outer = top();
        const sealed = outer === 'console' || outer === 'skip' || outer === 'log';
        const here = mode && mode.depth === stack.length ? mode.kind : null;
        if (t.type === 'punct' && '([{'.includes(t.value)) {
            let tag = sealed ? outer : null;
            if (!sealed && t.value !== '{') tag = here || (outer === 'field' || outer === 'id' ? outer : null);
            if (t.value === '(' && outer !== 'console') {
                const c = callee(toks, k);
                const next = close[k] >= 0 ? toks[close[k] + 1] : null;
                if (c && c.onConsole) tag = 'console';
                else if (c && c.name === '_log') tag = next && next.value === '{' ? 'skip' : 'log';
            }
            stack.push(tag);
            continue;
        }
        if (t.type === 'punct' && ')]}'.includes(t.value)) {
            stack.pop();
            if (mode && stack.length < mode.depth) mode = null;
            continue;
        }
        if (t.type === 'punct' && (t.value === ',' || t.value === ';')) {
            if (mode && mode.depth === stack.length) mode = null;
            continue;
        }
        if (!sealed) {
            const kind = keyKind(toks, k);
            if (kind) { mode = { depth: stack.length, kind }; k++; continue; }
        }
        if (t.type !== 'str') continue;
        const ctx = sealed ? outer : (here || outer);
        if (ctx === 'console' || ctx === 'skip' || ctx === 'id') continue;
        if (MARKER.test(t.value)) { report(t, 'marker'); continue; }
        if (!isWrapped(t.value)) continue;
        if (ctx === 'log') report(t, 'bracketed _log');
        else if (ctx === 'field') report(t, 'bracketed field');
    }
    return findings;
}

export function scanJson(src) {
    const findings = [];
    const walk = (node, key, path) => {
        if (typeof node === 'string') {
            if (ID_KEY.test(key || '')) return;
            if (MARKER.test(node)) findings.push({ path, why: 'marker', text: node.slice(0, 80) });
            else if (FIELDS.has(key) && isWrapped(node)) findings.push({ path, why: 'bracketed field', text: node.slice(0, 80) });
        } else if (Array.isArray(node)) {
            node.forEach((v, i) => walk(v, key, `${path}[${i}]`));
        } else if (node && typeof node === 'object') {
            for (const [k, v] of Object.entries(node)) walk(v, k, path ? `${path}.${k}` : k);
        }
    };
    walk(JSON.parse(src), null, '');
    return findings;
}

export function scanHtml(src) {
    // Blank out comments (keeping line breaks so line numbers hold), scan inline scripts as JS.
    const blank = (m) => m.replace(/[^\n]/g, ' ');
    let text = src.replace(/<!--[\s\S]*?-->/g, blank);
    const findings = [];
    text = text.replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi, (m, a, body, b, offset) => {
        const before = lineAt(text, offset) - 1;
        for (const f of scanJs(body)) findings.push({ ...f, line: f.line + before });
        return a + blank(body) + b;
    });
    const re = new RegExp(MARKER.source, 'g');
    let m;
    while ((m = re.exec(text))) findings.push({ line: lineAt(text, m.index), why: 'marker', text: text.slice(m.index, m.index + 60).split(/\r?\n/)[0] });
    return findings;
}

export function scanFile(name, src) {
    const ext = extname(name);
    if (ext === '.js') return scanJs(src);
    if (ext === '.json') return scanJson(src);
    if (ext === '.html') return scanHtml(src);
    return [];
}

function gameFiles(dir) {
    const out = [];
    for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) out.push(...gameFiles(p));
        else if (['.js', '.json', '.html'].includes(extname(e.name))) out.push(p);
    }
    return out;
}

function scanGame() {
    const counts = {}, samples = {};
    for (const p of gameFiles(GAME).sort()) {
        const rel = relative(GAME, p).split(sep).join('/');
        const found = scanFile(rel, readFileSync(p, 'utf8'));
        if (found.length) { counts[rel] = found.length; samples[rel] = found; }
    }
    return { counts, samples };
}

// ---------------------------------------------------------------- tests
describe('plain-copy guard: the scanner', () => {
    test('catches a planted [TEXT] and a planted bracketed log line', () => {
        const src = [
            "const a = { description: '[TEXT]' };",
            "this._log('[Save loaded]', 'transition');",
            "game._log?.(`[${who} expired]`);",
            "const b = { name: `[${shownName(e)}]`, barks: ['[Hey]', 'plain'] };",
            "def.label = '[Open]';",
            "say('[TEXT: placeholder line]');",
        ].join('\n');
        const found = scanJs(src);
        assert.deepEqual(found.map(f => [f.line, f.why]), [
            [1, 'marker'],
            [2, 'bracketed _log'],
            [3, 'bracketed _log'],
            [4, 'bracketed field'],      // the name template
            [4, 'bracketed field'],      // '[Hey]' in barks; 'plain' is not counted
            [5, 'bracketed field'],
            [6, 'marker'],
        ]);
    });

    test('a field value is followed through calls, ternaries and arrays, and ends at the comma', () => {
        const src = [
            "this.entity.name = unnestBrackets(`[${shownName(this)}]`);",
            "const c = { label: on ? '[On]' : '[Off]', other: '[x]', barks: ['[Hey]', 'plain', '[Ho]'] };",
            "const d = { text: pick({ tag: '[inner]' }), hint: '[E]' };",
        ].join('\n');
        assert.deepEqual(scanJs(src).map(f => [f.line, f.text]), [
            [1, '[${shownName(this)}]'],
            [2, '[On]'], [2, '[Off]'], [2, '[Hey]'], [2, '[Ho]'],
        ]);
    });

    test('skips comments, console tags, regexes, ids and the _log method itself', () => {
        const src = [
            "// a comment that says [TEXT] and [Save loaded]",
            "/* block comment: this._log('[Nope]') [TEXT] */",
            "console.log('[save]', '[npc] moved');",
            "console.warn?.(`[TEXT] debug ${x}`);",
            "const re = /\\[TEXT\\]/g;",
            "const item = { id: '[weird-id]', category: '[x]' };",
            "const q = { claimId: `[TEXT]_claim_${z}`, boothId: z ? '[TEXT]_booth' : null };",
            "_log(msg, cat = '[x]') { this.log.push('[Nope]'); }",
            "this._log(plainLine);",
            "const tag = '[Enter]';",
        ].join('\n');
        assert.deepEqual(scanJs(src), []);
    });

    test('JSON: markers anywhere, bracketed strings only under the fields', () => {
        const src = JSON.stringify({
            id: '[id-ok]',
            claim: { id: '[TEXT]_claim_factory', dialogueId: '[TEXT]' },
            npcs: [{ name: '[NAME: side A]', type: '[ok]' }, { name: '[Bob]', barks: ['[Hi]', 'hi'] }],
            props: [{ text: 'plain', note: '[TEXT]' }],
        });
        assert.deepEqual(scanJson(src).map(f => f.path),
            ['npcs[0].name', 'npcs[1].name', 'npcs[1].barks[0]', 'props[0].note']);
    });

    test('HTML: markers in text and attributes, not in comments', () => {
        const src = '<!-- [TEXT] in a comment -->\n<button aria-label="[TEXT]">[TEXT] GO</button>\n<p>[Plain brackets]</p>';
        assert.deepEqual(scanHtml(src).map(f => f.line), [2, 2]);
    });
});

describe('plain-copy guard: game/ against the allow-list', () => {
    const { counts, samples } = scanGame();
    const show = (rel) => (samples[rel] || []).slice(0, 5)
        .map(f => `    ${f.line ? 'line ' + f.line : f.path}: ${f.why} ${JSON.stringify(f.text)}`).join('\n');
    const listing = () => 'Actual counts:\n' + Object.entries(counts).map(([f, c]) => `    '${f}': ${c},`).join('\n');

    test('no file outside the allow-list has [TEXT] or bracketed player text', () => {
        const strays = Object.keys(counts).filter(f => !(f in ALLOWED));
        assert.deepEqual(strays, [], strays.map(f => `${f}: ${counts[f]}\n${show(f)}`).join('\n') + '\n' + listing());
    });

    test('no listed file has more than its number', () => {
        const up = Object.keys(ALLOWED).filter(f => (counts[f] || 0) > ALLOWED[f]);
        assert.deepEqual(up, [], up.map(f => `${f}: ${ALLOWED[f]} -> ${counts[f]}\n${show(f)}`).join('\n'));
    });

    test('every listed number is exact (lower it when a slice removes some; 0 leaves the list)', () => {
        const down = Object.keys(ALLOWED).filter(f => (counts[f] || 0) < ALLOWED[f]);
        assert.deepEqual(down, [], down.map(f => `${f}: listed ${ALLOWED[f]}, now ${counts[f] || 0}` +
            ((counts[f] || 0) === 0 ? ' — remove it from ALLOWED' : ' — lower it in ALLOWED')).join('\n'));
        const zeros = Object.keys(ALLOWED).filter(f => !(ALLOWED[f] > 0));
        assert.deepEqual(zeros, [], 'a file at 0 leaves the list');
    });
});
