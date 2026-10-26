# The guard tells a renamed test from a removed one

## Goal

`tools/roadmap-board/loop-guard.mjs` refuses a slice that removes a test. Today it decides that
line by line: any `-test(`, `-it(` or `-describe(` line in the diff of `tests/` counts as a removed
test. So a test whose title changed reads as a deleted one, and a slice that is allowed to change
a test (LOOP.md §3: only when the card says the behaviour changes, in its own commit) fails the
guard anyway. It did that three times on 2026-10-25: the loop-limits branch, the crits build and
the Carnival rats.

The fix is to judge by test names, per file:

- Read the names of the tests on the removed and added lines of each file in the branch's diff
  against `origin/dev`. A name on both sides (a test whose line changed but whose title did not,
  or a test that moved) is not a removal.
- A name that is gone is a **removal** when the file gains fewer new names than it lost.
- Otherwise it is a **retitle**, and it passes only when the commit on the branch that removed it
  also added a new name to the same file, and that commit's message says the behaviour changed
  ("behaviour changed", either spelling). A commit can only excuse as many retitles as it adds
  new names.
- Skipping, `.only` and `.todo` (as a call or as an option) are still caught line by line, as
  today.

## Acceptance

- A retitled test in a commit whose message says the behaviour changed passes the guard.
- A retitle in a commit that does not say so fails it.
- A deleted test fails it, and so do a skipped test and a narrowed (`.only`) test.
- `runGuard` keeps its exported shape; the existing guard tests pass unchanged. The per-commit
  information is a new, optional input.
- Re-running the new guard on the crits branch (`feature/el2-crits-from-weakness-kinds`) shows
  only real problems. The guard gains an optional `--base <ref>` (default `origin/dev`) so a branch
  that has since merged can be re-checked against the commit it was cut from.
- `npm test` passes.

## Rulings it rests on

- Card FX9, approved by the loop under the standing delegation (LOOP.md §11): tooling is the
  loop's call. This is a deliberate fix to the guard, not a builder working around it.
- LOOP.md §3: an assertion changes only when the card's acceptance says the behaviour changes, and
  only in its own commit. The guard now reads that commit's message.

## Out of scope

- Any change to LOOP.md, the other guard checks (branch, scope, forbidden paths, spec first) or
  the board.
- Telling whether a test kept its meaning under a new title. That stays a reviewer's job; the
  guard only checks that the commit owned up to the change.
- Test titles split across lines (none exist in `tests/` today); such a test is named by its
  first line.
