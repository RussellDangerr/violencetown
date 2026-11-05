# FX58 — pressing a greyed wheel option says why

## Goal
On the combat wheel, pressing a greyed option today only plays a bump sound. The player
cannot tell why it is grey. After this change the same press also writes one line to the
log naming the reason. No turn passes and nothing else about the press changes.

## What it does
- `game/wheel-model.js` gains one function, `greyedReason(node, game)`, that returns a
  reason key (or null when the option is usable), and one table, `GREYED_REASON_TEXT`,
  mapping each key to its line. It sits in the wheel model so the later fight-arc work can
  import the same reasons.
- `game/main.js` `_wheelDrill` asks it at the three places it already refuses (placeholder,
  `available`, `verbApplies`) and logs the line before the bump sound.
- Reasons: nobody beside you; someone beside you but not fighting you; no rock (nothing in the
  throw column); not enough MP (and no spell known); not hidden; nothing to take; no food; full
  health for Eat; no drink; no open tile to run to; not enough gold / trick not granted for the
  trick rows.
- Every line is a bracketed placeholder, `[TEXT: <reason>]`, for the owner's own words.

## Acceptance checks
- Pressing a greyed Hit, Cleave, Ranged, Magic, Thieve or Eat logs one line naming the reason.
- Spin is never greyed today (it needs no target and `verbApplies` is true), so it has no
  reason to give; the test pins that it fires, rather than inventing a greying.
- No turn passes on a refused press (the world is not advanced, the wheel stays open).
- A test presses each greyed option with real key events through the game's own key handler.
- `npm test`, `balance:check`, the naming grep, and `autoplay:check` all pass.

## Rulings it rests on
None.

## Out of scope
- Whether the wheel's Hit should reach someone who is not fighting you (as right-click does).
  A neutral still greys it; that stays the owner's call.
- Any real copy. The fight arc (FA1) will reuse the reasons table.
