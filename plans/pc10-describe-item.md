# PC10: every item's text gives its numbers, what it does, and where it comes from

Ruling: PCR3 (plain, flat copy, true to the code; no square brackets).

## Goal
One generated text for every item, ring and weapon: stats, then at most one short physical
`fact`, then sources ("Dropped by / Sold by / Found in").

## Acceptance
1. `describeItem(def)` in `game/inspector.js` builds the stat text from data for every item
   field (damage, damage type, range, reach, onHit, poition, puddle, heal, effect, armour and
   perks, sewerFare, consumable, quest item, tier, value). It extends `itemStatLine`,
   `poitionLine` and `ARMOUR_PERKS`.
2. `tools/item-sources.mjs` writes `game/item-sources.json` (dropped by, sold by, found in)
   from map loadouts, slot ENTRIES loadouts, shop stock, THROWS_CARRIED and the tier table.
   A test fails if the file is stale.
3. Each flavour `description` becomes a short `fact`: empty, or one physical fact he or the data
   already state. No flavour and no `[TEXT]` remains in items.js, weapons.js or ring-data.js.
4. The bag panel, the trade box, the weapon compare row and ground examine show stats, then the
   fact, then sources.
5. Every generated line is true to the code.
6. Tests that pin descriptions are re-pinned exactly; the plain-copy-guard allow-list falls.
7. `npm test`, `balance:check`, the naming grep and `autoplay:check` pass.
8. Evidence: 3440x1440 frames of the Sludge Sack, the Tunnel Mushroom, a weapon and an armour
   piece in the bag panel.

## Out of scope
Quest stage descriptions (quests.js), NPC dialogue, map text, new item names.

## Status
Blocked at the start: tests outside the touches pin the strings this slice changes (see the
BLOCKED report). Nothing is built yet.
