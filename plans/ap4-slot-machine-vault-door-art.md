# AP4 — the casino's slot machine and the bank's vault door get pictures

## Goal

Two examinable things that so far draw as nothing get a picture:

- the casino's slot machine, drawn as Tiny Dungeon's grey cabinet with a dark
  window (column 6, row 4);
- the bank's vault door, drawn as Tiny Town's metal door with a slot (column 5,
  row 10).

Their examine text is not touched.

## Rulings this rests on

- APR4 (art pick), Caelan picked a: the two cells above.
- AP4R1 (where each picture goes), Caelan picked b: the slot machine stands on
  the casino floor; the vault door picture goes on the bank's real door tile,
  and you still walk through it into the vault.

## How

- Two new prop types in `game/sprites.js`, `slotMachine` and `vaultDoor`, each a
  1x1 region on its sheet.
- Casino: a solid `slotMachine` prop on the examine spot (6,2), on floor. You
  stand below it and examine, as before.
- Bank: a `vaultDoor` prop on the door tile (6,1) with `solid: false`, so it
  never blocks the walk through. The transition at (6,1), its `requires` list
  and its `requiresMsg` are not touched. The bank's examine spot at (6,2) stays
  clear, as it is today.

## Acceptance

- Both pictures draw in their rooms and examining each still gives the same text.
- The vault door can still be walked through once the three items are carried,
  and is still shut without them.
- Screenshot of each room at 3440x1440.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` pass.

## Tests

- `tests/interior-furniture.test.js`: the "what the furniture leaves alone" test
  said nothing is placed on either examine spot. The casino half changes
  (behaviour changed): the slot machine now stands on its spot. The bank half is
  unchanged.
- New tests pin the new props' cells, that the vault door prop is not solid and
  sits on the transition, and that the gate is unchanged.

## Out of scope

- A row of several machines, any new examine text, any change to the vault gate
  or the vault room, any other room's art.
