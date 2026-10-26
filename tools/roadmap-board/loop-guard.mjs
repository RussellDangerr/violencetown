// loop-guard.mjs — the checks a loop run performs on itself before it pushes a
// slice and before it hands the card to Review (plans/board-loop.md §3).
//
// Rules written in LOOP.md are promises; these are checks. Run from the slice's
// branch:
//
//   node tools/roadmap-board/loop-guard.mjs --slug <slug> --touches a.js,b.js
//
// Prints { ok, problems } as JSON and exits 1 when anything is wrong. The pure
// checks below are exported for tests/loop-guard.test.js.

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const norm = p => String(p ?? '').trim().replace(/\\/g, '/').replace(/^\.\//, '');

// Paths a slice never edits, whatever its card says.
const FORBIDDEN = [
    [/^tiled\//, 'tiled/ is Caelan\'s, untracked, never touched'],
    [/golden[^/]*\.json$/i, 'a golden file moves only on his ruling'],
    [/^package(-lock)?\.json$/, 'package.json carries the release version'],
    [/^\.claude\/settings[^/]*\.json$/, 'permission settings are his to change'],
    [/^CLAUDE\.md$/, 'CLAUDE.md is changed only when he asks'],
    [/^game\/_headers$|^game\/_redirects$/, 'deploy config'],
];

export function checkBranch(branch) {
    return /^feature\/[a-z0-9][a-z0-9-]*$/.test(branch ?? '')
        ? [] : [`branch "${branch}" is not feature/<lower-case-slug>`];
}

// changed: [{ status: 'A'|'M'|'D'|'R…', path }] from `git diff --name-status origin/dev...HEAD`.
// Allowed: a file the card lists in `touches`, the slice's own spec, and NEW test files.
export function checkScope(changed, touches, slug) {
    const allowed = new Set((touches ?? []).map(norm));
    const spec = `plans/${slug}.md`;
    const problems = [];
    for (const { status, path } of changed) {
        const p = norm(path);
        const banned = FORBIDDEN.find(([re]) => re.test(p));
        if (banned) { problems.push(`${p}: ${banned[1]}`); continue; }
        if (p === spec || allowed.has(p)) continue;
        if (p.startsWith('tests/') && status === 'A') continue;
        problems.push(`${p}: outside the card's touches (stop and ask, LOOP.md step 7)`);
    }
    return problems;
}

// The first commit on the branch must carry the spec.
export function checkSpecFirst(firstCommitFiles, slug) {
    return (firstCommitFiles ?? []).map(norm).includes(`plans/${slug}.md`)
        ? [] : [`the first commit does not add plans/${slug}.md`];
}

// A unified diff of tests/ against origin/dev. A slice may add tests and may
// change one only in a commit that says the behaviour changed; it may never
// delete one or switch one off.
//
// Removal is judged by test NAME, per file, not by line: a test whose line
// changed but whose title did not, or one that moved, is not a removal. A name
// that is gone counts as removed when its file gained fewer new names than it
// lost. Otherwise it was retitled, and that is allowed only when the commit on
// the branch that removed it also added a new name to the same file and says in
// its message that the behaviour changed (LOOP.md §3). Each such commit excuses
// at most as many retitles as it adds names. `commits` is
// [{ sha, message, testsDiff }], oldest first, each diff against its parent.
export function checkTestIntegrity(diffText, commits = []) {
    const problems = [];
    for (const line of String(diffText ?? '').split(/\r?\n/)) {
        // Only a real call at the start of a line counts — a test file that quotes
        // "test.skip(" inside a string (this guard's own tests do) is not a skipped test.
        if (/^\+(?!\+\+)\s*(test|it|describe)\.(skip|only|todo)\s*\(/.test(line)) problems.push(`a test was switched off or narrowed: ${line.slice(1).trim().slice(0, 80)}`);
        if (/^\+(?!\+\+)\s*(test|it|describe)\s*\([^\n]*\{\s*(skip|only|todo)\s*:\s*true/.test(line)) problems.push(`a test was switched off or narrowed: ${line.slice(1).trim().slice(0, 80)}`);
    }

    const steps = (commits ?? []).map(c => ({
        sha: String(c.sha ?? '').slice(0, 7) || '(commit)',
        owned: saysBehaviourChanged(c.message),
        files: testNameChanges(c.testsDiff).map(f => ({ ...f, budget: count(f.added) })),
    }));
    for (const file of testNameChanges(diffText)) {
        const gone = names(file.gone);
        if (!gone.length) continue;
        if (gone.length > count(file.added)) {
            problems.push(`a test was removed from ${file.label} (${gone.length} gone, ${count(file.added)} new): ${gone.join(', ').slice(0, 160)}`);
            continue;
        }
        for (const name of gone) {
            let at = null;
            for (const step of steps) {
                const f = step.files.find(x => x.gone.has(name) && sharesPath(x, file));
                if (f) at = { step, f };
            }
            if (!at) problems.push(`a test was retitled with no commit on the branch that shows it: ${file.label}: ${name}`);
            else if (!at.step.owned) problems.push(`a test was retitled in ${at.step.sha}, whose message does not say the behaviour changed: ${file.label}: ${name}`);
            else if (at.f.budget <= 0) problems.push(`a test was removed in ${at.step.sha} with no new test in its place: ${file.label}: ${name}`);
            else at.f.budget--;
        }
    }
    return problems;
}

const BEHAVIOUR_CHANGED = /\bbehaviou?r\s+(?:has\s+)?changed\b/i;
export const saysBehaviourChanged = message => BEHAVIOUR_CHANGED.test(String(message ?? ''));

// The test names a diff removes and adds, per file. A name on both sides of a
// file cancels out. Returns [{ label, paths, gone: Map, added: Map }], where a
// Map is name → how many times.
export function testNameChanges(diffText) {
    const files = [];
    let cur = null, inHeader = false;
    const open = () => { cur = { paths: new Set(), minus: [], plus: [] }; files.push(cur); };
    const addPath = p => { if (p && p !== '/dev/null') cur.paths.add(norm(p.replace(/^[ab]\//, ''))); };
    for (const line of String(diffText ?? '').split(/\r?\n/)) {
        const head = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
        if (head) { open(); addPath(head[1]); addPath(head[2]); inHeader = true; continue; }
        if (line.startsWith('@@')) { inHeader = false; continue; }
        const side = /^(?:---|\+\+\+) (.+)$/.exec(line);
        if (side && (inHeader || /^(a\/|b\/|\/dev\/null)/.test(side[1]))) {
            if (!cur) open();
            addPath(side[1].trim());
            continue;
        }
        if (inHeader) continue;
        const sign = line[0];
        if (sign !== '-' && sign !== '+') continue;
        const name = testName(line.slice(1));
        if (!name) continue;
        if (!cur) open();
        (sign === '-' ? cur.minus : cur.plus).push(name);
    }
    return files.map(f => {
        const gone = tally(f.minus), added = tally(f.plus);
        for (const [n, k] of [...gone]) {
            const both = Math.min(k, added.get(n) ?? 0);
            if (!both) continue;
            sub(gone, n, both); sub(added, n, both);
        }
        const paths = [...f.paths];
        return { label: paths.at(-1) ?? '(a test file)', paths, gone, added };
    });
}

// `test('x', …)`, `it.skip("x", …)`, `describe(z.slot, …)` → "test('x')" etc.
// The modifier is left out, so a test switched to .skip keeps its name (the
// skip itself is caught above).
function testName(src) {
    const m = /^\s*(test|it|describe)(?:\.\w+)?\s*\(\s*(.*)$/.exec(src);
    if (!m) return null;
    const rest = m[2];
    const q = rest[0];
    let title;
    if (q === '\'' || q === '"' || q === '`') {
        let i = 1;
        while (i < rest.length && rest[i] !== q) i += rest[i] === '\\' ? 2 : 1;
        title = rest.slice(0, i + 1);
    } else {
        title = rest.split(/[,)]/)[0].trim() || '(untitled)';
    }
    return `${m[1]}(${title})`;
}

const tally = list => list.reduce((m, n) => m.set(n, (m.get(n) ?? 0) + 1), new Map());
const sub = (m, n, k) => { const v = m.get(n) - k; if (v > 0) m.set(n, v); else m.delete(n); };
const count = m => [...m.values()].reduce((a, b) => a + b, 0);
const names = m => [...m].flatMap(([n, k]) => Array(k).fill(n));
const sharesPath = (a, b) => a.paths.some(p => b.paths.includes(p)) || (!a.paths.length && !b.paths.length);

export function runGuard({ branch, changed, touches, slug, firstCommitFiles, testsDiff, commits }) {
    const problems = [
        ...checkBranch(branch),
        ...checkScope(changed, touches, slug),
        ...checkSpecFirst(firstCommitFiles, slug),
        ...checkTestIntegrity(testsDiff, commits),
    ];
    return { ok: problems.length === 0, problems };
}

// ── CLI ──────────────────────────────────────────────────────────────────────
function arg(name) {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 ? process.argv[i + 1] : undefined;
}
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).trim();

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    const slug = arg('slug');
    const touches = (arg('touches') ?? '').split(',').filter(Boolean);
    // --base re-checks a branch against the commit it was cut from, once dev has moved past it.
    const base = arg('base') ?? 'origin/dev';
    if (!slug) { console.error('usage: node loop-guard.mjs --slug <slug> --touches a,b [--base <ref>]'); process.exit(2); }
    const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
    const changed = git('diff', '--name-status', `${base}...HEAD`).split('\n').filter(Boolean)
        .map(l => { const [status, ...rest] = l.split('\t'); return { status: status[0], path: rest.at(-1) }; });
    const first = git('rev-list', '--reverse', `${base}..HEAD`).split('\n').filter(Boolean)[0];
    const firstCommitFiles = first ? git('show', '--name-only', '--format=', first).split('\n').filter(Boolean) : [];
    const testsDiff = git('diff', `${base}...HEAD`, '--', 'tests/');
    const commits = git('rev-list', '--reverse', '--no-merges', `${base}..HEAD`).split('\n').filter(Boolean)
        .map(sha => ({ sha, message: git('log', '-1', '--format=%B', sha), testsDiff: git('diff', `${sha}^`, sha, '--', 'tests/') }));
    const r = runGuard({ branch, changed, touches, slug, firstCommitFiles, testsDiff, commits });
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 1);
}
