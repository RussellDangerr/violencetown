# FX3c — a slot-machine reel rolls through what you just got

## Goal

A kill already puts everything it gives straight into the bag and bursts the items out to you
(FX3, FX3b). This slice adds the second half of what was asked for: a vertical ticker-tape reel,
slot-machine style, that rolls each item the kill gave, one after another. Each line shows the
item's icon and name, its rarity (the existing Common to Legendary ladder, in its colour), the
count, and its gold value (the item's base value, the same price everywhere).

The reel is pure show, like the burst. The items are already in the bag when it starts. It never
holds a turn, never blocks a key, and leaves nothing in the save.

## Acceptance

- After a kill, the reel rolls each new item: icon, name, rarity name in its colour, count and
  gold value. Two of the same item in one kill are one line with a count.
- A many-item kill rolls fast and stays readable: the time per item shrinks as the list grows,
  down to a floor. A one-item kill shows one line, with nothing to roll.
- Any fresh key press (or a tap) skips it, and the key still does its normal job. The reel is
  not a game state: nothing in the turn, the input or the save reads it.
- It fits a phone screen and 3440x1440: a panel at the top-centre of the world, clear of the
  HP panel, sized from the viewport.
- GIF at 3440x1440 of a boss kill's reel (scratchpad only, never committed).
- `npm test`, `balance:check`, the naming grep and `autoplay:check` all pass.

## Rulings it rests on

- **FX3R1, Caelan's own answer:** players have auto-loot on all the time with no weight limit;
  the loot should explode out, then "a roulette-styled vertical scroll wheel (vertical
  ticker-tape slot-machine style) showing you each picked-up item, its rarity, the quantity, and
  the gold point value in rapid-fire succession."
- FX3 and FX3b are merged on `dev`; the reel builds on them.

## How it is built

- `game/loot-ticker.js` (new): the reel as pure functions of time. `reelEntries` folds a kill's
  item defs into lines (icon, name, rarity name and colour from `itemTier`, count, base value).
  `makeReel`, `reelFrame` say which lines are where at a given moment and how faded; `reelDone`
  says when it is over. A new kill while a reel is still rolling folds what was left into the
  new reel (`extendReel`), so a crowd does not flicker.
- `game/layout.js`: `lootReelRect(vp)`, the panel's rectangle, one source for drawing and tests.
- `game/renderer.js`: `_drawLootReel` draws the panel, clips to it, and draws the lines.
- `game/main.js`: `_takeKillLoot` hands the kill's items to `_startLootReel`; a fresh key press or
  a canvas tap clears the reel; the effect loop draws it while it lives.
- `tests/loot-ticker.test.js` (new): the model frame by frame, the layout across screens, and a
  real kill through the real death handler.

## Choices this slice makes (flagged for review)

- The roll speed is the builder's number: 420 ms per item for a short list, shrinking so the
  whole roll takes about 2.4 s, never under 110 ms per item; then the last line holds, then fades.
- Rows are two lines (name and count, then rarity and value) so a name never fights the rest.
- Gold's value is written `N GP`, the label the game already uses for gold.
- Gold itself is not a line (it has no item and no rarity); its log line is unchanged.

## Out of scope

- Any new copy, names or tuning; item values and rarities come from the game as it is.
- Chests, stashes and items placed on maps.
- A setting to turn the reel off.
