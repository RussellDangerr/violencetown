# dt2: the Factory's goo sludges you, like the sewer river

## Goal
Stepping onto a Factory goo tile applies Sludge exactly as stepping into the sewer river does:
same duration, same log line, same protection (Shoe Bags block it; Soap clears it).

## How
The goo tile (id 42, GOO_VISUAL in game/data.js) gets the `sludge` hazard the river tile already
carries. main.js already acts on `hazard === 'sludge'` in the step and in the held-walk halt, so
no logic changes. Examine still names the tile "Goo" (it reads from the tile id, not the hazard).

## Acceptance
1. Walking onto goo with a real ArrowRight press applies Sludge (3 turns) and logs the river's line.
2. Shoe Bags worn: no Sludge, and the "slides right off" line instead.
3. Examining goo reads as before.
4. The sewer river tile is unchanged.
5. npm test, balance:check, naming grep, autoplay:check pass.

## Ruling
DTR1 (a), Caelan: goo sludges you like the sewer river (same turns and damage; Soap and Shoe Bags
still protect).

## Out of scope
Goo as its own status effect and element (for aliens and robots): a later, separate idea.
