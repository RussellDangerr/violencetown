# The guard refuses any golden file, and lets a ruled one through

## Goal

`tools/roadmap-board/loop-guard.mjs` refuses a slice that edits a golden file, because a golden
moves only on Caelan's ruling (LOOP.md §3 and §8). Today it spots a golden by the pattern
`golden*.json`, so `tools/autoplay-golden.json` is caught but `tools/balance-golden.txt` passes as
an ordinary file. And when a ruling does say "accept the new golden", the guard still refuses it,
so a slice that rightly moves the golden can never pass.

The fix:

- A golden file is any file whose name contains `golden`, whatever its extension. A rename
  counts on either side, so renaming a golden away from its name is still a golden change.
- A golden change passes only when every commit on the branch that touched that file cites an
  accept ruling in its message, and at least one such commit exists.
- "Cites an accept ruling" follows the rename fix (FX9): the guard reads the commit message, as it
  does for "behaviour changed". The message must say accept (accept, accepts, accepted) and name a
  ruling card by its id, such as `F3aR1`, `AB1R3` or `RV1R1`. The golden commits on `dev` that
  cite their ruling already read this way.
- A ruled golden change does not also need to be in the card's `touches`: the ruling is what
  allows it.

## Acceptance

- A change to `tools/balance-golden.txt` fails the guard unless its commit cites a ruling.
- A ruled golden change passes.
- The other forbidden paths (`tiled/`, `package.json`, settings, `CLAUDE.md`, deploy config) are
  refused as before, ruling or not.
- `runGuard` and `checkScope` keep their shape; the existing guard tests pass unchanged. The
  per-commit file list is a new, optional input.
- `npm test` passes.

## Rulings it rests on

- Card FX19, tweaked and approved by the loop under the standing delegation (LOOP.md §11): tooling
  is the loop's call.
- LOOP.md §3: only an "accept the new golden?" ruling's pick may rewrite the golden. The guard now
  reads the commit that does it.

## Out of scope

- Checking that the cited ruling exists, or that its pick was "accept". The guard cannot see the
  board; a reviewer can.
- Requiring the golden to move in a commit of its own.
- Any change to LOOP.md, the board or the other guard checks.
