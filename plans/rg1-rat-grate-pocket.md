# RG1: a rat-only pocket in the Sewer

## Goal
Rat Form (and the Rat Mask) can already walk onto grates. This gives them a third place to do it: a new grate in the Sewer's north-east wall, beside the corridor to the north door, with a small closed pocket behind it holding a chest.

## What is built
- sewer-map.json: one grate tile at (15,2), above existing floor (15,3). Behind it a five-tile pocket along y=1, x 14 to 18, carved out of solid wall. It touches no other floor.
- One chest, `rat-grate-cache`, at (18,1), holding a Strength Poition and a Gold Poition.
- game/item-sources.js regenerated (`node tools/item-sources.mjs`), because a new container makes it stale.
- tests/rg1-rat-grate-pocket.test.js.

## Acceptance
- On foot, a flood fill from the spawn reaches no pocket tile; with grates allowed it reaches every one.
- With real arrow keys: in Rat Form you walk onto the grate, into the pocket and back out; without it the grate bumps. With the Rat Mask on, the same walk works without Rat Form.
- Items taken from the chest stay taken after leaving the zone and coming back.
- No enemy stands in, or paths into, the pocket. The grates at (2,4) and (11,6) are unchanged.
- map-audit lists the pocket under what Rat Form opens, with no new orphan.
- npm test, balance:check, naming grep and autoplay:check pass.

## Rulings it rests on
- RG1R1 a: the north-east wall beside the corridor to the north door, five-tile pocket, tile edits only.
- RG1R2 a: one chest with a Strength Poition and a Gold Poition.
- PCR3 a: any player text is plain. This slice adds none: the chest has no examine line.

## Out of scope
No code changes, no new items, no new tile kind, no new copy, no save-format change.
