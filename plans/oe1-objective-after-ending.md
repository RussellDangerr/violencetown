# OE1 — after the credits, the objective points home

## Goal
Once the credits have rolled (the saved `endingSeen` flag), the objective and the Map stop
sending the player to the bank's vault in Downtown. They point at the Town instead.

## Ruling it rests on
OE1R1, pick (a): "Back to the Town". A new objective line and the Map rings the Town. The line
is `[TEXT]` until Caelan words it.

## Change
A new row in `BETWEEN_QUESTS` (`game/quests.js`), ahead of `to_downtown`, that holds when
`flags.endingSeen` is true. It reads only the saved flag, so a reload keeps it.

## Acceptance
- Before the credits nothing changes: existing rows and tests hold.
- With `endingSeen` set, the vault row no longer shows; the objective is `[TEXT]` and the
  Map ring is the Town alone.
- The row survives a save and reload.
- `tests/objective-after-ending.test.js` sets the flag the way `credits.js` does
  (`markEndingSeen`) and reads the objective and the zones.

## Out of scope
The real wording; any change to the credits themselves.
