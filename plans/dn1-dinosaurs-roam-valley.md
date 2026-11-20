# DN1: dinosaurs roam the Valley

## Goal

The Valley (the lost map you reach by climbing out of the Canyon with the grappling hook) gets its
first creatures: a raptor, a triceratops and a T. rex. Its mob slot, `valley.mob`, pools the three
and three spawns on the map are dealt from that pool, so all three stand in the Valley, in an order
that changes from game to game. Built the way the frozen area's creatures were (IC4).

## Acceptance

- `valley.mob` is a mob slot on `valley-map.json` whose pool holds the three kinds, and three map
  spawns are dealt from it.
- Each kind copies hp, armour, damage, gold and kit from the nearest existing enemy (the same three
  sources IC4 uses, tier for tier: Rattling Skeleton for the raptor, Red Fungus for the triceratops,
  Fungus King for the T. rex). No number is new.
- Each has a stand-in sprite (the cell its source enemy uses) and a plain examine line.
- The balance bench lists them. The new rows are put to Caelan before the golden is written.
- A test reaches a dinosaur through a real zone change (the hook climb out of the Canyon), not a
  direct spawn call.
- Evidence: a 3440x1440 frame of each kind in the Valley.
- `npm test`, the naming grep and `autoplay:check` pass; `balance:check` passes once the rows are
  accepted.

## Rulings it rests on

- DNR1 (a): the Valley.
- DNR2 (a): the classics, raptors, a triceratops and a T. rex.
- DNR3 (a): ordinary foes only; no boss.

## Out of scope

- A boss, real examine copy, barks, weakness rows, new art, flight, respawn tuning.
- The balance golden (`balance:write`) until the new rows are accepted.
