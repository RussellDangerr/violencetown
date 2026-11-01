# TX1: record the taxi in the spine

**Goal.** Put what Caelan ruled on 2026-11-01 into `plans/spine.md`, naming the Locked row it
replaces, as the lock clause (§4) asks. Documentation only. The longer spec the later slices cite is
`plans/taxi-driver.md`, committed in this same first commit.

**Rulings it rests on.**
- HO1R3, option a: the taxi replaces your car; the Converter fixes his taxi, and he is how you cross.
- HO1R4, option a: a new side area past the barricade, off the spine. Oil always unlocks it; it is
  optional.

**Acceptance.**
- `plans/spine.md` §9 has a dated entry citing both rulings, quoting the Act 1 line it replaces and
  the line that stands in its place.
- §1 Act 1 and the two beat-table rows ("The car won't start", "The bridge") read the new wording.
- §3 says the side area is optional and carries no beat.
- `plans/taxi-driver.md` lists TX2 to TX7 in order with what each changes.
- The diff touches only `plans/`. No game file, test or golden changes.
- No text shaped like a slot id is added to the spine, because `tools/radicals.mjs` reads it.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` pass.

**Out of scope.** All code, the side area's name, any in-game wording, the later slices.
