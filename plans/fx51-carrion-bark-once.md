# FX51 — Carrion says her line once as you walk around her

## Goal
An NPC with an adjacency bark (Carrion, in the Sewer) says her line once when you
come up to her. Today the line re-arms the moment you are not exactly one straight
step away, so a diagonal step re-arms it and walking around her repeats the line,
with copies stacked over her.

The bark now re-arms only once you have stopped touching her, diagonals included.
The firing rule is unchanged (one straight step away); only the re-arm changes. Her
words are unchanged.

## Acceptance
- Walking all the way around her, diagonals included, gives her line once.
- Walking away until you are not touching her, then back, gives it once more.
- The test drives the real turn path (`resolveEnemyTurns`, which calls the bark),
  not just the helper.
- Evidence: a 3440x1440 frame of her with one line over her after a walk around.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` pass.

## Rulings and picks
None. Approved by the loop on Caelan's Tweak it. No new copy.

## Out of scope
- Changing what she says, or when the first bark fires (still Manhattan distance 1).
- Other NPC barks (cadenced barks, "spotted").
