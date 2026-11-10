# RB2 — the rats' stash chest never hides under a body

## Goal
Chests draw under actors, and the Were-Rat's body lies at (17,10), the rat robbery's stash spot (RB1),
so the stash could not be seen. The stash now skips any tile holding an enemy, live or fallen, the way
it already skipped live ones. It stays at (17,10) whenever nothing lies there.

## Acceptance
- After a rat robbery with the body at (17,10), the stash is on the nearest free tile, with no body or live enemy.
- With (17,10) clear, the stash is exactly there.
- A test loses to a rat through a real world turn, then walks to the chest with real keys and opens it.
- Evidence: a 3440x1440 frame of the chest beside the body.
- npm test, balance:check, naming grep, autoplay:check pass.

## Rests on
RB1 (merged): losing to the sewer's ordinary rats leaves a stash at (17,10). The change is in `_stashTile`, game/main.js.

## Out of scope
Renderer draw order; other stash spots; gold in the stash.
