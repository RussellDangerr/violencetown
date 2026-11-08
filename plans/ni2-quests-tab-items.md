# NI2 — The Quests tab lists the three Act 2 items

## Goal
Once Act 1 is over (the burger delivery is done), the Quests tab of the Remoticon shows a
short checklist of the three things the game wants from Act 2: each item's name, the zone it
is found in, and a tick once the item is in the bag. Before the delivery the list is not
drawn, the same moment the "explore the three zones" objective begins.

## What it does
- `game/quests.js` gains `act2Checklist(qe)`: `null` before `deliver_burger` is complete,
  otherwise one row per Act 2 zone (Map order) with `{ zone, itemId, held }`. It reuses
  the existing `ACT2_ZONES` and the boss slot's `requiredDrop`, so no item id is retyped.
- `game/renderer.js` `_drawJournalQuestsBody` draws a heading, then one line per row:
  tick or dot, the item's name read from the item data (`ITEMS[id].name`), and the zone.
- Held is derived from the bag, which the save already stores, so a reload shows the same
  ticks with nothing new to persist.

## Acceptance
- After the delivery the tab shows the Stuffed Animal at the Carnival, the Flux Capacitor
  at the Factory, the Soul Crystal at the Graveyard.
- Picking one up ticks its line; a save/reload through the real save path keeps it.
- Before the delivery nothing is drawn.
- The heading reads `[TEXT]`.
- Evidence: 3440x1440 frames with none and with two held, and one at phone width.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` pass.

## Rulings
- NI2R1, picked (a): the Quests tab gains three lines — each item, its zone, a tick once held.
- NI1 (merged): the three items carry their names in `game/items.js`; they are read from there.

## Out of scope
- Any wording beyond the heading (placeholder `[TEXT]`); item descriptions stay `[TEXT]`.
- The vault-door check, objective line and Map rings (FX54, AE2 already do those).
- Layout or scrolling changes to the tab.
