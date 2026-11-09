// stack-check.mjs — do these branches still merge onto the base, one after another?
//
//   node tools/roadmap-board/stack-check.mjs <base> <branch>...
//
// (plans/loop-shared-file-picks.md) Several slices may now hold game/main.js at
// once. Before a slice moves to Review the loop runs this with origin/dev, every
// branch already in Review (in the order they would merge), then the new branch.
// It merges them in memory: `git merge-tree` for each step, and a throwaway
// commit (`git commit-tree`, no ref, nothing pushed, no worktree) so the next
// step merges onto the last. Prints JSON and exits 0 when every step is clean, 1
// at the first conflict, naming the branch and its files, 2 on bad input.

import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// The identity the throwaway commits carry, so the check runs with no git config.
const ENV = {
    GIT_AUTHOR_NAME: 'stack-check', GIT_AUTHOR_EMAIL: 'stack-check@localhost',
    GIT_COMMITTER_NAME: 'stack-check', GIT_COMMITTER_EMAIL: 'stack-check@localhost',
};

// git(args) -> { status, stdout }. Never throws on a non-zero exit.
export function gitRunner(cwd = process.cwd()) {
    return (args) => {
        try {
            return { status: 0, stdout: execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...ENV }, stdio: ['ignore', 'pipe', 'pipe'] }) };
        } catch (e) {
            return { status: e.status ?? 2, stdout: String(e.stdout ?? ''), stderr: String(e.stderr ?? '') };
        }
    };
}

export function stackCheck(base, branches, git = gitRunner()) {
    const head = git(['rev-parse', '--verify', `${base}^{commit}`]);
    if (head.status !== 0) return { ok: false, error: `no such base: ${base}` };
    let cur = head.stdout.trim();
    const merged = [];
    for (const b of branches) {
        const tip = git(['rev-parse', '--verify', `${b}^{commit}`]);
        if (tip.status !== 0) return { ok: false, error: `no such branch: ${b}`, merged };
        const m = git(['merge-tree', '--write-tree', '--name-only', '--no-messages', cur, tip.stdout.trim()]);
        const lines = m.stdout.split(/\r?\n/).filter(Boolean);
        if (m.status === 1) return { ok: false, conflict: b, files: lines.slice(1), merged };
        if (m.status !== 0 || !lines[0]) return { ok: false, error: `merge-tree failed on ${b}`, merged };
        const c = git(['commit-tree', lines[0], '-p', cur, '-p', tip.stdout.trim(), '-m', `stack-check: ${b}`]);
        if (c.status !== 0) return { ok: false, error: `commit-tree failed on ${b}`, merged };
        cur = c.stdout.trim();
        merged.push(b);
    }
    return { ok: true, merged };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
    const [base, ...branches] = process.argv.slice(2);
    if (!base || !branches.length) { console.error('usage: node stack-check.mjs <base> <branch>...'); process.exit(2); }
    const r = stackCheck(base, branches);
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : r.conflict ? 1 : 2);
}
