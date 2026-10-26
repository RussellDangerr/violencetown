// loop-guard.test.js — the checks a loop run performs on itself (plans/board-loop.md §3).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { checkBranch, checkScope, checkSpecFirst, checkTestIntegrity, testNameChanges, saysBehaviourChanged, runGuard } from '../tools/roadmap-board/loop-guard.mjs';

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
    test('a quoted "test.skip(" inside a string is not a skipped test', () => {
        assert.deepEqual(checkTestIntegrity(`+        assert.equal(check("+    test.skip('x', () => {});").length, 1);`), []);
        assert.deepEqual(checkTestIntegrity(`+        assert.equal(check("+    test('x', { skip: true }, () => {});").length, 1);`), []);
    });
    test('the diff header lines are not mistaken for tests', () => {
        assert.deepEqual(checkTestIntegrity('--- a/tests/test(weird).js\n+++ b/tests/test(weird).js'), []);
    });
});

// A one-file unified diff, the way `git diff` prints it.
const fileDiff = (path, ...lines) => [`diff --git a/${path} b/${path}`, 'index 1111111..2222222 100644', `--- a/${path}`, `+++ b/${path}`, '@@ -1,3 +1,3 @@', ...lines].join('\n');
const OWNED = 'test(x): the cap follows the new rule\n\nThe behaviour changed on purpose (plans/x.md).';

describe('checkTestIntegrity: a renamed test is not a removed one', () => {
    const retitle = fileDiff('tests/x.test.js', "-    test('a WIP cap of two', () => {", "+    test('a WIP cap of ten', () => {");
    test('a retitle in a commit that says the behaviour changed passes', () => {
        assert.deepEqual(checkTestIntegrity(retitle, [{ sha: 'aaaaaaa1', message: OWNED, testsDiff: retitle }]), []);
    });
    test('a retitle in a commit that does not say so fails', () => {
        const p = checkTestIntegrity(retitle, [{ sha: 'bbbbbbb2', message: 'test(x): tidy the titles', testsDiff: retitle }]);
        assert.equal(p.length, 1);
        assert.match(p[0], /retitled in bbbbbbb/);
        assert.match(p[0], /a WIP cap of two/);
    });
    test('a retitle with no commit to show for it fails', () => {
        assert.equal(checkTestIntegrity(retitle).length, 1);
    });
    test('a pure delete fails, even in a commit that says the behaviour changed', () => {
        const gone = fileDiff('tests/x.test.js', "-    test('old', () => {", '-    });');
        const p = checkTestIntegrity(gone, [{ sha: 'c', message: OWNED, testsDiff: gone }]);
        assert.equal(p.length, 1);
        assert.match(p[0], /a test was removed from tests\/x\.test\.js/);
    });
    test('a whole test file deleted fails', () => {
        const gone = ['diff --git a/tests/y.test.js b/tests/y.test.js', 'deleted file mode 100644', '--- a/tests/y.test.js', '+++ /dev/null', '@@ -1,2 +0,0 @@',
            "-test('one', () => {});", "-test('two', () => {});"].join('\n');
        assert.equal(checkTestIntegrity(gone, [{ sha: 'd', message: OWNED, testsDiff: gone }]).length, 1);
    });
    test('a test whose line changed but whose title did not is not a removal', () => {
        const d = fileDiff('tests/x.test.js', "-    test('same', () => {", "+    test('same', async () => {");
        assert.deepEqual(checkTestIntegrity(d, [{ sha: 'e', message: 'refactor', testsDiff: d }]), []);
    });
    test('a test moved within its file is not a removal', () => {
        const d = fileDiff('tests/x.test.js', "-test('moved', () => {});", ' // between', "+test('moved', () => {});");
        assert.deepEqual(checkTestIntegrity(d, []), []);
    });
    test('a new test in another file does not replace one deleted here', () => {
        const d = fileDiff('tests/x.test.js', "-test('old', () => {});") + '\n' + fileDiff('tests/z.test.js', "+test('new', () => {});");
        const p = checkTestIntegrity(d, [{ sha: 'f', message: OWNED, testsDiff: d }]);
        assert.equal(p.length, 1);
        assert.match(p[0], /removed from tests\/x\.test\.js/);
    });
    test('the commit that removed the test must be the one that replaced it', () => {
        const del = fileDiff('tests/x.test.js', "-test('old', () => {});");
        const add = fileDiff('tests/x.test.js', "+test('new', () => {});");
        const net = fileDiff('tests/x.test.js', "-test('old', () => {});", "+test('new', () => {});");
        const p = checkTestIntegrity(net, [{ sha: 'g1', message: OWNED, testsDiff: del }, { sha: 'g2', message: OWNED, testsDiff: add }]);
        assert.equal(p.length, 1);
        assert.match(p[0], /removed in g1 with no new test in its place/);
    });
    test('one commit excuses only as many retitles as it adds names', () => {
        const c1 = fileDiff('tests/x.test.js', "-test('a', () => {});", "-test('b', () => {});", "+test('a2', () => {});");
        const c2 = fileDiff('tests/x.test.js', "+test('extra', () => {});");
        const net = fileDiff('tests/x.test.js', "-test('a', () => {});", "-test('b', () => {});", "+test('a2', () => {});", "+test('extra', () => {});");
        const p = checkTestIntegrity(net, [{ sha: 'h1', message: OWNED, testsDiff: c1 }, { sha: 'h2', message: 'feat: more', testsDiff: c2 }]);
        assert.equal(p.length, 1);
        assert.match(p[0], /removed in h1/);
    });
    test('a retitled test switched to .skip or .only still fails', () => {
        for (const mod of ['skip', 'only', 'todo']) {
            const d = fileDiff('tests/x.test.js', "-    test('a', () => {", `+    test.${mod}('b', () => {`);
            assert.equal(checkTestIntegrity(d, [{ sha: 'i', message: OWNED, testsDiff: d }]).length, 1, mod);
        }
    });
    test('a renamed describe counts like a renamed test', () => {
        const d = fileDiff('tests/x.test.js', "-describe('old group', () => {", "+describe('new group', () => {");
        assert.deepEqual(checkTestIntegrity(d, [{ sha: 'j', message: OWNED, testsDiff: d }]), []);
        assert.equal(checkTestIntegrity(d, [{ sha: 'j', message: 'chore', testsDiff: d }]).length, 1);
    });
});

