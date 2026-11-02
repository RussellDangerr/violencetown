# fx37 — the bag's main button does something for every item

## Goal

Every item in the bag has a main button (the first one on the item's action row). Today two
kinds of item have a button that does nothing useful:

- The Pipe is a melee item with no way to wield it, so the button swings it at no direction and
  logs "no direction". It is a better weapon than the starting sword and cannot be equipped.
- A throw item (the Rock) has a Use button that calls the resolver with no direction. The log
  says "no direction", and in the hotbar overlay the Rock is even spent on it.

After this slice:

- The Pipe is an ordinary weapon item: its main button reads Equip and wields it (the sword
  goes back into the bag). It is already in the hammer class; only its use type changes. The
  door-jam on the hotbar overlay's Use is left as it is.
- A throw item's main button arms the throw: the game leaves the menu, says which item and asks
  for a direction (the line the Throw row already uses), and the next direction key throws it.
  Escape cancels as it does now.
- No bag button can end in a "no direction" line.

## Acceptance

1. Equip on the Pipe wields it.
2. Use on a Rock arms the throw, and the next direction throws it.
3. No bag button ends in a "no direction" line.
4. The tests drive the bag with real keys.
5. npm test, balance:check, the naming grep and autoplay:check all pass.

## Rulings and picks

None. No tuning number changes; no new copy (the armed-throw line is the one the Throw row
already prints). The button on a Rock keeps its current label.

## Out of scope

- Renaming the Rock's button to Throw (a label is player-facing copy: left for him).
- Any change to the renderer, the wheel, or the Throw action on the wheel.
- Making the door-jam reachable from the bag screen.
