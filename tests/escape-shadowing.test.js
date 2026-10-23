// escape-shadowing.test.js — Escape has exactly one owner.
//
// main.js's keydown handler opens with a gate:
//
//     if (e.code === 'Escape' && this._closeCurrentMenu()) { ... return; }
//
// _closeCurrentMenu's switch returns true for nine states, so for those nine
// the gate ALWAYS wins and returns. Any per-state Escape branch further down
// the handler for one of those nine can never run.
//
// That is worse than merely dead: it reads as live. A reader wanting to change
// what Escape does in DIALOGUE would naturally edit the DIALOGUE branch, and
// their edit would do nothing — the gate already closed the menu. Roadmap item C1
// (plans/roadmap-2026-09.md) counted seven such branches.
//
// This test derives both halves from the source rather than listing line
// numbers, so it keeps holding as main.js moves. RADIAL_MENU is the control:
// _closeCurrentMenu does NOT handle it, so its Escape branch is genuinely live
// and must survive.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const main = readFileSync(fileURLToPath(new URL('../game/main.js', import.meta.url)), 'utf8');
const lines = main.split(/\r?\n/);

// ── Half 1: which states does the gate swallow Escape for? ───────────────────
function statesClosedByTheGate() {
    const start = lines.findIndex(l => /_closeCurrentMenu\(\)\s*\{/.test(l));
    assert.notEqual(start, -1, 'could not find _closeCurrentMenu');
    const out = new Set();
    for (let i = start; i < lines.length; i++) {
        if (/^\s{4}\}/.test(lines[i]) && i > start) break;          // end of method
        const m = lines[i].match(/case STATE\.([A-Z_]+):.*return true/);
        if (m) out.add(m[1]);
    }
    return out;
}

// ── Half 2: which state does each Escape branch sit inside? ──────────────────
// The handler is a flat run of `if (this.state === STATE.X) { ... }` blocks, so
// the nearest preceding guard owns the line.
function escapeBranchesAfterTheGate() {
    const gate = lines.findIndex(l => /'Escape'\s*&&\s*this\._closeCurrentMenu\(\)/.test(l));
    assert.notEqual(gate, -1, 'could not find the Escape gate');
    const found = [];
    let owner = null;
    for (let i = gate + 1; i < lines.length; i++) {
        // Stop at the next method definition — the keydown handler is over and
        // the DOM sheet/modal listeners below own their own Escape keys.
        if (/^\s{4}_[a-zA-Z]+\(/.test(lines[i])) break;
        const g = lines[i].match(/this\.state === STATE\.([A-Z_]+)/);
        if (g) owner = g[1];
        if (/'Escape'/.test(lines[i]) && owner) {
            found.push({ line: i + 1, state: owner, text: lines[i].trim() });
        }
    }
    return found;
}

describe('C1 — Escape is handled once, by the gate', () => {
    const closed = statesClosedByTheGate();
    const branches = escapeBranchesAfterTheGate();

    test('the gate and the branches were both actually found', () => {
        assert.ok(closed.size >= 5, `expected the gate to close several states, got ${[...closed]}`);
        assert.ok(branches.length >= 1, 'found no per-state Escape branches at all — parser drifted');
    });

    test('no Escape branch sits in a state the gate already closes', () => {
        const shadowed = branches.filter(b => closed.has(b.state));
        const report = shadowed.map(b => `  main.js:${b.line}  [${b.state}]  ${b.text}`).join('\n');
        assert.deepEqual(shadowed, [],
            `${shadowed.length} unreachable Escape branch(es) — the gate closes these states first:\n${report}`);
    });

    // The control. _closeCurrentMenu has no RADIAL_MENU case, so the gate
    // returns false and Escape falls through to the wheel's own block, where it
    // is folded into DOWN and drives _wheelBack() — Escape is the wheel's BACK,
    // not a close. At the root there is nothing left to back out of, so the
    // wheel does close, but it closes by backing out, not through the gate.
    // If RADIAL_MENU ever joins _closeCurrentMenu, that nuance dies silently
    // and the wheel loses its back key, so both halves are pinned.
    test('RADIAL_MENU keeps its Escape — the gate does NOT close it', () => {
        assert.ok(!closed.has('RADIAL_MENU'),
            'RADIAL_MENU joined _closeCurrentMenu; Escape now closes the wheel outright '
            + 'instead of backing out one level, and its own branch went dead');
        assert.ok(branches.some(b => b.state === 'RADIAL_MENU'),
            'RADIAL_MENU lost its Escape branch — Escape no longer backs out of the wheel');
    });
});
