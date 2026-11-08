# BF1 — remove the unreachable "bag is full" paths

## Goal

The bag grows a page when the PACK fills (BG1), so `_addToInventory` always
succeeds. Several callers still carry a refusal branch for a bag that cannot
grow. Those branches never run in play. This slice removes them, so the code
stops claiming a state that cannot happen.

Nothing changes on screen.

## What goes

- The offer screen's `bagFull` blocker in `game/offer.js` (nothing passes it).
- The refusal branches in `game/main.js` for: the walk-onto pickup, the take
  verb, the examine grant, the kill-loot take, `_grantItem`, and the NPC gift
  loop.
- The refusal in `unequipItem` in `game/items.js`.

## What stays, on purpose

- The shop's take loop guard (pinned by `tests/offer-wiring.test.js`, the test
  that forces a bag that cannot grow). It is defence in depth against losing an
  item with no gold trail.
- The Thieve lift guard (pinned by `tests/skills.test.js`, "a full bag counts
  for nothing").
- `_grantItem` still returns false for an item id with no definition, so the Ice
  Cone machine keeps its part.
- `_takeKillLoot` still leaves a drop with no definition in `left`.
- An unknown gift id is still skipped quietly.

## Acceptance

- No `bagFull` in `offer.js`; nothing passes it.
- The refusal branches above are gone; the two pinned guards remain.
- A new test (`tests/bag-full-paths.test.js`) fills the PACK and picks up
  through the real `_tryPickup`: the bag grows a page, no refusal line is
  logged.
- `npm test`, `balance:check`, the naming grep and `autoplay:check` pass with no
  drift. No test removed or narrowed.

## Rulings

None.

## Out of scope

- The two guards above, and any test edit.
- Any copy, tuning or on-screen change.
