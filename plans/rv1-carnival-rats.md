# RV1 — the Carnival's rats, placed by hand

**Date:** 2026-10-25
**Parent:** `plans/spine.md` §7 (rats are the first content through the framework),
`plans/slot-registry.md` (the registry), the recolor tool (`tools/gen_recolor.py`, merged).

## Goal

The Carnival gets its first crowd: three new rats, each the one brown rat recoloured, standing
where they were placed by hand. Each rat is one registry entry in `game/slots.js` with its own
type, its own cell on the recolor sheet, its stats and its kit. A map places one with a new spawn
form, `{ "id", "entry", "x", "y" }`: the map says where, the registry says who.

## The rulings this rests on

- **Which rats first:** the Carnival three, birthday, sludge and robot. No Wilderness rat yet.
- **Colours:** bold and readable, which are the recolor sheet's first three columns as merged
  (birthday 0, sludge 1, robot 2). The sheet is not regenerated.
- **Names:** plain, Birthday Rat, Sludge Rat and Robot Rat. The name is the type, so it is what
  the log and Examine show.
- **Toughness and drops:** canyon-rat stats (hp 100, armor -30, damage 6, sight 6, 1 GP, vermin,
  sewer dweller), and one themed drop each, all inside the vermin cap of 5 GP of kit.

## The shape

- `slots.js`: three `ENTRIES` rows. `resolveSpawn` learns the `entry` form beside `slot`: a spawn
  naming an entry becomes that entry's stat block with the spawn's own id, place and facing on
  top. The canyon rat's `canyon_critter` tag is not copied, since that tag feeds Pike's deal.
- `sprites.js`: three `ENEMY_SPRITES` rows on the `ratVariants` sheet.
- `carnival-map.json`: three hand-placed spawns in the fair's open east half, clear of the
  clown's wander and of the arrival tile.
- `content-validate.js`: a spawn's `entry` must be a real entry; a spawn may not carry both
  `slot` and `entry`.
- `balance-harness.mjs`: map spawns already resolve through `resolveSpawn`, so placed entries are
  linted where they stand. A registry entry no map places and no slot pools is linted too, so no
  entry can escape the bands.
- `sprite-coverage.test.js`: the map sweep resolves `entry` spawns to their type, so coverage,
  same-map cell clashes and orphan checks see the new rats.

## Drops

The ruling's note put a sludge sack at 3 GP. It is 10 GP today, over the vermin cap, and no
scrap item exists (a new one is outside this slice). So each drop is an existing item inside the
cap, flagged for review: these are one-line changes in `slots.js`.

## Acceptance

- The three rats spawn in the Carnival with their ruled colours, names and stats.
- The balance harness lints every new rat; no registry entry escapes it.
- No two types on one map share a sprite cell, and no sprite entry is orphaned.
- A 3440x1440 screenshot of the rats in place.
- `npm test`, the naming grep and `autoplay:check` pass. `balance:check` drifts only by the new
  rats' rows, and the new golden waits for Caelan's yes.

## Out of scope

The pouch, undead and frost rats; spawn-table rolls (RV2); new items or art for drops; barks or
any other copy; regenerating the recolor sheet; writing the balance or autoplay golden.
