# FIN1b — the vault door doesn't look open while it's locked

## Goal

The bank's vault door should read as a vault door, and as a shut one until you carry all
three Act 2 items.

## What already shipped

AP4 (plans/ap4-slot-machine-vault-door-art.md) gave the door its own picture: Tiny Town's metal
door with a slot, drawn on the door tile, distinct from the street door. That covers the
"boxy proxy door" part of this card, so no art, sprite entry or map data changes here.

## What is left

Every transition wears the gold exit glow and an arrow, drawn over the world after everything
else. On the locked vault door that makes it read as an open way out, and standing on the tile
puts the arrow right on top of the hero.

## The change

- `game/renderer.js`: a transition whose `requires` the bag does not satisfy (`carriesAll`,
  game/map.js) draws no glow, no arrow and no EXIT hint strip. Carrying everything it asks for,
  it draws all three as before. Gates with no `requires` are untouched. Grapple anchors are not
  touched.
- The rule is one small exported function, so a test can pin it without a canvas.

## Acceptance

- Without the three items the vault door shows no glow, arrow or EXIT hint; with them it does.
- Standing on the locked door, the hero is fully visible.
- Every other exit still wears its marker.
- Screenshots at 3440x1440, door locked and unlocked.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` pass.

## Rulings it rests on

- FIN1 (the door's look): a boxy proxy door, Caelan's earlier pick. Already built by AP4.

## Out of scope

- New art, real copy for the locked message or label, an open/shut tile swap, markers on
  locked grapple anchors.
