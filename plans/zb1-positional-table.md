# The rulebook states the positional table, and a test pins it

## Goal

Where a hit comes from has one rule in the game today: the single tile directly behind a target
hits for ×1.5 (a backstab), and every other tile hits for ×1. The rulebook still lists this as
open ("5-Zone Body reconciliation"), and three old research docs still describe a five-zone body
with per-zone health, per-zone armour, prosthetics and head/leg hits from above and below. None of
that was built, and the ruling below drops it.

This slice writes the ruled table into the rulebook, closes the open item, marks the old docs as
superseded at the top, fixes the stale line citations and code comments around it, and adds a test
that pins the table tile by tile. Game behaviour does not change.

## Ruling it rests on

- **Where a hit comes from (ruled 2026-10-23): pick a, "Back ×1.5, everything else ×1".** The gear
  slots keep their body-part names and carry perks, but armour stays one flat total. No flanks, no
  top or bottom hits, no per-zone health or armour.
- **Can enemies backstab you (ruled 2026-10-23): pick a, "yes, by the same rule".** The rulebook
  records it as ruled; building it is its own slice (it may move the quest-1 autoplay golden), so
  it is out of scope here.

## The table

The "back" is the tile opposite the target's last step (its facing). For a target at the centre:

| Facing | ×1.5 | ×1 |
|---|---|---|
| a straight step (e.g. east) | the one tile behind (west) | the other seven, including both diagonals behind |
| a diagonal step (e.g. south-east) | the one diagonal tile behind (north-west) | the other seven, including the two straight tiles beside it |
| none (never moved, no seeded facing) | nothing | all eight |

## Acceptance

1. `plans/balancing-bible.md` Law 2 states the table above; the 5-Zone Body item leaves *Deferred*
   and is recorded under a *Ruled* section.
2. `plans/gold-standard-design.md`'s open hook for the zone body points at the ruling.
3. `plans/combat-health-system.md`, `plans/game-research-findings.md` and
   `plans/fists-fallback-weapon.md` each say at the top that their zone-body parts are superseded.
4. Stale line citations in Law 2 and the zone-body comments in `game/combat.js` and `game/main.js`
   are corrected. `main.js` changes are comments only.
5. `tests/positional-table.test.js` pins all eight neighbours for a straight and a diagonal facing,
   both on `isBackstab` and on the multiplier the player's swing actually passes to `computeHit`.
6. `npm test`, `balance:check`, the naming grep and `autoplay:check` all pass; no golden moves.

## Out of scope

- Enemies backstabbing the player (ruled yes; its own slice).
- Any change to the ×1.5 number or to how crits stack weakness kinds (a separate branch).
- Rewriting the old docs' bodies; they keep their history and get a banner.
