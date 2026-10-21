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
export function checkTestIntegrity(diffText) {
    const problems = [];
    for (const line of String(diffText ?? '').split(/\r?\n/)) {
        if (/^-(?!--)\s*(test|it|describe)\s*\(/.test(line)) problems.push(`a test was removed: ${line.slice(1).trim().slice(0, 80)}`);
        if (/^\+(?!\+\+).*\b(test|it|describe)\.(skip|only|todo)\s*\(/.test(line)) problems.push(`a test was switched off or narrowed: ${line.slice(1).trim().slice(0, 80)}`);
        if (/^\+(?!\+\+).*\{\s*(skip|only|todo)\s*:\s*true/.test(line)) problems.push(`a test was switched off or narrowed: ${line.slice(1).trim().slice(0, 80)}`);
    }
    return problems;
}

export function runGuard({ branch, changed, touches, slug, firstCommitFiles, testsDiff }) {
    const problems = [
        ...checkBranch(branch),
        ...checkScope(changed, touches, slug),
        ...checkSpecFirst(firstCommitFiles, slug),
        ...checkTestIntegrity(testsDiff),
    ];
    return { ok: problems.length === 0, problems };
}

// ── CLI ──────────────────────────────────────────────────────────────────────
function arg(name) {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 ? process.argv[i + 1] : undefined;
}
const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    const slug = arg('slug');
    const touches = (arg('touches') ?? '').split(',').filter(Boolean);
    if (!slug) { console.error('usage: node loop-guard.mjs --slug <slug> --touches a,b'); process.exit(2); }
    const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
    const changed = git('diff', '--name-status', 'origin/dev...HEAD').split('\n').filter(Boolean)
        .map(l => { const [status, ...rest] = l.split('\t'); return { status: status[0], path: rest.at(-1) }; });
    const first = git('rev-list', '--reverse', 'origin/dev..HEAD').split('\n').filter(Boolean)[0];
    const firstCommitFiles = first ? git('show', '--name-only', '--format=', first).split('\n').filter(Boolean) : [];
    const testsDiff = git('diff', 'origin/dev...HEAD', '--', 'tests/');
    const r = runGuard({ branch, changed, touches, slug, firstCommitFiles, testsDiff });
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 1);
}