describe('testNameChanges', () => {
    test('names cancel within a file and stay apart across files', () => {
        const d = fileDiff('tests/a.test.js', "-test('x', () => {});", "+test('x', () => {});", "+it(\"y\", () => {});")
            + '\n' + fileDiff('tests/b.test.js', "-describe(z.slot, () => {");
        const [a, b] = testNameChanges(d);
        assert.equal(a.label, 'tests/a.test.js');
        assert.deepEqual([...a.gone], []);
        assert.deepEqual([...a.added], [['it("y")', 1]]);
        assert.deepEqual([...b.gone], [['describe(z.slot)', 1]]);
    });
});

describe('saysBehaviourChanged', () => {
    test('either spelling, any case; other words do not count', () => {
        for (const m of ['The behaviour changed on purpose', 'Behaviour changed under RV1R1 (pick a).', 'the behavior has changed', 'BEHAVIOUR CHANGED']) {
            assert.equal(saysBehaviourChanged(m), true, m);
        }
        for (const m of ['', undefined, 'tidy the titles', 'no behaviour change here']) {
            assert.equal(saysBehaviourChanged(m), false, String(m));
        }
    });
});

describe('runGuard', () => {
    test('passes the branch commits to the test check', () => {
        const d = fileDiff('tests/x.test.js', "-test('a', () => {});", "+test('b', () => {});");
        const base = { branch: 'feature/s', slug: 's', touches: ['tests/x.test.js'], changed: [{ status: 'M', path: 'tests/x.test.js' }], firstCommitFiles: ['plans/s.md'], testsDiff: d };
        assert.equal(runGuard({ ...base, commits: [{ sha: 'k', message: OWNED, testsDiff: d }] }).ok, true);
        assert.equal(runGuard({ ...base, commits: [{ sha: 'k', message: 'chore', testsDiff: d }] }).ok, false);
    });
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
