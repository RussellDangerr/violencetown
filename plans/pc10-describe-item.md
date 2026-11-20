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
2. `tools/item-sources.mjs` writes `game/item-sources.js` (a generated module; dropped by, sold by, found in)
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
Built. The tests that pinned item text were outside the first touches; the loop widened them
(ruling PC10R1) and they are re-pinned exactly.

- The sources are a JS module, not JSON: dev-server.py's cache-buster and the Cloudflare headers
  only cover .js, so a JSON import could run with stale data beside new code.
- npc.js THROWS_CARRIED is not read as a source. It says only what an enemy throws instead of
  eating; who carries the item already comes from the loadouts, which spawnEnemy returns.
- `itemStatLine` is no longer called in the game (the panels use describeItem). It is left in
  place with its tests; PC12 removes it.
- A thrown item hits enemies only, plus whoever stands on an aimed centre tile (items.js
  resolveThrow); the text says so.
- A thing with no base value (a ring) prints no tier or value.
