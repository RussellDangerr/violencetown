// stack-check.test.js — branches merged onto a base one after another, in memory
// (plans/loop-shared-file-picks.md). Runs against a throwaway git repo.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stackCheck, gitRunner } from '../tools/roadmap-board/stack-check.mjs';

let dir, git;
const run = (...args) => {
    const r = git(args);
    if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
    return r.stdout.trim();
};
const lines = (n, edit = {}) => Array.from({ length: n }, (_, i) => edit[i] ?? `line ${i}`).join('\n') + '\n';
const branchWith = (name, file, text) => {
    run('checkout', '-q', '-b', name, 'base');
    writeFileSync(join(dir, file), text);
    run('commit', '-q', '-am', name);
    run('checkout', '-q', 'base');
};

describe('stackCheck', () => {
    before(() => {
        dir = mkdtempSync(join(tmpdir(), 'stack-check-'));
        git = gitRunner(dir);
        run('init', '-q', '-b', 'base');
        run('config', 'core.autocrlf', 'false');
        run('config', 'user.name', 'test');
        run('config', 'user.email', 'test@localhost');
        writeFileSync(join(dir, 'main.js'), lines(40));
        writeFileSync(join(dir, 'other.js'), lines(5));
        run('add', '.');
        run('commit', '-q', '-m', 'base');
        branchWith('top', 'main.js', lines(40, { 2: 'top edit' }));
        branchWith('bottom', 'main.js', lines(40, { 37: 'bottom edit' }));
        branchWith('other', 'other.js', lines(5, { 1: 'other edit' }));
        branchWith('top-again', 'main.js', lines(40, { 2: 'a different top edit' }));
    });
    after(() => rmSync(dir, { recursive: true, force: true }));

    test('edits to different parts of one file stack cleanly', () => {
        assert.deepEqual(stackCheck('base', ['top', 'bottom', 'other'], git), { ok: true, merged: ['top', 'bottom', 'other'] });
    });

    test('two edits to the same lines name the second branch and the file', () => {
        const r = stackCheck('base', ['top', 'bottom', 'top-again'], git);
        assert.equal(r.ok, false);
        assert.equal(r.conflict, 'top-again');
        assert.deepEqual(r.files, ['main.js']);
        assert.deepEqual(r.merged, ['top', 'bottom'], 'the ones before it merged');
    });

    test('nothing is written to any branch or the working tree', () => {
        const before = run('for-each-ref', '--format=%(refname) %(objectname)');
        stackCheck('base', ['top', 'top-again'], git);
        stackCheck('base', ['top', 'bottom'], git);
        assert.equal(run('for-each-ref', '--format=%(refname) %(objectname)'), before);
        assert.equal(run('status', '--porcelain'), '');
        assert.equal(run('rev-parse', '--abbrev-ref', 'HEAD'), 'base');
    });

    test('an unknown base or branch is an error, not a conflict', () => {
        assert.match(stackCheck('nope', ['top'], git).error, /no such base/);
        const r = stackCheck('base', ['top', 'missing'], git);
        assert.match(r.error, /no such branch: missing/);
        assert.equal(r.conflict, undefined);
    });
});
