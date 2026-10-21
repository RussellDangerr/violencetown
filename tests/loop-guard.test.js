// loop-guard.test.js — the checks a loop run performs on itself (plans/board-loop.md §3).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { checkBranch, checkScope, checkSpecFirst, checkTestIntegrity, runGuard } from '../tools/roadmap-board/loop-guard.mjs';

describe('checkBranch', () => {
    test('only feature/<lower-case-slug>', () => {
        assert.deepEqual(checkBranch('feature/ws1-weapon-classes'), []);
        for (const b of ['dev', 'main', 'feature/WS1', 'feature/', 'fix/x', 'feature/a b', undefined]) {
            assert.equal(checkBranch(b).length, 1, String(b));
        }
    });
});

describe('checkScope', () => {
    const touches = ['game/weapons.js', 'game\\items.js'];
    test('touches, the spec and new test files are allowed', () => {
        assert.deepEqual(checkScope([
            { status: 'M', path: 'game/weapons.js' },
            { status: 'M', path: 'game/items.js' },
            { status: 'A', path: 'plans/ws1-weapon-classes.md' },
            { status: 'A', path: 'tests/weapon-classes.test.js' },
        ], touches, 'ws1-weapon-classes'), []);
    });
    test('a file outside touches is a stop', () => {
        const p = checkScope([{ status: 'M', path: 'game/main.js' }], touches, 's');
        assert.match(p[0], /game\/main\.js: outside the card's touches/);
    });
    test('editing an existing test needs it in touches', () => {
        assert.equal(checkScope([{ status: 'M', path: 'tests/combat.test.js' }], touches, 's').length, 1);
    });
    test('forbidden paths are refused even when the card lists them', () => {
        const bad = ['tiled/town.tmj', 'tools/autoplay-golden.json', 'package.json', '.claude/settings.json', 'CLAUDE.md', 'game/_headers'];
        for (const path of bad) {
            const p = checkScope([{ status: 'M', path }], [path], 's');
            assert.equal(p.length, 1, path);
            assert.doesNotMatch(p[0], /outside the card/, `${path} is refused for itself, not for scope`);
        }
    });
});

describe('checkSpecFirst', () => {
    test('the first commit must add the slice spec', () => {
        assert.deepEqual(checkSpecFirst(['plans/s.md'], 's'), []);
        assert.equal(checkSpecFirst(['game/x.js'], 's').length, 1);
        assert.equal(checkSpecFirst([], 's').length, 1);
    });
});

describe('checkTestIntegrity', () => {
    test('adding tests is fine', () => {
        assert.deepEqual(checkTestIntegrity('+++ b/tests/x.test.js\n+    test(\'new\', () => {});'), []);
    });
    test('removing a test, or skipping / only-ing one, is caught', () => {
        assert.equal(checkTestIntegrity("--- a/tests/x.test.js\n-    test('old', () => {});").length, 1);
        assert.equal(checkTestIntegrity("+    test.skip('x', () => {});").length, 1);
        assert.equal(checkTestIntegrity("+  describe.only('x', () => {});").length, 1);
        assert.equal(checkTestIntegrity("+    test('x', { skip: true }, () => {});").length, 1);
    });
    test('the diff header lines are not mistaken for tests', () => {
        assert.deepEqual(checkTestIntegrity('--- a/tests/test(weird).js\n+++ b/tests/test(weird).js'), []);
    });
});

describe('runGuard', () => {
    test('a clean slice passes; problems from every check are collected', () => {
        const clean = runGuard({
            branch: 'feature/s', slug: 's', touches: ['game/a.js'],
            changed: [{ status: 'A', path: 'plans/s.md' }, { status: 'M', path: 'game/a.js' }],
            firstCommitFiles: ['plans/s.md'], testsDiff: '',
        });
        assert.deepEqual(clean, { ok: true, problems: [] });
        const dirty = runGuard({
            branch: 'dev', slug: 's', touches: [],
            changed: [{ status: 'M', path: 'game/a.js' }],
            firstCommitFiles: ['game/a.js'], testsDiff: "-  test('x', () => {});",
        });
        assert.equal(dirty.ok, false);
        assert.equal(dirty.problems.length, 4);
    });
});
