# TX6 — oil: spread it, and the next landing slides through the Downtown gate

## Goal
An `oil` item. Used at the bridge in Town it is spent, spread on the road, and a saved flag
records it. The next ramp landing in Downtown then slides: the taxi keeps going into the TX5
gate, the fence tile becomes road, and you stand in Downtown beside it. The gate stays open.

## What changes
- `game/items.js`: `oil`, a non-consumable-by-use item (spent only by its use row), baseValue 35,
  placeholder `[TEXT]` name and description. Not for sale until TX7.
- `game/ui-sprites.js`: a tinted-square icon for it (placeholder).
- `game/item-uses.js`: row `oil-on-bridge`, matching the bridge or the taxi parked at it (the
  bridge point itself is not reachable before the Converter is fitted, the taxi is). Works
  before and after the Converter. Spends one, sets `oilSpread`, logs `[TEXT]`. If the oil is
  already spread, or the gate already open, it says so in `[TEXT]` and spends nothing.
- `game/main.js`: `_oilSlideDue`, `_oilSlideDone`, `_openDowntownGateIfSlid`; the first ramp
  landing (`_rampToDowntown`) and a later taxi ride landing in Downtown (`_rideTo`) slide when
  oil is spread and the gate is shut. A crash does not touch the flag, so the oil waits.
  `_loadMap` re-derives the open gate from the saved flag `downtownGateOpen`, the way the bridge
  is re-derived, so it survives leaving, a save and CONTINUE. New Game methods are called as
  `this._x?.()`.
- Tests: `tests/oil-slide.test.js` (grants oil, pours alcohol, crosses and walks through, all
  with real keys), a row in `tests/inspector-uses.test.js` and `tests/item-uses.test.js`.

## Acceptance
As on the card: use spends one and sets the flag (before and after the Converter); a ramp
landing with oil slides through the gate; a crash still crashes and the oil stays spread; the
gate stays open after leaving, a save and CONTINUE; walking through reaches the TX5 area; a
second use after the gate is open spends nothing and says so.

## Rulings
TX6R1 (a): spread on the road at the bridge from the start of the game; the next ramp landing
slides. Costs accepted: oil needs alcohol too; a crash does not slide and the oil waits; once
the gate is open more oil does nothing. TX5 (the gated area) is on dev. Oil's baseValue is 35.

## Out of scope
Selling oil (TX7), any real names or copy, a new set piece, art beyond the placeholder icon.
