# MK3: you can get the Strongman mask in a new game

## Goal
The Power-Wield Mask (item id `strongman_mask`) exists and nothing hands it out. After this, a new
game has exactly one place to get it: the Carnival's strongman hands it over, once, the first time
he joins you.

## Rulings it rests on
- MK1R3, pick a: the strongman hands the mask over once, the first time he joins you.
- SG1R2, pick a: there is one strongman, at (24,13), calm; a talk recruit sits beside the gift flip.
- PCR3, pick a: player-visible text is plain and true to the code, no square brackets. The item
  keeps its existing name, Power-Wield Mask.

## Build
- `game/main.js`: a small check, `_syncStrongmanGift`, run on every render. When the strongman is
  your ally and no mask has been handed over yet, it grants the mask through `_grantItem` (the
  same path a quest reward takes: the bag grows a page when full, so it never refuses) and logs one
  plain line. "Only once" is a key in `_collectedItems`, which is already saved. Both ways he joins
  (a gift, or the talk) set the same ally flag, so one check covers both.
- `tests/mk3-strongman-mask-source.test.js`.

## Acceptance
1. A scan of every map, shop, container, slots.js loadout and quests.js grant finds no
   strongman_mask source other than this one hand-over.
2. Winning him over through the real flip puts the mask in the bag with one log line.
3. Only once: a second join, a save and a reload give no second mask.
4. A full bag does not lose it.
5. Worn, each hand can hold a two-hander.
6. Gates: npm test, balance:check, naming grep, autoplay:check.

## Out of scope
Other sources (a quest grant, a shop row), art, the real hand-over line, any change to the item.
