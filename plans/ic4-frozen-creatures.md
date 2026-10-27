# IC4: snowmen, a yeti and polar bears live in the frozen area

## Goal

The frozen area (IC3) gets its first creatures. Its mob slot holds a pool of three entries,
`[Snowman]`, `[Yeti]` and `[Polar Bear]`, and three spawns on the map are dealt from that pool,
so all three stand in the area. The names are placeholders until Caelan names them.

## Acceptance

- The three creatures spawn in the frozen area, from the area's mob pool.
- Each has a sprite, a weakness row, and examine text `[TEXT]`.
- The balance bench lists them.
- A 3440x1440 screenshot of each.
- `npm test`, the naming grep and `autoplay:check` pass. `balance:check` passes once the new
  rows are accepted.

## What it rests on

- Caelan asked for these three creatures in the frozen area, with art picked or recoloured from
  the bundled Kenney sheets, and stats that start from the nearest existing enemy and go
  through the balance bench.
- IC3 (merged): the frozen area itself, `game/frozen-map.json`.
- The spine, SL-5 and SL-6: a mob is a slot kind, and a mob slot holds mooks rolled per spawn,
  not one anchor picked per game.

## The build

- `game/slots.js`
  - A `frozen.mob` slot of kind `mob`, pooling the three entries.
  - A mob slot is never one pick per game. A new game shuffles its pool like a deck, on a
    stream of its own (so no anchor pick and no combat roll moves). Each mob spawn names a
    `seat`, its place in the deal. A map with a seat per entry shows every entry, in an order
    that changes from game to game. With no shuffle saved (an older save, or the bench), the
    deck is the pool's own order.
  - Each entry's numbers are copied from the nearest existing enemy (hp, armor, damage, gold,
    kit). Nothing is invented:
    - `[Snowman]` from the Rattling Skeleton, whose art it shares.
    - `[Yeti]` from the Fungus King, whose art it shares.
    - `[Polar Bear]` from the Red Fungus, the tier between those two.
  - Each entry's weakness row comes straight from the weakness chart (`game/elements.js`): the
    `cold` row, which the chart puts on water, so weak to what overcomes water and resisting
    what water overcomes.
  - Each entry carries `examine: '[TEXT]'`.
- `game/enemies.js`: an enemy carries its `examine` text and keeps it through a save.
- `game/sprites.js`: three `ENEMY_SPRITES` rows, picked from the Tiny Dungeon sheet (no new
  art files, no recolour tool).
- `game/examine.js`: a creature with examine text of its own says it, on E and on the Target
  List / tap alike; any other creature keeps the generic line.
- `tools/balance-harness.mjs`: a slot's unpicked pool entry is not listed again when its map
  already shows it, so each frozen creature is one bench row and the frozen faucet is their
  three wallets.
- `game/frozen-map.json`: three spawns in the `frozen.mob` slot, seats 0 to 2, on open snow
  away from both doors.
- `tests/frozen-creatures.test.js`: the slot and its deal, the spawns, the art, the weakness
  rows, the copied numbers, examine on both paths, and the bench rows.
- `tests/balance-harness.test.js`: a mob slot's creatures are listed once, and no pool entry
  dodges the bench.

## Out of scope

- Real names, examine copy, barks, lore and loot beyond the copied kit.
- New art or recolours (no tint mechanism exists in `sprites.js`; a recolour needs a new sheet
  file).
- Respawn tuning and any quest beat in the frozen area.

## A ruling taken while building

The first pass found two gaps outside its files: examine printed one generic line for every
creature (`game/examine.js`), and the bench listed each frozen creature twice, doubling the
area's faucet, because it assumed every slot has one pick per game (`tools/balance-harness.mjs`).
The pick was to widen the slice to both files and fix both here.
